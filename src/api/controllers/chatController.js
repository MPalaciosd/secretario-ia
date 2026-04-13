// src/api/controllers/chatController.js
// Optimized: parallel context+classify, user email from auth middleware, deduped DB queries
'use strict';
const { classifyIntent, INTENTS } = require('../../ai/intentClassifier');
const { processFunctionCall } = require('../../ai/functionCalling');
const { buildUserContext, saveMessage, extractAndUpdateMemory, getMemoryProfile: memoryGetProfile } = require('../../ai/memoryService');
const { createEvent, getEvents, updateEvent, deleteEvent, formatEventsResponse } = require('../../services/eventService');
const { createPlan, getPlanDetails, formatPlanResponse } = require('../../services/planService');
const { schedulePlan, formatScheduleSummary } = require('../../services/schedulerService');
const { sendEventCreatedEmail, sendPlanCreatedEmail } = require('../../services/emailService');
const { query } = require('../../db/database');
const Groq = require('groq-sdk');
const config = require('../../config');
const groq = new Groq({ apiKey: config.groq.apiKey });
const MAX_MESSAGE_LENGTH = 2000;

// ─── Fast intent classification for trivial patterns (no LLM, ~0ms) ──────────
// Returns null if the pattern is ambiguous — falls through to LLM classifier.
const FAST_INTENTS = {
  confirmar: /^(si|sí|ok|vale|va|perfecto|adelante|claro|hazlo|confirma|correcto)$/i,
  cancelar:  /^(no|cancela|olvídalo|olvidalo|mejor no|para|stop)$/i,
  saludo:    /^(hola|buenos dias|buenas|hi|hey|gracias|de nada|genial)$/i,
};
function fastClassify(message) {
  const trimmed = message.trim();
  if (trimmed.length > 40) return null; // Only check short messages
  for (const [intent, regex] of Object.entries(FAST_INTENTS)) {
    if (regex.test(trimmed)) return { intent, confidence: 0.99, requires_data: false, missing_fields: [], extracted_data: {}, context_completion: false };
  }
  return null;
}

const FIELD_QUESTIONS = {
  title:             { q: 'Como se llama el evento?',              hint: 'Ej: "Dentista", "Reunion de equipo"' },
  date:              { q: 'Para que dia es?',                       hint: 'Ej: "manana", "el lunes", "el 15 de mayo"' },
  time:              { q: 'A que hora?',                            hint: 'Ej: "a las 10:00", "a las 3 de la tarde"' },
  duration_minutes:  { q: 'Cuanto tiempo durara?',                  hint: 'Ej: "30 minutos", "1 hora"' },
  weeks:             { q: 'Cuantas semanas quieres que dure?',       hint: 'Ej: "4 semanas", "8 semanas"' },
  goal:              { q: 'Cual es tu objetivo?',                   hint: 'Ej: "perder peso", "ganar musculo"' },
  level:             { q: 'Cual es tu nivel?',                      hint: 'Principiante, intermedio o avanzado' },
  sessions_per_week: { q: 'Cuantos dias a la semana?',              hint: 'Ej: "3 dias", "lunes y miercoles"' },
  plan_type:         { q: 'Que tipo de plan necesitas?',             hint: 'Entrenamiento, dieta o estudio' },
  event_id:          { q: 'A que evento te refieres?',              hint: 'Dime el nombre o la fecha del evento' },
};

const FOLLOW_UP_SUGGESTIONS = {
  crear_evento: ['Ver mis eventos esta semana', 'Crear otro evento', 'Que tengo manana?'],
  crear_plan:   ['Cuando empezamos?', 'Ver mi agenda de la semana', 'Como funciona el plan?'],
  consultar:    ['Crear un nuevo evento', 'Ver el proximo mes', 'Que tengo manana?'],
  modificar:    ['Ver mis eventos', 'Crear un evento nuevo', 'Que tengo esta semana?'],
  eliminar:     ['Ver mis eventos restantes', 'Crear un evento nuevo', 'Que tengo esta semana?'],
  saludo:       ['Que tengo esta semana?', 'Crear un evento', 'Hacer un plan de entrenamiento'],
  otro:         ['Que tengo esta semana?', 'Crear un evento', 'Hacer un plan de entrenamiento'],
};

