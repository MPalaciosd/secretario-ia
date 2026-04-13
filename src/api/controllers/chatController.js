// src/api/controllers/chatController.js
'use strict';

const { classifyIntent, INTENTS } = require('../../ai/intentClassifier');
const { processFunctionCall } = require('../../ai/functionCalling');
const {
  buildUserContext,
  saveMessage,
  extractAndUpdateMemory,
  getMemoryProfile: memoryGetProfile,
  getLongTermMemory,
} = require('../../ai/memoryService');
const { createEvent, getEvents, updateEvent, deleteEvent, formatEventsResponse } = require('../../services/eventService');
const { createPlan, getPlanDetails, formatPlanResponse } = require('../../services/planService');
const { schedulePlan, formatScheduleSummary } = require('../../services/schedulerService');
const { sendEventCreatedEmail, sendPlanCreatedEmail } = require('../../services/emailService');
const { query } = require('../../db/database');
const Groq = require('groq-sdk');
const config = require('../../config');

const groq = new Groq({ apiKey: config.groq.apiKey });
const MAX_MESSAGE_LENGTH = 2000;

const FIELD_QUESTIONS = {
  title            : 'Como se llama el evento?',
  date             : 'Para que dia es? (ej: "el proximo lunes", "el 15 de mayo")',
  time             : 'A que hora? (ej: "a las 10:00", "por la tarde")',
  duration_minutes : 'Cuanto tiempo durara el evento?',
  weeks            : 'Cuantas semanas quieres que dure el plan?',
  goal             : 'Cual es tu objetivo? (ej: perder peso, ganar musculo)',
  level            : 'Cual es tu nivel? (principiante, intermedio, avanzado)',
  sessions_per_week: 'Cuantas sesiones por semana puedes hacer?',
  plan_type        : 'Que tipo de plan quieres? (entrenamiento, dieta, estudio)',
  event_id         : 'Sobre que evento? Dime el nombre o fecha.',
};

function buildMissingDataQuestion(missingFields) {
  if (!missingFields || missingFields.length === 0) return null;
  const questions = missingFields
    .map(function(f) { return FIELD_QUESTIONS[f] || ('Puedes darme mas informacion sobre "' + f + '"?'); })
    .filter(Boolean);
  if (questions.length === 1) return questions[0];
  return 'Necesito algunos datos mas:\n' + questions.map(function(q, i) { return (i + 1) + '. ' + q; }).join('\n');
}

