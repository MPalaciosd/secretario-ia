const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const availabilityService = require('../services/availabilityService');
const appointmentService = require('../services/appointmentService');
const clientService = require('../services/clientService');
const conversationService = require('../services/conversationService');

const groq = new Groq({ apiKey: config.groq.apiKey });

const CASOS_PATH = path.join(__dirname, '../../config/casos.json');

// ── Carga de casos (con caché de 60s para no leer disco en cada mensaje) ──────
let casosCache = null;
let casosCacheTime = 0;

function loadCasos() {
  const now = Date.now();
  if (casosCache && now - casosCacheTime < 60_000) return casosCache;
  try {
    casosCache = JSON.parse(fs.readFileSync(CASOS_PATH, 'utf8'));
    casosCacheTime = now;
  } catch (err) {
    console.error('[AI] Error leyendo casos.json:', err.message);
    if (!casosCache) casosCache = { bot: {}, instrucciones_globales: [], casos: [] };
  }
  return casosCache;
}

// Invalida el caché al instante (llamado desde la ruta /api/casos al guardar)
function invalidateCasosCache() {
  casosCache = null;
}

// ── System Prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt() {
  const casos = loadCasos();
  const bot = casos.bot || {};

  const servicesList = Object.entries(config.services)
    .map(([key, s]) => `  - ${s.name} (clave: "${key}"): ${s.duration} min, ${s.price}€`)
    .join('\n');

  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const days = config.schedule.workingDays.map(d => dayNames[d]).join(', ');
  const today = new Date();
  const todayStr = today.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const todayISO = today.toISOString().split('T')[0];

  // Instrucciones globales
  const instrucciones = (casos.instrucciones_globales || [])
    .map((inst, i) => `${i + 1}. ${inst}`)
    .join('\n');

  // Casos con instrucciones y ejemplos (few-shot)
  const casosBlocks = (casos.casos || []).map(caso => {
    const ejemplos = (caso.ejemplos || [])
      .map(e => `  Usuario: "${e.usuario}"\n  Tú: "${e.asistente}"`)
      .join('\n');
    return `### ${caso.nombre}\nCuándo aplica: ${caso.descripcion}\nQué hacer: ${caso.instruccion}${ejemplos ? `\nEjemplos:\n${ejemplos}` : ''}`;
  }).join('\n\n');

  return `Eres ${bot.nombre || config.shop.assistantName}, ${bot.rol || `el asistente virtual de ${config.shop.name}`}.
${bot.personalidad || 'Eres cercano, profesional y amable. Hablas siempre en español.'}

SERVICIOS Y HORARIO:
- Horario: ${config.schedule.startHour} a ${config.schedule.endHour}
- Días: ${days}
- Servicios:
${servicesList}

HOY ES: ${todayStr} (${todayISO})

INSTRUCCIONES GENERALES:
${instrucciones}

CÓMO ACTUAR EN CADA CASO:
${casosBlocks}`;
}

