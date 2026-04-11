const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createEvent, getEvents, updateEvent, deleteEvent, formatEventsResponse } = require('../../services/eventService');

/**
 * POST /api/events
 * Create a new event
 * Body: { title, date, time, duration_minutes?, description?, event_type? }
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const event = await createEvent(userId, req.body);
    res.status(201).json({ success: true, event });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/events
 * Get events list
 * Query params: date_from?, date_to?, event_type?
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date_from, date_to, event_type, format } = req.query;
    const events = await getEvents(userId, { dateFrom: date_from, dateTo: date_to, eventType: event_type });
    
    if (format === 'text') {
      return res.json({ success: true, response: formatEventsResponse(events), count: events.length });
    }
    
    res.json({ success: true, events, count: events.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/events/:id
 * Get single event
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const events = await getEvents(userId, {});
    const event = events.find(e => e.id === req.params.id);
    if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/events/:id
 * Update an event
 * Body: { title?, date?, time?, duration_minutes?, description?, event_type? }
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const event = await updateEvent(userId, req.params.id, req.body);
    res.json({ success: true, event });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/events/:id
 * Soft-delete (cancel) an event
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await deleteEvent(userId, req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
