const rateLimit = require('express-rate-limit');

// ─── GLOBAL RATE LIMITER ──────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Inténtalo en 15 minutos.' }
});

// ─── CHAT RATE LIMITER ────────────────────────────────────────────────────────
const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Demasiados mensajes. Por favor espera un momento.' }
});

// ─── AUTH RATE LIMITER ────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de autenticación. Espera 15 minutos.' }
});

module.exports = { globalLimiter, rateLimiter, authLimiter };
