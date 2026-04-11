const { classifyIntent } = require('../../ai/intentClassifier');
const { processFunctionCall } = require('../../ai/functionCalling');
const { 
  buildUserContext, 
  saveMessage, 
  extractAndUpdateMemory 
} = require('../../ai/memoryService');
const { createEvent, getEvents, updateEvent, deleteEvent, formatEventsResponse } = require('../../services/eventService');
const { createPlan, getPlanDetails, formatPlanResponse } = require('../../services/planService');
const { schedulePlan, formatScheduleSummary } = require('../../services/schedulerService');
const { sendEventCreatedEmail, sendPlanCreatedEmail } = require('../../services/emailService');
const { query } = require('../../db/database');
const OpenAI = require('openai');
const config = require('../../config');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

// ─── MISSING DATA QUESTIONER ──────────────────────────────────────────────────

const MISSING_FIELD_QUESTIONS = {
  // Event fields
  'title': '¿Cómo se llama el evento?',
  'date': '¿Para qué día es? (ej: "el próximo lunes", "el 15 de mayo")',
  'time': '¿A qué hora? (ej: "a las 10:00", "por la tarde")',
  'duration_minutes': '¿Cuánto tiempo durará el evento?',
  // Plan fields
  'weeks': '¿Cuántas semanas quieres que dure el plan?',
  'goal': '¿Cuál es tu objetivo? (ej: perder peso, ganar músculo, mejorar resistencia)',
  'level': '¿Cuál es tu nivel? (principiante, intermedio, avanzado)',
  'sessions_per_week': '¿Cuántas sesiones por semana puedes hacer?',
  'plan_type': '¿Qué tipo de plan quieres? (entrenamiento, dieta, estudio)'
};

function buildMissingDataQuestion(missingFields) {
  if (!missingFields || missingFields.length === 0) return null;
  
  const questions = missingFields
    .map(field => MISSING_FIELD_QUESTIONS[field] || `¿Puedes darme más información sobre "${field}"?`)
    .filter(Boolean);
  
  if (questions.length === 1) return questions[0];
  return `Necesito algunos datos más:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
}

// ─── FUNCTION EXECUTOR ───────────────────────────────────────────────────────

async function executeFunctionCall(functionName, args, userId, userEmail, userName) {
  switch (functionName) {
    case 'createEvent': {
      const event = await createEvent(userId, args);
      // Send email notification (fire and forget)
      sendEventCreatedEmail(userEmail, userName, event).catch(console.error);
      return {
        success: true,
        data: event,
        message: `✅ Evento creado: **${event.title}** el ${new Date(event.start_time).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${new Date(event.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
      };
    }
    
    case 'createTrainingPlan': {
      const plan = await createPlan(userId, args);
      const planResponse = formatPlanResponse(plan);
      
      // Send email notification
      sendPlanCreatedEmail(userEmail, userName, plan, 0).catch(console.error);
      
      return {
        success: true,
        data: plan,
        message: planResponse,
        requiresSchedule: true
      };
    }
    
    case 'schedulePlan': {
      const { plan_id, start_date, preferred_days, preferred_time } = args;
      
      const sessions = await schedulePlan(userId, plan_id, {
        startDate: start_date || new Date().toISOString().split('T')[0],
        preferredDays: preferred_days || ['lunes', 'miercoles', 'viernes'],
        preferredTime: preferred_time || '07:00'
      });
      
      const summary = formatScheduleSummary(sessions);
      
      // Update plan email with session count
      const planResult = await query('SELECT * FROM plans WHERE id = $1', [plan_id]);
      if (planResult.rows.length) {
        sendPlanCreatedEmail(userEmail, userName, planResult.rows[0], sessions.length).catch(console.error);
      }
      
      return {
        success: true,
        data: { sessions, count: sessions.length },
        message: summary
      };
    }
    
    case 'getEvents': {
      const { date_from, date_to, event_type } = args;
      
      // If no dates provided, use today + 7 days
      const from = date_from || new Date().toISOString().split('T')[0];
      const to = date_to || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const events = await getEvents(userId, { dateFrom: from, dateTo: to, eventType: event_type });
      return {
        success: true,
        data: events,
        message: formatEventsResponse(events)
      };
    }
    
    case 'updateEvent': {
      const { event_id, ...updateData } = args;
      const event = await updateEvent(userId, event_id, updateData);
      return {
        success: true,
        data: event,
        message: `✅ Evento actualizado: **${event.title}**`
      };
    }
    
    case 'deleteEvent': {
      const { event_id } = args;
      const result = await deleteEvent(userId, event_id);
      return {
        success: true,
        data: result,
        message: `✅ Evento eliminado: **${result.title}**`
      };
    }
    
    default:
      throw new Error(`Función desconocida: ${functionName}`);
  }
}

