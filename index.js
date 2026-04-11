require('dotenv').config();
const { initializeDatabase } = require('./src/db/database');
const { createServer }       = require('./src/api/server');
const { startKeepAlive }     = require('./src/keepAlive');
const config = require('./src/config');

async function main() {
  // ── Validate critical env vars ────────────────────────────
  if (!config.groq.apiKey) {
    console.warn('⚠️  WARNING: GROQ_API_KEY no configurada. El chat IA no funcionará hasta que la añadas en Render > Environment.');
  }
  if (!config.database.url) {
    console.error('[FATAL] DATABASE_URL no configurada. El servidor no puede arrancar.');
    process.exit(1);
  }

  console.log('\n🧠 Secretario IA — Backend Inteligente (Groq Edition)');
  console.log('─────────────────────────────────────────────');

  // ── Connect to DB ─────────────────────────────────────────
  try {
    await initializeDatabase();
  } catch (err) {
    console.error('[FATAL] Error al iniciar:', err.message);
    process.exit(1);
  }

  // ── Start HTTP server ─────────────────────────────────────
  const app  = createServer();
  const port = config.port;

  app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${port}`);
    console.log(`🌐 URL: ${config.app.url}`);
    console.log(`🤖 AI:  Groq / ${config.groq.model}`);
    console.log(`🗄️  DB:  PostgreSQL connected`);
  });

  // ── Keep-alive ping (prevent Render free tier spin-down) ──
  if (process.env.NODE_ENV === 'production') {
    startKeepAlive(config.app.url);
  }
}

main().catch(err => {
  console.error('[FATAL] Unhandled startup error:', err.message);
  process.exit(1);
});
