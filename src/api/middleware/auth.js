const jwt = require('jsonwebtoken');
const { query } = require('../../db/database');
const config = require('../../config');

/**
 * JWT Authentication Middleware
 * Verifies the JWT token and attaches user to req.user
 * Supports Bearer token in Authorization header or x-user-id header for dev
 */
async function authMiddleware(req, res, next) {
  try {
    // Development bypass: allow userId in header (ONLY in dev mode)
    if (process.env.NODE_ENV === 'development' && req.headers['x-user-id']) {
      const userId = req.headers['x-user-id'];
      const userResult = await query('SELECT * FROM users WHERE id = $1', [userId]);
      if (userResult.rows.length) {
        req.user = userResult.rows[0];
        return next();
      }
    }
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autorización requerido' });
    }
    
    const token = authHeader.substring(7);
    
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expirado, por favor vuelve a iniciar sesión' });
      }
      return res.status(401).json({ error: 'Token inválido' });
    }
    
    // Verify user exists in DB
    const userResult = await query(
      'SELECT id, email, name, timezone, subscription_status FROM users WHERE id = $1',
      [decoded.userId || decoded.id]
    );
    
    if (!userResult.rows.length) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    
    req.user = userResult.rows[0];
    next();
  } catch (err) {
    console.error('[Auth] Middleware error:', err.message);
    return res.status(500).json({ error: 'Error de autenticación' });
  }
}

/**
 * Optional auth middleware — doesn't block if no token, but attaches user if present
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, config.jwt.secret);
      const userResult = await query(
        'SELECT id, email, name, timezone, subscription_status FROM users WHERE id = $1',
        [decoded.userId || decoded.id]
      );
      if (userResult.rows.length) {
        req.user = userResult.rows[0];
      }
    }
  } catch (err) {
    // Silent fail for optional auth
  }
  next();
}

/**
 * Check if user has active subscription
 */
function requireSubscription(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  
  if (req.user.subscription_status !== 'active' && req.user.subscription_status !== 'trial') {
    return res.status(403).json({ 
      error: 'Suscripción requerida',
      message: 'Esta funcionalidad requiere una suscripción activa',
      upgrade_url: '/api/stripe/checkout'
    });
  }
  
  next();
}

/**
 * Generate JWT token for a user
 */
function generateToken(userId) {
  return jwt.sign(
    { userId, id: userId },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

module.exports = { authMiddleware, optionalAuth, requireSubscription, generateToken };
