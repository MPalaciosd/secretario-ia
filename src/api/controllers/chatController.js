// src/api/controllers/chatController.js
'use strict';

const { classifyIntent, INTENTS } = require('../../ai/intentClassifier');
const { processFunctionCall } = require('../../ai/functionCalling');
const {
  buildUserContext,
  saveMessage,
  extractAndUpdateMemory,
  getMemoryProfile: memoryGetProfile,
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

// ─── UX: Field questions with examples ──────────────────────────────────────
const FIELD_QUESTIONS = {
  title            : { q: 'Como se llama el evento?', hint: 'Ej: "Dentista", "Reunion de equipo", "Gym"' },
  date             : { q: 'Para que dia es?', hint: 'Ej: "el proximo lunes", "manana", "el 15 de mayo"' },
  time             : { q: 'A que hora?', hint: 'Ej: "a las 10:00", "a las 3 de la tarde"' },
  duration_minutes : { q: 'Cuanto tiempo durara?', hint: 'Ej: "30 minutos", "1 hora", "hora y media"' },
  weeks            : { q: 'Cuantas semanas quieres que dure el plan?', hint: 'Ej: "4 semanas", "8 semanas", "3 meses"' },
  goal             : { q: 'Cual es tu objetivo?', hint: 'Ej: "perder peso", "ganar musculo", "mejorar resistencia"' },
  level            : { q: 'Cual es tu nivel actual?', hint: 'Principiante, intermedio o avanzado' },
  sessions_per_week: { q: 'Cuantos dias a la semana puedes entrenar?', hint: 'Ej: "3 dias", "lunes, miercoles y viernes"' },
  plan_type        : { q: 'Que tipo de plan necesitas?', hint: 'Entrenamiento, dieta o estudio' },
  event_id         : { q: 'A que evento te refieres?', hint: 'Dime el nombre o la fecha del evento' },
};

// ─── UX: Contextual follow-up suggestions per intent ────────────────────────
const FOLLOW_UP_SUGGESTIONS = {
  crear_evento : ['Ver mis eventos esta semana', 'Crear otro evento', 'Que tengo manana?'],
  crear_plan   : ['Cuando empezamos?', 'Ver mi agenda de la semana', 'Como funciona el plan?'],
  consultar    : ['Crear un nuevo evento', 'Ver el proximo mes', 'Que tengo manana?'],
  modificar    : ['Ver mis eventos', 'Crear un evento nuevo', 'Que tengo esta semana?'],
  eliminar     : ['Ver mis eventos restantes', 'Crear un evento nuevo', 'Que tengo esta semana?'],
  saludo       : ['Que tengo esta semana?', 'Crear un evento', 'Hacer un plan de entrenamiento'],
  otro         : ['Que tengo esta semana?', 'Crear un evento', 'Hacer un plan de entrenamiento'],
};

function buildMissingDataQuestion(missingFields) {
  if (!missingFields || missingFields.length === 0) return null;
  if (missingFields.length === 1) {
    const f = missingFields[0];
    const entry = FIELD_QUESTIONS[f];
    if (!entry) return 'Puedes darme mas informacion?';
    return entry.q + ' (' + entry.hint + ')';
  }
  // Multiple fields: ask only the FIRST one (one question at a time = better UX)
  const first = missingFields[0];
  const entry = FIELD_QUESTIONS[first] || { q: 'Puedes darme mas informacion sobre "' + first + '"?', hint: '' };
  const remaining = missingFields.length - 1;
  const suffix = remaining > 0 ? ' (Despues te preguntare ' + remaining + ' dato' + (remaining > 1 ? 's' : '') + ' mas)' : '';
  return entry.q + ' (' + entry.hint + ')' + suffix;
}

async function executeFunctionCall(functionName, args, userId, userEmail, userName) {
  switch (functionName) {
    case 'createEvent': {
      const event = await createEvent(userId, args);
      sendEventCreatedEmail(userEmail, userName, event).catch(console.error);
      const dateStr = new Date(event.start_time).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      const timeStr = new Date(event.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      return {
        success     : true,
        data        : event,
        action_type : 'event_created',
        message     : 'Listo! "' + event.title + '" anadido para el ' + dateStr + ' a las ' + timeStr + '.',
        summary     : {
          title   : event.title,
          date    : dateStr,
          time    : timeStr,
          duration: event.duration_minutes + ' min',
          type    : event.event_type,
        },
      };
    }
    case 'createTrainingPlan': {
      const plan = await createPlan(userId, args);
      sendPlanCreatedEmail(userEmail, userName, plan, 0).catch(console.error);
      return {
        success        : true,
        data           : plan,
        action_type    : 'plan_created',
        message        : formatPlanResponse(plan),
        requiresSchedule: true,
        planId         : plan.id,
        summary        : {
          title   : plan.title,
          weeks   : plan.weeks,
          sessions: plan.sessions_per_week,
          goal    : plan.goal,
        },
      };
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
      return {
        success    : true,
        data       : { sessions: sessions, count: sessions.length },
        action_type: 'plan_scheduled',
        message    : summ,
        summary    : { sessions_count: sessions.length },
      };
    }
    case 'getEvents': {
      const from   = args.date_from || new Date().toISOString().split('T')[0];
      const to     = args.date_to   || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const events = await getEvents(userId, { dateFrom: from, dateTo: to, eventType: args.event_type });
      const msg    = await formatEventsResponse(events);
      return {
        success    : true,
        data       : events,
        action_type: 'events_listed',
        message    : msg,
        summary    : { count: events.length },
      };
    }
    case 'updateEvent': {
      const eventId    = args.event_id;
      const updateData = Object.assign({}, args);
      delete updateData.event_id;
      const event = await updateEvent(userId, eventId, updateData);
      return {
        success    : true,
        data       : event,
        action_type: 'event_updated',
        message    : 'Hecho! "' + event.title + '" actualizado correctamente.',
        summary    : { title: event.title },
      };
    }
    case 'deleteEvent': {
      const result = await deleteEvent(userId, args.event_id);
      return {
        success    : true,
        data       : result,
        action_type: 'event_deleted',
        message    : 'Eliminado. "' + result.title + '" ya no esta en tu agenda.',
        summary    : { title: result.title },
      };
    }
    default:
      throw new Error('Funcion desconocida: ' + functionName);
  }
}

function buildSystemPrompt(userContext) {
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  let prompt = 'Eres Secretario IA, asistente personal de agenda. Hoy es ' + today + '.';
  prompt += ' Hablas espanol claro, directo y natural. Maximo 2 frases.';
  prompt += ' Nunca digas "como puedo ayudarte" ni repitas el mensaje del usuario.';
  prompt += ' Si hay una accion completada, confirma brevemente y ofrece algo util.';
  if (userContext.contextSummary && userContext.contextSummary.trim() !== '') {
    prompt += '\n\n--- Lo que recuerdo del usuario ---\n' + userContext.contextSummary;
  }
  if (userContext.confirmedHabits && userContext.confirmedHabits.length > 0) {
    prompt += '\n\nUsa sus habitos para personalizar tus respuestas.';
  }
  if (userContext.conversationTopic) {
    prompt += '\n\nTema activo: ' + userContext.conversationTopic + '. Mantener coherencia.';
  }
  return prompt;
}

async function generateConversationalResponse(userMessage, userContext, functionResult) {
  if (functionResult && functionResult.message && !functionResult.requiresSchedule) {
    return functionResult.message;
  }
  if (!config.groq.apiKey) {
    return (functionResult && functionResult.message) || 'Hola! En que puedo ayudarte?';
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
      temperature: 0.7,
      max_tokens : 200,
    });
    return response.choices[0].message.content;
  } catch (err) {
    console.error('[Chat] generateConversationalResponse error:', err.message);
    return (functionResult && functionResult.message) || 'Hola, en que puedo ayudarte?';
  }
}

