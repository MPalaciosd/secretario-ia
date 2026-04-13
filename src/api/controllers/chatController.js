// ─── api/controllers/chatController.js ───────────────────────────────
//
// PIPELINE COMPLETO:
//   1. classifyIntent()  → qué quiere + qué falta
//   2. Si requires_data  → preguntar al usuario (nunca ejecutar)
//   3. Si confirmar/cancelar → resolver contexto pendiente
//   4. processFunctionCall() → extraer args exactos para la función
//   5. executeFunctionCall() → ejecutar la acción real
//   6. generateResponse()   → respuesta conversacional

'use strict';

const { classifyIntent, INTENTS } = require('../../ai/intentClassifier');
const { processFunctionCall }     = require('../../ai/functionCalling');
const { buildUserContext, saveMessage, extractAndUpdateMemory } = require('../../ai/memoryService');
const { createEvent, getEvents, updateEvent, deleteEvent, formatEventsResponse } = require('../../services/eventService');
const { createPlan, getPlanDetails, formatPlanResponse }        = require('../../services/planService');
const { schedulePlan, formatScheduleSummary }                   = require('../../services/schedulerService');
const { sendEventCreatedEmail, sendPlanCreatedEmail }           = require('../../services/emailService');
const { query }  = require('../../db/database');
const Groq       = require('groq-sdk');
const config     = require('../../config');

const groq = new Groq({ apiKey: config.groq.apiKey });

const MAX_MESSAGE_LENGTH = 2000;

// ─── Questions for missing fields ────────────────────────────────────

const FIELD_QUESTIONS = {
  // Event fields
  title:            '¿Cómo se llama el evento?',
  date:             '¿Para qué día es? (ej: "el próximo lunes", "el 15 de mayo")',
  time:             '¿A qué hora? (ej: "a las 10:00", "por la tarde")',
  duration_minutes: '¿Cuánto tiempo durará el evento?',
  // Plan fields
  weeks:            '¿Cuántas semanas quieres que dure el plan?',
  goal:             '¿Cuál es tu objetivo? (ej: perder peso, ganar músculo, mejorar resistencia)',
  level:            '¿Cuál es tu nivel? (principiante, intermedio, avanzado)',
  sessions_per_week:'¿Cuántas sesiones por semana puedes hacer?',
  plan_type:        '¿Qué tipo de plan quieres? (entrenamiento, dieta, estudio)',
  // Modify/delete
  event_id:         '¿Sobre qué evento? Dime el nombre o fecha para identificarlo.',
};

function buildMissingDataQuestion(missingFields) {
  if (!missingFields || missingFields.length === 0) return null;
  const questions = missingFields
    .map(f => FIELD_QUESTIONS[f] || `¿Puedes darme más información sobre "${f}"?`)
    .filter(Boolean);
  if (questions.length === 1) return questions[0];
  return 'Necesito algunos datos más:\n' + questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
}

// ─── Execute a function call ─────────────────────────────────────────

