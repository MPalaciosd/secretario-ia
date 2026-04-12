// ─── api/routes/planRoutes.js ────────────────────────────────────────
// Route definitions only — all logic lives in planController.js

'use strict';

const express = require('express');
const router  = express.Router();

const {
  create,
  list,
  getOne,
  schedule,
  getSessions,
} = require('../controllers/planController');

const { authMiddleware }  = require('../middleware/auth');
const { requirePro }      = require('../middleware/subscription');

// ── Routes ────────────────────────────────────────────────────────────
router.post('/',              [authMiddleware, requirePro], create);
router.get('/',               authMiddleware, list);
router.get('/:id',            authMiddleware, getOne);
router.post('/:id/schedule',  [authMiddleware, requirePro], schedule);
router.get('/:id/sessions',   authMiddleware, getSessions);

module.exports = router;
