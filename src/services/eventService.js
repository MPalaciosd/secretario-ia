const { query } = require('../db/database');

// ─── BUSINESS RULES VALIDATION ────────────────────────────────
function validateEventData(data) {
  const errors = [];
  if (!data.title || data.title.trim() === '') {
    errors.push('El título del evento es requerido');
  }
  if (!data.date) {
    errors.push('La fecha del evento es requerida');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    errors.push('Formato de fecha inválido. Use YYYY-MM-DD');
  }
  if (!data.time) {
    errors.push('La hora del evento es requerida');
  } else if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(data.time)) {
    errors.push('Formato de hora inválido. Use HH:MM');
  }
  return errors;
}

// ─── CREATE EVENT ─────────────────────────────────────────────
async function createEvent(userId, data) {
  const validationErrors = validateEventData(data);
  if (validationErrors.length > 0) {
    throw new Error('Datos inválidos: ' + validationErrors.join(', '));
  }

  const startTime = new Date(data.date + 'T' + data.time + ':00');
  if (isNaN(startTime.getTime())) {
    throw new Error('Fecha u hora inválida');
  }

  const endTime = data.duration_minutes
    ? new Date(startTime.getTime() + data.duration_minutes * 60 * 1000)
    : null;

  // Check for conflicts — log warning but DO NOT block creation
  const conflictCheck = await query(
    `SELECT id, title, start_time FROM events
     WHERE user_id = $1
     AND status != 'cancelled'
     AND start_time BETWEEN $2 AND $3`,
    [userId,
     new Date(startTime.getTime() - 30 * 60 * 1000).toISOString(),
     endTime ? endTime.toISOString() : new Date(startTime.getTime() + 60 * 60 * 1000).toISOString()]
  );
  if (conflictCheck.rows.length > 0) {
    console.warn('[EventService] Overlap with "' + conflictCheck.rows[0].title + '" — creating anyway');
  }

  const result = await query(
    `INSERT INTO events
       (user_id, title, description, start_time, end_time, duration_minutes, event_type, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      userId,
      data.title.trim(),
      data.description || null,
      startTime.toISOString(),
      endTime ? endTime.toISOString() : null,
      data.duration_minutes || null,
      data.event_type || 'general',
      JSON.stringify({})
    ]
  );
  return result.rows[0];
}

// ─── GET EVENTS ───────────────────────────────────────────────
async function getEvents(userId, options = {}) {
  const { dateFrom, dateTo, eventType, planId } = options;
  let sqlQuery = `
    SELECT e.*, p.title as plan_title
    FROM events e
    LEFT JOIN plans p ON p.id = e.plan_id
    WHERE e.user_id = $1 AND e.status != 'cancelled'`;
  const params = [userId];
  let paramIndex = 2;

  if (dateFrom) {
    sqlQuery += ` AND e.start_time >= $${paramIndex}`;
    params.push(new Date(dateFrom).toISOString());
    paramIndex++;
  }
  if (dateTo) {
    sqlQuery += ` AND e.start_time <= $${paramIndex}`;
    params.push(new Date(dateTo + 'T23:59:59').toISOString());
    paramIndex++;
  }
  if (eventType) {
    sqlQuery += ` AND e.event_type = $${paramIndex}`;
    params.push(eventType);
    paramIndex++;
  }
  if (planId) {
    sqlQuery += ` AND e.plan_id = $${paramIndex}`;
    params.push(planId);
    paramIndex++;
  }
  sqlQuery += ' ORDER BY e.start_time ASC LIMIT 50';

  const result = await query(sqlQuery, params);
  return result.rows;
}

// ─── UPDATE EVENT ─────────────────────────────────────────────
async function updateEvent(userId, eventId, data) {
  const existing = await query('SELECT * FROM events WHERE id = $1 AND user_id = $2', [eventId, userId]);
  if (!existing.rows.length) throw new Error('Evento no encontrado');

  const updateFields = [];
  const values = [];
  let paramIndex = 1;

  if (data.title)                     { updateFields.push(`title = $${paramIndex}`);       values.push(data.title);       paramIndex++; }
  if (data.description !== undefined) { updateFields.push(`description = $${paramIndex}`); values.push(data.description); paramIndex++; }
  if (data.event_type)                { updateFields.push(`event_type = $${paramIndex}`);  values.push(data.event_type);  paramIndex++; }
  if (data.status)                    { updateFields.push(`status = $${paramIndex}`);       values.push(data.status);      paramIndex++; }

  if (data.date && data.time) {
    const newStart = new Date(data.date + 'T' + data.time + ':00');
    updateFields.push(`start_time = $${paramIndex}`);
    values.push(newStart.toISOString());
    paramIndex++;
    const dur = data.duration_minutes || existing.rows[0].duration_minutes;
    if (dur) {
      updateFields.push(`end_time = $${paramIndex}`);
      values.push(new Date(newStart.getTime() + dur * 60 * 1000).toISOString());
      paramIndex++;
    }
  }
  if (data.duration_minutes) { updateFields.push(`duration_minutes = $${paramIndex}`); values.push(data.duration_minutes); paramIndex++; }

  if (updateFields.length === 0) throw new Error('No hay campos para actualizar');
  updateFields.push('updated_at = NOW()');
  values.push(eventId, userId);

  const result = await query(
    `UPDATE events SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING *`,
    values
  );
  return result.rows[0];
}

// ─── DELETE EVENT ─────────────────────────────────────────────
async function deleteEvent(userId, eventId) {
  const result = await query(
    `UPDATE events SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id, title`,
    [eventId, userId]
  );
  if (!result.rows.length) throw new Error('Evento no encontrado');
  return result.rows[0];
}

// ─── FORMAT EVENTS ────────────────────────────────────────────
function formatEventsResponse(events) {
  if (!events.length) return 'No tienes eventos programados para ese período.';

  const byDay = {};
  events.forEach(event => {
    const date   = new Date(event.start_time);
    const dayKey = date.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
    if (!byDay[dayKey]) byDay[dayKey] = [];
    byDay[dayKey].push(event);
  });

  let response = '';
  Object.entries(byDay).forEach(([day, dayEvents]) => {
    response += `📅 **${day.charAt(0).toUpperCase() + day.slice(1)}:**\n`;
    dayEvents.forEach(event => {
      const time     = new Date(event.start_time).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
      const duration = event.duration_minutes ? ` (${event.duration_minutes} min)` : '';
      response += ` • ${time} — ${event.title}${duration}\n`;
    });
    response += '\n';
  });
  return response;
}

module.exports = { createEvent, getEvents, updateEvent, deleteEvent, formatEventsResponse };
