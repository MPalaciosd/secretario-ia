const OpenAI = require('openai');
const config = require('../config');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

// ─── TOOL DEFINITIONS FOR OPENAI FUNCTION CALLING ───────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'createEvent',
      description: 'Crea un único evento o cita en el calendario del usuario',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título del evento' },
          date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
          time: { type: 'string', description: 'Hora en formato HH:MM (24h)' },
          duration_minutes: { type: 'number', description: 'Duración en minutos' },
          description: { type: 'string', description: 'Descripción opcional del evento' },
          event_type: { 
            type: 'string', 
            enum: ['general', 'medico', 'trabajo', 'personal', 'deporte', 'reunion'],
            description: 'Tipo de evento' 
          }
        },
        required: ['title', 'date', 'time']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createTrainingPlan',
      description: 'Crea un plan de entrenamiento estructurado de múltiples semanas. NUNCA usar para eventos individuales.',
      parameters: {
        type: 'object',
        properties: {
          weeks: { type: 'number', description: 'Número de semanas del plan' },
          goal: { type: 'string', description: 'Objetivo principal (ej: perder peso, ganar músculo, resistencia)' },
          level: { 
            type: 'string', 
            enum: ['principiante', 'intermedio', 'avanzado'],
            description: 'Nivel de condición física del usuario'
          },
          sessions_per_week: { type: 'number', description: 'Sesiones de entrenamiento por semana' },
          session_duration_minutes: { type: 'number', description: 'Duración de cada sesión en minutos' },
          focus_areas: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Áreas de enfoque (ej: cardio, fuerza, flexibilidad)'
          }
        },
        required: ['weeks', 'goal', 'level']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'schedulePlan',
      description: 'Distribuye las sesiones de un plan en el calendario evitando solapamientos',
      parameters: {
        type: 'object',
        properties: {
          plan_id: { type: 'string', description: 'ID del plan a programar' },
          start_date: { type: 'string', description: 'Fecha de inicio en formato YYYY-MM-DD' },
          preferred_days: { 
            type: 'array',
            items: { type: 'string', enum: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] },
            description: 'Días preferidos para entrenar'
          },
          preferred_time: { type: 'string', description: 'Hora preferida en formato HH:MM' }
        },
        required: ['plan_id', 'start_date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getEvents',
      description: 'Consulta eventos del calendario del usuario',
      parameters: {
        type: 'object',
        properties: {
          date_from: { type: 'string', description: 'Fecha inicio en formato YYYY-MM-DD' },
          date_to: { type: 'string', description: 'Fecha fin en formato YYYY-MM-DD' },
          event_type: { type: 'string', description: 'Filtrar por tipo de evento' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateEvent',
      description: 'Modifica un evento existente',
      parameters: {
        type: 'object',
        properties: {
          event_id: { type: 'string', description: 'ID del evento a modificar' },
          title: { type: 'string', description: 'Nuevo título' },
          date: { type: 'string', description: 'Nueva fecha en formato YYYY-MM-DD' },
          time: { type: 'string', description: 'Nueva hora en formato HH:MM' },
          duration_minutes: { type: 'number', description: 'Nueva duración en minutos' }
        },
        required: ['event_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deleteEvent',
      description: 'Elimina un evento del calendario',
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

/**
 * Main function calling processor
 * Given an intent and user message, determines which function to call
 */
async function processFunctionCall(intent, userMessage, extractedData, conversationHistory, userId) {
  const systemPrompt = `Eres el asistente de agenda inteligente. El clasificador de intenciones ya detectó que el usuario quiere: ${intent}.
  
  Los datos ya extraídos son: ${JSON.stringify(extractedData)}
  
  Tu único trabajo es llamar la función correcta con los parámetros correctos.
  NO respondas en texto libre — SIEMPRE usa una función.
  
  REGLAS:
  - Si la intención es "crear_plan" → usa createTrainingPlan, NUNCA createEvent
  - Si la intención es "crear_evento" → usa createEvent
  - Si la intención es "consultar" → usa getEvents
  - Si la intención es "modificar" → usa updateEvent
  - Si la intención es "eliminar" → usa deleteEvent
  
  Hoy es: ${new Date().toISOString().split('T')[0]}
  Zona horaria del usuario: UTC`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-3).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages,
      tools: TOOLS,
      tool_choice: 'required',
      temperature: 0.1
    });

    const message = response.choices[0].message;
    
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      return {
        functionName: toolCall.function.name,
        arguments: JSON.parse(toolCall.function.arguments),
        toolCallId: toolCall.id
      };
    }

    return null;
  } catch (err) {
    console.error('[FunctionCalling] Error:', err.message);
    throw err;
  }
}

module.exports = { processFunctionCall, TOOLS };
