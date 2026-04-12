// ─── api/controllers/stripeController.js ────────────────────────────
// HTTP layer for Stripe routes. Delegates all Stripe logic to stripeService.

'use strict';

const {
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  getSubscriptionStatus,
} = require('../../services/stripeService');
const { AppError } = require('../middleware/errorHandler');

// ── URL validation helper ────────────────────────────────────────────

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

function isAllowedRedirectUrl(url) {
  if (!url) return true; // undefined = use default, always safe
  try {
    const parsed  = new URL(url);
    const allowed = new URL(APP_URL);
    return parsed.hostname === allowed.hostname;
  } catch {
    return false;
  }
}

// ── GET /api/stripe/checkout ─────────────────────────────────────────

async function checkout(req, res, next) {
  const { success_url, cancel_url } = req.query;

  if (!isAllowedRedirectUrl(success_url) || !isAllowedRedirectUrl(cancel_url)) {
    return next(new AppError('URL de redirección no permitida', 400));
  }

  try {
    const result = await createCheckoutSession(
      req.user.id,
      req.user.email,
      req.user.name,
      success_url,
      cancel_url
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/stripe/portal ───────────────────────────────────────────

async function portal(req, res, next) {
  const { return_url } = req.query;

  if (!isAllowedRedirectUrl(return_url)) {
    return next(new AppError('URL de redirección no permitida', 400));
  }

  try {
    const result = await createPortalSession(req.user.id, return_url);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/stripe/status ───────────────────────────────────────────

async function status(req, res, next) {
  try {
    const subscriptionStatus = await getSubscriptionStatus(req.user.id);
    res.json({ success: true, subscription: subscriptionStatus });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/stripe/webhook ─────────────────────────────────────────

async function webhook(req, res, next) {
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return next(new AppError('Missing stripe-signature header', 400));
  }

  try {
    const result = await handleWebhook(req.body, signature);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { checkout, portal, status, webhook };
