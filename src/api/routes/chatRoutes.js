// ─── api/routes/chatRoutes.js ────────────────────────────────────────
// Route definitions only — main handler in chatController.js

'use strict';

const express = require('express');
const router  = express.Router();

const { processChat, getChatHistory, deleteChatHistory } = require('../controllers/chatController');
const { authMiddleware }              = require('../middleware/auth');
const { rateLimiter }                 = require('../middleware/rateLimiter');
const { checkAILimit, attachPlanInfo } = require('../middleware/subscription');

/**
 * POST /api/chat
 * Main conversation endpoint — INTENT CLASSIFIER + FUNCTION CALLING
 */
router.post('/', [rateLimiter, authMiddleware, attachPlanInfo, checkAILimit], processChat);

/**
 * GET /api/chat/history
 * Get last 50 conversation messages for the authenticated user
 */
router.get('/history', authMiddleware, getChatHistory);

/**
 * DELETE /api/chat/history
 * Clear all conversation history for the authenticated user
 */
router.delete('/history', authMiddleware, deleteChatHistory);

module.exports = router;