async function executeFunctionCall(functionName, args, userId, userEmail, userName) {
  switch (functionName) {
    case 'createEvent': {
      const event = await createEvent(userId, args);
      sendEventCreatedEmail(userEmail, userName, event).catch(console.error);
      const dateStr = new Date(event.start_time).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      const timeStr = new Date(event.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      return { success: true, data: event, message: 'Evento "' + event.title + '" anadido el ' + dateStr + ' a las ' + timeStr + '.' };
    }
    case 'createTrainingPlan': {
      const plan = await createPlan(userId, args);
      sendPlanCreatedEmail(userEmail, userName, plan, 0).catch(console.error);
      return { success: true, data: plan, message: formatPlanResponse(plan), requiresSchedule: true, planId: plan.id };
    }
    case 'schedulePlan': {
      const planArgs = args;
      const sessions = await schedulePlan(userId, planArgs.plan_id, {
        startDate    : planArgs.start_date || new Date().toISOString().split('T')[0],
        preferredDays: planArgs.preferred_days || ['lunes', 'miercoles', 'viernes'],
        preferredTime: planArgs.preferred_time || '07:00',
      });
      const summ = await formatScheduleSummary(sessions);
      const planRes = await query('SELECT * FROM plans WHERE id = $1 AND user_id = $2', [planArgs.plan_id, userId]);
      if (planRes.rows.length) sendPlanCreatedEmail(userEmail, userName, planRes.rows[0], sessions.length).catch(console.error);
      return { success: true, data: { sessions: sessions, count: sessions.length }, message: summ };
    }
    case 'getEvents': {
      const from = args.date_from || new Date().toISOString().split('T')[0];
      const to   = args.date_to   || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const events = await getEvents(userId, { dateFrom: from, dateTo: to, eventType: args.event_type });
      const msg = await formatEventsResponse(events);
      return { success: true, data: events, message: msg };
    }
    case 'updateEvent': {
      const eventId = args.event_id;
      const updateData = Object.assign({}, args);
      delete updateData.event_id;
      const event = await updateEvent(userId, eventId, updateData);
      return { success: true, data: event, message: 'Evento "' + event.title + '" actualizado.' };
    }
    case 'deleteEvent': {
      const result = await deleteEvent(userId, args.event_id);
      return { success: true, data: result, message: 'Evento "' + result.title + '" eliminado.' };
    }
    default:
      throw new Error('Funcion desconocida: ' + functionName);
  }
}

// Build system prompt enriched with memory context
function buildSystemPrompt(userContext) {
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  let prompt = 'Eres Secretario IA, asistente personal de agenda. Hoy es ' + today + '.';
  prompt += ' Hablas espanol de forma natural y concisa. Maximo 2-3 frases.';

  // Inject relevant memories
  if (userContext.contextSummary && userContext.contextSummary.trim() !== '') {
    prompt += '\n\n--- Memoria del usuario ---\n' + userContext.contextSummary;
  }

  // Add habits notice
  if (userContext.confirmedHabits && userContext.confirmedHabits.length > 0) {
    prompt += '\n\nUsa esta informacion sobre sus habitos para dar respuestas mas personalizadas y anticipar sus necesidades.';
  }

  // Conversation topic context
  if (userContext.conversationTopic) {
    prompt += '\n\nEl tema principal de la conversacion actual es: ' + userContext.conversationTopic + '.';
    prompt += ' Mantener coherencia con lo discutido.';
  }

  return prompt;
}

async function generateConversationalResponse(userMessage, userContext, functionResult) {
  if (functionResult && functionResult.message && !functionResult.requiresSchedule) {
    return functionResult.message;
  }
  if (!config.groq.apiKey) {
    return (functionResult && functionResult.message) || 'Hola, estoy aqui para ayudarte con tu agenda.';
  }
  try {
    const systemPrompt = buildSystemPrompt(userContext);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...userContext.shortTermMemory.slice(-6).map(function(m) {
        return { role: m.role, content: m.content.substring(0, 400) };
      }),
      { role: 'user', content: userMessage },
    ];
    if (functionResult && functionResult.data) {
      const dataStr = '[Accion completada: ' + JSON.stringify(functionResult.data) +
        (functionResult.requiresSchedule ? ' - Plan creado. Pregunta cuando quiere entrenar.' : ']');
      messages.splice(-1, 0, { role: 'assistant', content: dataStr });
    }
    const response = await groq.chat.completions.create({
      model      : config.groq.model,
      messages   : messages,
      temperature: 0.75,
      max_tokens : 300,
    });
    return response.choices[0].message.content;
  } catch (err) {
    console.error('[Chat] generateConversationalResponse error:', err.message);
    return (functionResult && functionResult.message) || 'Hola, en que puedo ayudarte?';
  }
}

