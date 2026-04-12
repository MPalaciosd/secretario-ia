const rateLimit = require('express-rate-limit');

// GLOBAL RATE LIMITER
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intentalo en 15 minutos.' }
});

// CHAT RATE LIMITER - keyed by user ID
const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user && req.user.id ? req.user.id : req.ip,
  message: { error: 'Demasiados mensajes. Por favor espera un momento.' }
});

// AUTH RATE LIMITER
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' }
});

// OTP VERIFY LIMITER
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => (req.body && req.body.email ? req.body.email.toLowerCase() : req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de verificacion. Espera 1 hora.' }
});

module.exports = { globalLimiter, rateLimiter, authLimiter, otpLimiter };
