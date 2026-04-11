const { Pool } = require('pg');
const config = require('../config');

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.connectionString,
      ssl: config.database.ssl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });
    pool.on('error', (err) => {
      console.error('[DB] Unexpected error on idle client', err.message);
    });
  }
  return pool;
}

async function query(text, params) {
  const client = getPool();
  const start = Date.now();
  try {
    const res = await client.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DB] query executed', { text: text.substring(0, 60), duration, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    console.error('[DB] query error', { text: text.substring(0, 60), error: err.message });
    throw err;
  }
}

async function initializeDatabase() {
  console.log('[DB] Connecting to PostgreSQL...');
  try {
    const client = await getPool().connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('[DB] ✅ PostgreSQL connected');
    await runMigrations();
  } catch (err) {
    console.error('[DB] ❌ Connection failed:', err.message);
    throw err;
  }
}

async function runMigrations() {
  console.log('[DB] Running migrations...');
  const sql = `
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      timezone VARCHAR(100) DEFAULT 'UTC',
      stripe_customer_id VARCHAR(255),
      subscription_status VARCHAR(50) DEFAULT 'free',
      subscription_id VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- User preferences table (long-term memory)
    CREATE TABLE IF NOT EXISTS user_preferences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      preferred_workout_days JSONB DEFAULT '[]',
      preferred_workout_time VARCHAR(50),
      fitness_level VARCHAR(50),
      goals JSONB DEFAULT '[]',
      availability JSONB DEFAULT '{}',
      dietary_restrictions JSONB DEFAULT '[]',
      other_preferences JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id)
    );

    -- Events table
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ,
      duration_minutes INTEGER,
      event_type VARCHAR(100) DEFAULT 'general',
      plan_id UUID,
      week_number INTEGER,
      session_number INTEGER,
      status VARCHAR(50) DEFAULT 'scheduled',
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Plans table
    CREATE TABLE IF NOT EXISTS plans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      plan_type VARCHAR(100) NOT NULL,
      weeks INTEGER,
      goal TEXT,
      level VARCHAR(50),
      sessions_per_week INTEGER,
      session_duration_minutes INTEGER,
      schedule JSONB DEFAULT '[]',
      status VARCHAR(50) DEFAULT 'active',
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Conversations table (short-term memory)
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      intent VARCHAR(100),
      function_called VARCHAR(100),
      function_result JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Embeddings table (long-term semantic memory)
    CREATE TABLE IF NOT EXISTS user_embeddings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      embedding VECTOR(1536),
      category VARCHAR(100),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Create vector extension if not exists
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
    CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
    CREATE INDEX IF NOT EXISTS idx_events_plan_id ON events(plan_id);
    CREATE INDEX IF NOT EXISTS idx_plans_user_id ON plans(user_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
    CREATE INDEX IF NOT EXISTS idx_user_embeddings_user_id ON user_embeddings(user_id);
  `;

  try {
    await query(sql);
    console.log('[DB] ✅ Migrations completed');
  } catch (err) {
    // If vector extension fails (not all postgres support it), continue without it
    if (err.message.includes('vector')) {
      console.warn('[DB] ⚠️  pgvector not available, embeddings will use JSON storage');
      const sqlWithoutVector = sql.replace('embedding VECTOR(1536),', 'embedding JSONB,')
        .replace('CREATE EXTENSION IF NOT EXISTS vector;', '');
      await query(sqlWithoutVector);
      console.log('[DB] ✅ Migrations completed (without pgvector)');
    } else {
      throw err;
    }
  }
}

module.exports = { getPool, query, initializeDatabase };
