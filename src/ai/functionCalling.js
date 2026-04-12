const Groq = require('groq-sdk');
const config = require('../config');
const groq = new Groq({ apiKey: config.groq.apiKey });

// ─── Tool definitions ─────────────────────────────────────────
const TOOLS = [
  { type: 'function', function: {
    name: 'createEvent',
    description: 'Crea un nuevo evento en el calendario del usuario',
    parameters: { type: 'object', properties: {
      title:            { type: 'string', description: 'Título del evento' },
      date:             { type: 'string', description: 'Fecha en formato YYYY-MM-DD o expresión española como "el 30 de abril", "mañana", "el viernes"' },
      time:             { type: 'string', description: 'Hora en formato HH:MM' },
      duration_minutes: { type: 'number', description: 'Duración en minutos (por defecto 60)' },
      event_type:       { type: 'string', enum: ['general','medico','trabajo','personal','deporte','reunion'] },
      notes:            { type: 'string' }
    }, required: ['title', 'date'] }
  }},
  { type: 'function', function: {
    name: 'createTrainingPlan',
    description: 'Crea un plan de entrenamiento, estudio, dieta u otro plan multi-semana',
    parameters: { type: 'object', properties: {
      weeks:             { type: 'number' },
      goal:              { type: 'string', description: 'Objetivo. Default: entrenamiento general' },
      level:             { type: 'string', enum: ['principiante','intermedio','avanzado'], description: 'Default: intermedio' },
      sessions_per_week: { type: 'number' },
      plan_type:         { type: 'string', enum: ['entrenamiento','dieta','estudio','otro'] },
      notes:             { type: 'string' }
    }, required: ['weeks', 'sessions_per_week'] }
  }},
  { type: 'function', function: {
    name: 'schedulePlan',
    description: 'Programa un plan ya creado distribuyendo las sesiones en el calendario',
    parameters: { type: 'object', properties: {
      plan_id:        { type: 'string' },
      start_date:     { type: 'string' },
      preferred_days: { type: 'array', items: { type: 'string' } },
      preferred_time: { type: 'string' }
    }, required: ['plan_id'] }
  }},
  { type: 'function', function: {
    name: 'getEvents',
    description: 'Consulta los eventos del calendario del usuario',
    parameters: { type: 'object', properties: {
      date_from:  { type: 'string' },
      date_to:    { type: 'string' },
      event_type: { type: 'string' }
    }}
  }},
  { type: 'function', function: {
    name: 'updateEvent',
    description: 'Modifica un evento existente del calendario',
    parameters: { type: 'object', properties: {
      event_id:         { type: 'string' },
      title:            { type: 'string' },
      date:             { type: 'string' },
      time:             { type: 'string' },
      duration_minutes: { type: 'number' },
      notes:            { type: 'string' }
    }, required: ['event_id'] }
  }},
  { type: 'function', function: {
    name: 'deleteEvent',
    description: 'Elimina o cancela un evento del calendario',
    parameters: { type: 'object', properties: {
      event_id: { type: 'string' }
    }, required: ['event_id'] }
  }}
];

// ─── Date resolver — handles Spanish date expressions ─────────
function resolveDate(input) {
  if (!input) return new Date().toISOString().split('T')[0];
  const s = input.toLowerCase().trim();
  const now = new Date();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  // Relative keywords
  if (s === 'hoy') return now.toISOString().split('T')[0];
  if (s === 'mañana' || s === 'manana') {
    const d = new Date(now); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0];
  }
  if (s.includes('pasado')) {
    const d = new Date(now); d.setDate(d.getDate() + 2); return d.toISOString().split('T')[0];
  }

  // Spanish month names
  const MONTHS = { enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12 };

  // "el 30 de abril", "30 de abril", "30 de abril de 2026"
  const mDayMonth = s.match(/(\d{1,2})\s+de\s+(\w+)(?:\s+(?:de\s+)?(\d{4}))?/);
  if (mDayMonth) {
    const day   = parseInt(mDayMonth[1]);
    const month = MONTHS[mDayMonth[2]];
    const year  = mDayMonth[3] ? parseInt(mDayMonth[3]) : now.getFullYear();
    if (month && day >= 1 && day <= 31) {
      const target = new Date(year, month - 1, day);
      if (!mDayMonth[3] && target < now && target.getMonth() < now.getMonth()) {
        target.setFullYear(year + 1);
      }
      return target.toISOString().split('T')[0];
    }
  }

  // "30/04" or "30/04/2026"
  const mSlash = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (mSlash) {
    const day   = parseInt(mSlash[1]);
    const month = parseInt(mSlash[2]);
    const year  = mSlash[3] ? parseInt(mSlash[3]) : now.getFullYear();
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day).toISOString().split('T')[0];
    }
  }

  // Day names: "el próximo lunes", "el viernes", "este martes"
  const DAY_MAP = { lunes:1, martes:2, miércoles:3, miercoles:3, jueves:4, viernes:5, sábado:6, sabado:6, domingo:0 };
  for (const [name, dayNum] of Object.entries(DAY_MAP)) {
    if (s.includes(name)) {
      const d    = new Date(now);
      let diff   = dayNum - d.getDay();
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString().split('T')[0];
    }
  }

  // Native parse fallback
  const parsed = new Date(input);
  if (!isNaN(parsed)) return parsed.toISOString().split('T')[0];

  console.warn('[resolveDate] Could not parse:', input, '→ today');
  return now.toISOString().split('T')[0];
}

