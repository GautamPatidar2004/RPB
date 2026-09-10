const express = require('express');
const syncController = require('../controllers/syncController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

// Synchronize sources: Admin, Operations, or Planner can trigger
router.post('/trigger/:source', requireAuth, requireRole('Admin', 'Operations', 'Planner'), (req, res) => syncController.triggerSync(req, res));
router.post('/trigger', requireAuth, requireRole('Admin', 'Operations', 'Planner'), (req, res) => syncController.triggerSync(req, res));
router.post('/:source', requireAuth, requireRole('Admin', 'Operations', 'Planner'), (req, res) => syncController.triggerSync(req, res));

// Monitoring and Audit: Any authenticated railway user can read
router.get('/status', requireAuth, (req, res) => syncController.getStatus(req, res));
router.get('/history', requireAuth, (req, res) => syncController.getHistory(req, res));
router.get('/sources', requireAuth, (req, res) => syncController.getSources(req, res));

module.exports = router;