// ─── MAIN CHAT HANDLER ────────────────────────────────────────────────────────
async function processChat(req, res, next) {
  const message = req.body.message;
  const userId  = req.user && req.user.id;

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'El mensaje no puede estar vacio' });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: 'El mensaje no puede superar ' + MAX_MESSAGE_LENGTH + ' caracteres' });
  }
  if (!userId) return res.status(401).json({ error: 'Usuario no autenticado' });

  if (process.env.NODE_ENV !== 'production') {
    console.log('[Chat] User: ' + userId + ' | Msg: ' + message.substring(0, 80));
  } else {
    console.log('[Chat] User: ' + userId + ' | Len: ' + message.length);
  }

  try {
    // ── Step 1: Build context WITH current message for semantic retrieval ───
    const userContext = await buildUserContext(userId, message);

    // ── Step 2: Classify intent ─────────────────────────────────────────────
    const intentResult = await classifyIntent(message, userContext.shortTermMemory);

    // ── Step 3: Handle confirm/cancel ───────────────────────────────────────
    if (intentResult.intent === INTENTS.CONFIRMAR || intentResult.intent === INTENTS.CANCELAR) {
      return handleConfirmOrCancel(intentResult, message, userId, userContext, res);
    }

    // ── Step 4: Handle saludo / otro ────────────────────────────────────────
    if (intentResult.intent === INTENTS.SALUDO || intentResult.intent === INTENTS.OTRO) {
      const resp = await generateConversationalResponse(message, userContext, null);
      await saveMessage(userId, 'user', message, { intent: intentResult.intent });
      await saveMessage(userId, 'assistant', resp);
      // Non-blocking memory extraction
      setImmediate(function() {
        extractAndUpdateMemory(userId, message, intentResult.intent, intentResult.extracted_data).catch(function() {});
      });
      return res.json({ success: true, response: resp, intent: intentResult.intent, confidence: intentResult.confidence, function_called: false, data: null });
    }

    // ── Step 5: Ask for missing data ────────────────────────────────────────
    if (intentResult.requires_data && intentResult.missing_fields && intentResult.missing_fields.length > 0) {
      const question = buildMissingDataQuestion(intentResult.missing_fields);
      await saveMessage(userId, 'user', message, {
        intent: intentResult.intent,
        missing_fields: intentResult.missing_fields,
        extracted_data: intentResult.extracted_data,
      });
      await saveMessage(userId, 'assistant', question, {
        pending_intent: intentResult.intent,
        pending_data  : intentResult.extracted_data,
        missing_fields: intentResult.missing_fields,
      });
      return res.json({
        success          : true,
        response         : question,
        intent           : intentResult.intent,
        confidence       : intentResult.confidence,
        missing_fields   : intentResult.missing_fields,
        requires_more_info: true,
        function_called  : false,
        data             : null,
      });
    }

    // ── Step 6: Execute function ────────────────────────────────────────────
    let assistantResponse = '';
    let functionResult    = null;
    const actionableIntents = [INTENTS.CREAR_EVENTO, INTENTS.CREAR_PLAN, INTENTS.CONSULTAR, INTENTS.MODIFICAR, INTENTS.ELIMINAR];

    if (actionableIntents.includes(intentResult.intent)) {
      try {
        const functionCall = await processFunctionCall(
          intentResult.intent, message, intentResult.extracted_data, userContext.shortTermMemory, userId
        );
        if (functionCall) {
          const userRow = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
          const email = userRow.rows[0] && userRow.rows[0].email;
          const name  = userRow.rows[0] && userRow.rows[0].name;
          functionResult = await executeFunctionCall(functionCall.functionName, functionCall.arguments, userId, email, name);
          assistantResponse = functionResult.message;
          if (functionResult.requiresSchedule) {
            assistantResponse += '\n\nCuando quieres entrenar? Dime los dias y la hora.';
          }
        }
      } catch (err) {
        console.error('[Chat] Function error:', err.message);
        assistantResponse = 'Lo siento, hubo un problema. Puedes reformularlo?';
      }
    }

    if (!assistantResponse) {
      assistantResponse = await generateConversationalResponse(message, userContext, functionResult);
    }

    await saveMessage(userId, 'user', message, { intent: intentResult.intent, extracted_data: intentResult.extracted_data });
    await saveMessage(userId, 'assistant', assistantResponse, { functionCalled: functionResult ? 'yes' : 'none' });

    // Non-blocking: extract and update long-term memory
    setImmediate(function() {
      extractAndUpdateMemory(userId, message, intentResult.intent, intentResult.extracted_data).catch(function() {});
    });

    return res.json({
      success       : true,
      response      : assistantResponse,
      intent        : intentResult.intent,
      confidence    : intentResult.confidence,
      function_called: !!functionResult,
      data          : (functionResult && functionResult.data) || null,
    });

  } catch (err) {
    next(err);
  }
}

