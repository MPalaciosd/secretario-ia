const OpenAI = require('openai');
const { query } = require('../db/database');
const config = require('../config');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

// ─── SHORT-TERM MEMORY (últimas conversaciones en DB) ────────────────────────

async function getShortTermMemory(userId, limit = 20) {
  const result = await query(
    `SELECT role, content, intent, function_called, created_at 
     FROM conversations 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows.reverse(); // Return chronological order
}

async function saveMessage(userId, role, content, extras = {}) {
  const { intent, functionCalled, functionResult } = extras;
  await query(
    `INSERT INTO conversations (user_id, role, content, intent, function_called, function_result)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, role, content, intent || null, functionCalled || null, 
     functionResult ? JSON.stringify(functionResult) : null]
  );
}

// ─── LONG-TERM MEMORY (preferencias y hábitos del usuario) ──────────────────

async function getLongTermMemory(userId) {
  const result = await query(
    `SELECT up.*, u.name, u.email, u.timezone
     FROM user_preferences up
     JOIN users u ON u.id = up.user_id
     WHERE up.user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function updateUserPreferences(userId, preferences) {
  const existing = await getLongTermMemory(userId);
  
  if (existing) {
    const updateFields = [];
    const values = [];
    let paramIndex = 1;
    
    const validFields = [
      'preferred_workout_days', 'preferred_workout_time', 'fitness_level',
      'goals', 'availability', 'dietary_restrictions', 'other_preferences'
    ];
    
    for (const [key, value] of Object.entries(preferences)) {
      if (validFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }
    
    if (updateFields.length > 0) {
      values.push(userId);
      await query(
        `UPDATE user_preferences SET ${updateFields.join(', ')}, updated_at = NOW() 
         WHERE user_id = $${paramIndex}`,
        values
      );
    }
  } else {
    await query(
      `INSERT INTO user_preferences (user_id, preferred_workout_days, preferred_workout_time, 
         fitness_level, goals, availability, dietary_restrictions, other_preferences)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        JSON.stringify(preferences.preferred_workout_days || []),
        preferences.preferred_workout_time || null,
        preferences.fitness_level || null,
        JSON.stringify(preferences.goals || []),
        JSON.stringify(preferences.availability || {}),
        JSON.stringify(preferences.dietary_restrictions || []),
        JSON.stringify(preferences.other_preferences || {})
      ]
    );
  }
}

// ─── EMBEDDINGS (semantic memory) ────────────────────────────────────────────

async function createEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: config.openai.embeddingModel,
      input: text
    });
    return response.data[0].embedding;
  } catch (err) {
    console.error('[Memory] Error creating embedding:', err.message);
    return null;
  }
}

async function saveEmbedding(userId, content, category, metadata = {}) {
  const embedding = await createEmbedding(content);
  
  await query(
    `INSERT INTO user_embeddings (user_id, content, embedding, category, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, content, embedding ? JSON.stringify(embedding) : null, category, JSON.stringify(metadata)]
  );
}

async function searchSimilarMemories(userId, queryText, limit = 5) {
  // Simple text search fallback if pgvector not available
  const result = await query(
    `SELECT content, category, metadata, created_at
     FROM user_embeddings 
     WHERE user_id = $1 
     AND content ILIKE $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [userId, `%${queryText.split(' ').slice(0, 3).join('%')}%`, limit]
  );
  return result.rows;
}

// ─── CONTEXT BUILDER ─────────────────────────────────────────────────────────

async function buildUserContext(userId) {
  const [shortTermMemory, longTermMemory] = await Promise.all([
    getShortTermMemory(userId, config.app.maxConversationHistory),
    getLongTermMemory(userId)
  ]);

  let contextSummary = '';
  
  if (longTermMemory) {
    contextSummary += `\nMEMORIA DEL USUARIO:`;
    if (longTermMemory.fitness_level) contextSummary += `\n- Nivel físico: ${longTermMemory.fitness_level}`;
    if (longTermMemory.preferred_workout_time) contextSummary += `\n- Horario preferido: ${longTermMemory.preferred_workout_time}`;
    if (longTermMemory.preferred_workout_days?.length) {
      contextSummary += `\n- Días preferidos: ${longTermMemory.preferred_workout_days.join(', ')}`;
    }
    if (longTermMemory.goals?.length) {
      contextSummary += `\n- Objetivos: ${longTermMemory.goals.join(', ')}`;
    }
  }

  return {
    shortTermMemory,
    longTermMemory,
    contextSummary
  };
}

// ─── EXTRACT AND UPDATE MEMORY FROM CONVERSATION ─────────────────────────────

async function extractAndUpdateMemory(userId, userMessage, intent, extractedData) {
  // Update preferences based on extracted data
  const prefUpdates = {};
  
  if (extractedData.level) prefUpdates.fitness_level = extractedData.level;
  if (extractedData.goal) {
    const currentPrefs = await getLongTermMemory(userId);
    const currentGoals = currentPrefs?.goals || [];
    if (!currentGoals.includes(extractedData.goal)) {
      prefUpdates.goals = [...currentGoals, extractedData.goal];
    }
  }
  
  if (Object.keys(prefUpdates).length > 0) {
    await updateUserPreferences(userId, prefUpdates);
  }
  
  // Save important info as embedding
  if (intent === 'crear_plan' || intent === 'crear_evento') {
    await saveEmbedding(userId, userMessage, intent, { extractedData, timestamp: new Date().toISOString() });
  }
}

module.exports = {
  getShortTermMemory,
  saveMessage,
  getLongTermMemory,
  updateUserPreferences,
  createEmbedding,
  saveEmbedding,
  searchSimilarMemories,
  buildUserContext,
  extractAndUpdateMemory
};
