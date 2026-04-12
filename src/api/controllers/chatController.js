const { classifyIntent } = require('../../ai/intentClassifier');
const { processFunctionCall } = require('../../ai/functionCalling');
const { buildUserContext, saveMessage, extractAndUpdateMemory } = require('../../ai/memoryService');
const { createEvent, getEvents, updateEvent, deleteEvent, formatEventsResponse } = require('../../services/eventService');
const { createPlan, getPlanDetails, formatPlanResponse } = require('../../services/planService');
const { schedulePlan, formatScheduleSummary } = require('../../services/schedulerService');
const { sendEventCreatedEmail, sendPlanCreatedEmail } = require('../../services/emailService');
const { query } = require('../../db/database');
const Groq = require('groq-sdk');
const config = require('../../config');

const groq = new Groq({ apiKey: config.groq.apiKey });

// ─── Maximum message length to prevent abuse and excessive API costs ──
const MAX_MESSAGE_LENGTH = 2000;

// ─── Questions for missing fields ──────────────────────────────
const MISSING_FIELD_QUESTIONS = {
  title: 'Como se llama el evento?',
  date: 'Para que dia es? (ej: "el proximo lunes", "el 15 de mayo")',
  time: 'A que hora? (ej: "a las 10:00", "por la tarde")',
  duration_minutes: 'Cuanto tiempo durara el evento?',
  weeks: 'Cuantas semanas quieres que dure el plan?',
  goal: 'Cual es tu objetivo? (ej: perder peso, ganar musculo, mejorar resistencia)',
  level: 'Cual es tu nivel? (principiante, intermedio, avanzado)',
  sessions_per_week: 'Cuantas sesiones por semana puedes hacer?',
  plan_type: 'Que tipo de plan quieres? (entrenamiento, dieta, estudio)'
};

function buildMissingDataQuestion(missingFields) {
  if (!missingFields || missingFields.length === 0) return null;
  const questions = missingFields
    .map(f => MISSING_FIELD_QUESTIONS[f] || ('Puedes darme mas informacion sobre "' + f + '"?'))
    .filter(Boolean);
  if (questions.length === 1) return questions[0];
  return 'Necesito algunos datos mas:\n' + questions.map((q, i) => (i + 1) + '. ' + q).join('\n');
}

// ─── Execute function call ──────────────────────────────────────
async function executeFunctionCall(functionName, args, userId, userEmail, userName) {
  switch (functionName) {
    case 'createEvent': {
      const event = await createEvent(userId, args);
      sendEventCreatedEmail(userEmail, userName, event).catch(console.error);
      const dateStr = new Date(event.start_time).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      const timeStr = new Date(event.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      return { success: true, data: event, message: '✅ Evento creado: **' + event.title + '** el ' + dateStr + ' a las ' + timeStr };
    }
    case 'createTrainingPlan': {
      const plan = await createPlan(userId, args);
      sendPlanCreatedEmail(userEmail, userName, plan, 0).catch(console.error);
      return { success: true, data: plan, message: formatPlanResponse(plan), requiresSchedule: true };
    }
    case 'schedulePlan': {
      const { plan_id, start_date, preferred_days, preferred_time } = args;
      const sessions = await schedulePlan(userId, plan_id, {
        startDate: start_date || new Date().toISOString().split('T')[0],
        preferredDays: preferred_days || ['lunes','miercoles','viernes'],
        preferredTime: preferred_time || '07:00'
      });
      const summary = formatScheduleSummary(sessions);
      const planRes = await query('SELECT * FROM plans WHERE id = $1 AND user_id = $2', [plan_id, userId]);
      if (planRes.rows.length) sendPlanCreatedEmail(userEmail, userName, planRes.rows[0], sessions.length).catch(console.error);
      return { success: true, data: { sessions, count: sessions.length }, message: summary };
    }
    case 'getEvents': {
      const { date_from, date_to, event_type } = args;
      const from = date_from || new Date().toISOString().split('T')[0];
      const to = date_to || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const events = await getEvents(userId, { dateFrom: from, dateTo: to, eventType: event_type });
      return { success: true, data: events, message: formatEventsResponse(events) };
    }
    case 'updateEvent': {
      const { event_id, ...updateData } = args;
      const event = await updateEvent(userId, event_id, updateData);
      return { success: true, data: event, message: '✅ Evento actualizado: **' + event.title + '**' };
    }
    case 'deleteEvent': {
      const result = await deleteEvent(userId, args.event_id);
      return { success: true, data: result, message: '✅ Evento eliminado: **' + result.title + '**' };
    }
    default:
      throw new Error('Funcion desconocida: ' + functionName);
  }
}

// ─── Generate conversational response ─────────────────────────
async function generateConversationalResponse(userMessage, context, functionResult = null) {
  if (!config.groq.apiKey) {
    if (functionResult?.message) return functionResult.message;
    return 'Hola, estoy aqui para ayudarte con tu agenda. Que necesitas?';
  }
  try {
    const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const systemPrompt = 'Eres Secretario IA, un asistente personal de agenda amigable y eficiente. Hablas en espanol de manera natural y cercana. Hoy es: ' + today + '. ' +
      (context.contextSummary ? 'Contexto del usuario:\n' + context.contextSummary : '') +
      (functionResult ? ' Accion completada: ' + JSON.stringify(functionResult.data) : '') +
      ' Responde de forma concisa. Usa emojis ocasionalmente. Se util y proactivo.';

    if (functionResult?.message) return functionResult.message;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...context.shortTermMemory.slice(-6).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage }
    ];
    const response = await groq.chat.completions.create({ model: config.groq.model, messages, temperature: 0.8, max_tokens: 400 });
    return response.choices[0].message.content;
  } catch (err) {
    console.error('[Chat] generateConversationalResponse error:', err.message);
    if (functionResult?.message) return functionResult.message;
    return 'Hola, estoy aqui para ayudarte. Que necesitas hoy?';
  }
}