function buildMissingDataQuestion(missingFields) {
  if (!missingFields || missingFields.length === 0) return null;
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
      return { success: true, data: event, action_type: 'event_created',
        message: 'Listo! "' + event.title + '" anadido para el ' + dateStr + ' a las ' + timeStr + '.',
        summary: { title: event.title, date: dateStr, time: timeStr, duration: event.duration_minutes + ' min', type: event.event_type } };
    }
    case 'createTrainingPlan': {
      const plan = await createPlan(userId, args);
      sendPlanCreatedEmail(userEmail, userName, plan, 0).catch(console.error);
      return { success: true, data: plan, action_type: 'plan_created', message: formatPlanResponse(plan),
        requiresSchedule: true, planId: plan.id,
        summary: { title: plan.title, weeks: plan.weeks, sessions: plan.sessions_per_week, goal: plan.goal } };
    }
    case 'schedulePlan': {
      const sessions = await schedulePlan(userId, args.plan_id, {
        startDate:     args.start_date    || new Date().toISOString().split('T')[0],
        preferredDays: args.preferred_days || ['lunes', 'miercoles', 'viernes'],
        preferredTime: args.preferred_time || '07:00',
      });
      const summ = await formatScheduleSummary(sessions);
      const planRes = await query('SELECT * FROM plans WHERE id = $1 AND user_id = $2', [args.plan_id, userId]);
      if (planRes.rows.length) sendPlanCreatedEmail(userEmail, userName, planRes.rows[0], sessions.length).catch(console.error);
      return { success: true, data: { sessions, count: sessions.length }, action_type: 'plan_scheduled', message: summ, summary: { sessions_count: sessions.length } };
    }
    case 'getEvents': {
      const from = args.date_from || new Date().toISOString().split('T')[0];
      const to   = args.date_to   || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const events = await getEvents(userId, { dateFrom: from, dateTo: to, eventType: args.event_type });
      const msg = await formatEventsResponse(events);
      return { success: true, data: events, action_type: 'events_listed', message: msg, summary: { count: events.length } };
    }
    case 'updateEvent': {
      const updateData = Object.assign({}, args); delete updateData.event_id;
      const event = await updateEvent(userId, args.event_id, updateData);
      return { success: true, data: event, action_type: 'event_updated', message: 'Hecho! "' + event.title + '" actualizado correctamente.', summary: { title: event.title } };
    }
    case 'deleteEvent': {
      const result = await deleteEvent(userId, args.event_id);
      return { success: true, data: result, action_type: 'event_deleted', message: 'Eliminado. "' + result.title + '" ya no esta en tu agenda.', summary: { title: result.title } };
    }
    default: throw new Error('Funcion desconocida: ' + functionName);
  }
}

function buildSystemPrompt(userContext) {
  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let p = 'Eres Secretario IA, asistente de agenda. Hoy es ' + today + '.';
  p += ' Hablas espanol claro, directo. Maximo 2 frases.';
  p += ' Nunca digas "como puedo ayudarte" ni repitas el mensaje del usuario.';
  if (userContext.contextSummary && userContext.contextSummary.trim() !== '') {
    p += '\n\n' + userContext.contextSummary;
  }
  return p;
}

async function generateConversationalResponse(userMessage, userContext, functionResult) {
  if (functionResult && functionResult.message && !functionResult.requiresSchedule) return functionResult.message;
  if (!config.groq.apiKey) return (functionResult && functionResult.message) || 'Hola! En que puedo ayudarte?';
  try {
    const systemPrompt = buildSystemPrompt(userContext);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...userContext.shortTermMemory.slice(-4).map(function(m) { // Reduced: 6→4 turns
        return { role: m.role, content: m.content.substring(0, 300) }; // Reduced: 400→300 chars
      }),
      { role: 'user', content: userMessage },
    ];
    if (functionResult && functionResult.data) {
      const dataStr = '[Accion: ' + JSON.stringify(functionResult.data).substring(0, 200) + (functionResult.requiresSchedule ? ' - Plan creado. Pregunta cuando quiere empezar.' : ']');
      messages.splice(-1, 0, { role: 'assistant', content: dataStr });
    }
    const response = await groq.chat.completions.create({
      model:       config.groq.model,
      messages,
      temperature: 0.7,
      max_tokens:  150, // Reduced: 200→150
    });
    return response.choices[0].message.content;
  } catch (err) {
    console.error('[Chat] generateConversationalResponse error:', err.message);
    return (functionResult && functionResult.message) || 'Hola, en que puedo ayudarte?';
  }
}

