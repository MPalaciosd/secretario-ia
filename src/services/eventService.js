// ─── services/eventService.js ────────────────────────────────────────
//
// Sistema de eventos robusto con:
//   - Manejo correcto de zonas horarias (timezone del usuario, almacenado en UTC)
//   - Detección de conflictos real por solapamiento de intervalos
//   - Validación estricta antes de cualquier escritura
//   - Búfer de cortesía configurable entre eventos
//   - API de huecos libres para el scheduler

'use strict';

const { query } = require('../db/database');

// ─── Constants ───────────────────────────────────────────────────────

// Minimum gap between events in minutes (courtesy buffer)
const MIN_GAP_MINUTES = 5;

// Max events returned in a single query (prevents huge responses)
const MAX_EVENTS_PER_QUERY = 100;

// ─── Timezone helpers ────────────────────────────────────────────────
//
// PRINCIPLE: All timestamps are stored as UTC in PostgreSQL.
// All input (date + time) is interpreted in the user's timezone.
// All output is converted back to the user's timezone for display.
//
// We use Intl.DateTimeFormat to avoid any external dependency.

/**
 * Convert a local date+time string to a UTC Date object.
 * @param {string} dateStr   'YYYY-MM-DD'
 * @param {string} timeStr   'HH:MM'
 * @param {string} timezone  IANA timezone (e.g. 'Europe/Madrid')
 * @returns {Date} UTC Date
 */
function localToUTC(dateStr, timeStr, timezone) {
  // Build an ISO-like string and parse it in the given timezone using Intl
  // Strategy: format "1970-01-01" in target TZ to get offset, then apply
  const isoLocal = `${dateStr}T${timeStr}:00`;

  // Use a trick: format a known moment in the user TZ to get its offset
  try {
    // Parse as if it's local, then adjust for TZ offset
    const naive  = new Date(`${isoLocal}Z`); // treat as UTC first
    const offset = getTZOffsetMinutes(naive, timezone);
    return new Date(naive.getTime() - offset * 60 * 1000);
  } catch {
    // Fallback: parse naively (server TZ — may be wrong but won't crash)
    return new Date(isoLocal);
  }
}

/**
 * Get the UTC offset in minutes for a given timezone at a given moment.
 * Positive = ahead of UTC (e.g. Europe/Madrid in summer = +120)
 */
function getTZOffsetMinutes(date, timezone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone:     timezone,
      year:         'numeric',
      month:        '2-digit',
      day:          '2-digit',
      hour:         '2-digit',
      minute:       '2-digit',
      second:       '2-digit',
      hour12:       false,
    });

    const parts  = formatter.formatToParts(date);
    const get    = (type) => parseInt(parts.find(p => p.type === type)?.value || '0');

    const localDate = new Date(
      get('year'), get('month') - 1, get('day'),
      get('hour') === 24 ? 0 : get('hour'), get('minute'), get('second')
    );

    // Offset = local - UTC (in minutes)
    return (localDate.getTime() - date.getTime()) / 60000;
  } catch {
    return 0;
  }
}

/**
 * Format a UTC Date to local time string in the given timezone.
 */
function formatLocalTime(utcDate, timezone, opts = {}) {
  const defaults = {
    timeZone: timezone,
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  };
  return new Intl.DateTimeFormat('es-ES', { ...defaults, ...opts }).format(utcDate);
}

/**
 * Format a UTC Date to a local date string in the given timezone.
 */
function formatLocalDate(utcDate, timezone, opts = {}) {
  const defaults = {
    timeZone: timezone,
    weekday:  'long',
    day:      'numeric',
    month:    'long',
  };
  return new Intl.DateTimeFormat('es-ES', { ...defaults, ...opts }).format(utcDate);
}

/**
 * Get the day-of-week (0=Sunday..6=Saturday) in the user's timezone.
 */
function getLocalDayOfWeek(utcDate, timezone) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
  const day = fmt.format(utcDate);
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(day);
}

/**
 * Get the start/end of a calendar day in UTC for a given local date + timezone.
 */
function getDayBoundsUTC(dateStr, timezone) {
  const startUTC = localToUTC(dateStr, '00:00', timezone);
  const endUTC   = localToUTC(dateStr, '23:59', timezone);
  return { startUTC, endUTC };
}

// ─── Overlap detection ───────────────────────────────────────────────

/**
 * Returns true if [startA, endA) overlaps with [startB, endB).
 * Includes the courtesy buffer.
 */
function overlaps(startA, endA, startB, endB) {
  const bufferedEnd = new Date(endA.getTime() + MIN_GAP_MINUTES * 60 * 1000);
  return startA < endB && bufferedEnd > startB;
}

