const express = require('express');
const maintenanceTaskController = require('../controllers/maintenanceTaskController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

// Maintenance Request Ingestion (Standardized pipeline for DEMO, BDMS, TDMS, SMMS)
router.post('/ingest', requireAuth, (req, res) => maintenanceTaskController.ingest(req, res));
router.post('/', requireAuth, (req, res) => maintenanceTaskController.ingest(req, res));

// Maintenance Request Queue & Filtering
router.get('/', requireAuth, (req, res) => maintenanceTaskController.list(req, res));
router.get('/pending', requireAuth, (req, res) => maintenanceTaskController.listPending(req, res));
router.get('/summary', requireAuth, (req, res) => maintenanceTaskController.summary(req, res));
router.get('/:id', requireAuth, (req, res) => maintenanceTaskController.getById(req, res));
router.patch('/:id/status', requireAuth, requireRole('Planner', 'Admin'), (req, res) => maintenanceTaskController.updateStatus(req, res));

module.exports = router;