async function processChat(req, res, next) {
  const message = req.body.message;
  const user    = req.user;
  const userId  = user && user.id;
  if (!message || typeof message !== 'string' || message.trim() === '') return res.status(400).json({ error: 'El mensaje no puede estar vacio' });
  if (message.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: 'El mensaje es demasiado largo (max ' + MAX_MESSAGE_LENGTH + ' caracteres)' });
  if (!userId) return res.status(401).json({ error: 'Sesion expirada. Vuelve a iniciar sesion.' });
  if (process.env.NODE_ENV !== 'production') console.log('[Chat] User:', userId, '| Len:', message.length);
  try {
    // OPTIMIZATION 1: try fast regex classify first (0 API calls for simple inputs)
    const fastResult = fastClassify(message);

    // OPTIMIZATION 2: start context fetch and LLM classify in parallel
    // If fastResult exists, we skip the LLM classify entirely
    const [userContext, intentResult] = await Promise.all([
      buildUserContext(userId, message),
      fastResult ? Promise.resolve(fastResult) : classifyIntent(message, []), // pass empty — will re-read from context below
    ]);

    // If LLM classifier ran without history, re-run with history only when needed
    // (avoid double LLM call: history is only needed for context_completion)
    const finalIntent = (fastResult || intentResult.context_completion === false)
      ? intentResult
      : await classifyIntent(message, userContext.shortTermMemory);

    // OPTIMIZATION 3: user email/name from auth middleware — no extra DB query
    // auth.js already SELECT'd these; attach them to req.user in auth middleware
    const userEmail = user.email || '';
    const userName  = user.name  || '';

    if (finalIntent.intent === INTENTS.CONFIRMAR || finalIntent.intent === INTENTS.CANCELAR) {
      return handleConfirmOrCancel(finalIntent, message, userId, userEmail, userName, userContext, res);
    }
    if (finalIntent.intent === INTENTS.SALUDO || finalIntent.intent === INTENTS.OTRO) {
      const resp = await generateConversationalResponse(message, userContext, null);
      await Promise.all([saveMessage(userId, 'user', message, { intent: finalIntent.intent }), saveMessage(userId, 'assistant', resp)]);
      setImmediate(function() { extractAndUpdateMemory(userId, message, finalIntent.intent, finalIntent.extracted_data).catch(function() {}); });
      return res.json({ success: true, response: resp, intent: finalIntent.intent, confidence: finalIntent.confidence, function_called: false, data: null, suggestions: FOLLOW_UP_SUGGESTIONS[finalIntent.intent] || [] });
    }
    if (finalIntent.requires_data && finalIntent.missing_fields && finalIntent.missing_fields.length > 0) {
      const question = buildMissingDataQuestion(finalIntent.missing_fields);
      await Promise.all([
        saveMessage(userId, 'user', message, { intent: finalIntent.intent, missing_fields: finalIntent.missing_fields, extracted_data: finalIntent.extracted_data }),
        saveMessage(userId, 'assistant', question, { pending_intent: finalIntent.intent, pending_data: finalIntent.extracted_data, missing_fields: finalIntent.missing_fields }),
      ]);
      return res.json({ success: true, response: question, intent: finalIntent.intent, confidence: finalIntent.confidence, missing_fields: finalIntent.missing_fields, requires_more_info: true, function_called: false, data: null, suggestions: [] });
    }
    let assistantResponse = '';
    let functionResult    = null;
    let actionType        = null;
    let responseSummary   = null;
    const actionableIntents = new Set([INTENTS.CREAR_EVENTO, INTENTS.CREAR_PLAN, INTENTS.CONSULTAR, INTENTS.MODIFICAR, INTENTS.ELIMINAR]);
    if (actionableIntents.has(finalIntent.intent)) {
      try {
        const functionCall = await processFunctionCall(finalIntent.intent, message, finalIntent.extracted_data, userContext.shortTermMemory, userId);
        if (functionCall) {
          // OPTIMIZATION 3: use email/name from req.user — NO extra SELECT
          functionResult  = await executeFunctionCall(functionCall.functionName, functionCall.arguments, userId, userEmail, userName);
          assistantResponse = functionResult.message;
          actionType       = functionResult.action_type || null;
          responseSummary  = functionResult.summary    || null;
          if (functionResult.requiresSchedule) assistantResponse += '\n\nCuando quieres empezar? Dime los dias y la hora preferida.';
        }
      } catch (err) {
        console.error('[Chat] Function error:', err.message);
        if (err.message && err.message.includes('conflict')) assistantResponse = 'Ese horario ya esta ocupado. Quieres que te sugiera un hueco libre?';
        else if (err.message && err.message.includes('not found')) assistantResponse = 'No encontre ese evento. Puedes decirme el nombre o la fecha exacta?';
        else assistantResponse = 'Algo salio mal. Puedes intentarlo de otra forma?';
        actionType = 'error';
      }
    }
    if (!assistantResponse) assistantResponse = await generateConversationalResponse(message, userContext, functionResult);
    // OPTIMIZATION 4: save both messages in parallel
    await Promise.all([
      saveMessage(userId, 'user', message, { intent: finalIntent.intent, extracted_data: finalIntent.extracted_data }),
      saveMessage(userId, 'assistant', assistantResponse, { functionCalled: functionResult ? 'yes' : 'none', action_type: actionType }),
    ]);
    setImmediate(function() { extractAndUpdateMemory(userId, message, finalIntent.intent, finalIntent.extracted_data).catch(function() {}); });
    return res.json({ success: true, response: assistantResponse, intent: finalIntent.intent, confidence: finalIntent.confidence, function_called: !!functionResult, action_type: actionType, summary: responseSummary, data: (functionResult && functionResult.data) || null, suggestions: actionType !== 'error' ? (FOLLOW_UP_SUGGESTIONS[finalIntent.intent] || []) : [] });
  } catch (err) { next(err); }
}

