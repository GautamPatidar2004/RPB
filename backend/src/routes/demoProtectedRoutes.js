const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * Route accessible ONLY to Planner and Admin
 */
router.get('/planner/dashboard', requireAuth, requireRole('Planner', 'Admin'), (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Access granted to Planner Dashboard',
        user: req.user,
        scope: 'MAINTENANCE_TASK_PLANNING'
    });
});

/**
 * Route accessible ONLY to Operations and Admin
 */
router.get('/operations/dispatch', requireAuth, requireRole('Operations', 'Admin'), (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Access granted to Operations Dispatch Console',
        user: req.user,
        scope: 'SECTION_CONTROL_AND_TRAIN_DISPATCH'
    });
});

/**
 * Route accessible ONLY to Admin
 */
router.get('/admin/settings', requireAuth, requireRole('Admin'), (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Access granted to System Administration Settings',
        user: req.user,
        scope: 'SYSTEM_CONFIGURATION_AND_AUDIT'
    });
});

/**
 * Route accessible to ANY authenticated user (Planner, Operations, Admin)
 */
router.get('/shared/status', requireAuth, (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Access granted to Shared Operational Status',
        user: req.user,
        scope: 'GENERAL_CORRIDOR_OVERVIEW'
    });
});

module.exports = router;
