const OpenAI = require('openai');
const config = require('../config');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * INTENT CLASSIFIER — First step in every conversation
 * Returns ALWAYS a structured JSON with intent, requirements and missing fields
 */
async function classifyIntent(userMessage, conversationHistory = []) {
  const systemPrompt = `Eres un clasificador de intenciones para un asistente personal de agenda inteligente.
  
  Analiza el mensaje del usuario y devuelve SIEMPRE un JSON con esta estructura exacta:
  {
    "intent": "crear_evento | crear_plan | consultar | modificar | eliminar | saludo | desconocido",
    "confidence": 0.0-1.0,
    "requires_data": true/false,
    "missing_fields": [],
    "extracted_data": {},
    "user_message_summary": "resumen breve"
  }

  REGLAS ESTRICTAS:
  - "crear_evento": el usuario quiere añadir UNA sola cita/evento/tarea concreta
    * Campos requeridos: title, date, time (o duration si aplica)
    * Si falta date/time → missing_fields debe incluirlos
    * Ejemplo: "Tengo dentista el jueves a las 10" → crear_evento
  
  - "crear_plan": el usuario quiere un programa de múltiples sesiones (entrenamiento, dieta, estudio, etc.)
    * Campos requeridos: plan_type, weeks, goal, level, sessions_per_week
    * NUNCA guardar un plan como evento único
    * Ejemplo: "Montame un entrenamiento de 4 semanas" → crear_plan
  
  - "consultar": el usuario pregunta por su agenda, eventos o planes existentes
    * Ejemplo: "¿Qué tengo mañana?" → consultar
  
  - "modificar": el usuario quiere cambiar un evento o plan existente
    * Campos requeridos: event_id o identificación del evento, campo a modificar
  
  - "eliminar": el usuario quiere borrar un evento o plan
  
  - "saludo": saludo o conversación general
  
  Para extracted_data, extrae TODOS los datos mencionados:
  {
    "title": "nombre del evento",
    "date": "fecha en formato ISO si se menciona",
    "time": "hora si se menciona",
    "duration_minutes": número si se menciona,
    "plan_type": "entrenamiento|dieta|estudio|otro",
    "weeks": número de semanas,
    "goal": "objetivo del plan",
    "level": "principiante|intermedio|avanzado",
    "sessions_per_week": número de sesiones por semana,
    "notes": "notas adicionales"
  }
  
  SOLO devuelve el JSON, sin explicaciones ni markdown.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-5).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages,
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    // Validate required fields
    if (!result.intent) result.intent = 'desconocido';
    if (!result.requires_data) result.requires_data = false;
    if (!result.missing_fields) result.missing_fields = [];
    if (!result.extracted_data) result.extracted_data = {};
    if (!result.confidence) result.confidence = 0.5;

    console.log('[IntentClassifier] Intent detected:', result.intent, '| Confidence:', result.confidence);
    return result;
  } catch (err) {
    console.error('[IntentClassifier] Error:', err.message);
    return {
      intent: 'desconocido',
      confidence: 0,
      requires_data: false,
      missing_fields: [],
      extracted_data: {},
      user_message_summary: userMessage
    };
  }
}

module.exports = { classifyIntent };
