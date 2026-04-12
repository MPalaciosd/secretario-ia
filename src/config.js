// ─── Centralized Configuration ────────────────────────────────
module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // ── Server (alias for convenience) ────────────────────────
  server: {
    port: process.env.PORT || 3000,
    env:  process.env.NODE_ENV || 'development'
  },

  // ── Groq ──────────────────────────────────────────────────
  // Active models as of April 2026 — llama3-8b-8192 is decommissioned
  groq: {
    apiKey:    process.env.GROQ_API_KEY || '',
    model:     process.env.GROQ_MODEL      || 'llama-3.3-70b-versatile',
    fastModel: process.env.GROQ_FAST_MODEL || 'llama-3.1-8b-instant'
  },

  // ── Keep openai entry for backward compat (unused) ────────
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model:  process.env.OPENAI_MODEL   || 'gpt-4o-mini'
  },

  // ── Database ──────────────────────────────────────────────
  database: {
    url: process.env.DATABASE_URL || '',
    ssl: process.env.NODE_ENV === 'production'
  },

  // ── Auth ──────────────────────────────────────────────────
  jwt: {
    secret:    process.env.JWT_SECRET    || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '30d'
  },

  // ── Stripe ────────────────────────────────────────────────
  stripe: {
    secretKey:     process.env.STRIPE_SECRET_KEY      || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET  || '',
    priceId:       process.env.STRIPE_PRICE_ID        || ''
  },

  // ── Email (Resend) ────────────────────────────────────────
  resend: {
    apiKey:    process.env.RESEND_API_KEY || '',
    fromEmail: process.env.FROM_EMAIL     || 'noreply@secretario-ia.com',
    fromName:  process.env.FROM_NAME      || 'Secretario IA'
  },

  // ── App ───────────────────────────────────────────────────
  app: {
    url:  process.env.APP_URL || 'http://localhost:3000',
    name: 'Secretario IA'
  }
};
