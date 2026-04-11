const { query } = require('../db/database');
const { getLongTermMemory } = require('../ai/memoryService');

/**
 * INTELLIGENT SCHEDULER SERVICE
 * Distributes plan sessions across the calendar intelligently,
 * avoiding conflicts and respecting user availability preferences
 */

const DAY_MAP = {
  'lunes': 1, 'martes': 2, 'miercoles': 3, 'jueves': 4,
  'viernes': 5, 'sabado': 6, 'domingo': 0
};

const DAY_NAMES_ES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/**
 * Get all existing events for a user in a date range
 */
async function getExistingEvents(userId, startDate, endDate) {
  const result = await query(
    `SELECT id, title, start_time, end_time, duration_minutes
     FROM events 
     WHERE user_id = $1 
     AND start_time BETWEEN $2 AND $3
     AND status != 'cancelled'
     ORDER BY start_time ASC`,
    [userId, startDate, endDate]
  );
  return result.rows;
}

/**
 * Check if a proposed time slot conflicts with existing events
 */
function hasConflict(proposedStart, proposedDuration, existingEvents) {
  const proposedEnd = new Date(proposedStart.getTime() + proposedDuration * 60 * 1000);
  
  for (const event of existingEvents) {
    const eventStart = new Date(event.start_time);
    const eventEnd = event.end_time 
      ? new Date(event.end_time) 
      : new Date(eventStart.getTime() + (event.duration_minutes || 60) * 60 * 1000);
    
    // Check overlap: proposed starts before event ends AND proposed ends after event starts
    if (proposedStart < eventEnd && proposedEnd > eventStart) {
      return true;
    }
  }
  return false;
}

/**
 * Generate training session content based on week number and focus
 */
function generateSessionContent(weekNumber, sessionNumber, sessionsPerWeek, plan) {
  const phases = {
    1: 'Adaptación — ejercicios básicos con intensidad baja',
    2: 'Progresión — aumentar repeticiones y series',
    3: 'Intensificación — mayor carga y variedad',
    4: 'Peak — máxima intensidad y consolidación'
  };
  
  const phase = phases[weekNumber] || `Semana ${weekNumber} — progresión continua`;
  
  return {
    title: `${plan.title} — Semana ${weekNumber}, Sesión ${sessionNumber}`,
    description: `${phase}\n\nObjetivo: ${plan.goal}\nNivel: ${plan.level}\nDuración: ${plan.session_duration_minutes || 60} minutos`
  };
}

/**
 * MAIN SCHEDULER: Distributes all sessions of a plan into the calendar
 */
