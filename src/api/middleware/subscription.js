const { query } = require('../../db/database');

// ─── SUBSCRIPTION PLANS CONFIG ────────────────────────────────
const PLANS = {
  free: {
    name: 'Gratuito',
    maxEventsTotal: 20,
    maxWeeklyAIMessages: 20,   // 20 mensajes por semana (periodo lun-dom)
    features: ['crear_evento', 'consultar'],
    canSchedulePlans: false,
    canCreatePlans: false
  },
  active: {
    name: 'PRO',
    maxEventsTotal: Infinity,
    maxWeeklyAIMessages: Infinity,
    features: ['crear_evento', 'consultar', 'modificar', 'eliminar', 'crear_plan'],
    canSchedulePlans: true,
    canCreatePlans: true
  },
  trial: {
    name: 'Trial PRO',
    maxEventsTotal: Infinity,
    maxWeeklyAIMessages: Infinity,
    features: ['crear_evento', 'consultar', 'modificar', 'eliminar', 'crear_plan'],
    canSchedulePlans: true,
    canCreatePlans: true
  }
};

function getPlan(subscriptionStatus) {
  return PLANS[subscriptionStatus] || PLANS.free;
}

/**
 * Get the Monday of the current week (week starts on Monday)
 */
function getWeekStart() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon...
  const diff = (day === 0) ? -6 : 1 - day; // adjust to Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString();
}

/**
 * Check AI message limit for free users (weekly: 20 messages/week)
 */
async function checkAILimit(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  const plan = getPlan(user.subscription_status);
  if (plan.maxWeeklyAIMessages === Infinity) return next();

  // Count messages this week (Monday to now)
  const weekStart = getWeekStart();
  const result = await query(
    `SELECT COUNT(*) as count FROM conversations
     WHERE user_id = $1 AND role = 'user' AND created_at >= $2`,
    [user.id, weekStart]
  );

  const count = parseInt(result.rows[0].count);

  if (count >= plan.maxWeeklyAIMessages) {
    return res.status(403).json({
      error: 'Límite semanal de IA alcanzado',
      limit: plan.maxWeeklyAIMessages,
      used: count,
      period: 'semanal',
      upgrade_message: 'Actualiza a PRO para uso ilimitado',
      upgrade_url: '/pricing'
    });
  }

  req.aiMessagesUsed   = count;
  req.aiMessagesLimit  = plan.maxWeeklyAIMessages;
  next();
}

/**
 * Check if user can create plans (PRO only)
 */
function requirePro(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  const plan = getPlan(user.subscription_status);
  if (!plan.canCreatePlans) {
    return res.status(403).json({
      error: 'Función exclusiva del plan PRO',
      feature: 'Planes de entrenamiento IA',
      upgrade_url: '/pricing',
      upgrade_message: 'Actualiza a PRO por 9€/mes'
    });
  }
  next();
}

/**
 * Check event count limit for free users
 */
async function checkEventLimit(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  const plan = getPlan(user.subscription_status);
  if (plan.maxEventsTotal === Infinity) return next();

  const result = await query(
    "SELECT COUNT(*) as count FROM events WHERE user_id = $1 AND status != 'cancelled'",
    [user.id]
  );
  const count = parseInt(result.rows[0].count);

  if (count >= plan.maxEventsTotal) {
    return res.status(403).json({
      error: `Límite de ${plan.maxEventsTotal} eventos alcanzado en el plan gratuito`,
      limit: plan.maxEventsTotal,
      used: count,
      upgrade_url: '/pricing'
    });
  }
  next();
}

/**
 * Attach plan info to request
 */
function attachPlanInfo(req, res, next) {
  if (req.user) {
    req.plan   = getPlan(req.user.subscription_status);
    req.isPro  = req.plan.maxWeeklyAIMessages === Infinity;
  }
  next();
}

module.exports = { checkAILimit, requirePro, checkEventLimit, attachPlanInfo, PLANS, getPlan, getWeekStart };
