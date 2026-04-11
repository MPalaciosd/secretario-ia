const Groq = require('groq-sdk');
const config = require('../config');
const { query } = require('../db/database');

const groq = new Groq({ apiKey: config.groq.apiKey });

// ─── Build user context (short + long term memory) ───────────
async function buildUserContext(userId) {
  try {
    // Short-term: last 10 messages
    const shortResult = await query(
      `SELECT role, content, metadata, created_at
       FROM conversations
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );
    const shortTermMemory = shortResult.rows.reverse();

    // Long-term: user preferences and habits
    const longResult = await query(
      `SELECT memory_type, content, metadata
       FROM user_memory
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 10`,
      [userId]
    );
    const longTermMemory = longResult.rows;

    // Build context summary
    let contextSummary = '';
    if (longTermMemory.length > 0) {
      contextSummary = 'Información del usuario:\n' +
        longTermMemory.map(m => `- ${m.memory_type}: ${m.content}`).join('\n');
    }

    return { shortTermMemory, longTermMemory, contextSummary };
  } catch (err) {
    console.error('[Memory] buildUserContext error:', err.message);
    return { shortTermMemory: [], longTermMemory: [], contextSummary: '' };
  }
}

// ─── Save a message to conversation history ──────────────────
async function saveMessage(userId, role, content, metadata = {}) {
  try {
    await query(
      `INSERT INTO conversations (user_id, role, content, metadata)
       VALUES ($1, $2, $3, $4)`,
      [userId, role, content, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('[Memory] saveMessage error:', err.message);
  }
}

// ─── Extract and update long-term memory (uses Groq) ─────────
async function extractAndUpdateMemory(userId, message, intent, extractedData) {
  // Only extract memory for certain intents
  if (!['crear_evento','crear_plan','consultar'].includes(intent)) return;
  if (!config.groq.apiKey) return;

  try {
    const prompt = `Analiza este mensaje de usuario y extrae información de memoria a largo plazo.
Mensaje: "${message}"
Intención detectada: ${intent}
Datos extraídos: ${JSON.stringify(extractedData)}

Si hay información relevante sobre preferencias, hábitos o disponibilidad del usuario,
responde con JSON. Si no hay nada relevante, responde con {"memories": []}.

Formato:
{
  "memories": [
    {"type": "disponibilidad|preferencia|habito|objetivo", "content": "descripción breve"}
  ]
}
Tipos válidos: disponibilidad (horarios libres), preferencia (gustos), habito (rutinas), objetivo (metas)
Máximo 2 memorias. Solo información realmente útil para el futuro.`;

    const response = await groq.chat.completions.create({
      model:       config.groq.fastModel,
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens:  200
    });

    const raw = response.choices[0].message.content.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const result = JSON.parse(jsonMatch[0]);
    if (!result.memories || result.memories.length === 0) return;

    for (const mem of result.memories) {
      if (!mem.type || !mem.content) continue;
      await query(
        `INSERT INTO user_memory (user_id, memory_type, content, metadata)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, memory_type)
         DO UPDATE SET content = $3, metadata = $4, updated_at = NOW()`,
        [userId, mem.type, mem.content, JSON.stringify({ source: 'auto', intent })]
      );
    }
  } catch (err) {
    // Non-critical — don't crash
    console.error('[Memory] extractAndUpdateMemory error:', err.message);
  }
}

module.exports = { buildUserContext, saveMessage, extractAndUpdateMemory };
