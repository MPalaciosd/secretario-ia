const express = require('express');
const router = express.Router();
const { processChat } = require('../controllers/chatController');
const { authMiddleware } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');
const { checkAILimit, attachPlanInfo } = require('../middleware/subscription');

/**
 * POST /api/chat
 * Main conversation endpoint — INTENT CLASSIFIER + FUNCTION CALLING
 *
 * Flow:
 * 1. Auth check
 * 2. Rate limit (30 req/min per user)
 * 3. AI message limit check (free: 10/day, pro: unlimited)
 * 4. Intent classification
 * 5. Function execution
 * 6. Memory update
 * 7. Response
 */
router.post('/', [rateLimiter, authMiddleware, attachPlanInfo, checkAILimit], processChat);

/**
 * GET /api/chat/history
 * Get conversation history
 */
router.get('/history', authMiddleware, async (req, res) => {
  const { query } = require('../../db/database');
  const result = await query(
    `SELECT role, content, intent, function_called, created_at
     FROM conversations WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({ success: true, messages: result.rows.reverse() });
});

/**
 * DELETE /api/chat/history
 * Clear conversation history
 */
router.delete('/history', authMiddleware, async (req, res) => {
  const { query } = require('../../db/database');
  await query('DELETE FROM conversations WHERE user_id = $1', [req.user.id]);
  res.json({ success: true, message: 'Historial eliminado' });
});

module.exports = router;
