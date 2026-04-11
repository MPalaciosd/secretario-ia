const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { createCheckoutSession, createPortalSession, handleWebhook, getSubscriptionStatus } = require('../../services/stripeService');

/**
 * GET /api/stripe/checkout
 * Create a Stripe checkout session for subscription
 */
router.get('/checkout', authMiddleware, async (req, res) => {
  try {
    const { success_url, cancel_url } = req.query;
    const result = await createCheckoutSession(
      req.user.id,
      req.user.email,
      req.user.name,
      success_url,
      cancel_url
    );
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/stripe/portal
 * Create a Stripe customer portal session for managing subscription
 */
router.get('/portal', authMiddleware, async (req, res) => {
  try {
    const result = await createPortalSession(req.user.id, req.query.return_url);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/stripe/webhook
 * Stripe webhook handler
 * Note: This route receives raw body (configured in server.js BEFORE express.json)
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
