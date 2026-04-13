const rateLimit = require('express-rate-limit');

// GLOBAL LIMITER — raised to 300/15min to avoid blocking normal usage during development
// and bursty traffic on single-user free-tier deployment.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,                  // was 100 — caused false positives during active sessions
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intentalo en 15 minutos.' }
});

// CHAT LIMITER — 30 msgs/min per user (was 20). Free plan weekly cap enforced separately.
const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user && req.user.id ? req.user.id : req.ip,
  message: { error: 'Demasiados mensajes. Por favor espera un momento.' }
});

// AUTH LIMITER — 10 attempts / 15 min (was 5 — too strict for OTP retries)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' }
});

// OTP VERIFY LIMITER — unchanged
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => (req.body && req.body.email ? req.body.email.toLowerCase() : req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de verificacion. Espera 1 hora.' }
});

module.exports = { globalLimiter, rateLimiter, authLimiter, otpLimiter };
