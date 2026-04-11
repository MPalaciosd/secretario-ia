const { Pool } = require('pg');
const config    = require('../config');

// ── Connection pool ───────────────────────────────────────────
const pool = new Pool({
  connectionString: config.database.url ||
    process.env.DATABASE_URL ||
    'postgresql://secretario_ia_db_user:keocbbF2iOZVZkZsiGGxAWx6i5T2A36f@dpg-d7d3uj1f9bms73fuo4eg-a/secretario_ia_db',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max:              10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => console.error('[DB] Pool error:', err.message));

// ── Query helper ──────────────────────────────────────────────
async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally { client.release(); }
}

// ── Initialize DB with migrations ─────────────────────────────
async function initializeDatabase() {
  console.log('[DB] Connecting to PostgreSQL...');
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('[DB] ✅ Connected successfully');
    await runMigrations(client);
  } catch (err) {
    console.error('[DB] ❌ Connection failed:', err.message);
    throw err;
  } finally { client.release(); }
}

// ── Migrations ────────────────────────────────────────────────
async function runMigrations(client) {
  try {
    // Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email               VARCHAR(255) UNIQUE NOT NULL,
        name                VARCHAR(255),
        subscription_status VARCHAR(50) DEFAULT 'free',
        stripe_customer_id  VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        timezone            VARCHAR(100) DEFAULT 'Europe/Madrid',
        preferences         JSONB DEFAULT '{}',
        created_at          TIMESTAMP DEFAULT NOW(),
        updated_at          TIMESTAMP DEFAULT NOW()
      )
    `);

    // Events
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
        title            VARCHAR(500) NOT NULL,
        description      TEXT,
        start_time       TIMESTAMP NOT NULL,
        end_time         TIMESTAMP,
        duration_minutes INTEGER DEFAULT 60,
        event_type       VARCHAR(50) DEFAULT 'general',
        location         VARCHAR(500),
        status           VARCHAR(50) DEFAULT 'scheduled',
        recurrence       JSONB DEFAULT '{}',
        plan_id          UUID,
        week_number      INTEGER,
        session_number   INTEGER,
        metadata         JSONB DEFAULT '{}',
        created_at       TIMESTAMP DEFAULT NOW(),
        updated_at       TIMESTAMP DEFAULT NOW()
      )
    `);

    // Conversations (memory)
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
        role       VARCHAR(20) NOT NULL,
        content    TEXT NOT NULL,
        metadata   JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Plans
    await client.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                 UUID REFERENCES users(id) ON DELETE CASCADE,
        title                   VARCHAR(500) NOT NULL,
        description             TEXT,
        plan_type               VARCHAR(50) DEFAULT 'entrenamiento',
        weeks                   INTEGER NOT NULL,
        goal                    VARCHAR(500),
        level                   VARCHAR(50),
        sessions_per_week       INTEGER DEFAULT 3,
        session_duration_minutes INTEGER DEFAULT 60,
        status                  VARCHAR(50) DEFAULT 'active',
        metadata                JSONB DEFAULT '{}',
        created_at              TIMESTAMP DEFAULT NOW(),
        updated_at              TIMESTAMP DEFAULT NOW()
      )
    `);

    // User memory (long-term)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_memory (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
        memory_type VARCHAR(100) NOT NULL,
        content     TEXT NOT NULL,
        embedding   JSONB DEFAULT '[]',
        metadata    JSONB DEFAULT '{}',
        created_at  TIMESTAMP DEFAULT NOW(),
        updated_at  TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, memory_type)
      )
    `);

    console.log('[DB] ✅ Migrations completed');
  } catch (err) {
    console.error('[DB] Migration error:', err.message);
    throw err;
  }
}

module.exports = { pool, query, initializeDatabase };