// ─── GENERATE CONVERSATIONAL RESPONSE ────────────────────────────────────────

async function generateConversationalResponse(userMessage, context, functionResult = null) {
  const systemPrompt = `Eres Secretario IA, un asistente personal de agenda inteligente y amigable.
  Hablas en español de manera natural y cercana.
  ${context.contextSummary}
  
  Hoy es: ${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
  
  ${functionResult ? `RESULTADO DE LA ACCIÓN: ${JSON.stringify(functionResult.data)}` : ''}
  
  Responde de forma concisa y útil. Si acabas de completar una acción, confírmala brevemente.
  Usa emojis ocasionalmente para hacer la conversación más amigable.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...context.shortTermMemory.slice(-8).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];
  
  if (functionResult?.message) {
    messages.push({ role: 'assistant', content: functionResult.message });
    return functionResult.message;
  }

  const response = await openai.chat.completions.create({
    model: config.openai.model,
    messages,
    temperature: 0.8,
    max_tokens: 500
  });
  
  return response.choices[0].message.content;
}

// ─── MAIN CHAT HANDLER ────────────────────────────────────────────────────────

async function processChat(req, res) {
  const { message, context: contextOverride } = req.body;
  const userId = req.user?.id || req.body.userId; // From JWT middleware
  
  if (!message || message.trim() === '') {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
  }
  
  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }
  
  try {
    console.log(`[Chat] User: ${userId} | Message: ${message.substring(0, 80)}`);
    
    // ── STEP 1: Get user context (short + long term memory) ──────────────────
    const userContext = await buildUserContext(userId);
    
    // ── STEP 2: Classify intent ───────────────────────────────────────────────
    const intentResult = await classifyIntent(message, userContext.shortTermMemory);
    console.log(`[Chat] Intent: ${intentResult.intent} | Confidence: ${intentResult.confidence}`);
    
    // ── STEP 3: Check for missing required data ────────────────────────────────
    if (intentResult.requires_data && intentResult.missing_fields?.length > 0) {
      const question = buildMissingDataQuestion(intentResult.missing_fields);
      
      // Save conversation
      await saveMessage(userId, 'user', message, { intent: intentResult.intent });
      await saveMessage(userId, 'assistant', question);
      
      return res.json({
        success: true,
        response: question,
        intent: intentResult.intent,
        missing_fields: intentResult.missing_fields,
        requires_more_info: true
      });
    }
    
    // ── STEP 4: Process based on intent ───────────────────────────────────────
    let assistantResponse = '';
    let functionResult = null;
    
    if (['crear_evento', 'crear_plan', 'consultar', 'modificar', 'eliminar'].includes(intentResult.intent)) {
      try {
        // Get function to call
        const functionCall = await processFunctionCall(
          intentResult.intent,
          message,
          intentResult.extracted_data,
          userContext.shortTermMemory,
          userId
        );
        
        if (functionCall) {
          console.log(`[Chat] Calling function: ${functionCall.functionName}`);
          
          // Get user email for notifications
          const userResult = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
          const userEmail = userResult.rows[0]?.email;
          const userName = userResult.rows[0]?.name;
          
          // Execute the function
          functionResult = await executeFunctionCall(
            functionCall.functionName,
            functionCall.arguments,
            userId,
            userEmail,
            userName
          );
          
          assistantResponse = functionResult.message;
          
          // If it's a plan creation, prompt for scheduling
          if (functionResult.requiresSchedule) {
            assistantResponse += `\n\n💡 ¿Cuándo prefieres entrenar? Dime los días y la hora y lo programaré en tu calendario.`;
          }
        }
      } catch (err) {
        console.error('[Chat] Function execution error:', err.message);
        // Don't crash - generate a helpful error response
        assistantResponse = `Lo siento, hubo un problema: ${err.message}. ¿Puedes reformular tu petición?`;
      }
    } else {
      // For greetings and general conversation
      assistantResponse = await generateConversationalResponse(message, userContext);
    }
    
    // ── STEP 5: Update memory ─────────────────────────────────────────────────
    await saveMessage(userId, 'user', message, { intent: intentResult.intent });
    await saveMessage(userId, 'assistant', assistantResponse, { 
      functionCalled: functionResult?.functionName,
      functionResult: functionResult?.data
    });
    
    // Update long-term memory based on this interaction
    await extractAndUpdateMemory(userId, message, intentResult.intent, intentResult.extracted_data);
    
    // ── STEP 6: Return response ────────────────────────────────────────────────
    return res.json({
      success: true,
      response: assistantResponse,
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      function_called: functionResult ? true : false,
      data: functionResult?.data || null
    });
    
  } catch (err) {
    console.error('[Chat] Critical error:', err.message, err.stack);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Inténtalo de nuevo'
    });
  }
}

module.exports = { processChat };