async function executeFunctionCall(functionName, args, userId, userEmail, userName) {
  switch (functionName) {
    case 'createEvent': {
      const event = await createEvent(userId, args);
      sendEventCreatedEmail(userEmail, userName, event).catch(console.error);
      const dateStr = new Date(event.start_time).toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long',
      });
      const timeStr = new Date(event.start_time).toLocaleTimeString('es-ES', {
        hour: '2-digit', minute: '2-digit',
      });
      return {
        success: true,
        data:    event,
        message: `✅ **${event.title}** añadido a tu agenda el ${dateStr} a las ${timeStr}.`,
      };
    }

    case 'createTrainingPlan': {
      const plan = await createPlan(userId, args);
      sendPlanCreatedEmail(userEmail, userName, plan, 0).catch(console.error);
      return {
        success:         true,
        data:            plan,
        message:         formatPlanResponse(plan),
        requiresSchedule: true,
        planId:          plan.id,
      };
    }

    case 'schedulePlan': {
      const { plan_id, start_date, preferred_days, preferred_time } = args;
      const sessions = await schedulePlan(userId, plan_id, {
        startDate:     start_date     || new Date().toISOString().split('T')[0],
        preferredDays: preferred_days || ['lunes', 'miercoles', 'viernes'],
        preferredTime: preferred_time || '07:00',
      });
      const summary  = formatScheduleSummary(sessions);
      const planRes  = await query('SELECT * FROM plans WHERE id = $1 AND user_id = $2', [plan_id, userId]);
      if (planRes.rows.length) {
        sendPlanCreatedEmail(userEmail, userName, planRes.rows[0], sessions.length).catch(console.error);
      }
      return { success: true, data: { sessions, count: sessions.length }, message: summary };
    }

    case 'getEvents': {
      const { date_from, date_to, event_type } = args;
      const from   = date_from || new Date().toISOString().split('T')[0];
      const to     = date_to   || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const events = await getEvents(userId, { dateFrom: from, dateTo: to, eventType: event_type });
      return { success: true, data: events, message: formatEventsResponse(events) };
    }

    case 'updateEvent': {
      const { event_id, ...updateData } = args;
      const event = await updateEvent(userId, event_id, updateData);
      return {
        success: true,
        data:    event,
        message: `✅ Evento **${event.title}** actualizado.`,
      };
    }

    case 'deleteEvent': {
      const result = await deleteEvent(userId, args.event_id);
      return {
        success: true,
        data:    result,
        message: `✅ Evento **${result.title}** eliminado de tu agenda.`,
      };
    }

    default:
      throw new Error('Función desconocida: ' + functionName);
  }
}

// ─── Generate conversational response ────────────────────────────────

async function generateConversationalResponse(userMessage, context, functionResult = null) {
  // If there's already a good message from the function, use it directly
  if (functionResult?.message && !functionResult.requiresSchedule) {
    return functionResult.message;
  }

  if (!config.groq.apiKey) {
    return functionResult?.message || 'Hola, estoy aquí para ayudarte con tu agenda. ¿Qué necesitas?';
  }

  try {
    const today = new Date().toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    let systemPrompt = [
      `Eres Secretario IA, un asistente personal de agenda. Hoy es ${today}.`,
      'Hablas en español de forma natural, concisa y amigable.',
      'Usa emojis ocasionalmente para ser más cercano.',
      'Responde en máximo 2-3 frases a menos que debas mostrar una lista.',
    ].join(' ');

    if (context.contextSummary) {
      systemPrompt += `\n\nInformación del usuario:\n${context.contextSummary}`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      // Include recent history for continuity
      ...context.shortTermMemory.slice(-6).map(m => ({
        role:    m.role,
        content: m.content.substring(0, 400),
      })),
      { role: 'user', content: userMessage },
    ];

    // If there's function data, add it as assistant context
    if (functionResult?.data) {
      messages.splice(-1, 0, {
        role:    'assistant',
        content: `[Acción completada: ${JSON.stringify(functionResult.data)}`
          + (functionResult.requiresSchedule
            ? ' Plan creado. Pregunta al usuario cuándo quiere entrenar.'
            : ']'),
      });
    }

    const response = await groq.chat.completions.create({
      model:       config.groq.model,
      messages,
      temperature: 0.75,
      max_tokens:  300,
    });

    return response.choices[0].message.content;
  } catch (err) {
    console.error('[Chat] generateConversationalResponse error:', err.message);
    return functionResult?.message || 'Hola, estoy aquí para ayudarte. ¿Qué necesitas hoy?';
  }
}

// ─── MAIN CHAT HANDLER ────────────────────────────────────────────────

