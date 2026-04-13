// ─── ai/intentClassifier.js ──────────────────────────────────────────
//
// RESPONSABILIDAD ÚNICA: clasificar intención + detectar campos faltantes.
// NO extrae datos para ejecutar — eso es trabajo de functionCalling.js.
//
// PIPELINE:
//   1. classifyIntent()  →  qué quiere el usuario + qué falta
//   2. (si requires_data) → chatController pregunta al usuario
//   3. (si completo)      → functionCalling.js ejecuta la acción
//
// MODELOS:
//   - fastModel para clasificación (barato, rápido, < 300 tokens)
//   - Solo clasificación, nunca ejecución

'use strict';

const Groq   = require('groq-sdk');
const config = require('../config');

const groq = new Groq({ apiKey: config.groq.apiKey });

// ─── Intent catalogue ────────────────────────────────────────────────

const INTENTS = {
  CREAR_EVENTO: 'crear_evento',
  CREAR_PLAN:   'crear_plan',
  CONSULTAR:    'consultar',
  MODIFICAR:    'modificar',
  ELIMINAR:     'eliminar',
  SALUDO:       'saludo',
  CONFIRMAR:    'confirmar',   // "sí", "ok", "confirma"
  CANCELAR:     'cancelar',   // "no", "cancela", "olvídalo"
  OTRO:         'otro',
};

// ─── System prompt — separado del prompt de ejecución ───────────────
//
// PRINCIPIO: Este prompt SOLO clasifica. No extrae datos para ejecutar.
// Extrae únicamente lo necesario para saber si faltan datos.
//
// REGLAS ANTI-FALSOS-POSITIVOS:
//   - Un texto sin fecha NI indicación de evento → OTRO, no crear_evento
//   - Preguntas sobre agenda → consultar, nunca crear_evento
//   - Respuestas a preguntas previas ("a las 5", "el martes") → usar contexto
//     para determinar si completan un crear_evento/crear_plan previo

