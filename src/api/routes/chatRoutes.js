// src/api/routes/chatRoutes.js
'use strict';

const express = require('express');
const router = express.Router();

const {
  processChat,
  getChatHistory,
  deleteChatHistory,
  getMemoryProfile,
  deleteMemory,
} = require('../controllers/chatController');
const { authMiddleware } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');
const { checkAILimit, attachPlanInfo } = require('../middleware/subscription');

// POST /api/chat — main conversation
router.post('/', [rateLimiter, authMiddleware, attachPlanInfo, checkAILimit], processChat);

// GET /api/chat/history
router.get('/history', authMiddleware, getChatHistory);

// DELETE /api/chat/history
router.delete('/history', authMiddleware, deleteChatHistory);

// GET /api/chat/memory — user memory profile
router.get('/memory', authMiddleware, getMemoryProfile);

// DELETE /api/chat/memory — clear all long-term memory
router.delete('/memory', authMiddleware, deleteMemory);

module.exports = router;
