const express = require('express');
const aiGatewayController = require('../controllers/aiGatewayController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

// AI Data Ingestion Gateway (Restricted to AI Service, Planner, Admin, Operations)
router.get('/planning-data', requireAuth, (req, res) => aiGatewayController.getPlanningData(req, res));

// AI Plan Submission & Registration
router.post('/plans', requireAuth, requireRole('Planner', 'Admin', 'AI_OPTIMIZER'), (req, res) => aiGatewayController.createPlan(req, res));

// AI Plan Inspection
router.get('/plans/:id', requireAuth, (req, res) => aiGatewayController.getPlan(req, res));
router.get('/plans', requireAuth, (req, res) => aiGatewayController.listPlans(req, res));

module.exports = router;
