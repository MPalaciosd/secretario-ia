const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createCheckoutSession, createPortalSession, handleWebhook, getSubscriptionStatus } = require('../../services/stripeService');

// ─── Validate redirect URLs to prevent open redirect attacks ──────
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

function isAllowedRedirectUrl(url) {
  if (!url) return true; // undefined = use default, always safe
  try {
    const parsed = new URL(url);
    const allowed = new URL(APP_URL);
    return parsed.hostname === allowed.hostname;
  } catch {
    return false;
  }
}

/**
 * GET /api/stripe/checkout
 * Create a Stripe checkout session for subscription
 */
router.get('/checkout', authMiddleware, async (req, res) => {
  const { success_url, cancel_url } = req.query;

  // Validate redirect URLs — prevent open redirect to phishing sites
  if (success_url && !isAllowedRedirectUrl(success_url)) {
    return res.status(400).json({ error: 'URL de redireccion no permitida' });
  }
  if (cancel_url && !isAllowedRedirectUrl(cancel_url)) {
    return res.status(400).json({ error: 'URL de redireccion no permitida' });
  }

  try {
    const result = await createCheckoutSession(
      req.user.id, req.user.email, req.user.name,
      success_url, cancel_url
    );
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Stripe] Checkout error:', err.message);
    res.status(400).json({ error: 'Error al crear sesion de pago' });
  }
});

/**
 * GET /api/stripe/portal
 * Create a Stripe customer portal session
 */
router.get('/portal', authMiddleware, async (req, res) => {
  const { return_url } = req.query;

  if (return_url && !isAllowedRedirectUrl(return_url)) {
    return res.status(400).json({ error: 'URL de redireccion no permitida' });
  }

  try {
    const result = await createPortalSession(req.user.id, return_url);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Stripe] Portal error:', err.message);
    res.status(400).json({ error: 'Error al acceder al portal' });
  }
});

/**
 * GET /api/stripe/status
 * Get current subscription status
 */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const status = await getSubscriptionStatus(req.user.id);
    res.json({ success: true, subscription: status });
  } catch (err) {
    console.error('[Stripe] Status error:', err.message);
    res.status(500).json({ error: 'Error al obtener estado de suscripcion' });
  }
});

/**
 * POST /api/stripe/webhook
 * Stripe webhook handler — raw body required (configured in server.js)
 */
router.post('/webhook', async (req, res) => {
  const signature = req.headers['stripe-signature'];

  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  try {
    const result = await handleWebhook(req.body, signature);
    res.json(result);
  } catch (err) {
    console.error('[Stripe] Webhook error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
