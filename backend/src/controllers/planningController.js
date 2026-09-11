const planningService = require('../services/planningService');
const aiPlanningBridge = require('../services/aiPlanningBridge');

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

    /**
     * POST /planning-runs or POST /api/plans/planning-runs
     * Creates a planning run.
     * - If execute_now !== false: runs full pipeline immediately.
     * - If execute_now === false: creates run, locks tasks into PLANNING state, and returns run ID.
     */
    async createPlanningRun(req, res) {
        try {
            const executeNow = req.body.execute_now !== false && req.body.executeNow !== false;
            let result;

            if (executeNow) {
                result = await aiPlanningBridge.executePlanningRun(req.body, req.user);
                const statusCode = result.isDuplicate ? 200 : (result.success ? 201 : 422);
                return res.status(statusCode).json(result);
            } else {
                result = await aiPlanningBridge.createPlanningRun(req.body, req.user);
                const statusCode = result.isDuplicate ? 200 : 201;
                return res.status(statusCode).json(result);
            }
        } catch (err) {
            console.error('[PlanningController.createPlanningRun]:', err);
            const status = err.statusCode || 400;
            return res.status(status).json({
                success: false,
                error: err.message || 'Failed to create planning run'
            });
        }
    }

    /**
     * POST /planning-runs/:id/generate or POST /api/plans/planning-runs/:id/generate
     * Triggers AI generation for an existing planning run
     */
    async generatePlanForRun(req, res) {
        try {
            const runId = req.params.id || req.params.runId;
            const result = await aiPlanningBridge.generatePlanForRun(runId, req.body, req.user);
            const statusCode = result.success ? 200 : 422;
            return res.status(statusCode).json(result);
        } catch (err) {
            console.error('[PlanningController.generatePlanForRun]:', err);
            const status = err.statusCode || 400;
            return res.status(status).json({
                success: false,
                error: err.message || 'Failed to generate plan for run'
            });
        }
    }

    /**
     * GET /planning-runs or GET /api/plans/planning-runs
     * List planning runs with optional corridor and status filters
     */
    async listPlanningRuns(req, res) {
        try {
            const runs = await aiPlanningBridge.listPlanningRuns(req.query);
            return res.status(200).json({
                success: true,
                count: runs.length,
                data: runs
            });
        } catch (err) {
            console.error('[PlanningController.listPlanningRuns]:', err);
            return res.status(500).json({
                success: false,
                error: 'Failed to list planning runs'
            });
        }
    }

    /**
     * GET /planning-runs/:id or GET /api/plans/planning-runs/:runId
     * Retrieve details and plan results of a specific planning run
     */
    async getPlanningRun(req, res) {
        try {
            const runId = req.params.runId || req.params.id;
            const run = await aiPlanningBridge.getPlanningRunById(runId);
            if (!run) {
                return res.status(404).json({
                    success: false,
                    error: `Planning run [${runId}] not found`
                });
            }
            return res.status(200).json({
                success: true,
                data: run
            });
        } catch (err) {
            console.error('[PlanningController.getPlanningRun]:', err);
            return res.status(500).json({
                success: false,
                error: 'Failed to retrieve planning run'
            });
        }
    }
}

module.exports = new PlanningController();
