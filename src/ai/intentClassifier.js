const Groq = require('groq-sdk');
const config = require('../config');
const groq = new Groq({ apiKey: config.groq.apiKey });

// ─── Intent types ─────────────────────────────────────────────
const INTENTS = {
  CREAR_EVENTO: 'crear_evento',
  CREAR_PLAN:   'crear_plan',
  CONSULTAR:    'consultar',
  MODIFICAR:    'modificar',
  ELIMINAR:     'eliminar',
  SALUDO:       'saludo',
  OTRO:         'otro'
};

const SYSTEM_PROMPT = `Eres un clasificador de intenciones para una agenda inteligente.
Analiza el mensaje del usuario y responde ÚNICAMENTE con JSON válido.

Intenciones posibles:
- crear_evento: crear/añadir/poner/apuntar/recordar/tengo una cita/evento/reunión/médico/dentista/etc.
- crear_plan: crear plan de entrenamiento, estudio, dieta, proyecto multi-semana
- consultar: preguntar QUÉ hay en la agenda, ver eventos, disponibilidad (solo preguntas sobre agenda existente)
- modificar: cambiar, mover, editar un evento existente
- eliminar: borrar, cancelar un evento
- saludo: hola, buenos días, gracias, conversación general
- otro: cualquier otra cosa

Responde SIEMPRE con este JSON exacto:
{
  "intent": "una_de_las_intenciones_anteriores",
  "confidence": 0.0_a_1.0,
  "requires_data": true_o_false,
  "missing_fields": [],
  "extracted_data": {}
}

REGLAS CRÍTICAS:

CREAR EVENTO — detectar con "tengo X", "hay X", "apunta X", "pon X", "recuérdame X", "cita de X":
- "tengo dentista el viernes a las 11" → crear_evento (TIENE fecha → requires_data: false)
- "hay una reunión mañana a las 10" → crear_evento
- "apunta que tengo médico el lunes" → crear_evento
- "recuérdame la reunión del martes a las 3" → crear_evento
- Solo falta title si el usuario no lo menciona. Solo falta date si no la da.

CONSULTAR — solo si el usuario PREGUNTA sobre agenda existente:
- "¿qué tengo esta semana?" → consultar
- "¿qué hay el lunes?" → consultar
- "muéstrame mis eventos" → consultar
- NO confundir con crear_evento

CREAR PLAN — multi-semana, entrenamiento, rutina, dieta:
- Si no menciona goal → usa "entrenamiento general" como default, NO lo pongas en missing_fields
- Si no menciona level → usa "intermedio" como default, NO lo pongas en missing_fields
- Si da weeks y sessions_per_week → requires_data: false

Ejemplos:
- "dentista el viernes a las 11" → {"intent":"crear_evento","requires_data":false,"missing_fields":[],"extracted_data":{"title":"Dentista","date":"viernes","time":"11:00"}}
- "tengo dentista mañana a las 10" → {"intent":"crear_evento","requires_data":false,"extracted_data":{"title":"Dentista","date":"mañana","time":"10:00"}}
- "qué tengo el lunes" → {"intent":"consultar","requires_data":false}
- "plan 4 semanas 3 días fútbol" → {"intent":"crear_plan","requires_data":false,"extracted_data":{"weeks":4,"sessions_per_week":3,"goal":"fútbol","level":"intermedio"}}
- "entrenamiento 4 semanas 4 veces semana" → {"intent":"crear_plan","requires_data":false,"extracted_data":{"weeks":4,"sessions_per_week":4,"goal":"entrenamiento general","level":"intermedio"}}
`;

async function classifyIntent(message, conversationHistory = []) {
  if (!config.groq.apiKey) {
    console.warn('[Intent] No GROQ_API_KEY set, using fallback classifier');
    return fallbackClassify(message);
  }

  try {
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

    if (conversationHistory.length > 0) {
      const recent = conversationHistory.slice(-6);
      messages.push({ role: 'user', content: `Contexto reciente:\n${recent.map(m => `${m.role}: ${m.content}`).join('\n')}` });
      messages.push({ role: 'assistant', content: 'Entendido.' });
    }

    messages.push({ role: 'user', content: message });

    const response = await groq.chat.completions.create({
      model: config.groq.fastModel,
      messages,
      temperature: 0.1,
      max_tokens: 300
    });

    const raw = response.choices[0].message.content.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const result = JSON.parse(jsonMatch[0]);
    if (!result.intent) throw new Error('Missing intent in response');

    // Post-process: apply smart defaults for plan fields
    const extracted = result.extracted_data || {};
    if (result.intent === 'crear_plan') {
      if (!extracted.goal)  extracted.goal  = extractGoal(message) || 'entrenamiento general';
      if (!extracted.level) extracted.level = extractLevel(message) || 'intermedio';
      if (!extracted.sessions_per_week) extracted.sessions_per_week = extractSessions(message) || 3;
      const autoFields = ['goal', 'level'];
      result.missing_fields = (result.missing_fields || []).filter(f => !autoFields.includes(f));
      if (extracted.weeks)             result.missing_fields = result.missing_fields.filter(f => f !== 'weeks');
      if (extracted.sessions_per_week) result.missing_fields = result.missing_fields.filter(f => f !== 'sessions_per_week');
      if (result.missing_fields.length === 0) result.requires_data = false;
    }

    return {
      intent:         result.intent || INTENTS.OTRO,
      confidence:     result.confidence || 0.8,
      requires_data:  result.requires_data ?? false,
      missing_fields: result.missing_fields || [],
      extracted_data: extracted
    };

  } catch (err) {
    console.error('[Intent] Groq classification error:', err.message);
    return fallbackClassify(message);
  }
}

