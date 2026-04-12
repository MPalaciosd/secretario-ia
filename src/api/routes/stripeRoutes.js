// ─── api/routes/stripeRoutes.js ──────────────────────────────────────
// Route definitions only — all logic lives in stripeController.js

'use strict';

const express = require('express');
const router  = express.Router();

const {
  checkout,
  portal,
  status,
  webhook,
} = require('../controllers/stripeController');

const { authMiddleware } = require('../middleware/auth');

// ── Webhook — raw body required (configured in server.js) ─────────────
router.post('/webhook', webhook);

// ── Authenticated routes ──────────────────────────────────────────────
router.get('/checkout', authMiddleware, checkout);
router.get('/portal',   authMiddleware, portal);
router.get('/status',   authMiddleware, status);

module.exports = router;
