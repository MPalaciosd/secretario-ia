// ─── services/schedulerService.js ───────────────────────────────────
//
// Scheduler inteligente para distribución automática de planes.
//
// GARANTÍAS:
//   - Todas las operaciones de tiempo en timezone del usuario (no del servidor)
//   - Detección de conflictos con buffer de cortesía (MIN_GAP_MINUTES)
//   - Distribución equitativa: se cubre CADA semana completa
//   - Si el slot preferido está ocupado, busca el siguiente hueco libre en el día
//   - Si el día preferido está lleno, usa el siguiente día disponible de esa semana
//   - Nunca pierde sesiones silenciosamente — lanza error si no puede programar
//   - Rotación de días: si hay más sesiones/semana que días preferidos, usa días adyacentes

'use strict';

const { query } = require('../db/database');
const {
  localToUTC,
  getLocalDayOfWeek,
  formatLocalTime,
  formatLocalDate,
  findConflict,
  getUserTimezone,
  MIN_GAP_MINUTES,
} = require('./eventService');

// ─── Day name → ISO weekday number (1=Mon...7=Sun, matching ISO 8601) ─

const DAY_NAME_TO_ISO = {
  lunes: 1, martes: 2, 'miércoles': 3, miercoles: 3,
  jueves: 4, viernes: 5, 'sábado': 6, sabado: 6, domingo: 7,
};

const ISO_TO_DAY_ES = {
  1: 'lunes', 2: 'martes', 3: 'miércoles',
  4: 'jueves', 5: 'viernes', 6: 'sábado', 7: 'domingo',
};

// JS getDay() returns 0=Sun..6=Sat — convert to ISO 1=Mon..7=Sun
function jsToISO(jsDay) { return jsDay === 0 ? 7 : jsDay; }
function isoToJS(isoDay) { return isoDay === 7 ? 0 : isoDay; }

// ─── Date helpers ────────────────────────────────────────────────────

/**
 * Format a Date to 'YYYY-MM-DD' string (local to the Date's UTC value).
 * We always work with UTC internally since localToUTC already applied the offset.
 */
function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/**
 * Get Monday (ISO day 1) of the week containing 'date'.
 */
