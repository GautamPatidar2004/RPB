const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middlewares/authMiddleware');

const router = express.Router();

// Public auth endpoints
router.post('/login', (req, res) => authController.login(req, res));
router.get('/demo-accounts', (req, res) => authController.getDemoAccounts(req, res));

// Authenticated session endpoints
router.post('/logout', requireAuth, (req, res) => authController.logout(req, res));
router.get('/me', requireAuth, (req, res) => authController.getCurrentUser(req, res));

module.exports = router;
