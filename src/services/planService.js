const OpenAI = require('openai');
const { query } = require('../db/database');
const config = require('../config');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

// ─── BUSINESS RULES ────────────────────────────────────────────────────────────

function validatePlanData(data) {
  const errors = [];
  
  if (!data.weeks || data.weeks < 1 || data.weeks > 52) {
    errors.push('Las semanas deben ser entre 1 y 52');
  }
  
  if (!data.goal || data.goal.trim() === '') {
    errors.push('El objetivo del plan es requerido');
  }
  
  if (!data.level || !['principiante', 'intermedio', 'avanzado'].includes(data.level.toLowerCase())) {
    errors.push('El nivel debe ser: principiante, intermedio o avanzado');
  }
  
  return errors;
}

// ─── AI PLAN GENERATOR ─────────────────────────────────────────────────────────

async function generatePlanWithAI(planParams) {
  const { weeks, goal, level, sessions_per_week = 3, session_duration_minutes = 60, focus_areas = [] } = planParams;
  
  const prompt = `Eres un entrenador personal experto. Crea un plan de entrenamiento estructurado.

  PARÁMETROS:
  - Semanas: ${weeks}
  - Objetivo: ${goal}
  - Nivel: ${level}
  - Sesiones por semana: ${sessions_per_week}
  - Duración por sesión: ${session_duration_minutes} minutos
  ${focus_areas.length ? `- Áreas de enfoque: ${focus_areas.join(', ')}` : ''}

  Devuelve SOLO un JSON con esta estructura:
  {
    "title": "nombre del plan",
    "description": "descripción breve del plan",
    "phases": [
      {
        "week_range": "1-2",
        "phase_name": "Adaptación",
        "focus": "descripción del enfoque",
        "exercises": ["ejercicio 1", "ejercicio 2", "ejercicio 3"]
      }
    ],
    "weekly_structure": {
      "warmup": "descripción del calentamiento",
      "main_workout": "descripción del entrenamiento principal",
      "cooldown": "descripción del enfriamiento"
    },
    "progression_notes": "cómo progresa el plan",
    "nutrition_tips": ["consejo 1", "consejo 2"]
  }`;

  const response = await openai.chat.completions.create({
    model: config.openai.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    response_format: { type: 'json_object' }
  });
  
  return JSON.parse(response.choices[0].message.content);
}

// ─── CREATE PLAN ───────────────────────────────────────────────────────────────

async function createPlan(userId, data) {
  const validationErrors = validatePlanData(data);
  if (validationErrors.length > 0) {
    throw new Error('Datos de plan inválidos: ' + validationErrors.join(', '));
  }
  
  // Generate plan content with AI
  let planContent = {};
  try {
    planContent = await generatePlanWithAI(data);
  } catch (err) {
    console.error('[PlanService] AI generation error:', err.message);
    // Fallback: create basic plan without AI content
    planContent = {
      title: `Plan de ${data.goal} - ${data.weeks} semanas`,
      description: `Plan de ${data.level} para ${data.goal}`
    };
  }
  
  const result = await query(
    `INSERT INTO plans (user_id, title, description, plan_type, weeks, goal, level, 
       sessions_per_week, session_duration_minutes, metadata, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
     RETURNING *`,
    [
      userId,
      planContent.title || `Plan ${data.goal}`,
      planContent.description || data.goal,
      data.plan_type || 'entrenamiento',
      data.weeks,
      data.goal,
      data.level.toLowerCase(),
      data.sessions_per_week || 3,
      data.session_duration_minutes || 60,
      JSON.stringify({
        ai_generated: planContent,
        focus_areas: data.focus_areas || [],
        created_by: 'ai'
      })
    ]
  );
  
  return result.rows[0];
}

// ─── GET PLANS ─────────────────────────────────────────────────────────────────

async function getPlans(userId, status = 'active') {
  const result = await query(
    `SELECT p.*, 
       COUNT(e.id) as total_sessions,
       COUNT(CASE WHEN e.status = 'completed' THEN 1 END) as completed_sessions
     FROM plans p
     LEFT JOIN events e ON e.plan_id = p.id
     WHERE p.user_id = $1 AND p.status = $2
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [userId, status]
  );
  return result.rows;
}

// ─── GET PLAN DETAILS ──────────────────────────────────────────────────────────

async function getPlanDetails(userId, planId) {
  const planResult = await query(
    'SELECT * FROM plans WHERE id = $1 AND user_id = $2',
    [planId, userId]
  );
  
  if (!planResult.rows.length) {
    throw new Error('Plan no encontrado');
  }
  
  const eventsResult = await query(
    `SELECT id, title, start_time, end_time, week_number, session_number, status
     FROM events 
     WHERE plan_id = $1 AND user_id = $2 AND status != 'cancelled'
     ORDER BY start_time ASC`,
    [planId, userId]
  );
  
  return {
    ...planResult.rows[0],
    sessions: eventsResult.rows
  };
}

// ─── FORMAT PLAN FOR DISPLAY ───────────────────────────────────────────────────

function formatPlanResponse(plan, sessions = []) {
  const aiData = plan.metadata?.ai_generated || {};
  
  let response = `🏋️ **${plan.title}**\n\n`;
  
  if (aiData.description || plan.description) {
    response += `📋 ${aiData.description || plan.description}\n\n`;
  }
  
  response += `📊 **Detalles:**\n`;
  response += `  • Duración: ${plan.weeks} semanas\n`;
  response += `  • Objetivo: ${plan.goal}\n`;
  response += `  • Nivel: ${plan.level}\n`;
  response += `  • Sesiones/semana: ${plan.sessions_per_week}\n`;
  response += `  • Duración sesión: ${plan.session_duration_minutes} min\n\n`;
  
  if (aiData.phases && aiData.phases.length > 0) {
    response += `📅 **Fases del plan:**\n`;
    aiData.phases.forEach((phase, i) => {
      response += `  **Semanas ${phase.week_range}** — ${phase.phase_name}\n`;
      response += `  _${phase.focus}_\n`;
    });
    response += '\n';
  }
  
  if (aiData.progression_notes) {
    response += `📈 **Progresión:** ${aiData.progression_notes}\n\n`;
  }
  
  if (sessions.length > 0) {
    response += `\n✅ Plan ya programado en tu calendario (${sessions.length} sesiones)`;
  } else {
    response += `\n💡 ¿Quieres que lo programe en tu calendario? Dime cuándo prefieres entrenar.`;
  }
  
  return response;
}

module.exports = { createPlan, getPlans, getPlanDetails, formatPlanResponse };
