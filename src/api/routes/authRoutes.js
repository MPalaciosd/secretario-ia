const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query } = require('../../db/database');
const { generateToken, authMiddleware } = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiter');
const { sendWelcomeEmail } = require('../../services/emailService');

// ─── Input validators ────────────────────────────────────────────
const MAX_NAME_LENGTH = 100;
const MAX_TIMEZONE_LENGTH = 50;

function validateEmail(email) {
  return typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeString(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.trim().substring(0, maxLen);
}

// ─── POST /api/auth/register ─────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  const { email, name, timezone = 'UTC' } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'Email y nombre son requeridos' });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Email invalido' });
  }

  const cleanName = sanitizeString(name, MAX_NAME_LENGTH);
  if (!cleanName) {
    return res.status(400).json({ error: 'Nombre invalido' });
  }

  const cleanTimezone = sanitizeString(timezone, MAX_TIMEZONE_LENGTH);

  try {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      // Generic message to prevent user enumeration
      return res.status(409).json({ error: 'Si ya tienes cuenta, inicia sesion.' });
    }

    const result = await query(
      `INSERT INTO users (email, name, timezone)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, timezone, subscription_status, created_at`,
      [email.toLowerCase(), cleanName, cleanTimezone || 'UTC']
    );

    const user = result.rows[0];

    // Generate OTP for email verification (15 min expiry)
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    await query(
      `INSERT INTO email_otps (user_id, otp_hash, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET otp_hash = $2, expires_at = $3, attempts = 0`,
      [user.id, otpHash, otpExpiry]
    );

    sendWelcomeEmail(user.email, user.name).catch(console.error);

    console.log('[Auth] New user registered:', user.id);

    // Do NOT return token until OTP is verified
    res.status(201).json({
      success: true,
      message: 'Cuenta creada. Revisa tu email para verificar tu identidad.',
      userId: user.id
    });
  } catch (err) {
    console.error('[Auth] Register error:', err.message);
    res.status(500).json({ error: 'Error al crear la cuenta' });
  }
});

// ─── POST /api/auth/login/request — request OTP ─────────────────
router.post('/login/request', authLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email || !validateEmail(email)) {
    return res.status(400).json({ error: 'Email invalido' });
  }

  try {
    const result = await query(
      'SELECT id, name, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length) {
      const user = result.rows[0];
      const otp = crypto.randomInt(100000, 999999).toString();
      const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

      await query(
        `INSERT INTO email_otps (user_id, otp_hash, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET otp_hash = $2, expires_at = $3, attempts = 0`,
        [user.id, otpHash, otpExpiry]
      );

      // Send OTP email (fire and forget)
      const { sendOTPEmail } = require('../../services/emailService');
      sendOTPEmail(user.email, user.name, otp).catch(console.error);
    }

    // Always 200 — never reveal if email exists (anti-enumeration)
    res.json({
      success: true,
      message: 'Si existe una cuenta con ese email, recibiras un codigo de acceso.'
    });
  } catch (err) {
    console.error('[Auth] Login request error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─── POST /api/auth/login/verify — verify OTP and get token ─────
router.post('/login/verify', otpLimiter, async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email y codigo son requeridos' });
  }
  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({ error: 'Codigo invalido' });
  }

  const INVALID_MSG = 'Codigo invalido o expirado';

  try {
    const result = await query(
      `SELECT u.id, u.email, u.name, u.timezone, u.subscription_status,
              o.otp_hash, o.expires_at, o.attempts
       FROM users u
       JOIN email_otps o ON o.user_id = u.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: INVALID_MSG });
    }

    const row = result.rows[0];

    // Max 5 failed attempts
    if (row.attempts >= 5) {
      return res.status(429).json({ error: 'Demasiados intentos. Solicita un nuevo codigo.' });
    }

    // Check expiry
    if (new Date() > new Date(row.expires_at)) {
      return res.status(401).json({ error: INVALID_MSG });
    }

    // Constant-time hash comparison
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expectedBuf = Buffer.from(row.otp_hash, 'utf8');
    const receivedBuf = Buffer.from(otpHash, 'utf8');

    if (expectedBuf.length !== receivedBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
      await query('UPDATE email_otps SET attempts = attempts + 1 WHERE user_id = $1', [row.id]);
      return res.status(401).json({ error: INVALID_MSG });
    }

    // Valid OTP — delete it and issue token
    await query('DELETE FROM email_otps WHERE user_id = $1', [row.id]);

    const token = generateToken(row.id);
    res.json({
      success: true,
      token,
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        timezone: row.timezone,
        subscription_status: row.subscription_status
      }
    });
  } catch (err) {
    console.error('[Auth] Verify error:', err.message);
    res.status(500).json({ error: 'Error de verificacion' });
  }
});

// ─── POST /api/auth/login — legacy direct login (dev/migration only) ─
// SECURITY NOTE: This grants a token with just email — only active in development
router.post('/login', authLimiter, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Use /api/auth/login/request and /api/auth/login/verify' });
  }

  const { email } = req.body;
  if (!email || !validateEmail(email)) {
    return res.status(400).json({ error: 'Email invalido' });
  }

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
    console.error('[Auth] Legacy login error:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesion' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, name, timezone, subscription_status, created_at, preferences
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('[Auth] /me error:', err.message);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// ─── PUT /api/auth/me ─────────────────────────────────────────────
router.put('/me', authMiddleware, async (req, res) => {
  const { name, timezone } = req.body;
  const updates = [];
  const values = [];
  let i = 1;

  if (name !== undefined) {
    const cleanName = sanitizeString(name, MAX_NAME_LENGTH);
    if (!cleanName) return res.status(400).json({ error: 'Nombre invalido' });
    updates.push(`name = $${i++}`);
    values.push(cleanName);
  }

  if (timezone !== undefined) {
    const cleanTz = sanitizeString(timezone, MAX_TIMEZONE_LENGTH);
    if (!cleanTz) return res.status(400).json({ error: 'Timezone invalido' });
    updates.push(`timezone = $${i++}`);
    values.push(cleanTz);
  }

  if (!updates.length) {
    return res.status(400).json({ error: 'Sin campos para actualizar' });
  }

  values.push(req.user.id);
  try {
    const result = await query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${i} RETURNING id, email, name, timezone`,
      values
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('[Auth] PUT /me error:', err.message);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

module.exports = router;