// ─── Keyword-based fallback ───────────────────────────────────
function fallbackClassify(message) {
  const lower = message.toLowerCase();

  if (/\b(hola|buenos|buenas|gracias|ok|bien|genial)\b/.test(lower))
    return { intent: INTENTS.SALUDO, confidence: 0.9, requires_data: false, missing_fields: [], extracted_data: {} };

  if (/\b(plan|semanas?|entrenamiento|rutina|dieta|estudio|programa)\b/.test(lower)) {
    const weeksM    = message.match(/(\d+)\s*semanas?/i);
    const sessionsM = message.match(/(\d+)\s*(veces?|días?|sesiones?)\s*(a la |por )?semana/i);
    return {
      intent: INTENTS.CREAR_PLAN, confidence: 0.8, requires_data: false, missing_fields: [],
      extracted_data: {
        weeks:             weeksM    ? parseInt(weeksM[1])    : 4,
        sessions_per_week: sessionsM ? parseInt(sessionsM[1]) : 3,
        goal:  extractGoal(message)  || 'entrenamiento general',
        level: extractLevel(message) || 'intermedio'
      }
    };
  }

  if (/\b(borra|elimina|cancela|quita|suprime)\b/.test(lower))
    return { intent: INTENTS.ELIMINAR, confidence: 0.85, requires_data: true, missing_fields: ['event_id'], extracted_data: {} };

  if (/\b(cambia|modifica|mueve|actualiza|edita)\b/.test(lower))
    return { intent: INTENTS.MODIFICAR, confidence: 0.8, requires_data: true, missing_fields: [], extracted_data: {} };

  // Consultar: solo preguntas
  if (/^[¿?]|\b(qué|que|cuándo|cuando|tengo.*\?|hay.*\?|muéstrame|enséñame|dame|lista)\b/.test(lower))
    return { intent: INTENTS.CONSULTAR, confidence: 0.8, requires_data: false, missing_fields: [], extracted_data: {} };

  // Crear evento: "tengo X el día", "hay X", "crea/añade/apunta X"
  if (/\b(tengo|hay|cita|evento|reunión|reunion|dentista|médico|medico|recordatorio|crea|añade|agrega|apunta|pon|recuérdame)\b/.test(lower)) {
    const titleMatch = lower.match(/(?:tengo|hay|cita de|cita con|recordatorio de)?\s*([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?)/i);
    return {
      intent: INTENTS.CREAR_EVENTO, confidence: 0.8, requires_data: false, missing_fields: [],
      extracted_data: {}
    };
  }

  return { intent: INTENTS.OTRO, confidence: 0.5, requires_data: false, missing_fields: [], extracted_data: {} };
}

// ─── Helpers ─────────────────────────────────────────────────
function extractGoal(message) {
  const lower = message.toLowerCase();
  if (/perder peso|adelgazar|bajar peso/.test(lower))       return 'perder peso';
  if (/ganar músculo|ganar musculo|hipertrofia/.test(lower)) return 'ganar músculo';
  if (/resistencia|cardio|correr|running/.test(lower))       return 'mejorar resistencia';
  if (/fuerza|potencia/.test(lower))                         return 'ganar fuerza';
  if (/fútbol|futbol|padel|tenis|deporte/.test(lower))       return 'rendimiento deportivo';
  if (/estudio|estudiar|aprender/.test(lower))               return 'estudio';
  if (/lesion|lesionarme|prevenir/.test(lower))              return 'prevención de lesiones';
  return null;
}

function extractLevel(message) {
  const lower = message.toLowerCase();
  if (/principiante|básico|basico|empezando|novato/.test(lower)) return 'principiante';
  if (/avanzado|experto|élite|elite/.test(lower))                return 'avanzado';
  return null;
}

function extractSessions(message) {
  const m = message.match(/(\d+)\s*(veces?|días?|sesiones?)\s*(a la |por )?semana/i);
  return m ? parseInt(m[1]) : null;
}

module.exports = { classifyIntent, INTENTS };
