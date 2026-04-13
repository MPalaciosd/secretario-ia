// src/ai/memoryService.js
// Complete memory system: short-term + long-term + embedding-based semantic search
'use strict';

const Groq = require('groq-sdk');
const config = require('../config');
const { query } = require('../db/database');

const groq = new Groq({ apiKey: config.groq.apiKey });

// ─── Constants ────────────────────────────────────────────────────────────────
const SHORT_TERM_LIMIT   = 20;
const SHORT_TERM_CONTEXT = 8;
const LONG_TERM_LIMIT    = 50;
const EMBEDDING_DIMS     = 384;
const SIMILARITY_THRESH  = 0.65;
const HABIT_CONFIDENCE   = 3;

const MEMORY_TYPES = {
  DISPONIBILIDAD : 'disponibilidad',
  PREFERENCIA    : 'preferencia',
  HABITO         : 'habito',
  OBJETIVO       : 'objetivo',
  RESTRICCION    : 'restriccion',
  CONTEXTO       : 'contexto',
  PERSONA        : 'persona',
};

// ─── Cosine similarity ────────────────────────────────────────────────────────
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Text embedding via Groq ──────────────────────────────────────────────────
async function generateEmbedding(text) {
  if (!config.groq.apiKey || !text || text.trim() === '') return [];
  try {
    const prompt = 'Genera un vector de embedding semantico para el siguiente texto. ' +
      'El vector debe ser un array JSON de ' + EMBEDDING_DIMS + ' numeros flotantes entre -1 y 1. ' +
      'Responde SOLO con el array JSON, sin texto adicional.\nTexto: ' + text.substring(0, 200);
    const response = await groq.chat.completions.create({
      model: config.groq.fastModel || 'llama3-8b-8192',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.0,
      max_tokens: 2000,
    });
    const raw = response.choices[0].message.content.trim();
    const match = raw.match(/\[([\s\S]*?)\]/);
    if (!match) return [];
    const arr = JSON.parse('[' + match[1] + ']');
    if (!Array.isArray(arr) || arr.length < 10) return [];
    return Array.from({ length: EMBEDDING_DIMS }, function(_, i) { return arr[i] || 0; });
  } catch (err) {
    console.error('[Memory] generateEmbedding error:', err.message);
    return [];
  }
}