const CLASSIFIER_SYSTEM_PROMPT = `Eres un clasificador de intenciones para una agenda inteligente. Tu ÚNICA tarea es determinar qué quiere hacer el usuario.

INTENCIONES DISPONIBLES:
- crear_evento: el usuario quiere AÑADIR algo a su agenda (cita, evento, reunión, recordatorio)
- crear_plan: el usuario quiere un plan multi-semana (entrenamiento, estudio, dieta)
- consultar: el usuario PREGUNTA qué hay en su agenda, quiere ver sus eventos
- modificar: el usuario quiere CAMBIAR un evento que ya existe
- eliminar: el usuario quiere BORRAR un evento que ya existe
- confirmar: el usuario dice "sí", "ok", "va", "perfecto", "adelante", "hazlo"
- cancelar: el usuario dice "no", "cancela", "olvídalo", "mejor no"
- saludo: saludos, agradecimientos, conversación general sin acción
- otro: todo lo demás que no es ninguna de las anteriores

REGLAS CRÍTICAS — léelas todas antes de clasificar:

1. CREAR_EVENTO requiere INTENCIÓN EXPLÍCITA de añadir algo a la agenda.
   ✅ "tengo dentista el viernes" → crear_evento
   ✅ "apunta una reunión" → crear_evento
   ✅ "añade al calendario: gym mañana" → crear_evento
   ✅ "recuérdame llamar a mamá el lunes" → crear_evento
   ✅ "mañana a las 10 tengo médico" → crear_evento
   ❌ "el viernes llueve" → OTRO (no es agenda)
   ❌ "hoy comí pizza" → OTRO (no es agenda)
   ❌ "me gustan los lunes" → OTRO (no es agenda)

2. CONSULTAR es solo cuando el usuario PREGUNTA sobre su agenda existente.
   ✅ "¿qué tengo esta semana?" → consultar
   ✅ "¿hay algo el martes?" → consultar
   ✅ "muéstrame mis eventos" → consultar
   ❌ "tengo reunión el martes" → crear_evento (no es pregunta)
   ❌ "apunta que hay reunión el martes" → crear_evento

3. RESPUESTAS EN CONTEXTO: Si el historial muestra que el bot preguntó por datos
   faltantes y el usuario responde con solo una fecha, hora o nombre, classifica
   según el contexto — probablemente completa una acción previa.
   Ejemplo: bot preguntó "¿a qué hora?" → usuario dice "a las 3" → crear_evento

4. CAMPOS REQUERIDOS:
   - crear_evento: NECESITA título (qué) + fecha (cuándo). La hora es opcional.
   - crear_plan: NECESITA semanas (cuántas). El resto tiene defaults.
   - modificar: NECESITA identificar qué evento + qué cambiar.
   - eliminar: NECESITA identificar qué evento.

5. DEFAULTS (NO poner en missing_fields):
   - crear_evento: hora → "09:00", duración → 60 min, tipo → "general"
   - crear_plan: goal → "entrenamiento general", level → "intermedio", sessions_per_week → 3

EXTRAE SOLO: título/nombre, fecha, hora (solo si los menciona explícitamente).
NO extraigas para ejecutar — solo para detectar si faltan datos.

FORMATO DE RESPUESTA (JSON puro, sin markdown):
{
  "intent": "una_de_las_intenciones",
  "confidence": 0.0_a_1.0,
  "requires_data": true_si_faltan_campos_obligatorios,
  "missing_fields": ["campo1", "campo2"],
  "extracted_data": {
    "title": "solo si mencionado",
    "date": "exactamente como el usuario lo dijo",
    "time": "solo si mencionado",
    "weeks": número_si_mencionado,
    "sessions_per_week": número_si_mencionado,
    "goal": "solo si mencionado"
  },
  "context_completion": false
}

EJEMPLOS REALES:

Mensaje: "tengo dentista el viernes a las 11"
→ {"intent":"crear_evento","confidence":0.98,"requires_data":false,"missing_fields":[],"extracted_data":{"title":"Dentista","date":"el viernes","time":"11:00"},"context_completion":false}

Mensaje: "apunta una reunión"
→ {"intent":"crear_evento","confidence":0.95,"requires_data":true,"missing_fields":["date"],"extracted_data":{"title":"Reunión"},"context_completion":false}

Mensaje: "tengo una cita"
→ {"intent":"crear_evento","confidence":0.9,"requires_data":true,"missing_fields":["title","date"],"extracted_data":{},"context_completion":false}

Mensaje: "qué tengo el lunes"
→ {"intent":"consultar","confidence":0.97,"requires_data":false,"missing_fields":[],"extracted_data":{"date":"el lunes"},"context_completion":false}

Mensaje: "plan 4 semanas 3 días fútbol"
→ {"intent":"crear_plan","confidence":0.96,"requires_data":false,"missing_fields":[],"extracted_data":{"weeks":4,"sessions_per_week":3,"goal":"fútbol"},"context_completion":false}

Mensaje: "a las 5" (con contexto de que el bot preguntó por hora)
→ {"intent":"crear_evento","confidence":0.9,"requires_data":false,"missing_fields":[],"extracted_data":{"time":"17:00"},"context_completion":true}

Mensaje: "ok sí hazlo"
→ {"intent":"confirmar","confidence":0.99,"requires_data":false,"missing_fields":[],"extracted_data":{},"context_completion":false}

Mensaje: "mejor no"
→ {"intent":"cancelar","confidence":0.99,"requires_data":false,"missing_fields":[],"extracted_data":{},"context_completion":false}
`;

// ─── Main classifier ─────────────────────────────────────────────────

