const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { globalLimiter } = require('./middleware/rateLimiter');
const config = require('../config');

// ─── ROUTE IMPORTS ────────────────────────────────────────────────────────────
const chatRoutes = require('./routes/chatRoutes');
const eventRoutes = require('./routes/eventRoutes');
const planRoutes = require('./routes/planRoutes');
const authRoutes = require('./routes/authRoutes');
const stripeRoutes = require('./routes/stripeRoutes');

let app;
let server;

function getApp() {
  return app;
}

function startServer() {
  app = express();
  
  // ── Security middleware ───────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false // disabled for API
  }));
  
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true
  }));
  
  // ── Stripe webhook needs raw body (must be BEFORE express.json) ──────────
  app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
  
  // ── Body parsing ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  // ── Global rate limiting ──────────────────────────────────────────────────
  app.use(globalLimiter);
  
  // ── Request logging (development) ─────────────────────────────────────────
  if (config.server.env === 'development') {
    app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }
  
  // ── Static files (frontend) ────────────────────────────────────────────────
  app.use(express.static('public'));
  
  // ── API Routes ─────────────────────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/plans', planRoutes);
  app.use('/api/stripe', stripeRoutes);
  
  // ── Health check ───────────────────────────────────────────────────────────
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '3.0.0',
      service: 'secretario-ia'
    });
  });
  
  // ── API docs endpoint ──────────────────────────────────────────────────────
  app.get('/api', (req, res) => {
    res.json({
      service: 'Secretario IA API',
      version: '3.0.0',
      endpoints: {
        'POST /api/auth/register': 'Register new user',
        'POST /api/auth/login': 'Login and get JWT token',
        'POST /api/chat': 'Send message to AI assistant',
        'GET /api/events': 'Get user events',
        'POST /api/events': 'Create event',
        'PUT /api/events/:id': 'Update event',
        'DELETE /api/events/:id': 'Delete event',
        'GET /api/plans': 'Get user plans',
        'POST /api/plans': 'Create plan',
        'POST /api/plans/:id/schedule': 'Schedule plan in calendar',
        'GET /api/stripe/checkout': 'Get Stripe checkout URL',
        'POST /api/stripe/webhook': 'Stripe webhook handler',
        'GET /health': 'Health check'
      }
    });
  });
  
  // ── 404 handler ────────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada', path: req.path });
  });
  
  // ── Error handler ──────────────────────────────────────────────────────────
  app.use((err, req, res, next) => {
    console.error('[Server] Unhandled error:', err.message);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: config.server.env === 'development' ? err.message : undefined
    });
  });
  
  // ── Start listening ────────────────────────────────────────────────────────
  const PORT = config.server.port;
  server = app.listen(PORT, () => {
    console.log(`\n🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📡 Ambiente: ${config.server.env}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`📖 API docs: http://localhost:${PORT}/api`);
  });
  
  return server;
}

module.exports = { startServer, getApp };