// ─── MAIN CHAT HANDLER ───────────────────────────────────────────────────────
async function processChat(req, res, next) {
  const message = req.body.message;
  const userId  = req.user && req.user.id;

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'El mensaje no puede estar vacio' });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: 'El mensaje es demasiado largo (max ' + MAX_MESSAGE_LENGTH + ' caracteres)' });
  }
  if (!userId) return res.status(401).json({ error: 'Sesion expirada. Vuelve a iniciar sesion.' });

  if (process.env.NODE_ENV !== 'production') {
    console.log('[Chat] User: ' + userId + ' | Msg: ' + message.substring(0, 80));
  } else {
    console.log('[Chat] User: ' + userId + ' | Len: ' + message.length);
  }

  try {
    const userContext  = await buildUserContext(userId, message);
    const intentResult = await classifyIntent(message, userContext.shortTermMemory);

    if (intentResult.intent === INTENTS.CONFIRMAR || intentResult.intent === INTENTS.CANCELAR) {
      return handleConfirmOrCancel(intentResult, message, userId, userContext, res);
    }

    if (intentResult.intent === INTENTS.SALUDO || intentResult.intent === INTENTS.OTRO) {
      const resp = await generateConversationalResponse(message, userContext, null);
      await saveMessage(userId, 'user', message, { intent: intentResult.intent });
      await saveMessage(userId, 'assistant', resp);
      setImmediate(function() {
        extractAndUpdateMemory(userId, message, intentResult.intent, intentResult.extracted_data).catch(function() {});
      });
      return res.json({
        success       : true,
        response      : resp,
        intent        : intentResult.intent,
        confidence    : intentResult.confidence,
        function_called: false,
        data          : null,
        suggestions   : FOLLOW_UP_SUGGESTIONS[intentResult.intent] || [],
      });
    }

    // Ask for missing data — ONE field at a time
    if (intentResult.requires_data && intentResult.missing_fields && intentResult.missing_fields.length > 0) {
      const question = buildMissingDataQuestion(intentResult.missing_fields);
      await saveMessage(userId, 'user', message, {
        intent        : intentResult.intent,
        missing_fields: intentResult.missing_fields,
        extracted_data: intentResult.extracted_data,
      });
      await saveMessage(userId, 'assistant', question, {
        pending_intent: intentResult.intent,
        pending_data  : intentResult.extracted_data,
        missing_fields: intentResult.missing_fields,
      });
      return res.json({
        success           : true,
        response          : question,
        intent            : intentResult.intent,
        confidence        : intentResult.confidence,
        missing_fields    : intentResult.missing_fields,
        requires_more_info: true,
        function_called   : false,
        data              : null,
        suggestions       : [],
      });
    }

    // Execute
    let assistantResponse = '';
    let functionResult    = null;
    let actionType        = null;
    let responseSummary   = null;
    const actionableIntents = [INTENTS.CREAR_EVENTO, INTENTS.CREAR_PLAN, INTENTS.CONSULTAR, INTENTS.MODIFICAR, INTENTS.ELIMINAR];

    if (actionableIntents.includes(intentResult.intent)) {
      try {
        const functionCall = await processFunctionCall(
          intentResult.intent, message, intentResult.extracted_data, userContext.shortTermMemory, userId
        );
        if (functionCall) {
          const userRow = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
          const email   = userRow.rows[0] && userRow.rows[0].email;
          const name    = userRow.rows[0] && userRow.rows[0].name;
          functionResult    = await executeFunctionCall(functionCall.functionName, functionCall.arguments, userId, email, name);
          assistantResponse = functionResult.message;
          actionType        = functionResult.action_type || null;
          responseSummary   = functionResult.summary    || null;
          if (functionResult.requiresSchedule) {
            assistantResponse += '\n\nCuando quieres empezar? Dime los dias y la hora preferida.';
          }
        }
      } catch (err) {
        console.error('[Chat] Function error:', err.message);
        // UX: specific error messages per failure type
        if (err.message && err.message.includes('conflict')) {
          assistantResponse = 'Ese horario ya esta ocupado. Quieres que te sugiera un hueco libre?';
        } else if (err.message && err.message.includes('not found')) {
          assistantResponse = 'No encontre ese evento. Puedes decirme el nombre o la fecha exacta?';
        } else {
          assistantResponse = 'Algo salio mal. Puedes intentarlo de otra forma?';
        }
        actionType = 'error';
      }
    }

    if (!assistantResponse) {
      assistantResponse = await generateConversationalResponse(message, userContext, functionResult);
    }

    await saveMessage(userId, 'user', message, { intent: intentResult.intent, extracted_data: intentResult.extracted_data });
    await saveMessage(userId, 'assistant', assistantResponse, { functionCalled: functionResult ? 'yes' : 'none', action_type: actionType });

    setImmediate(function() {
      extractAndUpdateMemory(userId, message, intentResult.intent, intentResult.extracted_data).catch(function() {});
    });

    return res.json({
      success       : true,
      response      : assistantResponse,
      intent        : intentResult.intent,
      confidence    : intentResult.confidence,
      function_called: !!functionResult,
      action_type   : actionType,
      summary       : responseSummary,
      data          : (functionResult && functionResult.data) || null,
      suggestions   : actionType !== 'error' ? (FOLLOW_UP_SUGGESTIONS[intentResult.intent] || []) : [],
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
    return res.json({
      success: true, response: resp, intent: 'cancelar',
      function_called: false, data: null,
      suggestions: FOLLOW_UP_SUGGESTIONS.saludo,
    });
  }

  if (pendingIntent && intentResult.intent === INTENTS.CONFIRMAR) {
    try {
      const functionCall = await processFunctionCall(pendingIntent, message, pendingData, history, userId);
      if (functionCall) {
        const userRow = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
        const email   = userRow.rows[0] && userRow.rows[0].email;
        const name    = userRow.rows[0] && userRow.rows[0].name;
        const fr      = await executeFunctionCall(functionCall.functionName, functionCall.arguments, userId, email, name);
        let resp      = fr.message;
        if (fr.requiresSchedule) resp += '\n\nCuando quieres empezar? Dime los dias y la hora preferida.';
        await saveMessage(userId, 'user', message, { intent: 'confirmar' });
        await saveMessage(userId, 'assistant', resp, { action_type: fr.action_type });
        return res.json({
          success       : true, response: resp, intent: 'confirmar',
          function_called: true, data: fr.data || null,
          action_type   : fr.action_type,
          summary       : fr.summary || null,
          suggestions   : FOLLOW_UP_SUGGESTIONS[pendingIntent] || [],
        });
      }
    } catch (err) {
      console.error('[Chat] Confirm error:', err.message);
    }
  }

  const resp2 = 'Confirmas que exactamente? Cuentame lo que quieres hacer.';
  await saveMessage(userId, 'user', message, { intent: intentResult.intent });
  await saveMessage(userId, 'assistant', resp2);
  return res.json({ success: true, response: resp2, intent: intentResult.intent, function_called: false, data: null, suggestions: [] });
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
    res.json({ success: true, message: 'Memoria eliminada' });
  } catch (err) { next(err); }
}

module.exports = { processChat, getChatHistory, deleteChatHistory, getMemoryProfile, deleteMemory };
