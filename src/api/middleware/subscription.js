const { query } = require('../../db/database');

// ─── SUBSCRIPTION PLANS CONFIG ────────────────────────────────
const PLANS = {
  free: {
    name: 'Gratuito',
    maxEventsTotal: 20,
    maxDailyAIMessages: 10,
    features: ['crear_evento', 'consultar'],
    canSchedulePlans: false,
    canCreatePlans: false
  },
  active: {
    name: 'PRO',
    maxEventsTotal: Infinity,
    maxDailyAIMessages: Infinity,
    features: ['crear_evento', 'consultar', 'modificar', 'eliminar', 'crear_plan'],
    canSchedulePlans: true,
    canCreatePlans: true
  },
  trial: {
    name: 'Trial PRO',
    maxEventsTotal: Infinity,
    maxDailyAIMessages: Infinity,
    features: ['crear_evento', 'consultar', 'modificar', 'eliminar', 'crear_plan'],
    canSchedulePlans: true,
    canCreatePlans: true
  }
};

function getPlan(subscriptionStatus) {
  return PLANS[subscriptionStatus] || PLANS.free;
}

/**
 * Check AI message limit for free users
 */
async function checkAILimit(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  const plan = getPlan(user.subscription_status);

  if (plan.maxDailyAIMessages === Infinity) return next();

  // Count messages today
  const today = new Date().toISOString().split('T')[0];
  const result = await query(
    `SELECT COUNT(*) as count FROM conversations
     WHERE user_id = $1 AND role = 'user' AND created_at >= $2`,
    [user.id, today + 'T00:00:00Z']
  );

  const count = parseInt(result.rows[0].count);
  
  if (count >= plan.maxDailyAIMessages) {
    return res.status(403).json({
      error: 'Límite diario de IA alcanzado',
      limit: plan.maxDailyAIMessages,
      used: count,
      upgrade_message: 'Actualiza a PRO para uso ilimitado',
      upgrade_url: '/pricing'
    });
  }

  req.aiMessagesUsed = count;
  req.aiMessagesLimit = plan.maxDailyAIMessages;
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
    req.plan = getPlan(req.user.subscription_status);
    req.isPro = req.plan.maxDailyAIMessages === Infinity;
  }
  next();
}

module.exports = { checkAILimit, requirePro, checkEventLimit, attachPlanInfo, PLANS, getPlan };
