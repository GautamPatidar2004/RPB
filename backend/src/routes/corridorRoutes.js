const express = require('express');
const corridorController = require('../controllers/corridorController');
const { requireAuth } = require('../middlewares/authMiddleware');

const router = express.Router();

// Public/Auth routes for Corridors
router.get('/', requireAuth, (req, res) => corridorController.list(req, res));
router.get('/summary', requireAuth, (req, res) => corridorController.summary(req, res));
router.get('/:id', requireAuth, (req, res) => corridorController.getById(req, res));

module.exports = router;
