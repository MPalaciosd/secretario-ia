// ─── Centralized Configuration ──────────────────────────────────

// ─── Startup validation — fail fast with clear error messages ───
const IS_PROD = process.env.NODE_ENV === 'production';

if (IS_PROD) {
  const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'GROQ_API_KEY'];
  const missing = REQUIRED.filter(k => !process.env[k] || process.env[k].trim() === '');
  if (missing.length > 0) {
    console.error('[FATAL] Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
  if (process.env.JWT_SECRET === 'dev-secret-change-in-production') {
    console.error('[FATAL] JWT_SECRET has insecure default value. Set a strong random secret in production.');
    process.exit(1);
  }
}

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // ── Server ──────────────────────────────────────────────────
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },

  // ── Groq ────────────────────────────────────────────────────
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    fastModel: process.env.GROQ_FAST_MODEL || 'llama-3.1-8b-instant'
  },

  // ── OpenAI (kept for backward compat, unused) ───────────────
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  },

  // ── Database ─────────────────────────────────────────────────
  database: {
    url: process.env.DATABASE_URL || '',
    ssl: process.env.NODE_ENV === 'production'
  },

  // ── Auth ─────────────────────────────────────────────────────
  // Default secret is intentionally weak — production MUST override via env var
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  // ── Stripe ───────────────────────────────────────────────────
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    priceId: process.env.STRIPE_PRICE_ID || ''
  },

  // ── Email (Resend) ────────────────────────────────────────────
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.FROM_EMAIL || 'noreply@secretario-ia.com',
    fromName: process.env.FROM_NAME || 'Secretario IA'
  },

  // ── App ──────────────────────────────────────────────────────
  app: {
    url: process.env.APP_URL || 'http://localhost:3000',
    name: 'Secretario IA'
  }
};
