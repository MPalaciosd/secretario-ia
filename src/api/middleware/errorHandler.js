// ─── middleware/errorHandler.js ──────────────────────────────────────
// Global Express error-handling middleware.
// Mount LAST in server.js: app.use(errorHandler)
//
// Usage in routes/controllers:
//   const err = new Error('Mensaje'); err.status = 400; next(err);
//   — or simply —
//   next(new AppError('Mensaje', 400));

'use strict';

// ── Custom error class ───────────────────────────────────────────────

class AppError extends Error {
  /**
   * @param {string} message - User-facing error message
   * @param {number} status  - HTTP status code (default 500)
   */
  constructor(message, status = 500) {
    super(message);
    this.name  = 'AppError';
    this.status = status;
  }
}

// ── Error-handling middleware (4-arg signature required by Express) ───

/**
 * Catches any error passed via next(err) and sends a clean JSON response.
 * Never leaks stack traces or internal details in production.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // Determine status code
  const status = err.status || err.statusCode || 500;

  // Log full error internally (not to client)
  if (status >= 500) {
    console.error(`[Error] ${req.method} ${req.path} → ${status}: ${err.message}`);
    if (process.env.NODE_ENV !== 'production') {
      console.error(err.stack);
    }
  } else {
    // 4xx: operational errors — log at warn level only
    console.warn(`[Warn] ${req.method} ${req.path} → ${status}: ${err.message}`);
  }

  // CORS errors get a specific status
  if (err.message && err.message.startsWith('CORS policy:')) {
    return res.status(403).json({ error: 'Acceso no permitido' });
  }

  // In production hide 5xx details from client
  const clientMessage =
    status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message || 'Error interno del servidor';

  res.status(status).json({ error: clientMessage });
}

module.exports = { errorHandler, AppError };
