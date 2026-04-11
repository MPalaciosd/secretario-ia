const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { requirePro } = require('../middleware/subscription');
const { createPlan, getPlans, getPlanDetails, formatPlanResponse } = require('../../services/planService');
const { schedulePlan, getPlanSchedule, formatScheduleSummary } = require('../../services/schedulerService');

/**
 * POST /api/plans
 * Create a new AI-generated plan — PRO ONLY
 * Body: { weeks, goal, level, sessions_per_week?, session_duration_minutes?, focus_areas? }
 */
router.post('/', [authMiddleware, requirePro], async (req, res) => {
  try {
    const plan = await createPlan(req.user.id, req.body);
    res.status(201).json({
      success: true,
      plan,
      message: formatPlanResponse(plan),
      next_step: 'Call POST /api/plans/:id/schedule to schedule sessions in calendar'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/plans
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const plans = await getPlans(req.user.id, req.query.status || 'active');
    res.json({ success: true, plans, count: plans.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/plans/:id
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const plan = await getPlanDetails(req.user.id, req.params.id);
    res.json({ success: true, plan, formatted: formatPlanResponse(plan, plan.sessions) });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * POST /api/plans/:id/schedule — PRO ONLY
 * Schedule a plan's sessions intelligently in the calendar
 */
router.post('/:id/schedule', [authMiddleware, requirePro], async (req, res) => {
  try {
    const { start_date, preferred_days, preferred_time } = req.body;
    const sessions = await schedulePlan(req.user.id, req.params.id, {
      startDate: start_date,
      preferredDays: preferred_days,
      preferredTime: preferred_time
    });
    res.json({
      success: true,
      sessions_scheduled: sessions.length,
      summary: formatScheduleSummary(sessions),
      sessions
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/plans/:id/sessions
 * Get all scheduled sessions for a plan
 */
router.get('/:id/sessions', authMiddleware, async (req, res) => {
  try {
    const sessions = await getPlanSchedule(req.user.id, req.params.id);
    res.json({ success: true, sessions, summary: formatScheduleSummary(sessions) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
