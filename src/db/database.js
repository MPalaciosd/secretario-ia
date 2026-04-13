const { Pool } = require('pg');
const config = require('../config');

// ── Fail fast if no DATABASE_URL ─────────────────────────────────────
if (!config.database.url) {
  console.error('[FATAL] DATABASE_URL not configured. Cannot start.');
  process.exit(1);
}

const pool = new Pool({
  connectionString:    config.database.url,
  ssl:                 process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max:                 10,
  idleTimeoutMillis:   30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => console.error('[DB] Pool error:', err.message));

// ── Query helper ──────────────────────────────────────────────────────

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// ── Initialize DB ─────────────────────────────────────────────────────

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
  } finally {
    client.release();
  }
}

// ── Migrations ────────────────────────────────────────────────────────

async function runMigrations(client) {
  try {

    // ── Core tables ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email                  VARCHAR(255) UNIQUE NOT NULL,
        name                   VARCHAR(255),
        subscription_status    VARCHAR(50)  DEFAULT 'free',
        stripe_customer_id     VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        timezone               VARCHAR(100) DEFAULT 'Europe/Madrid',
        preferences            JSONB        DEFAULT '{}',
        created_at             TIMESTAMP    DEFAULT NOW(),
        updated_at             TIMESTAMP    DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_otps (
        user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        otp_hash   VARCHAR(64)  NOT NULL,
        expires_at TIMESTAMP    NOT NULL,
        attempts   INTEGER      DEFAULT 0,
        created_at TIMESTAMP    DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id          UUID    REFERENCES users(id) ON DELETE CASCADE,
        title            VARCHAR(500)  NOT NULL,
        description      TEXT,
        start_time       TIMESTAMP    NOT NULL,
        end_time         TIMESTAMP,
        duration_minutes INTEGER      DEFAULT 60,
        event_type       VARCHAR(50)  DEFAULT 'general',
        location         VARCHAR(500),
        status           VARCHAR(50)  DEFAULT 'scheduled',
        recurrence       JSONB        DEFAULT '{}',
        plan_id          UUID,
        week_number      INTEGER,
        session_number   INTEGER,
        metadata         JSONB        DEFAULT '{}',
        created_at       TIMESTAMP    DEFAULT NOW(),
        updated_at       TIMESTAMP    DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
        role       VARCHAR(20) NOT NULL,
        content    TEXT        NOT NULL,
        metadata   JSONB       DEFAULT '{}',
        created_at TIMESTAMP   DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                  UUID REFERENCES users(id) ON DELETE CASCADE,
        title                    VARCHAR(500) NOT NULL,
        description              TEXT,
        plan_type                VARCHAR(50)  DEFAULT 'entrenamiento',
        weeks                    INTEGER      NOT NULL,
        goal                     VARCHAR(500),
        level                    VARCHAR(50),
        sessions_per_week        INTEGER      DEFAULT 3,
        session_duration_minutes INTEGER      DEFAULT 60,
        status                   VARCHAR(50)  DEFAULT 'active',
        schedule                 JSONB        DEFAULT '{}',
        week_structure           JSONB        DEFAULT '{}',
        metadata                 JSONB        DEFAULT '{}',
        created_at               TIMESTAMP    DEFAULT NOW(),
        updated_at               TIMESTAMP    DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_memory (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
        memory_type  VARCHAR(100) NOT NULL,
        content      TEXT         NOT NULL,
        embedding    JSONB        DEFAULT '[]',
        metadata     JSONB        DEFAULT '{}',
        created_at   TIMESTAMP    DEFAULT NOW(),
        updated_at   TIMESTAMP    DEFAULT NOW(),
        UNIQUE(user_id, memory_type)
      )
    `);

    // ── Idempotent column additions (ALTER TABLE IF NOT EXISTS column) ─
    const alterColumns = [
      `ALTER TABLE conversations   ADD COLUMN IF NOT EXISTS metadata      JSONB DEFAULT '{}'`,
      `ALTER TABLE plans           ADD COLUMN IF NOT EXISTS schedule       JSONB DEFAULT '{}'`,
      `ALTER TABLE plans           ADD COLUMN IF NOT EXISTS week_structure JSONB DEFAULT '{}'`,
      `ALTER TABLE events          ADD COLUMN IF NOT EXISTS metadata       JSONB DEFAULT '{}'`,
      `ALTER TABLE events          ADD COLUMN IF NOT EXISTS week_number    INTEGER`,
      `ALTER TABLE events          ADD COLUMN IF NOT EXISTS session_number INTEGER`,
      `ALTER TABLE events          ADD COLUMN IF NOT EXISTS plan_id        UUID`,
      `ALTER TABLE events          ADD COLUMN IF NOT EXISTS location       VARCHAR(500)`,
      `ALTER TABLE events          ADD COLUMN IF NOT EXISTS end_time       TIMESTAMP`,
    ];

    for (const sql of alterColumns) {
      await client.query(sql).catch(() => {}); // ignore "already exists"
    }

    // ── Performance indexes ───────────────────────────────────────
    // These are critical for event queries on large datasets.
    // All use IF NOT EXISTS (PG 9.5+) for idempotency.

    const indexes = [
      // Primary event lookup: user + time range (used in every getEvents call)
      `CREATE INDEX IF NOT EXISTS idx_events_user_start
         ON events (user_id, start_time)
         WHERE status != 'cancelled'`,

      // Conflict detection: narrow time window per user
      `CREATE INDEX IF NOT EXISTS idx_events_user_time_range
         ON events (user_id, start_time, end_time)
         WHERE status != 'cancelled'`,

      // Plan sessions lookup
      `CREATE INDEX IF NOT EXISTS idx_events_plan_id
         ON events (plan_id)
         WHERE plan_id IS NOT NULL`,

      // Conversations history: user + time (chat history queries)
      `CREATE INDEX IF NOT EXISTS idx_conversations_user_created
         ON conversations (user_id, created_at DESC)`,

      // Plans lookup
      `CREATE INDEX IF NOT EXISTS idx_plans_user_status
         ON plans (user_id, status)`,

      // User memory lookup
      `CREATE INDEX IF NOT EXISTS idx_user_memory_user
         ON user_memory (user_id, memory_type)`,
    ];

    for (const idx of indexes) {
      await client.query(idx).catch((err) => {
        // Partial index syntax issues on older PG versions — log and continue
        console.warn('[DB] Index warning:', err.message);
      });
    }

    console.log('[DB] ✅ Migrations completed');
  } catch (err) {
    console.error('[DB] Migration error:', err.message);
    throw err;
  }
}

module.exports = { pool, query, initializeDatabase };
