// ─── api/routes/eventRoutes.js ───────────────────────────────────────
// Route definitions only — all logic lives in eventController.js

'use strict';

const express = require('express');
const router  = express.Router();

const {
  create,
  list,
  today,
  getOne,
  update,
  remove,
} = require('../controllers/eventController');

const { authMiddleware }  = require('../middleware/auth');
const { checkEventLimit } = require('../middleware/subscription');

// ── Routes ────────────────────────────────────────────────────────────
router.post('/',        [authMiddleware, checkEventLimit], create);
router.get('/',         authMiddleware, list);
router.get('/today',    authMiddleware, today);
router.get('/:id',      authMiddleware, getOne);
router.put('/:id',      authMiddleware, update);
router.delete('/:id',   authMiddleware, remove);

module.exports = router;