async function processChat(req, res, next) {
  const { message } = req.body;
  const userId      = req.user?.id;

  // ── Input validation ─────────────────────────────────────────
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres` });
  }
  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  // ── Logging (no content in production) ───────────────────────
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Chat] User: ${userId} | Msg: ${message.substring(0, 80)}`);
  } else {
    console.log(`[Chat] User: ${userId} | Len: ${message.length}`);
  }

  try {
    const userContext  = await buildUserContext(userId);
    const intentResult = await classifyIntent(message, userContext.shortTermMemory);

    // ── STEP 1: Handle confirmar/cancelar (context-dependent) ────
    if (intentResult.intent === INTENTS.CONFIRMAR || intentResult.intent === INTENTS.CANCELAR) {
      return handleConfirmOrCancel(
        intentResult, message, userId, userContext, req, res
      );
    }

    // ── STEP 2: Handle saludo / otro (no action) ─────────────────
    if ([INTENTS.SALUDO, INTENTS.OTRO].includes(intentResult.intent)) {
      const response = await generateConversationalResponse(message, userContext);
      await saveMessage(userId, 'user', message, { intent: intentResult.intent });
      await saveMessage(userId, 'assistant', response);
      return res.json({
        success:  true,
        response,
        intent:   intentResult.intent,
        confidence: intentResult.confidence,
        function_called: false,
        data:     null,
      });
    }

    // ── STEP 3: Requires missing data → ask user ─────────────────
    if (intentResult.requires_data && intentResult.missing_fields.length > 0) {
      const question = buildMissingDataQuestion(intentResult.missing_fields);
      await saveMessage(userId, 'user', message, {
        intent:         intentResult.intent,
        missing_fields: intentResult.missing_fields,
        extracted_data: intentResult.extracted_data,
      });
      await saveMessage(userId, 'assistant', question, {
        pending_intent:  intentResult.intent,
        pending_data:    intentResult.extracted_data,
        missing_fields:  intentResult.missing_fields,
      });
      return res.json({
        success:           true,
        response:          question,
        intent:            intentResult.intent,
        confidence:        intentResult.confidence,
        missing_fields:    intentResult.missing_fields,
        requires_more_info: true,
        function_called:   false,
        data:              null,
      });
    }

    // ── STEP 4: Intent is clear and data is complete → execute ────
    let assistantResponse = '';
    let functionResult    = null;

    const actionableIntents = [
      INTENTS.CREAR_EVENTO, INTENTS.CREAR_PLAN,
      INTENTS.CONSULTAR, INTENTS.MODIFICAR, INTENTS.ELIMINAR,
    ];

    if (actionableIntents.includes(intentResult.intent)) {
      try {
        const functionCall = await processFunctionCall(
          intentResult.intent,
          message,
          intentResult.extracted_data,
          userContext.shortTermMemory,
          userId
        );

        if (functionCall) {
          // Get user email/name for notifications
          const userRow   = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
          const userEmail = userRow.rows[0]?.email;
          const userName  = userRow.rows[0]?.name;

          functionResult    = await executeFunctionCall(
            functionCall.functionName, functionCall.arguments,
            userId, userEmail, userName
          );
          assistantResponse = functionResult.message;

          // If plan was created, prompt to schedule
          if (functionResult.requiresSchedule) {
            assistantResponse += '\n\n💡 ¿Cuándo quieres entrenar? Dime los días y la hora y lo programo en tu calendario.';
          }
        }
      } catch (err) {
        console.error('[Chat] Function execution error:', err.message);
        assistantResponse = 'Lo siento, hubo un problema al procesar tu petición. ¿Puedes reformularla?';
      }
    }

    // ── STEP 5: Generate conversational response if none yet ─────
    if (!assistantResponse) {
      assistantResponse = await generateConversationalResponse(message, userContext, functionResult);
    }

    // ── STEP 6: Save to history + update long-term memory ────────
    await saveMessage(userId, 'user', message, {
      intent:         intentResult.intent,
      extracted_data: intentResult.extracted_data,
    });
    await saveMessage(userId, 'assistant', assistantResponse, {
      functionCalled: functionResult ? functionResult.data?.id ? 'yes' : 'ok' : 'none',
    });
    await extractAndUpdateMemory(userId, message, intentResult.intent, intentResult.extracted_data);

    return res.json({
      success:         true,
      response:        assistantResponse,
      intent:          intentResult.intent,
      confidence:      intentResult.confidence,
      function_called: !!functionResult,
      data:            functionResult?.data || null,
    });

  } catch (err) {
    next(err);
  }
}

