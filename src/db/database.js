// src/db/database.js
'use strict';

const { Pool } = require('pg');
const config = require('../config');

if (!config.database.url) {
  console.error('[FATAL] DATABASE_URL not configured. Cannot start.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: config.database.url,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', function(err) { console.error('[DB] Pool error:', err.message); });

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function initializeDatabase() {
  console.log('[DB] Connecting to PostgreSQL...');
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('[DB] Connected successfully');
    await runMigrations(client);
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function runMigrations(client) {
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS users (" +
      "id UUID PRIMARY KEY DEFAULT gen_random_uuid()," +
      "email VARCHAR(255) UNIQUE NOT NULL," +
      "name VARCHAR(255)," +
      "subscription_status VARCHAR(50) DEFAULT 'free'," +
      "stripe_customer_id VARCHAR(255)," +
      "stripe_subscription_id VARCHAR(255)," +
      "timezone VARCHAR(100) DEFAULT 'Europe/Madrid'," +
      "preferences JSONB DEFAULT '{}'," +
      "created_at TIMESTAMP DEFAULT NOW()," +
      "updated_at TIMESTAMP DEFAULT NOW())"
    );

    await client.query(
      "CREATE TABLE IF NOT EXISTS email_otps (" +
      "user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE," +
      "otp_hash VARCHAR(64) NOT NULL," +
      "expires_at TIMESTAMP NOT NULL," +
      "attempts INTEGER DEFAULT 0," +
      "created_at TIMESTAMP DEFAULT NOW())"
    );

    await client.query(
      "CREATE TABLE IF NOT EXISTS events (" +
      "id UUID PRIMARY KEY DEFAULT gen_random_uuid()," +
      "user_id UUID REFERENCES users(id) ON DELETE CASCADE," +
      "title VARCHAR(500) NOT NULL," +
      "description TEXT," +
      "start_time TIMESTAMP NOT NULL," +
      "end_time TIMESTAMP," +
      "duration_minutes INTEGER DEFAULT 60," +
      "event_type VARCHAR(50) DEFAULT 'general'," +
      "location VARCHAR(500)," +
      "status VARCHAR(50) DEFAULT 'scheduled'," +
      "recurrence JSONB DEFAULT '{}'," +
      "plan_id UUID," +
      "week_number INTEGER," +
      "session_number INTEGER," +
      "metadata JSONB DEFAULT '{}'," +
      "created_at TIMESTAMP DEFAULT NOW()," +
      "updated_at TIMESTAMP DEFAULT NOW())"
    );

    await client.query(
      "CREATE TABLE IF NOT EXISTS conversations (" +
      "id UUID PRIMARY KEY DEFAULT gen_random_uuid()," +
      "user_id UUID REFERENCES users(id) ON DELETE CASCADE," +
      "role VARCHAR(20) NOT NULL," +
      "content TEXT NOT NULL," +
      "embedding JSONB DEFAULT '[]'," +
      "metadata JSONB DEFAULT '{}'," +
      "created_at TIMESTAMP DEFAULT NOW())"
    );

    await client.query(
      "CREATE TABLE IF NOT EXISTS plans (" +
      "id UUID PRIMARY KEY DEFAULT gen_random_uuid()," +
      "user_id UUID REFERENCES users(id) ON DELETE CASCADE," +
      "title VARCHAR(500) NOT NULL," +
      "description TEXT," +
      "plan_type VARCHAR(50) DEFAULT 'entrenamiento'," +
      "weeks INTEGER NOT NULL," +
      "goal VARCHAR(500)," +
      "level VARCHAR(50)," +
      "sessions_per_week INTEGER DEFAULT 3," +
      "session_duration_minutes INTEGER DEFAULT 60," +
      "status VARCHAR(50) DEFAULT 'active'," +
      "schedule JSONB DEFAULT '{}'," +
      "week_structure JSONB DEFAULT '{}'," +
      "metadata JSONB DEFAULT '{}'," +
      "created_at TIMESTAMP DEFAULT NOW()," +
      "updated_at TIMESTAMP DEFAULT NOW())"
    );

    await client.query(
      "CREATE TABLE IF NOT EXISTS user_memory (" +
      "id UUID PRIMARY KEY DEFAULT gen_random_uuid()," +
      "user_id UUID REFERENCES users(id) ON DELETE CASCADE," +
      "memory_type VARCHAR(100) NOT NULL," +
      "content TEXT NOT NULL," +
      "confidence FLOAT DEFAULT 0.3," +
      "occurrence_count INTEGER DEFAULT 1," +
      "embedding JSONB DEFAULT '[]'," +
      "metadata JSONB DEFAULT '{}'," +
      "created_at TIMESTAMP DEFAULT NOW()," +
      "updated_at TIMESTAMP DEFAULT NOW())"
    );

    await client.query(
      "CREATE TABLE IF NOT EXISTS user_habits (" +
      "id UUID PRIMARY KEY DEFAULT gen_random_uuid()," +
      "user_id UUID REFERENCES users(id) ON DELETE CASCADE," +
      "habit_key VARCHAR(200) NOT NULL," +
      "description TEXT NOT NULL," +
      "frequency_pattern JSONB DEFAULT '{}'," +
      "last_seen TIMESTAMP DEFAULT NOW()," +
      "occurrence_count INTEGER DEFAULT 1," +
      "confidence FLOAT DEFAULT 0.3," +
      "is_active BOOLEAN DEFAULT TRUE," +
      "metadata JSONB DEFAULT '{}'," +
      "created_at TIMESTAMP DEFAULT NOW()," +
      "updated_at TIMESTAMP DEFAULT NOW()," +
      "UNIQUE(user_id, habit_key))"
    );

    await client.query(
      "CREATE TABLE IF NOT EXISTS user_preferences (" +
      "id UUID PRIMARY KEY DEFAULT gen_random_uuid()," +
      "user_id UUID REFERENCES users(id) ON DELETE CASCADE," +
      "pref_key VARCHAR(200) NOT NULL," +
      "pref_value TEXT NOT NULL," +
      "pref_type VARCHAR(50) DEFAULT 'general'," +
      "confidence FLOAT DEFAULT 0.5," +
      "source VARCHAR(100) DEFAULT 'explicit'," +
      "metadata JSONB DEFAULT '{}'," +
      "created_at TIMESTAMP DEFAULT NOW()," +
      "updated_at TIMESTAMP DEFAULT NOW()," +
      "UNIQUE(user_id, pref_key))"
    );

    await client.query(
      "CREATE TABLE IF NOT EXISTS memory_embeddings (" +
      "id UUID PRIMARY KEY DEFAULT gen_random_uuid()," +
      "user_id UUID REFERENCES users(id) ON DELETE CASCADE," +
      "source_type VARCHAR(50) NOT NULL," +
      "source_id UUID," +
      "content_hash VARCHAR(64) NOT NULL," +
      "content_preview TEXT," +
      "embedding JSONB NOT NULL DEFAULT '[]'," +
      "model_version VARCHAR(50) DEFAULT 'groq-v1'," +
      "created_at TIMESTAMP DEFAULT NOW()," +
      "UNIQUE(user_id, content_hash))"
    );

    // Idempotent column additions
    var alterColumns = [
      "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'",
      "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS embedding JSONB DEFAULT '[]'",
      "ALTER TABLE plans ADD COLUMN IF NOT EXISTS schedule JSONB DEFAULT '{}'",
      "ALTER TABLE plans ADD COLUMN IF NOT EXISTS week_structure JSONB DEFAULT '{}'",
      "ALTER TABLE events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'",
      "ALTER TABLE events ADD COLUMN IF NOT EXISTS week_number INTEGER",
      "ALTER TABLE events ADD COLUMN IF NOT EXISTS session_number INTEGER",
      "ALTER TABLE events ADD COLUMN IF NOT EXISTS plan_id UUID",
      "ALTER TABLE events ADD COLUMN IF NOT EXISTS location VARCHAR(500)",
      "ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time TIMESTAMP",
      "ALTER TABLE user_memory ADD COLUMN IF NOT EXISTS confidence FLOAT DEFAULT 0.3",
      "ALTER TABLE user_memory ADD COLUMN IF NOT EXISTS occurrence_count INTEGER DEFAULT 1",
      "ALTER TABLE user_memory ADD COLUMN IF NOT EXISTS embedding JSONB DEFAULT '[]'",
    ];
    for (var i = 0; i < alterColumns.length; i++) {
      await client.query(alterColumns[i]).catch(function() {});
    }

    // Performance indexes
    var indexes = [
      "CREATE INDEX IF NOT EXISTS idx_events_user_start ON events (user_id, start_time) WHERE status != 'cancelled'",
      "CREATE INDEX IF NOT EXISTS idx_events_user_time_range ON events (user_id, start_time, end_time) WHERE status != 'cancelled'",
      "CREATE INDEX IF NOT EXISTS idx_events_plan_id ON events (plan_id) WHERE plan_id IS NOT NULL",
      "CREATE INDEX IF NOT EXISTS idx_conversations_user_created ON conversations (user_id, created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_plans_user_status ON plans (user_id, status)",
      "CREATE INDEX IF NOT EXISTS idx_user_memory_user ON user_memory (user_id, memory_type)",
      "CREATE INDEX IF NOT EXISTS idx_user_memory_confidence ON user_memory (user_id, confidence DESC)",
      "CREATE INDEX IF NOT EXISTS idx_user_memory_type_count ON user_memory (user_id, memory_type, occurrence_count DESC)",
      "CREATE INDEX IF NOT EXISTS idx_user_habits_user ON user_habits (user_id, is_active)",
      "CREATE INDEX IF NOT EXISTS idx_user_habits_key ON user_habits (user_id, habit_key)",
      "CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences (user_id, pref_type)",
      "CREATE INDEX IF NOT EXISTS idx_user_preferences_key ON user_preferences (user_id, pref_key)",
      "CREATE INDEX IF NOT EXISTS idx_memory_embeddings_user ON memory_embeddings (user_id, source_type)",
      "CREATE INDEX IF NOT EXISTS idx_memory_embeddings_hash ON memory_embeddings (user_id, content_hash)",
    ];
    for (var j = 0; j < indexes.length; j++) {
      await client.query(indexes[j]).catch(function(err) {
        console.warn('[DB] Index warning:', err.message);
      });
    }

    console.log('[DB] Migrations completed');
  } catch (err) {
    console.error('[DB] Migration error:', err.message);
    throw err;
  }
}

module.exports = { pool, query, initializeDatabase };
