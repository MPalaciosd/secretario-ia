// ─── api/controllers/authController.js ───────────────────────────────
// Handles HTTP layer for auth routes.
// Business logic is delegated to otpService; DB queries stay minimal here.

'use strict';

const { query } = require('../../db/database');
const { generateToken } = require('../middleware/auth');
const { createAndSendOTP, verifyOTP, consumeOTP } = require('../../services/otpService');
const { sendWelcomeEmail } = require('../../services/emailService');
const { isValidEmail, sanitizeString } = require('../middleware/validate');
const { AppError } = require('../middleware/errorHandler');

const MAX_NAME_LENGTH     = 100;
const MAX_TIMEZONE_LENGTH = 50;

// ── POST /api/auth/register ──────────────────────────────────────────

async function register(req, res, next) {
  const { email, name, timezone = 'UTC' } = req.body;

  if (!isValidEmail(email)) return next(new AppError('Email inválido', 400));

  const cleanName = sanitizeString(name, MAX_NAME_LENGTH);
  if (!cleanName) return next(new AppError('Nombre inválido', 400));

  const cleanTimezone = sanitizeString(timezone, MAX_TIMEZONE_LENGTH);

  try {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      // Generic — prevent user enumeration
      return res.status(409).json({ error: 'Si ya tienes cuenta, inicia sesión.' });
    }

    const result = await query(
      `INSERT INTO users (email, name, timezone)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, timezone, subscription_status, created_at`,
      [email.toLowerCase(), cleanName, cleanTimezone || 'UTC']
    );
    const user = result.rows[0];

    await createAndSendOTP(user.id, user.email, user.name);
    sendWelcomeEmail(user.email, user.name).catch(console.error);

    console.log('[Auth] New user registered:', user.id);
    res.status(201).json({
      success: true,
      message: 'Cuenta creada. Revisa tu email para verificar tu identidad.',
      userId: user.id,
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/auth/login/request ─────────────────────────────────────

async function loginRequest(req, res, next) {
  const { email } = req.body;
  if (!isValidEmail(email)) return next(new AppError('Email inválido', 400));

  try {
    const result = await query(
      'SELECT id, name, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length) {
      const user = result.rows[0];
      await createAndSendOTP(user.id, user.email, user.name);
    }

    // Always 200 — never reveal if email exists (anti-enumeration)
    res.json({
      success: true,
      message: 'Si existe una cuenta con ese email, recibirás un código de acceso.',
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/auth/login/verify ──────────────────────────────────────

async function loginVerify(req, res, next) {
  const { email, otp } = req.body;

  if (!isValidEmail(email)) return next(new AppError('Email inválido', 400));
  if (!otp || !/^\d{6}$/.test(otp)) return next(new AppError('Código inválido', 400));

  const INVALID_MSG = 'Código inválido o expirado';

  try {
    const result = await query(
      `SELECT u.id, u.email, u.name, u.timezone, u.subscription_status
       FROM users u
       JOIN email_otps o ON o.user_id = u.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: INVALID_MSG });
    }

    const user = result.rows[0];
    const verification = await verifyOTP(user.id, otp);

    if (!verification.valid) {
      if (verification.reason === 'too_many_attempts') {
        return res.status(429).json({ error: 'Demasiados intentos. Solicita un nuevo código.' });
      }
      return res.status(401).json({ error: INVALID_MSG });
    }

    await consumeOTP(user.id);
    const token = generateToken(user.id);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        timezone: user.timezone,
        subscription_status: user.subscription_status,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/auth/login — legacy (dev only) ─────────────────────────

async function legacyLogin(req, res, next) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Use /api/auth/login/request and /api/auth/login/verify' });
  }

  const { email } = req.body;
  if (!isValidEmail(email)) return next(new AppError('Email inválido', 400));

  try {
    const result = await query(
      'SELECT id, email, name, timezone, subscription_status FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (!result.rows.length) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    const user = result.rows[0];
    const token = generateToken(user.id);
    res.json({ success: true, token, user });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/auth/me ─────────────────────────────────────────────────

async function getMe(req, res, next) {
  try {
    const result = await query(
      `SELECT id, email, name, timezone, subscription_status, created_at, preferences
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!result.rows.length) return next(new AppError('Usuario no encontrado', 404));
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// ── PUT /api/auth/me ─────────────────────────────────────────────────

async function updateMe(req, res, next) {
  const { name, timezone } = req.body;
  const updates = [];
  const values  = [];
  let i = 1;

  if (name !== undefined) {
    const cleanName = sanitizeString(name, MAX_NAME_LENGTH);
    if (!cleanName) return next(new AppError('Nombre inválido', 400));
    updates.push(`name = $${i++}`);
    values.push(cleanName);
  }

  if (timezone !== undefined) {
    const cleanTz = sanitizeString(timezone, MAX_TIMEZONE_LENGTH);
    if (!cleanTz) return next(new AppError('Timezone inválido', 400));
    updates.push(`timezone = $${i++}`);
    values.push(cleanTz);
  }

  if (!updates.length) return next(new AppError('Sin campos para actualizar', 400));

  values.push(req.user.id);

  try {
    const result = await query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${i}
       RETURNING id, email, name, timezone`,
      values
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  loginRequest,
  loginVerify,
  legacyLogin,
  getMe,
  updateMe,
};
