const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const { globalLimiter } = require('./middleware/rateLimiter');
const config = require('../config');

// ─── ROUTE IMPORTS ────────────────────────────────────────────
const chatRoutes = require('./routes/chatRoutes');
const eventRoutes = require('./routes/eventRoutes');
const planRoutes = require('./routes/planRoutes');
const authRoutes = require('./routes/authRoutes');
const stripeRoutes = require('./routes/stripeRoutes');

let app;
let server;

function getApp() { return app; }

function startServer() {
  app = express();

  // ── Security ──────────────────────────────────────────────
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*', credentials: true }));

  // ── Stripe webhook (raw body BEFORE express.json) ─────────
  app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

  // ── Body parsing ──────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Global rate limiting ──────────────────────────────────
  app.use(globalLimiter);

  // ── Request logging ───────────────────────────────────────
  if (config.server.env === 'development') {
    app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  // ── API Routes ─────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/plans', planRoutes);
  app.use('/api/stripe', stripeRoutes);

  // ── Subscription info endpoint ────────────────────────────
  app.get('/api/subscription', require('./middleware/auth').authMiddleware, async (req, res) => {
    const { getPlan } = require('./middleware/subscription');
    const { getSubscriptionStatus } = require('../services/stripeService');
    try {
      const liveStatus = await getSubscriptionStatus(req.user.id);
      const plan = getPlan(req.user.subscription_status);
      res.json({ success: true, subscription: liveStatus, plan: plan.name, features: plan.features });
    } catch (err) {
      const plan = getPlan(req.user.subscription_status);
      res.json({ success: true, subscription: { status: req.user.subscription_status }, plan: plan.name });
    }
  });

  // ── Health check ──────────────────────────────────────────
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '3.0.0', service: 'secretario-ia' });
  });

  // ── API docs ──────────────────────────────────────────────
  app.get('/api', (req, res) => {
    res.json({
      service: 'Secretario IA API',
      version: '3.0.0',
      docs: 'https://github.com/MPalaciosd/secretario-ia',
      endpoints: {
        auth: ['POST /api/auth/register', 'POST /api/auth/login', 'GET /api/auth/me', 'PUT /api/auth/me'],
        chat: ['POST /api/chat', 'GET /api/chat/history', 'DELETE /api/chat/history'],
        events: ['GET /api/events', 'POST /api/events', 'PUT /api/events/:id', 'DELETE /api/events/:id'],
        plans: ['GET /api/plans', 'POST /api/plans [PRO]', 'POST /api/plans/:id/schedule [PRO]'],
        stripe: ['GET /api/stripe/checkout', 'GET /api/stripe/portal', 'GET /api/stripe/status', 'POST /api/stripe/webhook'],
        subscription: ['GET /api/subscription'],
        system: ['GET /health']
      }
    });
  });

  // ── Stripe success/cancel redirect pages ──────────────────
  app.get('/subscription/success', (req, res) => {
    res.redirect('/?payment=success');
  });
  app.get('/subscription/cancel', (req, res) => {
    res.redirect('/?payment=cancel');
  });

  // ── Serve static frontend (React SPA) ────────────────────
  app.use(express.static(path.join(__dirname, '../../public')));

  // ── SPA fallback — serve index.html for all non-API routes ─
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/health')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(__dirname, '../../public', 'index.html'));
  });

  // ── 404 for API ───────────────────────────────────────────
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada', path: req.path });
  });

  // ── Error handler ─────────────────────────────────────────
  app.use((err, req, res, next) => {
    console.error('[Server] Unhandled error:', err.message);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: config.server.env === 'development' ? err.message : undefined
    });
  });

  // ── Start listening ───────────────────────────────────────
  const PORT = config.server.port;
  server = app.listen(PORT, () => {
    console.log(`\n🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📡 Ambiente: ${config.server.env}`);
    console.log(`🔗 Frontend: http://localhost:${PORT}`);
    console.log(`📖 API docs: http://localhost:${PORT}/api`);
  });

  return server;
}

module.exports = { startServer, getApp };
