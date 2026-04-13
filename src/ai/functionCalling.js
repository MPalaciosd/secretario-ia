// ─── ai/functionCalling.js ───────────────────────────────────────────
//
// RESPONSABILIDAD: dado un intent CONFIRMADO y datos COMPLETOS,
// determinar exactamente qué función llamar y con qué argumentos.
//
// GARANTÍAS:
//   - Nunca se llama si faltan campos obligatorios (eso ya lo filtró chatController)
//   - tool_choice: 'required' — Groq SIEMPRE devuelve una función, nunca texto libre
//   - Validación post-extracción: si Groq devuelve argumentos inválidos, error explícito
//   - resolveDate robusto para expresiones españolas complejas

'use strict';

const Groq   = require('groq-sdk');
const config = require('../config');
const { extractGoal, extractLevel, extractSessions } = require('./intentClassifier');

const groq = new Groq({ apiKey: config.groq.apiKey });

// ─── Tool definitions — fuente de verdad para Groq ──────────────────
//
// Descripciones muy explícitas para que Groq no confunda funciones.
// Parámetros con ejemplos concretos para mejorar extracción.

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'createEvent',
      description: [
        'Crea un nuevo evento en el calendario del usuario.',
        'Úsala cuando el usuario quiere AÑADIR algo a su agenda.',
        'NO la uses para consultar, modificar o eliminar eventos.',
        'Ejemplos: "tengo dentista el viernes", "apunta reunión mañana a las 10", "recuérdame gym el lunes"',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Título del evento. Sé específico: "Dentista", "Reunión con equipo", "Gym". Máx 100 chars.',
          },
          date: {
            type: 'string',
            description: [
              'Fecha exactamente como la mencionó el usuario.',
              'Ejemplos válidos: "mañana", "el viernes", "el 30 de abril", "el lunes que viene", "25/12".',
              'NO conviertas a YYYY-MM-DD — devuelve la expresión original.',
            ].join(' '),
          },
          time: {
            type: 'string',
            description: 'Hora en formato HH:MM (24h). Si no se menciona, usa "09:00". Ejemplos: "10:00", "14:30", "08:00".',
          },
          duration_minutes: {
            type: 'number',
            description: 'Duración en minutos. Default: 60. Infiere del tipo: médico=30, reunión=60, gym=90.',
          },
          event_type: {
            type: 'string',
            enum: ['general', 'medico', 'trabajo', 'personal', 'deporte', 'reunion'],
            description: 'Tipo de evento. Infiere del título: dentista/médico → medico, reunión → reunion, gym/deporte → deporte.',
          },
          notes: {
            type: 'string',
            description: 'Notas adicionales mencionadas por el usuario. Opcional.',
          },
        },
        required: ['title', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createTrainingPlan',
      description: [
        'Crea un plan multi-semana (entrenamiento, estudio, dieta, etc.).',
        'Úsala cuando el usuario quiere un programa estructurado de varias semanas.',
        'NO la uses para crear eventos puntuales.',
        'Ejemplos: "plan de entrenamiento 4 semanas", "rutina 3 días por semana fútbol".',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          weeks: {
            type: 'number',
            description: 'Número de semanas del plan. Obligatorio. Ejemplo: 4, 8, 12.',
          },
          goal: {
            type: 'string',
            description: 'Objetivo del plan. Default: "entrenamiento general". Ejemplos: "perder peso", "ganar músculo", "fútbol", "resistencia".',
          },
          level: {
            type: 'string',
            enum: ['principiante', 'intermedio', 'avanzado'],
            description: 'Nivel del usuario. Default: "intermedio".',
          },
          sessions_per_week: {
            type: 'number',
            description: 'Sesiones por semana. Default: 3. Rango típico: 2-6.',
          },
          session_duration_minutes: {
            type: 'number',
            description: 'Duración por sesión en minutos. Default: 60.',
          },
          plan_type: {
            type: 'string',
            enum: ['entrenamiento', 'dieta', 'estudio', 'otro'],
            description: 'Tipo de plan. Infiere del contexto.',
          },
          notes: {
            type: 'string',
            description: 'Observaciones adicionales del usuario.',
          },
        },
        required: ['weeks', 'sessions_per_week'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedulePlan',
      description: 'Programa las sesiones de un plan ya creado en el calendario. Requiere plan_id.',
      parameters: {
        type: 'object',
        properties: {
          plan_id: {
            type: 'string',
            description: 'ID del plan a programar.',
          },
          start_date: {
            type: 'string',
            description: 'Fecha de inicio. Default: hoy.',
          },
          preferred_days: {
            type: 'array',
            items: { type: 'string' },
            description: 'Días preferidos. Ejemplo: ["lunes", "miercoles", "viernes"].',
          },
          preferred_time: {
            type: 'string',
            description: 'Hora preferida en HH:MM. Default: "07:00".',
          },
        },
        required: ['plan_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getEvents',
      description: [
        'Consulta los eventos del calendario del usuario.',
        'Úsala para preguntas como "qué tengo esta semana", "mis eventos del lunes", "ver agenda".',
        'NO la uses para crear, modificar o eliminar.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          date_from: {
            type: 'string',
            description: 'Fecha inicio de búsqueda. Default: hoy.',
          },
          date_to: {
            type: 'string',
            description: 'Fecha fin de búsqueda. Default: 7 días desde hoy.',
          },
          event_type: {
            type: 'string',
            enum: ['general', 'medico', 'trabajo', 'personal', 'deporte', 'reunion'],
            description: 'Filtrar por tipo. Opcional.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateEvent',
      description: 'Modifica un evento existente del calendario. Requiere event_id.',
      parameters: {
        type: 'object',
        properties: {
          event_id: {
            type: 'string',
            description: 'ID del evento a modificar.',
          },
          title:            { type: 'string' },
          date:             { type: 'string' },
          time:             { type: 'string' },
          duration_minutes: { type: 'number' },
          notes:            { type: 'string' },
        },
        required: ['event_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deleteEvent',
      description: 'Elimina o cancela un evento del calendario. Requiere event_id.',
      parameters: {
        type: 'object',
        properties: {
          event_id: {
            type: 'string',
            description: 'ID del evento a eliminar.',
          },
        },
        required: ['event_id'],
      },
    },
  },
];

// ─── Intent → allowed functions whitelist ───────────────────────────
// Prevents Groq from calling the wrong function for an intent.
// e.g. if intent is crear_evento, Groq can ONLY call createEvent.

const INTENT_FUNCTION_WHITELIST = {
  crear_evento: ['createEvent'],
  crear_plan:   ['createTrainingPlan', 'schedulePlan'],
  consultar:    ['getEvents'],
  modificar:    ['updateEvent'],
  eliminar:     ['deleteEvent'],
};

// ─── Execution prompt — focused on data extraction, not classification ─

function buildExecutionPrompt(intent, extractedData) {
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const dataHint = Object.keys(extractedData).length > 0
    ? `\nDatos ya detectados por el clasificador: ${JSON.stringify(extractedData)}\nÚsalos como base y completa con el mensaje.`
    : '';

  return [
    `Eres el módulo de EJECUCIÓN de una agenda inteligente. Hoy es ${today}.`,
    `Tu tarea: extraer los argumentos exactos para llamar a la función correcta.`,
    `Intención confirmada: ${intent}.`,
    dataHint,
    ``,
    `REGLAS DE EXTRACCIÓN:`,
    `- Para fechas: devuelve la expresión EXACTAMENTE como la dijo el usuario (ej: "el viernes", "mañana", "el 30 de abril").`,
    `  NO conviertas a YYYY-MM-DD — la función resolveDate se encarga de eso.`,
    `- Para horas: formato HH:MM en 24h. "las 3 de la tarde" → "15:00", "las 10" → "10:00".`,
    `- Para títulos: sé específico y conciso. "Dentista", "Reunión de equipo", "Gym".`,
    `- event_type: infiere del contexto. médico/dentista → "medico", gym/deporte → "deporte".`,
    `- duration_minutes: infiere del tipo si no se menciona. médico=30, reunión=60, gym=90.`,
    `- NUNCA inventes datos que el usuario no mencionó — usa los defaults indicados en los parámetros.`,
    `- Llama SIEMPRE a una función. Nunca respondas con texto.`,
  ].filter(Boolean).join('\n');
}

// ─── Main: ask Groq to call a function ──────────────────────────────
//
// LLAMADO SOLO cuando intent está confirmado y datos están completos.
// tool_choice = 'required' garantiza que Groq SIEMPRE llame una función.

async function processFunctionCall(intent, message, extractedData = {}, history = [], userId) {
  if (!config.groq.apiKey) {
    return buildFallbackCall(intent, message, extractedData);
  }

  // Determine which functions are allowed for this intent
  const allowedFunctions = INTENT_FUNCTION_WHITELIST[intent];
  if (!allowedFunctions) {
    console.warn('[FunctionCalling] No whitelist for intent:', intent);
    return null;
  }

  // Filter tools to only allowed ones for this intent
  const filteredTools = TOOLS.filter(t => allowedFunctions.includes(t.function.name));

  try {
    const systemPrompt = buildExecutionPrompt(intent, extractedData);

    // Include recent history for context (e.g. to resolve "el mismo evento")
    const historyMessages = history.slice(-4).map(m => ({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content.substring(0, 300), // Truncate to save tokens
    }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user',   content: message },
    ];

    const response = await groq.chat.completions.create({
      model:       config.groq.model,
      messages,
      tools:       filteredTools,
      tool_choice: 'required',  // CRITICAL: always call a function, never return text
      temperature: 0.1,
      max_tokens:  600,
    });

    const choice = response.choices[0];

    if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
      // Should never happen with tool_choice: 'required', but handle defensively
      console.error('[FunctionCalling] No tool_call despite required — falling back');
      return buildFallbackCall(intent, message, extractedData);
    }

    const toolCall = choice.message.tool_calls[0];
    const funcName = toolCall.function.name;

    // Validate function name is in whitelist (paranoia check)
    if (!allowedFunctions.includes(funcName)) {
      console.error(`[FunctionCalling] Groq called ${funcName} but whitelist is ${allowedFunctions}`);
      return buildFallbackCall(intent, message, extractedData);
    }

    let args = {};
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error('[FunctionCalling] Failed to parse tool arguments:', e.message);
      return buildFallbackCall(intent, message, extractedData);
    }

    // ── Post-extraction validation and normalization ─────────────
    args = normalizeArgs(funcName, args, message, extractedData);

    // ── Validate required fields are present ─────────────────────
    const validationError = validateArgs(funcName, args);
    if (validationError) {
      console.error('[FunctionCalling] Validation failed:', validationError);
      return buildFallbackCall(intent, message, extractedData);
    }

    return { functionName: funcName, arguments: args };

  } catch (err) {
    console.error('[FunctionCalling] Groq error:', err.message);
    return buildFallbackCall(intent, message, extractedData);
  }
}

// ─── Normalize args after Groq extraction ───────────────────────────

function normalizeArgs(funcName, args, message, extractedData) {
  const normalized = { ...args };

  if (funcName === 'createEvent') {
    // Resolve date strings → YYYY-MM-DD
    if (normalized.date) normalized.date = resolveDate(normalized.date);
    else if (extractedData.date) normalized.date = resolveDate(extractedData.date);
    else normalized.date = new Date().toISOString().split('T')[0];

    // Normalize time
    if (normalized.time) normalized.time = normalizeTime(normalized.time);
    else if (extractedData.time) normalized.time = normalizeTime(extractedData.time);
    else normalized.time = '09:00';

    // Defaults
    if (!normalized.duration_minutes) normalized.duration_minutes = inferDuration(normalized.event_type, message);
    if (!normalized.event_type)       normalized.event_type        = inferEventType(message, normalized.title || '');
    if (!normalized.title)            normalized.title             = extractedData.title || extractTitle(message);

    // Final validation: title must not be empty
    if (!normalized.title || normalized.title.trim() === '') {
      normalized.title = 'Nuevo evento';
    }
  }

  if (funcName === 'createTrainingPlan') {
    if (!normalized.goal || normalized.goal.trim() === '')  normalized.goal  = extractGoal(message)     || 'entrenamiento general';
    if (!normalized.level || normalized.level.trim() === '') normalized.level = extractLevel(message)    || 'intermedio';
    if (!normalized.sessions_per_week)                       normalized.sessions_per_week = extractSessions(message) || 3;
    if (!normalized.plan_type)                               normalized.plan_type         = inferPlanType(message);
    if (!normalized.session_duration_minutes)                normalized.session_duration_minutes = 60;
  }

  if (funcName === 'getEvents') {
    if (!normalized.date_from) normalized.date_from = new Date().toISOString().split('T')[0];
    if (!normalized.date_to)   normalized.date_to   = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    // If user asked about a specific day, narrow the range
    if (extractedData.date) {
      const resolved = resolveDate(extractedData.date);
      normalized.date_from = resolved;
      normalized.date_to   = resolved;
    }
  }

  if (funcName === 'schedulePlan') {
    if (normalized.start_date) normalized.start_date = resolveDate(normalized.start_date);
    else normalized.start_date = new Date().toISOString().split('T')[0];

    if (!normalized.preferred_time) normalized.preferred_time = '07:00';
    if (!normalized.preferred_days) normalized.preferred_days = ['lunes', 'miercoles', 'viernes'];
  }

  return normalized;
}

// ─── Validate required fields ────────────────────────────────────────

function validateArgs(funcName, args) {
  const checks = {
    createEvent:        () => !args.title ? 'missing title' : !args.date ? 'missing date' : null,
    createTrainingPlan: () => !args.weeks ? 'missing weeks' : !args.sessions_per_week ? 'missing sessions_per_week' : null,
    updateEvent:        () => !args.event_id ? 'missing event_id' : null,
    deleteEvent:        () => !args.event_id ? 'missing event_id' : null,
    schedulePlan:       () => !args.plan_id  ? 'missing plan_id'  : null,
    getEvents:          () => null,
  };
  return checks[funcName] ? checks[funcName]() : null;
}

// ─── Fallback call builder ───────────────────────────────────────────

function buildFallbackCall(intent, message, extractedData) {
  const base = { ...extractedData };
  if (base.date) base.date = resolveDate(base.date);

  switch (intent) {
    case 'crear_evento':
      return {
        functionName: 'createEvent',
        arguments: {
          title:            base.title             || extractTitle(message),
          date:             base.date              || new Date().toISOString().split('T')[0],
          time:             base.time              || '09:00',
          duration_minutes: base.duration_minutes  || 60,
          event_type:       base.event_type        || inferEventType(message, base.title || ''),
        },
      };

    case 'crear_plan': {
      const wM = message.match(/(\d+)\s*semanas?/i);
      const sM = message.match(/(\d+)\s*(veces?|días?|sesiones?)\s*(a la |por )?semana/i);
      return {
        functionName: 'createTrainingPlan',
        arguments: {
          weeks:             base.weeks             || (wM ? parseInt(wM[1]) : 4),
          goal:              base.goal              || extractGoal(message)     || 'entrenamiento general',
          level:             base.level             || extractLevel(message)    || 'intermedio',
          sessions_per_week: base.sessions_per_week || (sM ? parseInt(sM[1]) : 3),
          plan_type:         base.plan_type         || inferPlanType(message),
          session_duration_minutes: 60,
        },
      };
    }

    case 'consultar':
      return {
        functionName: 'getEvents',
        arguments: {
          date_from: base.date || new Date().toISOString().split('T')[0],
          date_to:   base.date || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        },
      };

    default:
      return null;
  }
}

// ─── resolveDate — Spanish date expression parser ────────────────────
//
// Returns YYYY-MM-DD from any Spanish date expression.
// Handles: relative ("mañana", "pasado"), day names, full dates, numeric.

function resolveDate(input) {
  if (!input) return new Date().toISOString().split('T')[0];

  const s     = input.toLowerCase().trim();
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  // Relative
  if (s === 'hoy')                              return fmt(today);
  if (s === 'mañana' || s === 'manana')         return fmt(addDays(today, 1));
  if (s.includes('pasado mañana') || s.includes('pasado manana')) return fmt(addDays(today, 2));

  // "en X días"
  const inDaysM = s.match(/en (\d+) días?/);
  if (inDaysM) return fmt(addDays(today, parseInt(inDaysM[1])));

  // Month names
  const MONTHS = {
    enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6,
    julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12,
  };

  // "el 30 de abril de 2026", "30 de abril", "el 30 de abril"
  const mDayMonth = s.match(/(\d{1,2})\s+de\s+(\w+)(?:\s+(?:de\s+)?(\d{4}))?/);
  if (mDayMonth) {
    const day   = parseInt(mDayMonth[1]);
    const month = MONTHS[mDayMonth[2]];
    const year  = mDayMonth[3] ? parseInt(mDayMonth[3]) : now.getFullYear();
    if (month && day >= 1 && day <= 31) {
      let target = new Date(year, month - 1, day);
      // If past and no explicit year, assume next year
      if (!mDayMonth[3] && target < today) target.setFullYear(year + 1);
      return fmt(target);
    }
  }

  // "30/04" or "30/04/2026"
  const mSlash = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (mSlash) {
    const day   = parseInt(mSlash[1]);
    const month = parseInt(mSlash[2]);
    const year  = mSlash[3] ? parseInt(mSlash[3]) : now.getFullYear();
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return fmt(new Date(year, month - 1, day));
    }
  }

  // Day names: "el viernes", "el próximo lunes", "este martes", "el lunes que viene"
  const DAY_MAP = {
    lunes: 1, martes: 2, 'miércoles': 3, miercoles: 3,
    jueves: 4, viernes: 5, 'sábado': 6, sabado: 6, domingo: 0,
  };
  const isNextWeek = s.includes('próximo') || s.includes('proximo') || s.includes('que viene');

  for (const [name, dayNum] of Object.entries(DAY_MAP)) {
    if (s.includes(name)) {
      const d    = new Date(today);
      let diff   = dayNum - d.getDay();
      if (diff <= 0 || isNextWeek) diff += 7;  // Always go to next occurrence
      d.setDate(d.getDate() + diff);
      return fmt(d);
    }
  }

  // Native parse fallback
  const parsed = new Date(input);
  if (!isNaN(parsed)) return fmt(parsed);

  console.warn('[resolveDate] Could not parse:', input, '→ using today');
  return fmt(today);
}

// ─── Extraction and inference helpers ───────────────────────────────

function fmt(date) {
  return date.toISOString().split('T')[0];
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function normalizeTime(timeStr) {
  if (!timeStr) return '09:00';
  const s = timeStr.toLowerCase().trim();

  // Already HH:MM
  if (/^\d{2}:\d{2}$/.test(s)) return s;

  // "las 3 de la tarde", "3pm", "15h"
  const pmMatch = s.match(/(\d{1,2})(?::(\d{2}))?\s*(?:pm|de la tarde|de la noche)/);
  if (pmMatch) {
    let h = parseInt(pmMatch[1]);
    if (h < 12) h += 12;
    const m = pmMatch[2] || '00';
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  // "las 10 de la mañana", "10am"
  const amMatch = s.match(/(\d{1,2})(?::(\d{2}))?\s*(?:am|de la mañana|de la manana)/);
  if (amMatch) {
    const h = parseInt(amMatch[1]) % 12;
    const m = amMatch[2] || '00';
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  // Just a number: "a las 10", "a las 3"
  const numMatch = s.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (numMatch) {
    const h = parseInt(numMatch[1]);
    const m = numMatch[2] || '00';
    // Heuristic: < 7 is afternoon (e.g. "a las 3" = 15:00)
    const hour = h < 7 ? h + 12 : h;
    return `${String(hour).padStart(2, '0')}:${m}`;
  }

  return '09:00';
}

function inferDuration(eventType, message) {
  const durations = {
    medico:  30,
    reunion: 60,
    deporte: 90,
    trabajo: 60,
  };
  if (eventType && durations[eventType]) return durations[eventType];

  const l = message.toLowerCase();
  if (/médico|medico|dentista|consulta/.test(l)) return 30;
  if (/gym|entreno|deporte|running/.test(l))     return 90;
  if (/reunión|reunion|meeting/.test(l))         return 60;
  return 60;
}

function inferEventType(message, title = '') {
  const l = (message + ' ' + title).toLowerCase();
  if (/médico|medico|dentista|hospital|consulta|urgencias/.test(l)) return 'medico';
  if (/reunión|reunion|meeting|junta|presentación/.test(l))         return 'reunion';
  if (/gym|entreno|entrena|deporte|fútbol|running|yoga|padel/.test(l)) return 'deporte';
  if (/trabajo|oficina|cliente|proyecto/.test(l))                   return 'trabajo';
  if (/cumpleaños|familia|amigos|cena|cine|viaje/.test(l))          return 'personal';
  return 'general';
}

function inferPlanType(message) {
  const l = message.toLowerCase();
  if (/dieta|nutrición|comer|comida/.test(l))                return 'dieta';
  if (/estudio|estudiar|aprender|oposicion|examen/.test(l))  return 'estudio';
  if (/entrena|gym|deporte|fútbol|running/.test(l))          return 'entrenamiento';
  return 'entrenamiento';
}

function extractTitle(message) {
  // Remove filler words at the start
  let cleaned = message
    .replace(/^(crea|añade|agrega|programa|pon|apunta|recuérdame|recuerdame)\s+(un\s+|una\s+|el\s+|la\s+)?/i, '')
    .replace(/\s+(el|la|este|esta|un|una|al|del)\s+.+/i, '')  // cut after determiners
    .trim();

  return cleaned.split(/\s+/).slice(0, 5).join(' ') || 'Nuevo evento';
}

module.exports = { processFunctionCall, resolveDate, normalizeTime, inferEventType, TOOLS };
