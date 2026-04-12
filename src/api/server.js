const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const { globalLimiter } = require('./middleware/rateLimiter');
const config = require('../config');

// ─── ROUTE IMPORTS ──────────────────────────────────────────────
const chatRoutes = require('./routes/chatRoutes');
const eventRoutes = require('./routes/eventRoutes');
const planRoutes = require('./routes/planRoutes');
const authRoutes = require('./routes/authRoutes');
const stripeRoutes = require('./routes/stripeRoutes');

// ─── CORS whitelist — never use wildcard '*' with credentials ───
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : ['http://localhost:3000'];

let app;
let server;

function getApp() { return app; }

function startServer() {
    app = express();

  // ── Security headers ────────────────────────────────────────
  app.use(helmet({
        contentSecurityPolicy: {
                directives: {
                          defaultSrc:  ["'self'"],
                          scriptSrc:   ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
                          styleSrc:    ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
                          connectSrc:  ["'self'"],
                          imgSrc:      ["'self'", "data:", "https:"],
                          fontSrc:     ["'self'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
                          frameSrc:    ["'none'"],
                          objectSrc:   ["'none'"],
                          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
                }
        },
        crossOriginEmbedderPolicy: false
  }));

  // ── CORS — strict origin whitelist ──────────────────────────
  app.use(cors({
        origin: (origin, callback) => {
                // Allow requests with no origin only in development (e.g. curl, Postman)
          if (!origin && process.env.NODE_ENV !== 'production') return callback(null, true);
                if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
                callback(new Error(`CORS policy: origin '${origin}' not allowed`));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
  }));

  // ── Stripe webhook (raw body BEFORE express.json) ───────────
  app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

  // ── Body parsing — 1mb limit (was 10mb) ─────────────────────
  app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ── Global rate limiting ─────────────────────────────────────
  app.use(globalLimiter);

  // ── Request logging — no message content in production ──────
  if (config.server.env === 'development') {
        app.use((req, res, next) => {
                console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
                next();
        });
  }

  // ── API Routes ───────────────────────────────────────────────
  app.use('/api/auth',   authRoutes);
    app.use('/api/chat',   chatRoutes);
    app.use('/api/events', eventRoutes);
    app.use('/api/plans',  planRoutes);
    app.use('/api/stripe', stripeRoutes);

  // ── Subscription info endpoint ───────────────────────────────
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

  // ── Health check — minimal info ──────────────────────────────
  app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── Stripe redirect pages ─────────────────────────────────────
  app.get('/subscription/success', (req, res) => { res.redirect('/?payment=success'); });
    app.get('/subscription/cancel',  (req, res) => { res.redirect('/?payment=cancel');  });

  // ── Serve static frontend — block admin.html publicly ────────
  app.use(express.static(path.join(__dirname, '../../public'), {
        setHeaders: (res, filePath) => {
                if (path.basename(filePath) === 'admin.html') {
                          res.status(403).end('Forbidden');
                }
        }
  }));

  // Block direct requests to admin.html
  app.get('/admin.html', (req, res) => res.status(403).json({ error: 'Forbidden' }));
    app.get('/admin',      (req, res) => res.status(403).json({ error: 'Forbidden' }));

  // ── SPA fallback ─────────────────────────────────────────────
  app.get('*', (req, res) => {
        if (req.path.startsWith('/api/') || req.path === '/health') {
                return res.status(404).json({ error: 'Not found' });
        }
        res.sendFile(path.join(__dirname, '../../public', 'index.html'));
  });

  // ── 404 for unmatched API routes ─────────────────────────────
  app.use('/api/*', (req, res) => {
        res.status(404).json({ error: 'Ruta no encontrada' });
  });

  // ── Global error handler — never leak stack traces ───────────
  app.use((err, req, res, next) => {
        console.error('[Server] Unhandled error:', err.message);
        res.status(500).json({ error: 'Error interno del servidor' });
  });

  // ── Start listening ──────────────────────────────────────────
  const PORT = config.server.port;
    server = app.listen(PORT, () => {
          console.log(`\n🚀 Servidor corriendo en puerto ${PORT}`);
          console.log(`📡 Ambiente: ${config.server.env}`);
          console.log(`🔒 CORS origins: ${ALLOWED_ORIGINS.join(', ')}`);
    });

  return server;
}

module.exports = { startServer, getApp };
