const Groq = require('groq-sdk');
const config = require('../config');

const groq = new Groq({ apiKey: config.groq.apiKey });

// ─── Intent types ─────────────────────────────────────────────
const INTENTS = {
  CREAR_EVENTO:  'crear_evento',
  CREAR_PLAN:    'crear_plan',
  CONSULTAR:     'consultar',
  MODIFICAR:     'modificar',
  ELIMINAR:      'eliminar',
  SALUDO:        'saludo',
  OTRO:          'otro'
};

const SYSTEM_PROMPT = `Eres un clasificador de intenciones para una agenda inteligente.
Analiza el mensaje del usuario y responde ÚNICAMENTE con JSON válido.

Intenciones posibles:
- crear_evento: crear cita, evento, recordatorio, reunión, médico, etc.
- crear_plan: crear plan de entrenamiento, estudio, dieta, proyecto multi-semana
- consultar: preguntar qué hay en la agenda, qué eventos tiene, disponibilidad
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

Reglas para missing_fields:
- crear_evento: requiere title, date. Si faltan → ponlos en missing_fields
- crear_plan: requiere weeks, goal, level, sessions_per_week. Si faltan → ponlos
- Si el usuario ya dio los datos → extracted_data con lo que dio, missing_fields vacío

Ejemplos de extracted_data:
- "dentista el viernes a las 11" → {"title":"Dentista","date":"viernes","time":"11:00"}
- "plan 4 semanas 3 días fútbol" → {"weeks":4,"sessions_per_week":3,"goal":"fútbol","level":"intermedio"}
`;

async function classifyIntent(message, conversationHistory = []) {
  if (!config.groq.apiKey) {
    console.warn('[Intent] No GROQ_API_KEY set, using fallback classifier');
    return fallbackClassify(message);
  }

  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT }
    ];

    // Add last 3 conversation turns for context
    if (conversationHistory.length > 0) {
      const recent = conversationHistory.slice(-6);
      messages.push({
        role: 'user',
        content: `Contexto de conversación reciente:\n${recent.map(m => `${m.role}: ${m.content}`).join('\n')}`
      });
      messages.push({ role: 'assistant', content: 'Entendido, analizaré el siguiente mensaje con ese contexto.' });
    }

    messages.push({ role: 'user', content: message });

    const response = await groq.chat.completions.create({
      model:       config.groq.fastModel,
      messages,
      temperature: 0.1,
      max_tokens:  300
    });

    const raw = response.choices[0].message.content.trim();

    // Extract JSON even if there's extra text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const result = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!result.intent) throw new Error('Missing intent in response');

    return {
      intent:         result.intent         || INTENTS.OTRO,
      confidence:     result.confidence     || 0.8,
      requires_data:  result.requires_data  ?? false,
      missing_fields: result.missing_fields || [],
      extracted_data: result.extracted_data || {}
    };

  } catch (err) {
    console.error('[Intent] Groq classification error:', err.message);
    return fallbackClassify(message);
  }
}

// ─── Keyword-based fallback (no AI needed) ───────────────────
function fallbackClassify(message) {
  const lower = message.toLowerCase();

  if (/\b(hola|buenos|buenas|gracias|ok|bien|genial)\b/.test(lower))
    return { intent: INTENTS.SALUDO, confidence: 0.9, requires_data: false, missing_fields: [], extracted_data: {} };

  if (/\b(plan|semanas?|entrenamiento|rutina|dieta|estudio|programa)\b/.test(lower))
    return { intent: INTENTS.CREAR_PLAN, confidence: 0.8, requires_data: true,
      missing_fields: ['weeks','goal','level','sessions_per_week'], extracted_data: {} };

  if (/\b(borra|elimina|cancela|quita|suprime)\b/.test(lower))
    return { intent: INTENTS.ELIMINAR, confidence: 0.85, requires_data: true,
      missing_fields: ['event_id'], extracted_data: {} };

  if (/\b(cambia|modifica|mueve|actualiza|edita)\b/.test(lower))
    return { intent: INTENTS.MODIFICAR, confidence: 0.8, requires_data: true,
      missing_fields: [], extracted_data: {} };

  if (/\b(qué|que|cuándo|cuando|tengo|agenda|semana|hoy|mañana|próximo)\b/.test(lower))
    return { intent: INTENTS.CONSULTAR, confidence: 0.8, requires_data: false,
      missing_fields: [], extracted_data: {} };

  if (/\b(crea|cita|evento|reunión|reunion|dentista|médico|medico|recordatorio|añade|agrega)\b/.test(lower))
    return { intent: INTENTS.CREAR_EVENTO, confidence: 0.8, requires_data: true,
      missing_fields: [], extracted_data: {} };

  return { intent: INTENTS.OTRO, confidence: 0.5, requires_data: false,
    missing_fields: [], extracted_data: {} };
}

module.exports = { classifyIntent, INTENTS };