// ─── Handle confirmar / cancelar ─────────────────────────────────────
//
// Looks at recent history to find a pending intent (one that was blocked
// waiting for confirmation or that asked a question the user is now answering).

async function handleConfirmOrCancel(intentResult, message, userId, userContext, req, res) {
  const history = userContext.shortTermMemory;

  // Find the most recent assistant message with a pending_intent
  let pendingData  = null;
  let pendingIntent = null;

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'assistant' && msg.metadata) {
      const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
      if (meta.pending_intent) {
        pendingIntent = meta.pending_intent;
        pendingData   = meta.pending_data || {};
        break;
      }
    }
  }

  if (intentResult.intent === INTENTS.CANCELAR) {
    const response = 'De acuerdo, cancelado. ¿En qué más puedo ayudarte?';
    await saveMessage(userId, 'user', message, { intent: 'cancelar' });
    await saveMessage(userId, 'assistant', response);
    return res.json({ success: true, response, intent: 'cancelar', function_called: false, data: null });
  }

  // CONFIRMAR: if there's a pending intent, re-run the pipeline with accumulated data
  if (pendingIntent && intentResult.intent === INTENTS.CONFIRMAR) {
    // Reconstruct the original intent as if data is complete
    const syntheticIntent = {
      intent:         pendingIntent,
      confidence:     0.9,
      requires_data:  false,
      missing_fields: [],
      extracted_data: pendingData,
      context_completion: true,
    };

    // Re-run from step 4
    try {
      const functionCall = await processFunctionCall(
        syntheticIntent.intent,
        message,
        syntheticIntent.extracted_data,
        history,
        userId
      );

      if (functionCall) {
        const userRow   = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
        const userEmail = userRow.rows[0]?.email;
        const userName  = userRow.rows[0]?.name;
        const functionResult = await executeFunctionCall(
          functionCall.functionName, functionCall.arguments,
          userId, userEmail, userName
        );
        let response = functionResult.message;
        if (functionResult.requiresSchedule) {
          response += '\n\n💡 ¿Cuándo quieres entrenar? Dime los días y la hora.';
        }
        await saveMessage(userId, 'user', message, { intent: 'confirmar' });
        await saveMessage(userId, 'assistant', response);
        return res.json({
          success: true, response,
          intent: 'confirmar', function_called: true,
          data: functionResult.data || null,
        });
      }
    } catch (err) {
      console.error('[Chat] Confirm execution error:', err.message);
    }
  }

  // No pending context — treat as generic yes
  const response = '¿Confirmas qué exactamente? Dime lo que quieres hacer.';
  await saveMessage(userId, 'user', message, { intent: intentResult.intent });
  await saveMessage(userId, 'assistant', response);
  return res.json({ success: true, response, intent: intentResult.intent, function_called: false, data: null });
}

// ─── GET /api/chat/history ─────────────────────────────────────────────

async function getChatHistory(req, res, next) {
  try {
    const result = await query(
      `SELECT role, content, intent, function_called, created_at
       FROM conversations
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ success: true, messages: result.rows.reverse() });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/chat/history ──────────────────────────────────────────

async function deleteChatHistory(req, res, next) {
  try {
    await query('DELETE FROM conversations WHERE user_id = $1', [req.user.id]);
    res.json({ success: true, message: 'Historial eliminado' });
  } catch (err) {
    next(err);
  }
}

module.exports = { processChat, getChatHistory, deleteChatHistory };