async function handleConfirmOrCancel(intentResult, message, userId, userEmail, userName, userContext, res) {
  const history = userContext.shortTermMemory;
  let pendingIntent = null, pendingData = null;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg  = history[i];
    if (msg.role === 'assistant' && msg.metadata) {
      const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
      if (meta.pending_intent) { pendingIntent = meta.pending_intent; pendingData = meta.pending_data || {}; break; }
    }
  }
  if (intentResult.intent === INTENTS.CANCELAR) {
    const resp = 'De acuerdo, cancelado. En que mas puedo ayudarte?';
    await Promise.all([saveMessage(userId, 'user', message, { intent: 'cancelar' }), saveMessage(userId, 'assistant', resp)]);
    return res.json({ success: true, response: resp, intent: 'cancelar', function_called: false, data: null, suggestions: FOLLOW_UP_SUGGESTIONS.saludo });
  }
  if (pendingIntent && intentResult.intent === INTENTS.CONFIRMAR) {
    try {
      const functionCall = await processFunctionCall(pendingIntent, message, pendingData, history, userId);
      if (functionCall) {
        const fr   = await executeFunctionCall(functionCall.functionName, functionCall.arguments, userId, userEmail, userName);
        let resp   = fr.message;
        if (fr.requiresSchedule) resp += '\n\nCuando quieres empezar? Dime los dias y la hora preferida.';
        await Promise.all([saveMessage(userId, 'user', message, { intent: 'confirmar' }), saveMessage(userId, 'assistant', resp, { action_type: fr.action_type })]);
        return res.json({ success: true, response: resp, intent: 'confirmar', function_called: true, data: fr.data || null, action_type: fr.action_type, summary: fr.summary || null, suggestions: FOLLOW_UP_SUGGESTIONS[pendingIntent] || [] });
      }
    } catch (err) { console.error('[Chat] Confirm error:', err.message); }
  }
  const resp2 = 'Confirmas que exactamente? Cuentame lo que quieres hacer.';
  await Promise.all([saveMessage(userId, 'user', message, { intent: intentResult.intent }), saveMessage(userId, 'assistant', resp2)]);
  return res.json({ success: true, response: resp2, intent: intentResult.intent, function_called: false, data: null, suggestions: [] });
}

async function getChatHistory(req, res, next) {
  try {
    const result = await query('SELECT role, content, metadata, created_at FROM conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    res.json({ success: true, messages: result.rows.reverse() });
  } catch (err) { next(err); }
}
async function deleteChatHistory(req, res, next) {
  try {
    await query('DELETE FROM conversations WHERE user_id = $1', [req.user.id]);
    res.json({ success: true, message: 'Historial eliminado' });
  } catch (err) { next(err); }
}
async function getMemoryProfile(req, res, next) {
  try { res.json({ success: true, memory: await memoryGetProfile(req.user.id) }); }
  catch (err) { next(err); }
}
async function deleteMemory(req, res, next) {
  try {
    await query('DELETE FROM user_memory WHERE user_id = $1', [req.user.id]);
    res.json({ success: true, message: 'Memoria eliminada' });
  } catch (err) { next(err); }
}
module.exports = { processChat, getChatHistory, deleteChatHistory, getMemoryProfile, deleteMemory };