/**
 * Check if a proposed slot conflicts with a list of existing events.
 * @returns {Object|null} conflicting event, or null if no conflict
 */
function findConflict(proposedStart, proposedDurationMin, existingEvents) {
  const proposedEnd = new Date(proposedStart.getTime() + proposedDurationMin * 60 * 1000);

  for (const ev of existingEvents) {
    const evStart = new Date(ev.start_time);
    const evEnd   = ev.end_time
      ? new Date(ev.end_time)
      : new Date(evStart.getTime() + (ev.duration_minutes || 60) * 60 * 1000);

    if (overlaps(proposedStart, proposedEnd, evStart, evEnd)) {
      return ev;
    }
  }
  return null;
}

// ─── Validation ──────────────────────────────────────────────────────

function validateEventInput(data) {
  const errors = [];

  const title = (data.title || '').trim();
  if (!title)           errors.push('El título del evento es requerido');
  if (title.length > 500) errors.push('El título no puede superar 500 caracteres');

  if (!data.date)       errors.push('La fecha del evento es requerida');
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) errors.push('Formato de fecha inválido (use YYYY-MM-DD)');

  if (!data.time)       errors.push('La hora del evento es requerida');
  else if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(data.time)) errors.push('Formato de hora inválido (use HH:MM)');

  if (data.duration_minutes !== undefined) {
    const d = Number(data.duration_minutes);
    if (!Number.isInteger(d) || d < 1 || d > 1440) {
      errors.push('La duración debe ser entre 1 y 1440 minutos');
    }
  }

  const validTypes = ['general', 'medico', 'trabajo', 'personal', 'deporte', 'reunion'];
  if (data.event_type && !validTypes.includes(data.event_type)) {
    errors.push(`Tipo de evento inválido. Opciones: ${validTypes.join(', ')}`);
  }

  return errors;
}

// ─── Get user timezone ───────────────────────────────────────────────

async function getUserTimezone(userId) {
  const result = await query('SELECT timezone FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.timezone || 'Europe/Madrid';
}

// ─── CREATE EVENT ────────────────────────────────────────────────────

async function createEvent(userId, data) {
  const errors = validateEventInput(data);
  if (errors.length > 0) throw new Error('Datos inválidos: ' + errors.join(', '));

  // Get user's timezone for correct UTC conversion
  const timezone       = data.timezone || await getUserTimezone(userId);
  const durationMin    = data.duration_minutes || 60;
  const startUTC       = localToUTC(data.date, data.time, timezone);
  const endUTC         = new Date(startUTC.getTime() + durationMin * 60 * 1000);

  if (isNaN(startUTC.getTime())) throw new Error('Fecha u hora inválida');

  // Load events in the same day to check conflicts
  const dayStart = new Date(startUTC.getTime() - 24 * 60 * 60 * 1000);
  const dayEnd   = new Date(endUTC.getTime()   + 24 * 60 * 60 * 1000);

  const existing = await query(
    `SELECT id, title, start_time, end_time, duration_minutes
     FROM events
     WHERE user_id = $1
       AND status != 'cancelled'
       AND start_time BETWEEN $2 AND $3`,
    [userId, dayStart.toISOString(), dayEnd.toISOString()]
  );

  const conflict = findConflict(startUTC, durationMin, existing.rows);
  if (conflict) {
    const conflictTime = formatLocalTime(new Date(conflict.start_time), timezone);
    throw new Error(
      `Conflicto: ya tienes "${conflict.title}" a las ${conflictTime}. ` +
      `Elige otro horario o cancela el evento existente primero.`
    );
  }

  const result = await query(
    `INSERT INTO events
       (user_id, title, description, start_time, end_time, duration_minutes,
        event_type, location, status, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled',$9)
     RETURNING *`,
    [
      userId,
      data.title.trim(),
      data.description    || null,
      startUTC.toISOString(),
      endUTC.toISOString(),
      durationMin,
      data.event_type     || 'general',
      data.location       || null,
      JSON.stringify({ timezone, created_via: data.created_via || 'chat' }),
    ]
  );

  return result.rows[0];
}

// ─── GET EVENTS ──────────────────────────────────────────────────────

async function getEvents(userId, options = {}) {
  const {
    dateFrom,
    dateTo,
    eventType,
    planId,
    status    = null,
    limit     = 50,
    timezone,
  } = options;

  // Get user's timezone for correct day boundary calculation
  const userTZ = timezone || await getUserTimezone(userId);

  let sql    = `
    SELECT e.*, p.title AS plan_title
    FROM events e
    LEFT JOIN plans p ON p.id = e.plan_id
    WHERE e.user_id = $1
      AND e.status != 'cancelled'
  `;
  const params = [userId];
  let pi = 2;

  if (dateFrom) {
    // Convert the local date boundary to UTC
    const { startUTC } = getDayBoundsUTC(dateFrom, userTZ);
    sql += ` AND e.start_time >= $${pi}`;
    params.push(startUTC.toISOString());
    pi++;
  }

  if (dateTo) {
    const { endUTC } = getDayBoundsUTC(dateTo, userTZ);
    sql += ` AND e.start_time <= $${pi}`;
    params.push(endUTC.toISOString());
    pi++;
  }

  if (eventType) {
    sql += ` AND e.event_type = $${pi}`;
    params.push(eventType);
    pi++;
  }

  if (planId) {
    sql += ` AND e.plan_id = $${pi}`;
    params.push(planId);
    pi++;
  }

  if (status) {
    sql += ` AND e.status = $${pi}`;
    params.push(status);
    pi++;
  }

  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 50), MAX_EVENTS_PER_QUERY);
  sql += ` ORDER BY e.start_time ASC LIMIT ${safeLimit}`;

  const result = await query(sql, params);
  return result.rows;
}

