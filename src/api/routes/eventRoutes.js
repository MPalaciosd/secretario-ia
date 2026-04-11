const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { checkEventLimit } = require('../middleware/subscription');
const { createEvent, getEvents, updateEvent, deleteEvent, formatEventsResponse } = require('../../services/eventService');

/**
 * POST /api/events
 * Create a new event
 * Free: max 20 events | PRO: unlimited
 */
router.post('/', [authMiddleware, checkEventLimit], async (req, res) => {
  try {
    const event = await createEvent(req.user.id, req.body);
    res.status(201).json({ success: true, event });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/events
 * Query params: date_from?, date_to?, event_type?, format?
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { date_from, date_to, event_type, format } = req.query;
    const events = await getEvents(req.user.id, { dateFrom: date_from, dateTo: date_to, eventType: event_type });
    if (format === 'text') {
      return res.json({ success: true, response: formatEventsResponse(events), count: events.length });
    }
    res.json({ success: true, events, count: events.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/events/today
 * Convenience: Get today's events
 */
router.get('/today', authMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const events = await getEvents(req.user.id, { dateFrom: today, dateTo: today });
    res.json({ success: true, events, formatted: formatEventsResponse(events) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/events/:id
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const events = await getEvents(req.user.id, {});
    const event = events.find(e => e.id === req.params.id);
    if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/events/:id
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const event = await updateEvent(req.user.id, req.params.id, req.body);
    res.json({ success: true, event });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/events/:id
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await deleteEvent(req.user.id, req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
