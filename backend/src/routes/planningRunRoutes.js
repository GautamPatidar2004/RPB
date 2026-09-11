const express = require('express');
const planningController = require('../controllers/planningController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * Requirement 19 API Routes:
 * POST /planning-runs
 * GET  /planning-runs
 * GET  /planning-runs/:id
 * POST /planning-runs/:id/generate
 */

// POST /planning-runs: Creates planning run (if execute_now=false, only creates; otherwise creates & runs AI)
router.post('/', requireAuth, requireRole('Planner', 'Admin'), (req, res) => planningController.createPlanningRun(req, res));

// GET /planning-runs: Lists all planning runs with filters
router.get('/', requireAuth, (req, res) => planningController.listPlanningRuns(req, res));

// GET /planning-runs/:id: Details and results of a planning run
router.get('/:id', requireAuth, (req, res) => planningController.getPlanningRun(req, res));

// POST /planning-runs/:id/generate: Triggers AI generation for an existing planning run
router.post('/:id/generate', requireAuth, requireRole('Planner', 'Admin'), (req, res) => planningController.generatePlanForRun(req, res));

module.exports = router;
