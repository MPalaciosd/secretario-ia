const express = require('express');
const router = express.Router();
const { query } = require('../../db/database');
const { generateToken, authMiddleware } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { sendWelcomeEmail } = require('../../services/emailService');

/**
 * POST /api/auth/register
 * Register a new user
 * Body: { email, name, timezone? }
 */
router.post('/register', authLimiter, async (req, res) => {
  const { email, name, timezone = 'UTC' } = req.body;
  
  if (!email || !name) {
    return res.status(400).json({ error: 'Email y nombre son requeridos' });
  }
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  
  try {
    // Check if user already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Ya existe una cuenta con este email' });
    }
    
    // Create user
    const result = await query(
      `INSERT INTO users (email, name, timezone) VALUES ($1, $2, $3) RETURNING id, email, name, timezone, subscription_status, created_at`,
      [email.toLowerCase(), name.trim(), timezone]
    );
    
    const user = result.rows[0];
    const token = generateToken(user.id);
    
    // Send welcome email (fire and forget)
    sendWelcomeEmail(user.email, user.name).catch(console.error);
    
    console.log('[Auth] New user registered:', user.id, user.email);
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        timezone: user.timezone,
        subscription_status: user.subscription_status
      }
    });
  } catch (err) {
    console.error('[Auth] Register error:', err.message);
    res.status(500).json({ error: 'Error al crear la cuenta' });
  }
});

/**
 * POST /api/auth/login
 * Login with email (passwordless — sends magic link in production)
 * For simplicity, this implementation uses email as identity
 * Body: { email }
 */
router.post('/login', authLimiter, async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email requerido' });
  }
  
  try {
    const result = await query(
      'SELECT id, email, name, timezone, subscription_status FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado. ¿Quieres registrarte?' });
    }
    
    const user = result.rows[0];
    const token = generateToken(user.id);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        timezone: user.timezone,
        subscription_status: user.subscription_status
      }
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.*, up.preferred_workout_days, up.preferred_workout_time, 
              up.fitness_level, up.goals, up.availability
       FROM users u
       LEFT JOIN user_preferences up ON up.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const { stripe_customer_id, ...safeUser } = result.rows[0];
    res.json({ success: true, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/auth/me
 * Update user profile
 * Body: { name?, timezone? }
 */
router.put('/me', authMiddleware, async (req, res) => {
  const { name, timezone } = req.body;
  
  try {
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (name) { updates.push(`name = $${paramIndex}`); values.push(name); paramIndex++; }
    if (timezone) { updates.push(`timezone = $${paramIndex}`); values.push(timezone); paramIndex++; }
    
    if (!updates.length) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }
    
    values.push(req.user.id);
    const result = await query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING id, email, name, timezone`,
      values
    );
    
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