// ─── MAIN CHAT HANDLER ──────────────────────────────────────────
async function processChat(req, res) {
  const { message } = req.body;
  const userId = req.user?.id;

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'El mensaje no puede estar vacio' });
  }

  // Enforce message length limit to prevent API abuse and cost attacks
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: 'El mensaje no puede superar ' + MAX_MESSAGE_LENGTH + ' caracteres' });
  }

  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  try {
    // Log only in development — never log message content in production
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Chat] User: ' + userId + ' | Msg: ' + message.substring(0, 80));
    } else {
      console.log('[Chat] User: ' + userId + ' | Len: ' + message.length);
    }

    const userContext = await buildUserContext(userId);
    const intentResult = await classifyIntent(message, userContext.shortTermMemory);

    if (intentResult.requires_data && intentResult.missing_fields?.length > 0) {
      const question = buildMissingDataQuestion(intentResult.missing_fields);
      await saveMessage(userId, 'user', message, { intent: intentResult.intent });
      await saveMessage(userId, 'assistant', question);
      return res.json({
        success: true, response: question, intent: intentResult.intent,
        missing_fields: intentResult.missing_fields, requires_more_info: true
      });
    }

    let assistantResponse = '';
    let functionResult = null;

    if (['crear_evento','crear_plan','consultar','modificar','eliminar'].includes(intentResult.intent)) {
      try {
        const functionCall = await processFunctionCall(
          intentResult.intent, message, intentResult.extracted_data,
          userContext.shortTermMemory, userId
        );
        if (functionCall) {
          const userRow = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
          const userEmail = userRow.rows[0]?.email;
          const userName = userRow.rows[0]?.name;
          functionResult = await executeFunctionCall(functionCall.functionName, functionCall.arguments, userId, userEmail, userName);
          assistantResponse = functionResult.message;
          if (functionResult.requiresSchedule) {
            assistantResponse += '\n\n💡 Cuando prefieres entrenar? Dime los dias y hora y lo programare en tu calendario.';
          }
        }
      } catch (err) {
        console.error('[Chat] Function error:', err.message);
        assistantResponse = 'Lo siento, hubo un problema al procesar tu peticion. Puedes reformularla?';
      }
    }

    if (!assistantResponse) {
      assistantResponse = await generateConversationalResponse(message, userContext, functionResult);
    }

    await saveMessage(userId, 'user', message, { intent: intentResult.intent });
    await saveMessage(userId, 'assistant', assistantResponse, { functionCalled: functionResult?.functionName });
    await extractAndUpdateMemory(userId, message, intentResult.intent, intentResult.extracted_data);

    return res.json({
      success: true, response: assistantResponse,
      intent: intentResult.intent, confidence: intentResult.confidence,
      function_called: !!functionResult, data: functionResult?.data || null
    });
  } catch (err) {
    console.error('[Chat] Critical error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { processChat };
