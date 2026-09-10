const express = require('express');
const assetController = require('../controllers/assetController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => assetController.list(req, res));
router.get('/summary', requireAuth, (req, res) => assetController.summary(req, res));
router.get('/:id', requireAuth, (req, res) => assetController.getById(req, res));
router.patch('/:id/health', requireAuth, requireRole('Planner', 'Operations', 'Admin'), (req, res) => assetController.updateHealthStatus(req, res));

module.exports = router;
