const planningService = require('../services/planningService');

class PlanningController {
    /**
     * POST /api/plans/generate
     * Generate an AI Planning job / request for corridor and horizon (weekly/monthly/custom)
     */
    async requestPlanningJob(req, res) {
        try {
            const reqMeta = {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent']
            };
            const result = await planningService.requestPlanningJob(req.body, req.user, reqMeta);
            return res.status(201).json(result);
        } catch (err) {
            console.error('[PlanningController.requestPlanningJob]:', err);
            return res.status(400).json({
                success: false,
                error: err.message || 'Failed to generate planning job'
            });
        }
    }

    /**
     * GET /api/plans
     * List plans with weekly/monthly and date-range filters
     */
    async getPlans(req, res) {
        try {
            const filters = {
                corridorId: req.query.corridor_id || req.query.corridorId,
                corridorCode: req.query.corridor_code || req.query.corridorCode,
                status: req.query.status,
                approvalState: req.query.approval_state || req.query.approvalState,
                horizonMode: req.query.horizon_mode || req.query.horizonMode,
                startDate: req.query.start_date || req.query.startDate,
                endDate: req.query.end_date || req.query.endDate
            };
            const plans = await planningService.getPlans(filters);
            return res.status(200).json({
                success: true,
                count: plans.length,
                data: plans
            });
        } catch (err) {
            console.error('[PlanningController.getPlans]:', err);
            return res.status(500).json({
                success: false,
                error: 'Failed to list block plans'
            });
        }
    }

    /**
     * GET /api/plans/:id
     * Full plan details (tasks, block windows, conflicts, metrics, approvals)
     */
    async getPlanDetails(req, res) {
        try {
            const { id } = req.params;
            const plan = await planningService.getPlanDetails(id);
            if (!plan) {
                return res.status(404).json({
                    success: false,
                    error: `Block plan [${id}] not found`
                });
            }
            return res.status(200).json({
                success: true,
                data: plan
            });
        } catch (err) {
            console.error('[PlanningController.getPlanDetails]:', err);
            return res.status(500).json({
                success: false,
                error: 'Failed to retrieve plan details'
            });
        }
    }

    /**
     * POST /api/plans/:id/approve
     * Planner / Operations action to approve block plan
     */
    async approvePlan(req, res) {
        try {
            const { id } = req.params;
            const reqMeta = {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent']
            };
            const result = await planningService.approvePlan(id, req.body, req.user, reqMeta);
            return res.status(200).json(result);
        } catch (err) {
            console.error('[PlanningController.approvePlan]:', err);
            return res.status(400).json({
                success: false,
                error: err.message || 'Failed to approve block plan'
            });
        }
    }

    /**
     * POST /api/plans/:id/reject
     * Planner / Operations action to reject block plan
     */
    async rejectPlan(req, res) {
        try {
            const { id } = req.params;
            const reqMeta = {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent']
            };
            const result = await planningService.rejectPlan(id, req.body, req.user, reqMeta);
            return res.status(200).json(result);
        } catch (err) {
            console.error('[PlanningController.rejectPlan]:', err);
            return res.status(400).json({
                success: false,
                error: err.message || 'Failed to reject block plan'
            });
        }
    }

    /**
     * PUT /api/plans/:id/modify
     * Planner action to modify block plan (task allocations, timings, sequence)
     */
    async modifyPlan(req, res) {
        try {
            const { id } = req.params;
            const reqMeta = {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent']
            };
            const result = await planningService.modifyPlan(id, req.body, req.user, reqMeta);
            return res.status(200).json(result);
        } catch (err) {
            console.error('[PlanningController.modifyPlan]:', err);
            return res.status(400).json({
                success: false,
                error: err.message || 'Failed to modify block plan'
            });
        }
    }

    /**
     * PATCH /api/plans/:id/conflicts/:conflictId
     * Resolve / update status of a conflict
     */
    async updateConflictStatus(req, res) {
        try {
            const { id, conflictId } = req.params;
            const reqMeta = {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent']
            };
            const result = await planningService.updateConflictStatus(id, conflictId, req.body, req.user, reqMeta);
            return res.status(200).json(result);
        } catch (err) {
            console.error('[PlanningController.updateConflictStatus]:', err);
            return res.status(400).json({
                success: false,
                error: err.message || 'Failed to update conflict status'
            });
        }
    }

    /**
     * GET /api/plans/:id/audit-logs
     * Inspect audit trail for a plan
     */
    async getPlanAuditLogs(req, res) {
        try {
            const { id } = req.params;
            const logs = await planningService.getPlanAuditLogs(id);
            return res.status(200).json({
                success: true,
                count: logs.length,
                data: logs
            });
        } catch (err) {
            console.error('[PlanningController.getPlanAuditLogs]:', err);
            return res.status(500).json({
                success: false,
                error: 'Failed to retrieve plan audit logs'
            });
        }
    }
}

module.exports = new PlanningController();