// ─── Main: ask Groq which function to call ────────────────────
async function processFunctionCall(intent, message, extractedData = {}, history = [], userId) {
  if (!config.groq.apiKey) {
    return buildFallbackCall(intent, message, extractedData);
  }

  try {
    const today = new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const systemPrompt = `Eres un asistente de agenda inteligente. Hoy es ${today}.
Analiza el mensaje del usuario y llama a la función más apropiada.
Para createEvent: extrae título y fecha EXACTAMENTE como el usuario la menciona (ej: "el 30 de abril", "el viernes", "mañana").
Para createTrainingPlan: si no se menciona goal usa "entrenamiento general", si no se menciona level usa "intermedio".
SIEMPRE llama a alguna función cuando la intención es clara.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-4).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      { role: 'user', content: message }
    ];

    const response = await groq.chat.completions.create({
      model: config.groq.model, messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.2, max_tokens: 500
    });

    const choice = response.choices[0];
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      const funcName = toolCall.function.name;
      let args = {};
      try { args = JSON.parse(toolCall.function.arguments); } catch(e) { args = extractedData; }

      // Resolve dates
      if (args.date)       args.date       = resolveDate(args.date);
      if (args.start_date) args.start_date = resolveDate(args.start_date);

      // Defaults for events
      if (!args.duration_minutes) args.duration_minutes = 60;
      if (!args.event_type)       args.event_type       = inferEventType(message);
      if (!args.time)             args.time             = '09:00';

      // Defaults for plans
      if (funcName === 'createTrainingPlan') {
        if (!args.goal  || !args.goal.trim())  args.goal  = extractGoal(message)  || 'entrenamiento general';
        if (!args.level || !args.level.trim()) args.level = extractLevel(message) || 'intermedio';
        if (!args.plan_type)                   args.plan_type = 'entrenamiento';
        if (!args.sessions_per_week)           args.sessions_per_week = extractSessions(message) || 3;
      }

      return { functionName: funcName, arguments: args };
    }

    return buildFallbackCall(intent, message, extractedData);

  } catch (err) {
    console.error('[FunctionCalling] Groq error:', err.message);
    return buildFallbackCall(intent, message, extractedData);
  }
}

// ─── Fallback call builder ────────────────────────────────────
function buildFallbackCall(intent, message, extractedData) {
  const base = { ...extractedData };
  if (base.date) base.date = resolveDate(base.date);

  switch (intent) {
    case 'crear_evento':
      return { functionName: 'createEvent', arguments: {
        title:            base.title || extractTitle(message),
        date:             base.date  || resolveDate(message) || new Date().toISOString().split('T')[0],
        time:             base.time  || '09:00',
        duration_minutes: base.duration_minutes || 60,
        event_type:       base.event_type || inferEventType(message)
      }};
    case 'crear_plan': {
      const wM = message.match(/(\d+)\s*semanas?/i);
      const sM = message.match(/(\d+)\s*(veces?|días?|sesiones?)\s*(a la |por )?semana/i);
      return { functionName: 'createTrainingPlan', arguments: {
        weeks:             base.weeks             || (wM ? parseInt(wM[1]) : 4),
        goal:              base.goal              || extractGoal(message)  || 'entrenamiento general',
        level:             base.level             || extractLevel(message) || 'intermedio',
        sessions_per_week: base.sessions_per_week || (sM ? parseInt(sM[1]) : 3),
        plan_type:         base.plan_type         || 'entrenamiento'
      }};
    }
    case 'consultar':
      return { functionName: 'getEvents', arguments: {
        date_from: new Date().toISOString().split('T')[0],
        date_to:   new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
      }};
    default:
      return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────
function extractTitle(message) {
  const cleaned = message.replace(/^(crea|añade|agrega|programa|pon|apunta)\s+(un\s+|una\s+)?/i, '');
  return cleaned.split(' ').slice(0, 5).join(' ') || 'Nuevo evento';
}
function extractGoal(message) {
  const l = message.toLowerCase();
  if (/perder peso|adelgazar/.test(l))       return 'perder peso';
  if (/ganar músculo|ganar musculo/.test(l)) return 'ganar músculo';
  if (/resistencia|cardio|correr/.test(l))   return 'mejorar resistencia';
  if (/fuerza|potencia/.test(l))             return 'ganar fuerza';
  if (/fútbol|futbol|padel|tenis/.test(l))   return 'rendimiento deportivo';
  if (/lesion|lesionarme/.test(l))           return 'prevención de lesiones';
  return null;
}
function extractLevel(message) {
  const l = message.toLowerCase();
  if (/principiante|básico|novato/.test(l)) return 'principiante';
  if (/avanzado|experto/.test(l))           return 'avanzado';
  return null;
}
function extractSessions(message) {
  const m = message.match(/(\d+)\s*(veces?|días?|sesiones?)\s*(a la |por )?semana/i);
  return m ? parseInt(m[1]) : null;
}
function inferEventType(message) {
  const l = message.toLowerCase();
  if (/médico|medico|dentista|hospital|consulta/.test(l)) return 'medico';
  if (/reunión|reunion|meeting|trabajo|oficina/.test(l))  return 'reunion';
  if (/entrena|gym|deporte|fútbol|running/.test(l))       return 'deporte';
  if (/personal|cumpleaños|familia|amigos/.test(l))       return 'personal';
  return 'general';
}

module.exports = { processFunctionCall, TOOLS };