// ─── GET FREE SLOTS ──────────────────────────────────────────────────
//
// Returns available time windows of at least minDurationMin in a date range.
// Used by the scheduler to find smart insertion points.

async function getFreeSlots(userId, options = {}) {
  const {
    dateFrom,
    dateTo,
    minDurationMin  = 60,
    workdayStartH   = 7,
    workdayEndH     = 22,
    timezone,
  } = options;

  const userTZ = timezone || await getUserTimezone(userId);

  const existingEvents = await getEvents(userId, { dateFrom, dateTo, timezone: userTZ, limit: MAX_EVENTS_PER_QUERY });

  const freeSlots = [];
  const start  = new Date(dateFrom);
  const end    = new Date(dateTo);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr  = d.toISOString().split('T')[0];
    const dayStart = localToUTC(dateStr, `${String(workdayStartH).padStart(2,'0')}:00`, userTZ);
    const dayEnd   = localToUTC(dateStr, `${String(workdayEndH).padStart(2,'0')}:00`, userTZ);

    // Events on this day sorted by start time
    const dayEvents = existingEvents
      .filter(ev => {
        const s = new Date(ev.start_time);
        return s >= dayStart && s < dayEnd;
      })
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    let cursor = new Date(dayStart);

    for (const ev of dayEvents) {
      const evStart = new Date(ev.start_time);
      const evEnd   = ev.end_time
        ? new Date(ev.end_time)
        : new Date(evStart.getTime() + (ev.duration_minutes || 60) * 60 * 1000);

      const gapMin = (evStart - cursor) / 60000;
      if (gapMin >= minDurationMin) {
        freeSlots.push({ start: new Date(cursor), end: new Date(evStart), durationMin: gapMin });
      }
      cursor = new Date(Math.max(cursor, evEnd.getTime() + MIN_GAP_MINUTES * 60 * 1000));
    }

    // Remaining window until end of workday
    const remainingMin = (dayEnd - cursor) / 60000;
    if (remainingMin >= minDurationMin) {
      freeSlots.push({ start: new Date(cursor), end: new Date(dayEnd), durationMin: remainingMin });
    }
  }

  return freeSlots;
}

// ─── UPDATE EVENT ────────────────────────────────────────────────────