async function schedulePlan(userId, planId, options = {}) {
  const {
    startDate = new Date().toISOString().split('T')[0],
    preferredDays = ['lunes', 'miercoles', 'viernes'],
    preferredTime = '07:00'
  } = options;

  // Get plan details
  const planResult = await query(
    'SELECT * FROM plans WHERE id = $1 AND user_id = $2',
    [planId, userId]
  );
  
  if (!planResult.rows.length) {
    throw new Error('Plan no encontrado');
  }
  
  const plan = planResult.rows[0];
  const totalWeeks = plan.weeks || 4;
  const sessionsPerWeek = plan.sessions_per_week || 3;
  const sessionDuration = plan.session_duration_minutes || 60;
  
  // Convert preferred days to day numbers
  const preferredDayNums = preferredDays.map(d => DAY_MAP[d.toLowerCase()]).filter(d => d !== undefined);
  
  if (preferredDayNums.length === 0) {
    // Default to Mon/Wed/Fri
    preferredDayNums.push(1, 3, 5);
  }
  
  // Calculate end date (to load existing events)
  const start = new Date(startDate);
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + totalWeeks * 7 + 1);
  
  // Load existing events to avoid conflicts
  const existingEvents = await getExistingEvents(userId, start.toISOString(), endDate.toISOString());
  
  const scheduledSessions = [];
  const [prefHour, prefMinute] = preferredTime.split(':').map(Number);
  
  let currentDate = new Date(start);
  let sessionsScheduled = 0;
  let currentWeek = 1;
  let sessionsInCurrentWeek = 0;
  const weekStartDate = new Date(start);
  
  // Schedule sessions week by week
  while (currentWeek <= totalWeeks) {
    const dayOfWeek = currentDate.getDay();
    
    // Check if today is a preferred training day
    if (preferredDayNums.includes(dayOfWeek) && sessionsInCurrentWeek < sessionsPerWeek) {
      // Try the preferred time
      const proposedTime = new Date(currentDate);
      proposedTime.setHours(prefHour, prefMinute, 0, 0);
      
      // If there's a conflict, try 1 hour later (up to 3 attempts)
      let scheduled = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const attemptTime = new Date(proposedTime.getTime() + attempt * 60 * 60 * 1000);
        
        if (!hasConflict(attemptTime, sessionDuration, existingEvents)) {
          const sessionNum = sessionsInCurrentWeek + 1;
          const sessionContent = generateSessionContent(currentWeek, sessionNum, sessionsPerWeek, plan);
          
          const endTime = new Date(attemptTime.getTime() + sessionDuration * 60 * 1000);
          
          // Save event to database
          const eventResult = await query(
            `INSERT INTO events (user_id, title, description, start_time, end_time, duration_minutes, 
               event_type, plan_id, week_number, session_number, status, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, 'deporte', $7, $8, $9, 'scheduled', $10)
             RETURNING *`,
            [
              userId,
              sessionContent.title,
              sessionContent.description,
              attemptTime.toISOString(),
              endTime.toISOString(),
              sessionDuration,
              planId,
              currentWeek,
              sessionNum,
              JSON.stringify({ plan_type: plan.plan_type, level: plan.level, goal: plan.goal })
            ]
          );
          
          scheduledSessions.push(eventResult.rows[0]);
          
          // Add to existing events to prevent self-conflicts
          existingEvents.push({
            start_time: attemptTime.toISOString(),
            end_time: endTime.toISOString(),
            duration_minutes: sessionDuration
          });
          
          sessionsInCurrentWeek++;
          sessionsScheduled++;
          scheduled = true;
          break;
        }
      }
      
      if (!scheduled) {
        console.warn(`[Scheduler] Could not schedule session for week ${currentWeek}, will retry next day`);
      }
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
    
    // Check if we've moved to a new week
    const weekDiff = Math.floor((currentDate - weekStartDate) / (7 * 24 * 60 * 60 * 1000));
    if (weekDiff >= currentWeek) {
      sessionsInCurrentWeek = 0;
      currentWeek++;
      weekStartDate.setDate(weekStartDate.getDate() + 7);
    }
  }
  
  // Update plan with schedule summary
  await query(
    'UPDATE plans SET schedule = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(scheduledSessions.map(s => ({ id: s.id, start_time: s.start_time, title: s.title }))), planId]
  );
  
  console.log(`[Scheduler] ✅ Scheduled ${scheduledSessions.length} sessions for plan ${planId}`);
  return scheduledSessions;
}

/**
 * Get schedule summary for a plan
 */
async function getPlanSchedule(userId, planId) {
  const result = await query(
    `SELECT e.*, p.title as plan_title
     FROM events e
     JOIN plans p ON p.id = e.plan_id
     WHERE e.user_id = $1 AND e.plan_id = $2 AND e.status != 'cancelled'
     ORDER BY e.start_time ASC`,
    [userId, planId]
  );
  return result.rows;
}

/**
 * Generate a human-readable schedule summary
 */
function formatScheduleSummary(sessions) {
  if (!sessions.length) return 'No hay sesiones programadas.';
  
  const byWeek = {};
  sessions.forEach(session => {
    const week = session.week_number || 1;
    if (!byWeek[week]) byWeek[week] = [];
    byWeek[week].push(session);
  });
  
  let summary = `📅 Plan programado: ${sessions.length} sesiones\n\n`;
  
  Object.entries(byWeek).forEach(([week, weekSessions]) => {
    summary += `**Semana ${week}:**\n`;
    weekSessions.forEach(session => {
      const date = new Date(session.start_time);
      const dayName = DAY_NAMES_ES[date.getDay()];
      const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      summary += `  • ${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${date.getDate()}/${date.getMonth()+1} a las ${timeStr}\n`;
    });
    summary += '\n';
  });
  
  return summary;
}

module.exports = { schedulePlan, getPlanSchedule, formatScheduleSummary };
