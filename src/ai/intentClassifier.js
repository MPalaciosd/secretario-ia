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
- crear_evento: crear cita, evento, recordatorio, reunión, médico, etc.
- crear_plan: crear plan de entrenamiento, estudio, dieta, proyecto multi-semana
- consultar: preguntar qué hay en la agenda, disponibilidad
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

REGLAS CRÍTICAS para extracted_data y missing_fields:

Para crear_evento:
- SIEMPRE extrae title y date si están en el mensaje
- Solo añade a missing_fields lo que REALMENTE no está en el mensaje
- Si el usuario dice "dentista el viernes a las 11" → extracted_data completo, missing_fields vacío

Para crear_plan:
- Extrae weeks y sessions_per_week si el usuario los menciona
- Si no menciona goal → usa "entrenamiento general" como default, NO lo pongas en missing_fields
- Si no menciona level → usa "intermedio" como default, NO lo pongas en missing_fields
- SOLO pon en missing_fields campos REALMENTE ausentes y sin default razonable
- Si el usuario ya dio semanas Y sesiones/semana → requires_data: false, missing_fields: []

IMPORTANTE: Si el usuario dio weeks y sessions_per_week, NO preguntes de nuevo por ellos.
Usa siempre defaults inteligentes: goal="entrenamiento general", level="intermedio"

Ejemplos de extracted_data:
- "dentista el viernes a las 11" → {"title":"Dentista","date":"viernes","time":"11:00"}
- "plan 4 semanas 3 días fútbol" → {"weeks":4,"sessions_per_week":3,"goal":"fútbol","level":"intermedio"}
- "entrenamiento 4 semanas 4 veces semana" → {"weeks":4,"sessions_per_week":4,"goal":"entrenamiento general","level":"intermedio"}
- "hazme un plan de 6 semanas 5 días para perder peso nivel avanzado" → {"weeks":6,"sessions_per_week":5,"goal":"perder peso","level":"avanzado"}
`;

async function classifyIntent(message, conversationHistory = []) {
  if (!config.groq.apiKey) {
    console.warn('[Intent] No GROQ_API_KEY set, using fallback classifier');
    return fallbackClassify(message);
  }

  try {
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

    // Add last 3 conversation turns for context
    if (conversationHistory.length > 0) {
      const recent = conversationHistory.slice(-6);
      messages.push({ role: 'user', content: `Contexto reciente:\n${recent.map(m => `${m.role}: ${m.content}`).join('\n')}` });
      messages.push({ role: 'assistant', content: 'Entendido, analizaré el siguiente mensaje con ese contexto.' });
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

    // Post-process: apply smart defaults for plan fields so we don't ask for them
    const extracted = result.extracted_data || {};
    if (result.intent === 'crear_plan') {
      if (!extracted.goal)  extracted.goal  = 'entrenamiento general';
      if (!extracted.level) extracted.level = 'intermedio';
      if (!extracted.sessions_per_week) extracted.sessions_per_week = 3;
      // Remove goal/level from missing_fields since we have defaults
      const autoFields = ['goal', 'level'];
      result.missing_fields = (result.missing_fields || []).filter(f => !autoFields.includes(f));
      // If weeks is already extracted, remove from missing too
      if (extracted.weeks) {
        result.missing_fields = result.missing_fields.filter(f => f !== 'weeks');
      }
      if (extracted.sessions_per_week) {
        result.missing_fields = result.missing_fields.filter(f => f !== 'sessions_per_week');
      }
      // Only requires_data if truly missing required fields without defaults
      if (result.missing_fields.length === 0) {
        result.requires_data = false;
      }
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

// ─── Keyword-based fallback (no AI needed) ───────────────────
function fallbackClassify(message) {
  const lower = message.toLowerCase();

  if (/\b(hola|buenos|buenas|gracias|ok|bien|genial)\b/.test(lower))
    return { intent: INTENTS.SALUDO, confidence: 0.9, requires_data: false, missing_fields: [], extracted_data: {} };

  if (/\b(plan|semanas?|entrenamiento|rutina|dieta|estudio|programa)\b/.test(lower)) {
    // Try to extract weeks and sessions from message
    const weeksMatch    = message.match(/(\d+)\s*semanas?/i);
    const sessionsMatch = message.match(/(\d+)\s*(veces?|días?|sesiones?)\s*(a la |por )?semana/i);
    const goalMatch     = message.match(/para\s+([^,.]+)/i);
    const levelMatch    = message.match(/\b(principiante|intermedio|avanzado)\b/i);

    const extracted = {
      weeks:            weeksMatch    ? parseInt(weeksMatch[1])    : 4,
      sessions_per_week:sessionsMatch ? parseInt(sessionsMatch[1]) : 3,
      goal:             goalMatch     ? goalMatch[1].trim()        : 'entrenamiento general',
      level:            levelMatch    ? levelMatch[1].toLowerCase(): 'intermedio'
    };

    return {
      intent: INTENTS.CREAR_PLAN,
      confidence: 0.8,
      requires_data: false,
      missing_fields: [],
      extracted_data: extracted
    };
  }

  if (/\b(borra|elimina|cancela|quita|suprime)\b/.test(lower))
    return { intent: INTENTS.ELIMINAR, confidence: 0.85, requires_data: true, missing_fields: ['event_id'], extracted_data: {} };

  if (/\b(cambia|modifica|mueve|actualiza|edita)\b/.test(lower))
    return { intent: INTENTS.MODIFICAR, confidence: 0.8, requires_data: true, missing_fields: [], extracted_data: {} };

  if (/\b(qué|que|cuándo|cuando|tengo|agenda|semana|hoy|mañana|próximo)\b/.test(lower))
    return { intent: INTENTS.CONSULTAR, confidence: 0.8, requires_data: false, missing_fields: [], extracted_data: {} };

  if (/\b(crea|cita|evento|reunión|reunion|dentista|médico|medico|recordatorio|añade|agrega)\b/.test(lower))
    return { intent: INTENTS.CREAR_EVENTO, confidence: 0.8, requires_data: true, missing_fields: [], extracted_data: {} };

  return { intent: INTENTS.OTRO, confidence: 0.5, requires_data: false, missing_fields: [], extracted_data: {} };
}

module.exports = { classifyIntent, INTENTS };