// ─── Short-term memory ────────────────────────────────────────────────────────
async function getShortTermMemory(userId, limit) {
  limit = limit || SHORT_TERM_LIMIT;
  try {
    const result = await query(
      'SELECT role, content, metadata, created_at FROM conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    );
    return result.rows.reverse();
  } catch (err) {
    console.error('[Memory] getShortTermMemory error:', err.message);
    return [];
  }
}

function detectConversationTopic(messages) {
  if (!messages || messages.length < 2) return null;
  const recent = messages.slice(-4);
  const intents = recent
    .filter(function(m) { return m.metadata; })
    .map(function(m) {
      const meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata;
      return meta.intent;
    })
    .filter(Boolean);
  if (intents.length === 0) return null;
  const freq = {};
  let maxCount = 0, dominantTopic = null;
  for (const intent of intents) {
    freq[intent] = (freq[intent] || 0) + 1;
    if (freq[intent] > maxCount) { maxCount = freq[intent]; dominantTopic = intent; }
  }
  return maxCount >= 2 ? dominantTopic : null;
}

// ─── Long-term memory ─────────────────────────────────────────────────────────
async function getLongTermMemory(userId, memoryType) {
  try {
    let sql = 'SELECT id, memory_type, content, confidence, occurrence_count, embedding, metadata, updated_at FROM user_memory WHERE user_id = $1';
    const params = [userId];
    if (memoryType) {
      sql += ' AND memory_type = $2';
      params.push(memoryType);
    }
    sql += ' ORDER BY confidence DESC, updated_at DESC LIMIT ' + LONG_TERM_LIMIT;
    const result = await query(sql, params);
    return result.rows;
  } catch (err) {
    console.error('[Memory] getLongTermMemory error:', err.message);
    return [];
  }
}

async function upsertLongTermMemory(userId, memoryType, content, metadata) {
  if (!content || content.trim() === '') return;
  metadata = metadata || {};
  try {
    const existing = await getLongTermMemory(userId, memoryType);
    const newEmbedding = await generateEmbedding(content);
    let matchedId = null;
    for (const mem of existing) {
      const storedEmbedding = Array.isArray(mem.embedding)
        ? mem.embedding
        : (typeof mem.embedding === 'string' ? JSON.parse(mem.embedding || '[]') : []);
      if (storedEmbedding.length > 0 && newEmbedding.length > 0) {
        const sim = cosineSimilarity(newEmbedding, storedEmbedding);
        if (sim >= SIMILARITY_THRESH) { matchedId = mem.id; break; }
      } else if (mem.content.toLowerCase().trim() === content.toLowerCase().trim()) {
        matchedId = mem.id;
        break;
      }
    }
    if (matchedId) {
      await query(
        'UPDATE user_memory SET occurrence_count = occurrence_count + 1, confidence = LEAST(1.0, confidence + 0.1), content = $2, embedding = $3, metadata = $4, updated_at = NOW() WHERE id = $1',
        [matchedId, content, JSON.stringify(newEmbedding), JSON.stringify(Object.assign({}, metadata, { updated: new Date().toISOString() }))]
      );
    } else {
      const initialConfidence = memoryType === MEMORY_TYPES.RESTRICCION ? 0.9 : 0.3;
      await query(
        'INSERT INTO user_memory (user_id, memory_type, content, confidence, occurrence_count, embedding, metadata) VALUES ($1, $2, $3, $4, 1, $5, $6)',
        [userId, memoryType, content, initialConfidence, JSON.stringify(newEmbedding), JSON.stringify(metadata)]
      );
    }
    setImmediate(function() { pruneOldMemories(userId); });
  } catch (err) {
    console.error('[Memory] upsertLongTermMemory error:', err.message);
  }
}

// ─── Habit detection ──────────────────────────────────────────────────────────
async function detectHabits(userId) {
  try {
    const result = await query(
      'SELECT memory_type, content, occurrence_count, confidence, updated_at FROM user_memory WHERE user_id = $1 AND memory_type = $2 AND occurrence_count >= $3 ORDER BY confidence DESC LIMIT 10',
      [userId, MEMORY_TYPES.HABITO, HABIT_CONFIDENCE]
    );
    return result.rows;
  } catch (err) {
    console.error('[Memory] detectHabits error:', err.message);
    return [];
  }
}

// ─── Semantic retrieval ───────────────────────────────────────────────────────
async function retrieveRelevantMemories(userId, queryText, topK) {
  topK = topK || 5;
  if (!queryText || queryText.trim() === '') return [];
  try {
    const allMemories = await getLongTermMemory(userId);
    if (allMemories.length === 0) return [];
    const queryEmbedding = await generateEmbedding(queryText);
    if (queryEmbedding.length === 0) return allMemories.slice(0, topK);
    const scored = allMemories
      .map(function(mem) {
        const storedEmbedding = Array.isArray(mem.embedding)
          ? mem.embedding
          : (typeof mem.embedding === 'string' ? JSON.parse(mem.embedding || '[]') : []);
        const similarity = storedEmbedding.length > 0 ? cosineSimilarity(queryEmbedding, storedEmbedding) : 0;
        return Object.assign({}, mem, { similarity: similarity });
      })
      .filter(function(m) { return m.similarity >= SIMILARITY_THRESH || m.confidence >= 0.8; })
      .sort(function(a, b) { return (b.similarity * b.confidence) - (a.similarity * a.confidence); })
      .slice(0, topK);
    return scored;
  } catch (err) {
    console.error('[Memory] retrieveRelevantMemories error:', err.message);
    return [];
  }
}

// ─── Memory extraction ────────────────────────────────────────────────────────
async function extractMemoriesFromMessage(userId, message, intent, extractedData) {
  if (!config.groq.apiKey) return;
  try {
    const existingMemories = await getLongTermMemory(userId);
    const existingStr = existingMemories.length > 0
      ? existingMemories.map(function(m) { return m.memory_type + ': ' + m.content; }).join('; ')
      : 'ninguna';
    const prompt = 'Eres un sistema de memoria para un asistente de agenda personal.' +
      ' Analiza el mensaje y extrae informacion valiosa a largo plazo.' +
      '\nMensaje: "' + message + '"' +
      '\nIntencion: ' + intent +
      '\nDatos: ' + JSON.stringify(extractedData || {}) +
      '\nMemoria existente: ' + existingStr +
      '\nTipos validos: disponibilidad, preferencia, habito, objetivo, restriccion, persona' +
      '\nResponde con JSON: {"memories": [{"type": "tipo", "content": "descripcion", "importance": 0.5}]}' +
      '\nSi no hay nada nuevo: {"memories": []}. Maximo 3 memorias.';
    const response = await groq.chat.completions.create({
      model: config.groq.fastModel || 'llama3-8b-8192',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 300,
    });
    const raw = response.choices[0].message.content.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return;
    const result = JSON.parse(match[0]);
    if (!result.memories || result.memories.length === 0) return;
    for (const mem of result.memories) {
      if (!mem.type || !mem.content) continue;
      if (!Object.values(MEMORY_TYPES).includes(mem.type)) continue;
      await upsertLongTermMemory(userId, mem.type, mem.content, {
        source: 'auto_extract',
        intent: intent,
        importance: mem.importance || 0.5,
        extracted_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('[Memory] extractMemoriesFromMessage error:', err.message);
  }
}

// ─── Context builder ──────────────────────────────────────────────────────────
async function buildUserContext(userId, currentMessage) {
  try {
    const results = await Promise.all([
      getShortTermMemory(userId, SHORT_TERM_LIMIT),
      getLongTermMemory(userId),
      detectHabits(userId),
    ]);
    const shortTermMemory  = results[0];
    const longTermMemory   = results[1];
    const confirmedHabits  = results[2];

    const relevantMemories = currentMessage
      ? await retrieveRelevantMemories(userId, currentMessage, 5)
      : longTermMemory.slice(0, 5);

    const conversationTopic = detectConversationTopic(shortTermMemory);

    const lines = [];
    if (relevantMemories.length > 0) {
      lines.push('Memorias relevantes del usuario:');
      for (const m of relevantMemories) {
        const conf = m.confidence >= 0.7 ? '[confirmado]' : '[probable]';
        lines.push('  - ' + m.memory_type + ' ' + conf + ': ' + m.content);
      }
    }
    if (confirmedHabits.length > 0) {
      lines.push('Habitos confirmados:');
      for (const h of confirmedHabits) {
        lines.push('  - ' + h.content + ' (observado ' + h.occurrence_count + ' veces)');
      }
    }
    const restrictions = longTermMemory.filter(function(m) { return m.memory_type === MEMORY_TYPES.RESTRICCION; });
    if (restrictions.length > 0) {
      lines.push('Restricciones importantes:');
      for (const r of restrictions) lines.push('  - ' + r.content);
    }
    if (conversationTopic) {
      lines.push('Tema activo: ' + conversationTopic);
    }

    return {
      shortTermMemory   : shortTermMemory,
      longTermMemory    : longTermMemory,
      relevantMemories  : relevantMemories,
      confirmedHabits   : confirmedHabits,
      contextSummary    : lines.join('\n'),
      conversationTopic : conversationTopic,
    };
  } catch (err) {
    console.error('[Memory] buildUserContext error:', err.message);
    return {
      shortTermMemory   : [],
      longTermMemory    : [],
      relevantMemories  : [],
      confirmedHabits   : [],
      contextSummary    : '',
      conversationTopic : null,
    };
  }
}

// ─── Save message ─────────────────────────────────────────────────────────────
async function saveMessage(userId, role, content, metadata) {
  metadata = metadata || {};
  try {
    await query(
      'INSERT INTO conversations (user_id, role, content, metadata) VALUES ($1, $2, $3, $4)',
      [userId, role, content, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('[Memory] saveMessage error:', err.message);
  }
}

// ─── Backward-compatible alias ────────────────────────────────────────────────
async function extractAndUpdateMemory(userId, message, intent, extractedData) {
  return extractMemoriesFromMessage(userId, message, intent, extractedData);
}

// ─── Prune old memories ───────────────────────────────────────────────────────
async function pruneOldMemories(userId) {
  try {
    const count = await query('SELECT COUNT(*) FROM user_memory WHERE user_id = $1', [userId]);
    const total = parseInt(count.rows[0].count, 10);
    if (total <= LONG_TERM_LIMIT) return;
    const excess = total - LONG_TERM_LIMIT;
    await query(
      'DELETE FROM user_memory WHERE id IN (SELECT id FROM user_memory WHERE user_id = $1 ORDER BY confidence ASC, updated_at ASC LIMIT $2)',
      [userId, excess]
    );
  } catch (err) {
    console.error('[Memory] pruneOldMemories error:', err.message);
  }
}

// ─── Memory profile ───────────────────────────────────────────────────────────
async function getMemoryProfile(userId) {
  try {
    const memories = await getLongTermMemory(userId);
    const habits   = await detectHabits(userId);
    const recent   = await getShortTermMemory(userId, 5);
    return {
      total_memories   : memories.length,
      confirmed_habits : habits.length,
      recent_messages  : recent.length,
      by_type: memories.reduce(function(acc, m) {
        acc[m.memory_type] = (acc[m.memory_type] || 0) + 1; return acc;
      }, {}),
      top_memories: memories.slice(0, 5).map(function(m) {
        return { type: m.memory_type, content: m.content, confidence: m.confidence, occurrences: m.occurrence_count };
      }),
    };
  } catch (err) {
    console.error('[Memory] getMemoryProfile error:', err.message);
    return null;
  }
}

module.exports = {
  buildUserContext,
  saveMessage,
  extractAndUpdateMemory,
  extractMemoriesFromMessage,
  generateEmbedding,
  retrieveRelevantMemories,
  getLongTermMemory,
  getShortTermMemory,
  detectHabits,
  upsertLongTermMemory,
  getMemoryProfile,
  pruneOldMemories,
  MEMORY_TYPES,
  SIMILARITY_THRESH,
};