// ── Tools (formato OpenAI/Groq) ───────────────────────────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Verifica los horarios disponibles para una fecha y servicio. Usar SIEMPRE antes de crear cita.',
      parameters: {
        type: 'object',
        properties: {
          date:        { type: 'string', description: 'Fecha YYYY-MM-DD' },
          service_key: { type: 'string', description: `Clave del servicio: ${Object.keys(config.services).join(', ')}` },
        },
        required: ['date', 'service_key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_next_available',
      description: 'Obtiene los próximos días y horas libres para un servicio. Usar cuando el cliente no sabe qué día elegir.',
      parameters: {
        type: 'object',
        properties: {
          service_key: { type: 'string', description: `Clave del servicio: ${Object.keys(config.services).join(', ')}` },
        },
        required: ['service_key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_appointment',
      description: 'Crea una nueva cita. Solo usar después de check_availability.',
      parameters: {
        type: 'object',
        properties: {
          client_name: { type: 'string', description: 'Nombre completo del cliente' },
          phone:       { type: 'string', description: 'Teléfono (si lo dijo)' },
          service_key: { type: 'string', description: 'Clave del servicio' },
          datetime:    { type: 'string', description: 'Fecha y hora YYYY-MM-DD HH:MM' },
        },
        required: ['client_name', 'service_key', 'datetime'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancela una cita por su ID.',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'ID de la cita' },
        },
        required: ['appointment_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reschedule_appointment',
      description: 'Reprograma una cita a nueva fecha/hora.',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'ID de la cita' },
          new_datetime:   { type: 'string', description: 'Nueva fecha/hora YYYY-MM-DD HH:MM' },
        },
        required: ['appointment_id', 'new_datetime'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_client_appointments',
      description: 'Obtiene citas confirmadas de un cliente por nombre o teléfono.',
      parameters: {
        type: 'object',
        properties: {
          name:  { type: 'string', description: 'Nombre del cliente' },
          phone: { type: 'string', description: 'Teléfono del cliente' },
        },
      },
    },
  },
];

// ── Ejecutor de herramientas (async) ──────────────────────────────────────────

async function executeTool(toolName, toolInput, contextClientId) {
  console.log(`[AI] 🔧 Tool: ${toolName}`, JSON.stringify(toolInput));

  try {
    switch (toolName) {

      case 'check_availability': {
        const { date, service_key } = toolInput;
        const service = config.services[service_key];
        if (!service) return { error: `Servicio '${service_key}' no existe.` };

        const slots = await availabilityService.getAvailableSlots(date, service.duration);
        if (slots.length === 0) {
          return { available: false, date, service: service.name, message: 'No hay disponibilidad ese día.' };
        }
        return { available: true, date, service: service.name, duration: service.duration, slots };
      }

      case 'get_next_available': {
        const { service_key, days_ahead = 6 } = toolInput;
        const service = config.services[service_key];
        if (!service) return { error: `Servicio '${service_key}' no existe.` };

        const availability = await availabilityService.getAvailabilityRange(service.duration, days_ahead);
        if (Object.keys(availability).length === 0) {
          return { message: `Sin disponibilidad en los próximos ${days_ahead} días para ${service.name}.` };
        }
        return { service: service.name, availability };
      }

      case 'create_appointment': {
        const { client_name, phone, service_key, datetime } = toolInput;
        const service = config.services[service_key];
        if (!service) return { error: `Servicio '${service_key}' no existe.` };

        const client = await clientService.findOrCreate({ name: client_name, phone: phone || null, channel: 'bot' });
        const result = await appointmentService.createAppointment({ clientId: client._id, serviceKey: service_key, datetime });

        if (!result.success) return { error: result.error };

        return {
          success: true,
          appointment_id: result.appointment._id,
          client: client_name,
          service: service.name,
          datetime: result.appointment.start_time,
          duration: service.duration,
          price: service.price,
        };
      }

      case 'cancel_appointment': {
        const { appointment_id } = toolInput;
        const apt = await appointmentService.getAppointmentById(appointment_id);
        if (!apt) return { error: 'Cita no encontrada.' };

        const result = await appointmentService.cancelAppointment(appointment_id);
        if (!result.success) return { error: result.error };

        return { success: true, cancelled: { id: appointment_id, service: apt.service_name, datetime: apt.start_time } };
      }

      case 'reschedule_appointment': {
        const { appointment_id, new_datetime } = toolInput;
        const result = await appointmentService.rescheduleAppointment(appointment_id, new_datetime);
        if (!result.success) return { error: result.error };
        return { success: true, appointment_id, new_datetime: result.appointment.start_time };
      }

      case 'get_client_appointments': {
        const { name, phone } = toolInput;
        let client = null;

        if (phone)  client = await clientService.findByPhone(phone);
        if (!client && contextClientId) client = await clientService.findById(contextClientId);
        if (!client && name) {
          const all = await clientService.listAll();
          client = all.find(c => c.name.toLowerCase().includes(name.toLowerCase()));
        }
        if (!client) return { error: 'No encontré ningún cliente con esos datos.' };

        const appointments = await appointmentService.getClientAppointments(client._id, 'confirmed');
        if (appointments.length === 0) return { message: `${client.name} no tiene citas pendientes.` };

        return {
          client: client.name,
          appointments: appointments.map(a => ({
            id: a._id, service: a.service_name, datetime: a.start_time, duration: a.duration,
          })),
        };
      }

      default:
        return { error: `Tool '${toolName}' no reconocida.` };
    }
  } catch (err) {
    console.error(`[AI] Error en tool ${toolName}:`, err.message);
    return { error: 'Error interno al procesar.' };
  }
}

// ── Motor principal ───────────────────────────────────────────────────────────

async function processMessage(userMessage, channel, channelId, clientId = null) {
  const conversation = await conversationService.getOrCreateConversation(channel, channelId, clientId);
  await conversationService.saveMessage(conversation._id, 'user', userMessage);

  const history = await conversationService.getHistory(conversation._id);

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...history,
  ];

  let response = '';
  let maxIterations = 8;

  while (maxIterations-- > 0) {
    let completion;
    try {
      completion = await groq.chat.completions.create({
        model: config.groq.model,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 1024,
        temperature: 0.4,
      });
    } catch (apiErr) {
      console.error('[AI] Error API Groq:', apiErr.message);
      // Reintentar sin tools si falla el formato de tool call
      const fallback = await groq.chat.completions.create({
        model: config.groq.model,
        messages,
        max_tokens: 1024,
        temperature: 0.4,
      });
      response = (fallback.choices[0].message.content || '').trim();
      break;
    }

    const choice  = completion.choices[0];
    const message = choice.message;

    if (choice.finish_reason === 'tool_calls' && message.tool_calls?.length > 0) {
      messages.push({
        role: 'assistant',
        content: message.content || '',
        tool_calls: message.tool_calls,
      });

      for (const toolCall of message.tool_calls) {
        let args = {};
        try { args = JSON.parse(toolCall.function.arguments); } catch {}

        const result = await executeTool(toolCall.function.name, args, conversation.client_id);
        console.log(`[AI] 📦 Resultado:`, JSON.stringify(result));

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    } else {
      response = (message.content || '').trim();
      break;
    }
  }

  if (response) await conversationService.saveMessage(conversation._id, 'assistant', response);

  return response || 'Lo siento, no pude procesar tu mensaje. ¿Puedes intentarlo de nuevo?';
}

module.exports = { processMessage, invalidateCasosCache, loadCasos };
