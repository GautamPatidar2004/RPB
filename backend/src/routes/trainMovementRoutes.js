const express = require('express');
const trainMovementController = require('../controllers/trainMovementController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => trainMovementController.list(req, res));
router.get('/summary', requireAuth, (req, res) => trainMovementController.summary(req, res));
router.get('/:id', requireAuth, (req, res) => trainMovementController.getById(req, res));
router.patch('/:id/status', requireAuth, requireRole('Operations', 'Admin'), (req, res) => trainMovementController.updateStatus(req, res));

module.exports = router;
