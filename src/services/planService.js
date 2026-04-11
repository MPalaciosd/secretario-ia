const Groq   = require('groq-sdk');
const { query }  = require('../db/database');
const config     = require('../config');

const groq = new Groq({ apiKey: config.groq.apiKey });

// ─── Validation ───────────────────────────────────────────────
function validatePlanData(data) {
  const errors = [];
  if (!data.weeks || data.weeks < 1 || data.weeks > 52) errors.push('Las semanas deben ser entre 1 y 52');
  if (!data.goal  || data.goal.trim() === '')           errors.push('El objetivo del plan es requerido');
  if (!data.level || !['principiante','intermedio','avanzado'].includes(data.level.toLowerCase()))
    errors.push('El nivel debe ser: principiante, intermedio o avanzado');
  return errors;
}

// ─── AI Plan Generator (Groq) ─────────────────────────────────
async function generatePlanWithAI(planParams) {
  const { weeks, goal, level, sessions_per_week = 3, session_duration_minutes = 60, focus_areas = [] } = planParams;

  if (!config.groq.apiKey) return buildFallbackPlan(planParams);

  const prompt = `Eres un entrenador personal experto. Crea un plan de entrenamiento estructurado.
PARÁMETROS:
- Semanas: ${weeks}
- Objetivo: ${goal}
- Nivel: ${level}
- Sesiones por semana: ${sessions_per_week}
- Duración por sesión: ${session_duration_minutes} minutos
${focus_areas.length ? '- Áreas de enfoque: ' + focus_areas.join(', ') : ''}

Devuelve SOLO un JSON con esta estructura exacta:
{
  "title": "nombre del plan",
  "description": "descripción breve del plan",
  "phases": [
    { "week_range": "1-2", "phase_name": "Adaptación", "focus": "descripción", "exercises": ["ejercicio 1", "ejercicio 2"] }
  ],
  "weekly_structure": {
    "warmup": "calentamiento",
    "main_workout": "entrenamiento principal",
    "cooldown": "enfriamiento"
  },
  "progression_notes": "cómo progresa",
  "nutrition_tips": ["consejo 1", "consejo 2"]
}`;

  try {
    const response = await groq.chat.completions.create({
      model:       config.groq.model,
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens:  1000
    });

    const raw = response.choices[0].message.content.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return buildFallbackPlan(planParams);
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[PlanService] Groq generation error:', err.message);
    return buildFallbackPlan(planParams);
  }
}

function buildFallbackPlan({ weeks, goal, level, sessions_per_week }) {
  return {
    title:       `Plan de ${goal} — ${weeks} semanas`,
    description: `Plan de nivel ${level} para ${goal}. ${sessions_per_week} sesiones por semana.`,
    phases: [{ week_range: `1-${weeks}`, phase_name: 'Desarrollo', focus: goal, exercises: [] }],
    progression_notes: 'Aumenta la intensidad progresivamente cada semana.',
    nutrition_tips: ['Mantén buena hidratación', 'Come proteína después de entrenar']
  };
}

// ─── Create Plan ──────────────────────────────────────────────
async function createPlan(userId, data) {
  const errors = validatePlanData(data);
  if (errors.length > 0) throw new Error('Datos de plan inválidos: ' + errors.join(', '));

  let planContent = {};
  try { planContent = await generatePlanWithAI(data); }
  catch (err) {
    console.error('[PlanService] AI error:', err.message);
    planContent = buildFallbackPlan(data);
  }

  const result = await query(
    `INSERT INTO plans
       (user_id, title, description, plan_type, weeks, goal, level,
        sessions_per_week, session_duration_minutes, metadata, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active')
     RETURNING *`,
    [
      userId,
      planContent.title       || `Plan ${data.goal}`,
      planContent.description || data.goal,
      data.plan_type          || 'entrenamiento',
      data.weeks,
      data.goal,
      data.level.toLowerCase(),
      data.sessions_per_week        || 3,
      data.session_duration_minutes || 60,
      JSON.stringify({ ai_generated: planContent, focus_areas: data.focus_areas || [] })
    ]
  );
  return result.rows[0];
}

// ─── Get Plans ────────────────────────────────────────────────
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

// ─── Get Plan Details ─────────────────────────────────────────
async function getPlanDetails(userId, planId) {
  const planRes = await query('SELECT * FROM plans WHERE id = $1 AND user_id = $2', [planId, userId]);
  if (!planRes.rows.length) throw new Error('Plan no encontrado');

  const eventsRes = await query(
    `SELECT id, title, start_time, end_time, week_number, session_number, status
     FROM events WHERE plan_id = $1 AND user_id = $2 AND status != 'cancelled'
     ORDER BY start_time ASC`,
    [planId, userId]
  );
  return { ...planRes.rows[0], sessions: eventsRes.rows };
}

// ─── Format Plan Response ─────────────────────────────────────
function formatPlanResponse(plan) {
  const ai = plan.metadata?.ai_generated || {};
  let r = `🏋️ **${plan.title}**\n\n`;
  if (ai.description || plan.description) r += `📋 ${ai.description || plan.description}\n\n`;
  r += `📊 **Detalles:**\n`;
  r += ` • Duración: ${plan.weeks} semanas\n`;
  r += ` • Objetivo: ${plan.goal}\n`;
  r += ` • Nivel: ${plan.level}\n`;
  r += ` • Sesiones/semana: ${plan.sessions_per_week}\n`;
  r += ` • Duración sesión: ${plan.session_duration_minutes} min\n\n`;

  if (ai.phases?.length > 0) {
    r += `📅 **Fases del plan:**\n`;
    ai.phases.forEach(phase => {
      r += ` **Semanas ${phase.week_range}** — ${phase.phase_name}\n`;
      r += ` _${phase.focus}_\n`;
    });
    r += '\n';
  }
  if (ai.progression_notes) r += `📈 **Progresión:** ${ai.progression_notes}\n\n`;
  r += `\n💡 ¿Quieres que lo programe en tu calendario? Dime cuándo prefieres entrenar.`;
  return r;
}

module.exports = { createPlan, getPlans, getPlanDetails, formatPlanResponse };
