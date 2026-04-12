// ─── api/controllers/eventController.js ─────────────────────────────
// HTTP layer for event routes. All DB access goes through eventService.

'use strict';

const {
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent,
  formatEventsResponse,
} = require('../../services/eventService');
const { AppError } = require('../middleware/errorHandler');

// ── POST /api/events ─────────────────────────────────────────────────

async function create(req, res, next) {
  try {
    const event = await createEvent(req.user.id, req.body);
    res.status(201).json({ success: true, event });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/events ──────────────────────────────────────────────────

async function list(req, res, next) {
  try {
    const { date_from, date_to, event_type, format } = req.query;
    const events = await getEvents(req.user.id, {
      dateFrom: date_from,
      dateTo:   date_to,
      eventType: event_type,
    });

    if (format === 'text') {
      return res.json({
        success: true,
        response: formatEventsResponse(events),
        count: events.length,
      });
    }
    res.json({ success: true, events, count: events.length });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/events/today ────────────────────────────────────────────

async function today(req, res, next) {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const events = await getEvents(req.user.id, {
      dateFrom: todayStr,
      dateTo:   todayStr,
    });
    res.json({ success: true, events, formatted: formatEventsResponse(events) });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/events/:id ──────────────────────────────────────────────

async function getOne(req, res, next) {
  try {
    const events = await getEvents(req.user.id, {});
    const event  = events.find((e) => e.id === req.params.id);
    if (!event) return next(new AppError('Evento no encontrado', 404));
    res.json({ success: true, event });
  } catch (err) {
    next(err);
  }
}

// ── PUT /api/events/:id ──────────────────────────────────────────────

async function update(req, res, next) {
  try {
    const event = await updateEvent(req.user.id, req.params.id, req.body);
    res.json({ success: true, event });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /api/events/:id ───────────────────────────────────────────

async function remove(req, res, next) {
  try {
    const result = await deleteEvent(req.user.id, req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, today, getOne, update, remove };
