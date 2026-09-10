const express = require('express');
const maintenanceTaskController = require('../controllers/maintenanceTaskController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => maintenanceTaskController.list(req, res));
router.get('/summary', requireAuth, (req, res) => maintenanceTaskController.summary(req, res));
router.get('/:id', requireAuth, (req, res) => maintenanceTaskController.getById(req, res));
router.patch('/:id/status', requireAuth, requireRole('Planner', 'Admin'), (req, res) => maintenanceTaskController.updateStatus(req, res));

module.exports = router;
