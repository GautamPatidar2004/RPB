const express = require('express');
const blockWindowController = require('../controllers/blockWindowController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => blockWindowController.list(req, res));
router.get('/summary', requireAuth, (req, res) => blockWindowController.summary(req, res));
router.get('/:id', requireAuth, (req, res) => blockWindowController.getById(req, res));
router.patch('/:id/status', requireAuth, requireRole('Operations', 'Admin'), (req, res) => blockWindowController.updateStatus(req, res));

module.exports = router;
