const jwt = require('jsonwebtoken');
const { query } = require('../../db/database');
const config = require('../../config');

/**
 * JWT Authentication Middleware
 * Verifies Bearer token — no dev bypasses, no x-user-id header
 */
async function authMiddleware(req, res, next) {
    try {
          const authHeader = req.headers.authorization;
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
                  return res.status(401).json({ error: 'Token de autorización requerido' });
          }

      const token = authHeader.substring(7);

      // Guard against oversized token payloads
      if (token.length > 512) {
              return res.status(401).json({ error: 'Token inválido' });
      }

      let decoded;
          try {
                  decoded = jwt.verify(token, config.jwt.secret);
          } catch (err) {
                  if (err.name === 'TokenExpiredError') {
                            return res.status(401).json({ error: 'Token expirado. Por favor vuelve a iniciar sesión.' });
                  }
                  return res.status(401).json({ error: 'Token inválido' });
          }

      const userId = decoded.userId || decoded.id;
          if (!userId) {
                  return res.status(401).json({ error: 'Token malformado' });
          }

      // Only select necessary columns — never SELECT *
      const userResult = await query(
              'SELECT id, email, name, timezone, subscription_status FROM users WHERE id = $1',
              [userId]
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
 * Optional auth — attaches user if valid token present, never blocks
 */
async function optionalAuth(req, res, next) {
    try {
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
                  const token = authHeader.substring(7);
                  if (token.length <= 512) {
                            const decoded = jwt.verify(token, config.jwt.secret);
                            const userId = decoded.userId || decoded.id;
                            if (userId) {
                                        const userResult = await query(
                                                      'SELECT id, email, name, timezone, subscription_status FROM users WHERE id = $1',
                                                      [userId]
                                                    );
                                        if (userResult.rows.length) {
                                                      req.user = userResult.rows[0];
                                        }
                            }
                  }
          }
    } catch (err) {
          // Silent fail — optional auth never blocks the request
    }
    next();
}

/**
       * Require active subscription (PRO or trial)
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
 * Generate JWT token — fails hard if secret is insecure
 */
function generateToken(userId) {
    if (!config.jwt.secret || config.jwt.secret === 'dev-secret-change-in-production') {
          throw new Error('[FATAL] JWT_SECRET not properly configured');
    }
    return jwt.sign(
      { userId },
          config.jwt.secret,
      { expiresIn: '7d' }  // Reduced from 30d to 7d
        );
}

module.exports = { authMiddleware, optionalAuth, requireSubscription, generateToken };
