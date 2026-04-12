// ─── api/controllers/planController.js ──────────────────────────────
// HTTP layer for plan routes. Delegates to planService and schedulerService.

'use strict';

const {
  createPlan,
  getPlans,
  getPlanDetails,
  formatPlanResponse,
} = require('../../services/planService');
const {
  schedulePlan,
  getPlanSchedule,
  formatScheduleSummary,
} = require('../../services/schedulerService');
const { AppError } = require('../middleware/errorHandler');

// ── POST /api/plans ──────────────────────────────────────────────────

async function create(req, res, next) {
  try {
    const plan = await createPlan(req.user.id, req.body);
    res.status(201).json({
      success: true,
      plan,
      message: formatPlanResponse(plan),
      next_step: 'Call POST /api/plans/:id/schedule to schedule sessions in calendar',
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/plans ───────────────────────────────────────────────────

async function list(req, res, next) {
  try {
    const plans = await getPlans(req.user.id, req.query.status || 'active');
    res.json({ success: true, plans, count: plans.length });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/plans/:id ───────────────────────────────────────────────

async function getOne(req, res, next) {
  try {
    const plan = await getPlanDetails(req.user.id, req.params.id);
    res.json({
      success: true,
      plan,
      formatted: formatPlanResponse(plan, plan.sessions),
    });
  } catch (err) {
    next(new AppError(err.message, 404));
  }
}

// ── POST /api/plans/:id/schedule ─────────────────────────────────────

async function schedule(req, res, next) {
  try {
    const { start_date, preferred_days, preferred_time } = req.body;
    const sessions = await schedulePlan(req.user.id, req.params.id, {
      startDate:     start_date,
      preferredDays: preferred_days,
      preferredTime: preferred_time,
    });
    res.json({
      success: true,
      sessions_scheduled: sessions.length,
      summary: formatScheduleSummary(sessions),
      sessions,
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/plans/:id/sessions ──────────────────────────────────────

async function getSessions(req, res, next) {
  try {
    const sessions = await getPlanSchedule(req.user.id, req.params.id);
    res.json({
      success: true,
      sessions,
      summary: formatScheduleSummary(sessions),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getOne, schedule, getSessions };