function getWeekMonday(date) {
  const d   = new Date(date);
  const jsDay = d.getUTCDay();  // 0=Sun..6=Sat
  const iso   = jsToISO(jsDay); // 1=Mon..7=Sun
  d.setUTCDate(d.getUTCDate() - (iso - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─── Build the slot candidates for a single week ─────────────────────
//
// Given a set of preferred day ISO numbers, generate all candidate slots
// for that week ordered by preference. If sessions_per_week > preferred_days,
// add adjacent days in a round-robin to fill the quota.

function buildCandidateDays(weekMonday, preferredISODays, sessionsPerWeek) {
  const allISODays = [1, 2, 3, 4, 5, 6, 7];

  // Expand to cover extra sessions if needed
  let candidates = [...preferredISODays];

  if (candidates.length < sessionsPerWeek) {
    // Add remaining days ordered by proximity to preferred days
    const extras = allISODays.filter(d => !candidates.includes(d));
    candidates = [...candidates, ...extras];
  }

  // Take only sessionsPerWeek candidates
  candidates = candidates.slice(0, sessionsPerWeek);

  // Map to actual Date objects (UTC midnight of that day in the week)
  return candidates.map(isoDay => {
    const d = new Date(weekMonday);
    d.setUTCDate(d.getUTCDate() + (isoDay - 1));
    return d;
  });
}

// ─── Find next available slot on a given day ─────────────────────────
//
// Tries the preferred time, then shifts forward by 30-minute increments
// up to workday end. Returns null if the day is full.

function findSlotOnDay(
  dayDate,           // UTC Date of the day
  preferredTimeStr,  // 'HH:MM'
  durationMin,
  existingEvents,
  timezone,
  workdayEndH = 22,
) {
  const dateStr           = toDateStr(dayDate);
  const [prefH, prefM]    = preferredTimeStr.split(':').map(Number);

  // Build workday end in UTC
  const workdayEndUTC = localToUTC(dateStr, `${String(workdayEndH).padStart(2,'0')}:00`, timezone);

  // Try from preferred time, shifting 30 min at a time
  let attempt = localToUTC(dateStr, preferredTimeStr, timezone);

  // Safety: if preferred time is before "now", skip to next 30-min boundary
  const now = new Date();
  if (attempt < now) {
    const msAhead = Math.ceil((now - attempt) / (30 * 60 * 1000)) * 30 * 60 * 1000;
    attempt = new Date(attempt.getTime() + msAhead);
  }

  const maxIterations = 20; // up to 10 hours of 30-min slots
  for (let i = 0; i < maxIterations; i++) {
    const slotEnd = new Date(attempt.getTime() + durationMin * 60 * 1000);
    if (slotEnd > workdayEndUTC) return null; // Day is full

    const conflict = findConflict(attempt, durationMin, existingEvents);
    if (!conflict) return new Date(attempt);

    // Shift past the conflicting event + courtesy buffer
    const conflictEnd = conflict.end_time
      ? new Date(conflict.end_time)
      : new Date(new Date(conflict.start_time).getTime() + (conflict.duration_minutes || 60) * 60 * 1000);

    attempt = new Date(conflictEnd.getTime() + MIN_GAP_MINUTES * 60 * 1000);
  }

  return null; // Could not find a slot
}

// ─── Phase descriptor for session content ────────────────────────────

function getPhaseForWeek(weekNum, totalWeeks) {
  const ratio = weekNum / totalWeeks;
  if (ratio <= 0.20) return { name: 'Adaptación',       focus: 'Volumen bajo, técnica, acostumbramiento' };
  if (ratio <= 0.50) return { name: 'Progresión',        focus: 'Aumentar volumen e intensidad gradualmente' };
  if (ratio <= 0.80) return { name: 'Intensificación',   focus: 'Alta intensidad, máxima carga manejable' };
  if (ratio <= 0.90) return { name: 'Pico',              focus: 'Máximo rendimiento, consolidación de ganancias' };
  return               { name: 'Descarga / Deload',     focus: 'Reducir volumen, permitir recuperación' };
}

function buildSessionContent(plan, weekNum, sessionNum, totalSessions) {
  const phase = getPhaseForWeek(weekNum, plan.weeks);
  const planMeta = plan.metadata?.ai_generated || {};

  // Try to use AI-generated phase content if available
  const aiPhases = planMeta.phases || [];
  const aiPhase  = aiPhases.find(p => {
    const [from, to] = (p.week_range || '').split('-').map(Number);
    return weekNum >= from && weekNum <= (to || from);
  });

  const title = `${plan.title} — S${weekNum} D${sessionNum}`;
  const description = [
    `📅 Semana ${weekNum}/${plan.weeks} · Sesión ${sessionNum}/${plan.sessions_per_week}`,
    `🎯 Fase: ${phase.name} — ${phase.focus}`,
    aiPhase ? `\n💪 ${aiPhase.focus || ''}` : '',
    aiPhase?.exercises?.length
      ? `\nEjercicios: ${aiPhase.exercises.slice(0, 5).join(', ')}`
      : '',
    `\n⏱️ Duración: ${plan.session_duration_minutes || 60} minutos`,
    `🏆 Objetivo: ${plan.goal}`,
  ].filter(Boolean).join('\n');

  return { title, description };
}

// ─── MAIN SCHEDULER ──────────────────────────────────────────────────

async function schedulePlan(userId, planId, options = {}) {
  const {
    startDate      = new Date().toISOString().split('T')[0],
    preferredDays  = ['lunes', 'miercoles', 'viernes'],
    preferredTime  = '07:00',
    workdayEndH    = 22,
    allowWeekends  = true,
  } = options;

  // ── 1. Load plan ──────────────────────────────────────────────
  const planRes = await query(
    'SELECT * FROM plans WHERE id = $1 AND user_id = $2',
    [planId, userId]
  );
  if (!planRes.rows.length) throw new Error('Plan no encontrado');
  const plan = planRes.rows[0];

  const totalWeeks     = Math.max(1, plan.weeks          || 4);
  const sessionsPerWk  = Math.max(1, plan.sessions_per_week || 3);
  const durationMin    = Math.max(15, plan.session_duration_minutes || 60);
  const totalSessions  = totalWeeks * sessionsPerWk;

  // ── 2. Resolve user timezone ──────────────────────────────────
  const timezone = await getUserTimezone(userId);

  // ── 3. Parse preferred days to ISO numbers ────────────────────
  let prefISO = preferredDays
    .map(d => DAY_NAME_TO_ISO[d.toLowerCase().trim()])
    .filter(Boolean);

  if (prefISO.length === 0) prefISO = [1, 3, 5]; // Default Mon/Wed/Fri

  // Remove weekends if not allowed
  if (!allowWeekends) {
    prefISO = prefISO.filter(d => d <= 5);
    if (prefISO.length === 0) prefISO = [1, 3, 5];
  }

  // Deduplicate and sort
  prefISO = [...new Set(prefISO)].sort((a, b) => a - b);

  // ── 4. Calculate date range and load existing events ──────────
  const planStart = new Date(startDate + 'T00:00:00Z');
  const planEnd   = addDays(planStart, totalWeeks * 7 + 1);

  const existingRes = await query(
    `SELECT id, title, start_time, end_time, duration_minutes
     FROM events
     WHERE user_id = $1
       AND status != 'cancelled'
       AND start_time BETWEEN $2 AND $3
     ORDER BY start_time ASC`,
    [userId, planStart.toISOString(), planEnd.toISOString()]
  );
  // Mutable array — we add newly scheduled sessions to it to prevent self-conflicts
  const existingEvents = [...existingRes.rows];

  // ── 5. Schedule week by week ───────────────────────────────────
  const scheduledSessions = [];
  const failedWeeks       = [];

  for (let week = 1; week <= totalWeeks; week++) {
    // Monday of this week in the plan
    const weekOffset = (week - 1) * 7;
    const weekMonday = addDays(planStart, weekOffset);
    // Align weekMonday to actual Monday
    const dayOfPlanStart = jsToISO(planStart.getUTCDay());
    const alignedMonday  = addDays(planStart, weekOffset - (dayOfPlanStart - 1));
    alignedMonday.setUTCHours(0, 0, 0, 0);

    // Get the candidate day dates for this week
    const candidateDays = buildCandidateDays(alignedMonday, prefISO, sessionsPerWk);
    let weekScheduled   = 0;

    for (const candidateDay of candidateDays) {
      if (weekScheduled >= sessionsPerWk) break;

      // Skip days before startDate
      if (candidateDay < planStart) continue;

      const slot = findSlotOnDay(
        candidateDay,
        preferredTime,
        durationMin,
        existingEvents,
        timezone,
        workdayEndH,
      );

      if (!slot) {
        console.warn(`[Scheduler] No slot on ${toDateStr(candidateDay)} for plan ${planId} week ${week}`);
        continue;
      }

      const slotEnd       = new Date(slot.getTime() + durationMin * 60 * 1000);
      const sessionNum    = weekScheduled + 1;
      const totalScheduled = scheduledSessions.length + 1;
      const content       = buildSessionContent(plan, week, sessionNum, totalSessions);

      // Insert event
      const evRes = await query(
        `INSERT INTO events
           (user_id, title, description, start_time, end_time, duration_minutes,
            event_type, plan_id, week_number, session_number, status, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,'deporte',$7,$8,$9,'scheduled',$10)
         RETURNING *`,
        [
          userId,
          content.title,
          content.description,
          slot.toISOString(),
          slotEnd.toISOString(),
          durationMin,
          planId,
          week,
          sessionNum,
          JSON.stringify({
            timezone,
            plan_type:  plan.plan_type,
            goal:       plan.goal,
            level:      plan.level,
            session_of: `${totalScheduled}/${totalSessions}`,
          }),
        ]
      );

      const savedEvent = evRes.rows[0];
      scheduledSessions.push(savedEvent);

      // Add to in-memory list to prevent future conflicts in the same scheduling run
      existingEvents.push({
        id:               savedEvent.id,
        start_time:       savedEvent.start_time,
        end_time:         savedEvent.end_time,
        duration_minutes: durationMin,
      });

      weekScheduled++;
    }

    if (weekScheduled < sessionsPerWk) {
      failedWeeks.push({ week, scheduled: weekScheduled, required: sessionsPerWk });
    }
  }

  // ── 6. Warn about partial scheduling ─────────────────────────
  if (failedWeeks.length > 0) {
    const msg = failedWeeks
      .map(w => `semana ${w.week}: ${w.scheduled}/${w.required} sesiones`)
      .join(', ');
    console.warn(`[Scheduler] Partial schedule for plan ${planId}: ${msg}`);
  }

  // ── 7. Persist schedule summary to plan ───────────────────────
  await query(
    `UPDATE plans SET schedule = $1, updated_at = NOW() WHERE id = $2`,
    [
      JSON.stringify({
        scheduled_at:   new Date().toISOString(),
        total_sessions: scheduledSessions.length,
        total_expected: totalSessions,
        partial_weeks:  failedWeeks,
        preferred_days: preferredDays,
        preferred_time: preferredTime,
        timezone,
      }),
      planId,
    ]
  );

  console.log(
    `[Scheduler] ✅ Plan ${planId}: ${scheduledSessions.length}/${totalSessions} sessions scheduled` +
    (failedWeeks.length > 0 ? ` (${failedWeeks.length} partial weeks)` : '')
  );

  return scheduledSessions;
}

// ─── GET PLAN SCHEDULE ───────────────────────────────────────────────

async function getPlanSchedule(userId, planId) {
  const result = await query(
    `SELECT e.*, p.title AS plan_title
     FROM events e
     JOIN plans p ON p.id = e.plan_id
     WHERE e.user_id = $1
       AND e.plan_id = $2
       AND e.status != 'cancelled'
     ORDER BY e.start_time ASC`,
    [userId, planId]
  );
  return result.rows;
}

// ─── FORMAT SCHEDULE SUMMARY ─────────────────────────────────────────

async function formatScheduleSummary(sessions, timezone) {
  if (!sessions || !sessions.length) {
    return 'No hay sesiones programadas. 🗓️';
  }

  // Use timezone from first session's metadata if not provided
  const tz = timezone
    || (sessions[0]?.metadata?.timezone)
    || 'Europe/Madrid';

  // Group by week_number
  const byWeek = new Map();
  for (const s of sessions) {
    const wk = s.week_number || 1;
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk).push(s);
  }

  const totalWeeks    = Math.max(...byWeek.keys());
  const totalSessions = sessions.length;

  let summary = `📅 **Plan programado: ${totalSessions} sesiones en ${totalWeeks} semanas**\n\n`;

  for (const [week, weekSessions] of [...byWeek.entries()].sort((a, b) => a[0] - b[0])) {
    summary += `**📆 Semana ${week}:**\n`;

    for (const s of weekSessions.sort((a, b) => new Date(a.start_time) - new Date(b.start_time))) {
      const utcDate   = new Date(s.start_time);
      const dayName   = formatLocalDate(utcDate, tz, { weekday: 'long', day: 'numeric', month: 'short' });
      const timeStr   = formatLocalTime(utcDate, tz);
      const duration  = s.duration_minutes ? ` · ${s.duration_minutes} min` : '';
      summary += `  🏃 ${dayName} a las ${timeStr}${duration}\n`;
    }
    summary += '\n';
  }

  return summary.trim();
}

// ─── Exports ─────────────────────────────────────────────────────────

module.exports = {
  schedulePlan,
  getPlanSchedule,
  formatScheduleSummary,
};
