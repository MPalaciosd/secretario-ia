require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small'
  },
  database: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    priceId: process.env.STRIPE_PRICE_ID
  },
  email: {
    provider: process.env.EMAIL_PROVIDER || 'resend',
    resendApiKey: process.env.RESEND_API_KEY,
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    fromEmail: process.env.FROM_EMAIL || 'noreply@secretario-ia.com',
    fromName: process.env.FROM_NAME || 'Secretario IA'
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'change_this_in_production',
    expiresIn: '7d'
  },
  app: {
    name: 'Secretario IA',
    version: '3.0.0',
    maxConversationHistory: 20,
    maxLongTermMemory: 100
  }
};
