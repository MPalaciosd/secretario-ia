const Groq = require('groq-sdk');
const config = require('../config');

const groq = new Groq({ apiKey: config.groq.apiKey });

// ─── Tool definitions (same schema, works with Groq) ─────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'createEvent',
      description: 'Crea un nuevo evento en el calendario del usuario',
      parameters: {
        type: 'object',
        properties: {
          title:            { type: 'string',  description: 'Título del evento' },
          date:             { type: 'string',  description: 'Fecha en formato YYYY-MM-DD o descripción como "mañana", "el viernes"' },
          time:             { type: 'string',  description: 'Hora en formato HH:MM' },
          duration_minutes: { type: 'number',  description: 'Duración en minutos (por defecto 60)' },
          event_type:       { type: 'string',  enum: ['general','medico','trabajo','personal','deporte','reunion'], description: 'Tipo de evento' },
          notes:            { type: 'string',  description: 'Notas adicionales' }
        },
        required: ['title', 'date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createTrainingPlan',
      description: 'Crea un plan de entrenamiento, estudio, dieta u otro plan multi-semana',
      parameters: {
        type: 'object',
        properties: {
          weeks:            { type: 'number', description: 'Número de semanas del plan' },
          goal:             { type: 'string', description: 'Objetivo del plan (perder peso, ganar músculo, mejorar resistencia, etc.)' },
          level:            { type: 'string', enum: ['principiante','intermedio','avanzado'], description: 'Nivel del usuario' },
          sessions_per_week:{ type: 'number', description: 'Número de sesiones por semana' },
          plan_type:        { type: 'string', enum: ['entrenamiento','dieta','estudio','otro'], description: 'Tipo de plan' },
          notes:            { type: 'string', description: 'Notas o requisitos especiales' }
        },
        required: ['weeks', 'goal', 'level', 'sessions_per_week']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'schedulePlan',
      description: 'Programa un plan ya creado distribuyendo las sesiones en el calendario',
      parameters: {
        type: 'object',
        properties: {
          plan_id:        { type: 'string', description: 'ID del plan a programar' },
          start_date:     { type: 'string', description: 'Fecha de inicio en YYYY-MM-DD' },
          preferred_days: { type: 'array', items: { type: 'string' }, description: 'Días preferidos: ["lunes","miercoles","viernes"]' },
          preferred_time: { type: 'string', description: 'Hora preferida de entrenamiento HH:MM' }
        },
        required: ['plan_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getEvents',
      description: 'Consulta los eventos del calendario del usuario',
      parameters: {
        type: 'object',
        properties: {
          date_from:  { type: 'string', description: 'Fecha de inicio YYYY-MM-DD' },
          date_to:    { type: 'string', description: 'Fecha de fin YYYY-MM-DD' },
          event_type: { type: 'string', description: 'Filtrar por tipo de evento' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateEvent',
      description: 'Modifica un evento existente del calendario',
      parameters: {
        type: 'object',
        properties: {
          event_id:         { type: 'string', description: 'ID del evento a modificar' },
          title:            { type: 'string' },
          date:             { type: 'string' },
          time:             { type: 'string' },
          duration_minutes: { type: 'number' },
          notes:            { type: 'string' }
        },
        required: ['event_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deleteEvent',
      description: 'Elimina o cancela un evento del calendario',
      parameters: {
        type: 'object',
        properties: {
          event_id: { type: 'string', description: 'ID del evento a eliminar' }
        },
        required: ['event_id']
      }
    }
  }
];

// ─── Date resolver (converts relative dates) ─────────────────
function resolveDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const lower = dateStr.toLowerCase().trim();
  const now   = new Date();
  const dayMap = { lunes:1, martes:2, miércoles:3, miercoles:3, jueves:4, viernes:5, sábado:6, sabado:6, domingo:0 };

  if (lower === 'hoy')    return now.toISOString().split('T')[0];
  if (lower === 'mañana' || lower === 'manana') {
    now.setDate(now.getDate() + 1); return now.toISOString().split('T')[0];
  }
  if (lower === 'pasado mañana' || lower === 'pasado manana') {
    now.setDate(now.getDate() + 2); return now.toISOString().split('T')[0];
  }

  // "el próximo lunes", "el viernes", "este martes"
  for (const [name, dayNum] of Object.entries(dayMap)) {
    if (lower.includes(name)) {
      const current = now.getDay();
      let diff = dayNum - current;
      if (diff <= 0) diff += 7;
      now.setDate(now.getDate() + diff);
      return now.toISOString().split('T')[0];
    }
  }

  // Already a date string YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // Try parsing naturally
  const parsed = new Date(dateStr);
  if (!isNaN(parsed)) return parsed.toISOString().split('T')[0];

  return now.toISOString().split('T')[0];
}

// ─── Main function: ask Groq which function to call ──────────
async function processFunctionCall(intent, message, extractedData = {}, history = [], userId) {
  if (!config.groq.apiKey) {
    return buildFallbackCall(intent, message, extractedData);
  }

  try {
    const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const systemPrompt = `Eres un asistente de agenda inteligente. Hoy es ${today}.
Analiza el mensaje del usuario y llama a la función más apropiada.
Si el usuario pide crear un evento, usa createEvent con todos los datos que puedas extraer.
Si pide un plan de semanas, usa createTrainingPlan.
Resuelve fechas relativas: "el viernes" → la fecha del próximo viernes, "mañana" → mañana, etc.
SIEMPRE llama a alguna función cuando la intención es clara.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-4).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      { role: 'user', content: message }
    ];

    const response = await groq.chat.completions.create({
      model:       config.groq.model,
      messages,
      tools:       TOOLS,
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens:  500
    });

    const choice = response.choices[0];

    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall  = choice.message.tool_calls[0];
      const funcName  = toolCall.function.name;
      let   args      = {};

      try { args = JSON.parse(toolCall.function.arguments); } catch(e) { args = extractedData; }

      // Resolve relative dates
      if (args.date) args.date = resolveDate(args.date);
      if (args.start_date) args.start_date = resolveDate(args.start_date);

      // Default values
      if (!args.duration_minutes) args.duration_minutes = 60;
      if (!args.event_type)       args.event_type       = inferEventType(message);
      if (!args.time)             args.time             = '09:00';

      return { functionName: funcName, arguments: args };
    }

    // No tool call — use fallback
    return buildFallbackCall(intent, message, extractedData);

  } catch (err) {
    console.error('[FunctionCalling] Groq error:', err.message);
    return buildFallbackCall(intent, message, extractedData);
  }
}

// ─── Fallback: build function call from extracted data ───────
function buildFallbackCall(intent, message, extractedData) {
  const base = { ...extractedData };
  if (base.date) base.date = resolveDate(base.date);

  switch (intent) {
    case 'crear_evento':
      return {
        functionName: 'createEvent',
        arguments: {
          title:            base.title            || extractTitle(message),
          date:             base.date             || new Date().toISOString().split('T')[0],
          time:             base.time             || '09:00',
          duration_minutes: base.duration_minutes || 60,
          event_type:       base.event_type       || inferEventType(message)
        }
      };
    case 'crear_plan':
      return {
        functionName: 'createTrainingPlan',
        arguments: {
          weeks:             base.weeks             || 4,
          goal:              base.goal              || 'entrenamiento general',
          level:             base.level             || 'intermedio',
          sessions_per_week: base.sessions_per_week || 3,
          plan_type:         base.plan_type         || 'entrenamiento'
        }
      };
    case 'consultar':
      return {
        functionName: 'getEvents',
        arguments: {
          date_from: new Date().toISOString().split('T')[0],
          date_to:   new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
        }
      };
    default:
      return null;
  }
}

function extractTitle(message) {
  const cleaned = message.replace(/^(crea|añade|agrega|programa|pon|apunta)\s+(un\s+|una\s+)?/i, '');
  return cleaned.split(' ').slice(0, 5).join(' ') || 'Nuevo evento';
}

function inferEventType(message) {
  const lower = message.toLowerCase();
  if (/médico|medico|dentista|hospital|cita médica|consulta/.test(lower)) return 'medico';
  if (/reunión|reunion|meeting|trabajo|oficina|jefe|cliente/.test(lower))  return 'reunion';
  if (/entrena|gym|deporte|fútbol|futbol|running|correr|natación/.test(lower)) return 'deporte';
  if (/personal|cumpleaños|familia|amigos|cena|comida/.test(lower))        return 'personal';
  return 'general';
}

module.exports = { processFunctionCall, TOOLS };