// ─── Handle confirmar / cancelar ─────────────────────────────────────────────
async function handleConfirmOrCancel(intentResult, message, userId, userContext, res) {
  const history = userContext.shortTermMemory;
  let pendingIntent = null;
  let pendingData   = null;

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'assistant' && msg.metadata) {
      const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
      if (meta.pending_intent) { pendingIntent = meta.pending_intent; pendingData = meta.pending_data || {}; break; }
    }
  }

  if (intentResult.intent === INTENTS.CANCELAR) {
    const resp = 'De acuerdo, cancelado. En que mas puedo ayudarte?';
    await saveMessage(userId, 'user', message, { intent: 'cancelar' });
    await saveMessage(userId, 'assistant', resp);
    return res.json({ success: true, response: resp, intent: 'cancelar', function_called: false, data: null });
  }

  if (pendingIntent && intentResult.intent === INTENTS.CONFIRMAR) {
    try {
      const functionCall = await processFunctionCall(pendingIntent, message, pendingData, history, userId);
      if (functionCall) {
        const userRow = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
        const email = userRow.rows[0] && userRow.rows[0].email;
        const name  = userRow.rows[0] && userRow.rows[0].name;
        const fr = await executeFunctionCall(functionCall.functionName, functionCall.arguments, userId, email, name);
        let resp = fr.message;
        if (fr.requiresSchedule) resp += '\n\nCuando quieres entrenar? Dime los dias y la hora.';
        await saveMessage(userId, 'user', message, { intent: 'confirmar' });
        await saveMessage(userId, 'assistant', resp);
        return res.json({ success: true, response: resp, intent: 'confirmar', function_called: true, data: fr.data || null });
      }
    } catch (err) {
      console.error('[Chat] Confirm error:', err.message);
    }
  }

  const resp2 = 'Confirmas que exactamente? Dime lo que quieres hacer.';
  await saveMessage(userId, 'user', message, { intent: intentResult.intent });
  await saveMessage(userId, 'assistant', resp2);
  return res.json({ success: true, response: resp2, intent: intentResult.intent, function_called: false, data: null });
}

// ─── GET /api/chat/history ────────────────────────────────────────────────────
async function getChatHistory(req, res, next) {
  try {
    const result = await query(
      'SELECT role, content, metadata, created_at FROM conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ success: true, messages: result.rows.reverse() });
  } catch (err) { next(err); }
}

// ─── DELETE /api/chat/history ─────────────────────────────────────────────────
async function deleteChatHistory(req, res, next) {
  try {
    await query('DELETE FROM conversations WHERE user_id = $1', [req.user.id]);
    res.json({ success: true, message: 'Historial eliminado' });
  } catch (err) { next(err); }
}

// ─── GET /api/chat/memory ─────────────────────────────────────────────────────
async function getMemoryProfile(req, res, next) {
  try {
    const profile = await memoryGetProfile(req.user.id);
    res.json({ success: true, memory: profile });
  } catch (err) { next(err); }
}

// ─── DELETE /api/chat/memory ──────────────────────────────────────────────────
async function deleteMemory(req, res, next) {
  try {
    await query('DELETE FROM user_memory WHERE user_id = $1', [req.user.id]);
    res.json({ success: true, message: 'Memoria larga eliminada' });
  } catch (err) { next(err); }
}

module.exports = { processChat, getChatHistory, deleteChatHistory, getMemoryProfile, deleteMemory };
