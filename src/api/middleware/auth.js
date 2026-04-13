const jwt = require('jsonwebtoken');
const { query } = require('../../db/database');
const config = require('../../config');

/**
 * JWT Authentication Middleware
 * Selects id, email, name, timezone, subscription_status — no extra SELECT needed downstream.
 */
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autorizacion requerido' });
    }
    const token = authHeader.substring(7);
    if (token.length > 512) return res.status(401).json({ error: 'Token invalido' });
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expirado. Por favor vuelve a iniciar sesion.' });
      return res.status(401).json({ error: 'Token invalido' });
    }
    const userId = decoded.userId || decoded.id;
    if (!userId) return res.status(401).json({ error: 'Token malformado' });
    // Select all fields needed by downstream handlers — avoids repeated SELECT in chatController
    const userResult = await query(
      'SELECT id, email, name, timezone, subscription_status FROM users WHERE id = $1',
      [userId]
    );
    if (!userResult.rows.length) return res.status(401).json({ error: 'Usuario no encontrado' });
    req.user = userResult.rows[0];
    next();
  } catch (err) {
    console.error('[Auth] Middleware error:', err.message);
    return res.status(500).json({ error: 'Error de autenticacion' });
  }
}

async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token.length <= 512) {
        const decoded = jwt.verify(token, config.jwt.secret);
        const userId = decoded.userId || decoded.id;
        if (userId) {
          const r = await query('SELECT id, email, name, timezone, subscription_status FROM users WHERE id = $1', [userId]);
          if (r.rows.length) req.user = r.rows[0];
        }
      }
    }
  } catch (err) { /* silent */ }
  next();
}

function requireSubscription(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  if (req.user.subscription_status !== 'active' && req.user.subscription_status !== 'trial') {
    return res.status(403).json({ error: 'Suscripcion requerida', message: 'Esta funcionalidad requiere una suscripcion activa', upgrade_url: '/api/stripe/checkout' });
  }
  next();
}

function generateToken(userId) {
  if (!config.jwt.secret || config.jwt.secret === 'dev-secret-change-in-production') {
    throw new Error('[FATAL] JWT_SECRET not properly configured');
  }
  return jwt.sign({ userId }, config.jwt.secret, { expiresIn: '7d' });
}

module.exports = { authMiddleware, optionalAuth, requireSubscription, generateToken };