async function updateEvent(userId, eventId, data) {
  const existing = await query(
    'SELECT * FROM events WHERE id = $1 AND user_id = $2',
    [eventId, userId]
  );
  if (!existing.rows.length) throw new Error('Evento no encontrado');

  const ev       = existing.rows[0];
  const timezone = data.timezone || await getUserTimezone(userId);

  const fields = [];
  const values = [];
  let pi = 1;

  if (data.title !== undefined) {
    const title = data.title.trim();
    if (!title) throw new Error('El título no puede estar vacío');
    fields.push(`title = $${pi++}`); values.push(title);
  }

  if (data.description !== undefined) {
    fields.push(`description = $${pi++}`); values.push(data.description);
  }

  if (data.event_type !== undefined) {
    fields.push(`event_type = $${pi++}`); values.push(data.event_type);
  }

  if (data.location !== undefined) {
    fields.push(`location = $${pi++}`); values.push(data.location);
  }

  if (data.status !== undefined) {
    fields.push(`status = $${pi++}`); values.push(data.status);
  }

  // Recalculate times if either date or time changed
  const newDate = data.date || ev.start_time.toISOString().split('T')[0];
  const existingLocalTime = formatLocalTime(new Date(ev.start_time), timezone);
  const newTime = data.time || existingLocalTime;

  if (data.date || data.time) {
    const newDuration = data.duration_minutes || ev.duration_minutes || 60;
    const newStart    = localToUTC(newDate, newTime, timezone);
    const newEnd      = new Date(newStart.getTime() + newDuration * 60 * 1000);

    // Conflict check excluding the event being updated
    const nearby = await query(
      `SELECT id, title, start_time, end_time, duration_minutes
       FROM events
       WHERE user_id = $1 AND status != 'cancelled' AND id != $2
         AND start_time BETWEEN $3 AND $4`,
      [
        userId, eventId,
        new Date(newStart.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        new Date(newEnd.getTime()   + 24 * 60 * 60 * 1000).toISOString(),
      ]
    );

    const conflict = findConflict(newStart, newDuration, nearby.rows);
    if (conflict) {
      const ct = formatLocalTime(new Date(conflict.start_time), timezone);
      throw new Error(`Conflicto: ya tienes "${conflict.title}" a las ${ct}.`);
    }

    fields.push(`start_time = $${pi++}`); values.push(newStart.toISOString());
    fields.push(`end_time   = $${pi++}`); values.push(newEnd.toISOString());
    fields.push(`duration_minutes = $${pi++}`); values.push(newDuration);
  } else if (data.duration_minutes) {
    const currentStart = new Date(ev.start_time);
    const newEnd       = new Date(currentStart.getTime() + data.duration_minutes * 60 * 1000);
    fields.push(`end_time = $${pi++}`);         values.push(newEnd.toISOString());
    fields.push(`duration_minutes = $${pi++}`); values.push(data.duration_minutes);
  }

  if (!fields.length) throw new Error('No hay campos para actualizar');

  fields.push('updated_at = NOW()');
  values.push(eventId, userId);

  const result = await query(
    `UPDATE events SET ${fields.join(', ')}
     WHERE id = $${pi} AND user_id = $${pi + 1}
     RETURNING *`,
    values
  );

  return result.rows[0];
}

// ─── DELETE EVENT (soft) ─────────────────────────────────────────────

async function deleteEvent(userId, eventId) {
  const result = await query(
    `UPDATE events
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, title`,
    [eventId, userId]
  );
  if (!result.rows.length) throw new Error('Evento no encontrado');
  return result.rows[0];
}

// ─── FORMAT EVENTS RESPONSE ──────────────────────────────────────────

async function formatEventsResponse(events, timezone) {
  if (!events || !events.length) {
    return 'No tienes eventos programados para ese período. 🗓️';
  }

  // Group by local date using user's timezone
  const byDay = new Map();

  for (const event of events) {
    const utcDate  = new Date(event.start_time);
    const eventTZ  = event.metadata?.timezone || timezone || 'Europe/Madrid';
    const dayLabel = formatLocalDate(utcDate, eventTZ, {
      weekday: 'long', day: 'numeric', month: 'long',
    });

    if (!byDay.has(dayLabel)) byDay.set(dayLabel, []);
    byDay.get(dayLabel).push({ event, tz: eventTZ });
  }

  let response = '';
  for (const [day, items] of byDay) {
    const capitalDay = day.charAt(0).toUpperCase() + day.slice(1);
    response += `📅 **${capitalDay}:**\n`;

    for (const { event, tz } of items) {
      const time     = formatLocalTime(new Date(event.start_time), tz);
      const duration = event.duration_minutes ? ` (${event.duration_minutes} min)` : '';
      const typeIcon = { medico:'🏥', reunion:'💼', deporte:'🏃', personal:'👤', trabajo:'💻' }[event.event_type] || '📌';
      response += `  ${typeIcon} ${time} — **${event.title}`${duration}\n`;
    }
    response += '\n';
  }

  return response.trim();
}

// ─── Exports ─────────────────────────────────────────────────────────

module.exports = {
  createEvent,
  getEvents,
  getFreeSlots,
  updateEvent,
  deleteEvent,
  formatEventsResponse,
  // Timezone utilities — used by schedulerService
  localToUTC,
  getTZOffsetMinutes,
  getLocalDayOfWeek,
  formatLocalTime,
  formatLocalDate,
  getDayBoundsUTC,
  overlaps,
  findConflict,
  getUserTimezone,
  MIN_GAP_MINUTES,
};