async function classifyIntent(message, conversationHistory = []) {
  if (!config.groq.apiKey) {
    console.warn('[Intent] No GROQ_API_KEY — using fallback classifier');
    return fallbackClassify(message, conversationHistory);
  }

  try {
    // Build context window: last 6 turns (3 exchanges)
    const recentHistory = conversationHistory.slice(-6);
    const contextBlock = recentHistory.length > 0
      ? '\nCONTEXTO RECIENTE (últimos turnos):\n' +
        recentHistory.map(m => `${m.role === 'assistant' ? 'BOT' : 'USUARIO'}: ${m.content.substring(0, 150)}`).join('\n') +
        '\n'
      : '';

    const userContent = contextBlock
      ? `${contextBlock}\nMENSAJE ACTUAL DEL USUARIO: "${message}"`
      : `MENSAJE DEL USUARIO: "${message}"`;

    const response = await groq.chat.completions.create({
      model:      config.groq.fastModel,
      messages:   [
        { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
        { role: 'user',   content: userContent },
      ],
      temperature: 0.05,   // Almost deterministic — classification must be consistent
      max_tokens:  350,
      // No tools here — pure text classification
    });

    const raw = response.choices[0].message.content.trim();

    // Extract JSON — handle models that wrap in markdown blocks
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in classifier response: ' + raw.substring(0, 100));

    const result = JSON.parse(jsonMatch[0]);
    if (!result.intent || !INTENTS[result.intent.toUpperCase()]) {
      throw new Error('Invalid intent: ' + result.intent);
    }

    // Post-process: apply smart defaults — remove fields that have defaults from missing_fields
    const extracted = result.extracted_data || {};
    let missingFields = result.missing_fields || [];

    if (result.intent === 'crear_plan') {
      // Apply regex-based extraction as backup for plans
      if (!extracted.goal)              extracted.goal              = extractGoal(message)     || 'entrenamiento general';
      if (!extracted.level)             extracted.level             = extractLevel(message)    || 'intermedio';
      if (!extracted.sessions_per_week) extracted.sessions_per_week = extractSessions(message) || 3;

      // These always have defaults — never block execution
      missingFields = missingFields.filter(f => !['goal', 'level', 'sessions_per_week'].includes(f));
    }

    if (result.intent === 'crear_evento') {
      // hour has a default (09:00) — never block execution for missing time
      missingFields = missingFields.filter(f => f !== 'time');
    }

    const requiresData = missingFields.length > 0;

    return {
      intent:             result.intent,
      confidence:         Math.min(1, Math.max(0, result.confidence || 0.8)),
      requires_data:      requiresData,
      missing_fields:     missingFields,
      extracted_data:     extracted,
      context_completion: result.context_completion || false,
    };

  } catch (err) {
    console.error('[Intent] Classification error:', err.message);
    return fallbackClassify(message, conversationHistory);
  }
}

// ─── Keyword-based fallback ──────────────────────────────────────────
// Used when Groq is unavailable or returns bad JSON.
// Conservative: never creates events without explicit intent keywords.

function fallbackClassify(message, history = []) {
  const lower = message.toLowerCase().trim();

  // Confirmations / cancellations — check before anything else
  if (/^(sí|si|ok|vale|va|perfecto|adelante|claro|hazlo|confirma|correcto)$/i.test(lower)) {
    return mk(INTENTS.CONFIRMAR, 0.95);
  }
  if (/^(no|cancela|olvídalo|olvidalo|mejor no|para|stop)$/i.test(lower)) {
    return mk(INTENTS.CANCELAR, 0.95);
  }

  // Greetings
  if (/^(hola|buenos días|buenas|hi|hey|gracias|de nada|ok|genial|perfecto)\b/.test(lower) && lower.length < 30) {
    return mk(INTENTS.SALUDO, 0.9);
  }

  // Plans (before events — plans are more specific)
  if (/\b(plan|semanas?|entrenamiento|rutina|dieta|programa de)\b/.test(lower)) {
    const wM = message.match(/(\d+)\s*semanas?/i);
    const sM = message.match(/(\d+)\s*(veces?|días?|sesiones?)\s*(a la |por )?semana/i);
    const missing = [];
    if (!wM) missing.push('weeks');
    return {
      intent:         INTENTS.CREAR_PLAN,
      confidence:     0.8,
      requires_data:  missing.length > 0,
      missing_fields: missing,
      extracted_data: {
        weeks:             wM ? parseInt(wM[1]) : undefined,
        sessions_per_week: sM ? parseInt(sM[1]) : 3,
        goal:              extractGoal(message) || 'entrenamiento general',
        level:             extractLevel(message) || 'intermedio',
      },
      context_completion: false,
    };
  }

  // Delete
  if (/\b(borra|elimina|cancela|quita|suprime)\b/.test(lower)) {
    return { ...mk(INTENTS.ELIMINAR, 0.85), requires_data: true, missing_fields: ['event_id'] };
  }

  // Modify
  if (/\b(cambia|modifica|mueve|actualiza|edita)\b/.test(lower)) {
    return { ...mk(INTENTS.MODIFICAR, 0.8), requires_data: true, missing_fields: ['event_id'] };
  }

  // Consult — must be a question or explicit "show me"
  if (/[¿?]|\b(qué|que|cuándo|cuando|muéstrame|enséñame|dame|lista|ver|mostrar)\b/.test(lower)) {
    // Only classify as consult if it looks like a query, not a statement
    if (!/\b(tengo|hay que|voy a|me apuntas|pon|agrega|añade|crea)\b/.test(lower)) {
      return mk(INTENTS.CONSULTAR, 0.8);
    }
  }

  // Create event — REQUIRES at least one explicit intent keyword
  const eventTriggers = /\b(tengo|hay una|hay un|cita|evento|reunión|reunion|dentista|médico|medico|recordatorio|crea|añade|agrega|apunta|pon|recuérdame|programa)\b/;
  if (eventTriggers.test(lower)) {
    const missing = [];
    // Title detection — if only a medical keyword without context, title is known
    const titleDetected = /\b(dentista|médico|medico|reunión|reunion|gym|entreno)\b/.test(lower);
    const dateDetected  = /\b(mañana|hoy|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|\d{1,2}\s+de)\b/.test(lower);

    if (!titleDetected && !/\b(cita|evento|reunión)\s+\w+/.test(lower)) missing.push('title');
    if (!dateDetected) missing.push('date');

    return {
      intent:         INTENTS.CREAR_EVENTO,
      confidence:     0.75,
      requires_data:  missing.length > 0,
      missing_fields: missing,
      extracted_data: {},
      context_completion: false,
    };
  }

  return mk(INTENTS.OTRO, 0.5);
}

function mk(intent, confidence) {
  return { intent, confidence, requires_data: false, missing_fields: [], extracted_data: {}, context_completion: false };
}

// ─── Extraction helpers ──────────────────────────────────────────────

function extractGoal(message) {
  const l = message.toLowerCase();
  if (/perder peso|adelgazar|bajar peso/.test(l))          return 'perder peso';
  if (/ganar músculo|ganar musculo|hipertrofia/.test(l))   return 'ganar músculo';
  if (/resistencia|cardio|correr|running/.test(l))         return 'mejorar resistencia';
  if (/fuerza|potencia/.test(l))                           return 'ganar fuerza';
  if (/fútbol|futbol|padel|tenis|deporte/.test(l))         return 'rendimiento deportivo';
  if (/estudio|estudiar|aprender|oposicion/.test(l))       return 'estudio';
  if (/lesion|lesionarme|prevenir lesiones/.test(l))       return 'prevención de lesiones';
  if (/movilidad|flexibilidad|yoga/.test(l))               return 'movilidad y flexibilidad';
  return null;
}

function extractLevel(message) {
  const l = message.toLowerCase();
  if (/principiante|básico|basico|empezando|novato|inicio/.test(l)) return 'principiante';
  if (/avanzado|experto|élite|elite|profesional/.test(l))           return 'avanzado';
  return null;
}

function extractSessions(message) {
  const m = message.match(/(\d+)\s*(veces?|días?|sesiones?)\s*(a la |por )?semana/i);
  return m ? parseInt(m[1]) : null;
}

module.exports = { classifyIntent, INTENTS, extractGoal, extractLevel, extractSessions };
