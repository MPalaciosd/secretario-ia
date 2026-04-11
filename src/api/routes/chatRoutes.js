const express = require('express');
const router = express.Router();
const { processChat } = require('../controllers/chatController');
const { authMiddleware } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');

/**
 * POST /api/chat
 * Main conversation endpoint
 * 
 * Body: { message: string, userId?: string }
 * 
 * Response:
 * {
 *   success: true,
 *   response: string,        // Assistant's reply
 *   intent: string,          // Detected intent
 *   confidence: number,      // Intent confidence 0-1
 *   function_called: boolean,// Whether a function was called
 *   data: object|null,       // Function result data
 *   requires_more_info: bool // Whether more info is needed
 * }
 * 
 * Examples:
 * "Tengo dentista el jueves a las 10" → crear_evento → createEvent()
 * "Montame un entrenamiento de 4 semanas" → crear_plan → createTrainingPlan()
 * "¿Qué tengo mañana?" → consultar → getEvents()
 */
router.post('/', [rateLimiter, authMiddleware], processChat);

module.exports = router;
