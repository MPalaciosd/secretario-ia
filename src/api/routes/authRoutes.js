// ─── api/routes/authRoutes.js ────────────────────────────────────────
// Route definitions only — all logic lives in authController.js

'use strict';

const express = require('express');
const router  = express.Router();

const {
  register,
  loginRequest,
  loginVerify,
  legacyLogin,
  getMe,
  updateMe,
} = require('../controllers/authController');

const { authMiddleware } = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiter');

// ── Registration ─────────────────────────────────────────────────────
router.post('/register',       authLimiter, register);

// ── OTP-based login ───────────────────────────────────────────────────
router.post('/login/request',  authLimiter, loginRequest);
router.post('/login/verify',   otpLimiter,  loginVerify);

// ── Legacy login (dev only — blocked in production) ───────────────────
router.post('/login',          authLimiter, legacyLogin);

// ── Profile ───────────────────────────────────────────────────────────
router.get('/me',  authMiddleware, getMe);
router.put('/me',  authMiddleware, updateMe);

module.exports = router;
