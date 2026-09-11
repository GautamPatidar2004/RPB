const express = require('express');
const planningController = require('../controllers/planningController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

// Generate / Request AI planning job (Weekly / Monthly / Custom)
router.post('/generate', requireAuth, requireRole('Planner', 'Admin'), (req, res) => planningController.requestPlanningJob(req, res));

// Planning Runs (Standardized AI Planning Run Ingestion & Execution)
router.post('/planning-runs', requireAuth, requireRole('Planner', 'Admin'), (req, res) => planningController.createPlanningRun(req, res));
router.post('/submit-planning-run', requireAuth, requireRole('Planner', 'Admin'), (req, res) => planningController.createPlanningRun(req, res));
router.get('/planning-runs', requireAuth, (req, res) => planningController.listPlanningRuns(req, res));
router.get('/planning-runs/:runId', requireAuth, (req, res) => planningController.getPlanningRun(req, res));
router.post('/planning-runs/:runId/generate', requireAuth, requireRole('Planner', 'Admin'), (req, res) => planningController.generatePlanForRun(req, res));

// List block plans with date-range, weekly/monthly, and corridor filters
router.get('/', requireAuth, (req, res) => planningController.getPlans(req, res));

// Plan details (assigned tasks + block windows + conflicts + metrics + approvals)
router.get('/:id', requireAuth, (req, res) => planningController.getPlanDetails(req, res));

// Planner / Operations decisions
router.post('/:id/approve', requireAuth, requireRole('Planner', 'Operations', 'Admin'), (req, res) => planningController.approvePlan(req, res));
router.post('/:id/reject', requireAuth, requireRole('Planner', 'Operations', 'Admin'), (req, res) => planningController.rejectPlan(req, res));
router.put('/:id/modify', requireAuth, requireRole('Planner', 'Admin'), (req, res) => planningController.modifyPlan(req, res));

// Conflict resolution status updates
router.patch('/:id/conflicts/:conflictId', requireAuth, requireRole('Planner', 'Operations', 'Admin'), (req, res) => planningController.updateConflictStatus(req, res));

// Audit trail for a specific block plan
router.get('/:id/audit-logs', requireAuth, (req, res) => planningController.getPlanAuditLogs(req, res));

module.exports = router;
