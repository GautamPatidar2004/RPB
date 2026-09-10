const aiGatewayService = require('../services/aiGatewayService');

class AIGatewayController {
    /**
     * GET /api/v1/ai/planning-data
     * Return all datasets needed by the AI planning engine
     */
    async getPlanningData(req, res) {
        try {
            const data = await aiGatewayService.getPlanningData(req.query);
            return res.status(200).json(data);
        } catch (err) {
            console.error('[AIGatewayController.getPlanningData]:', err);
            return res.status(400).json({
                success: false,
                error: err.message || 'Failed to extract AI planning data'
            });
        }
    }

    /**
     * POST /api/v1/ai/plans
     * Ingest and validate an AI-generated block plan
     */
    async createPlan(req, res) {
        try {
            const result = await aiGatewayService.createPlan(req.body, req.user);
            return res.status(201).json(result);
        } catch (err) {
            console.error('[AIGatewayController.createPlan]:', err);
            return res.status(400).json({
                success: false,
                error: err.message || 'Failed to validate and register AI plan'
            });
        }
    }

    /**
     * GET /api/v1/ai/plans/:id
     * Retrieve complete plan details, task assignments, and detected conflicts
     */
    async getPlan(req, res) {
        try {
            const plan = await aiGatewayService.getPlanById(req.params.id);
            if (!plan) {
                return res.status(404).json({
                    success: false,
                    error: 'Block plan not found'
                });
            }
            return res.status(200).json({
                success: true,
                plan
            });
        } catch (err) {
            console.error('[AIGatewayController.getPlan]:', err);
            return res.status(500).json({
                success: false,
                error: 'Failed to retrieve block plan'
            });
        }
    }

    /**
     * GET /api/v1/ai/plans
     * List all registered block plans
     */
    async listPlans(req, res) {
        try {
            const plans = await aiGatewayService.listPlans(req.query);
            return res.status(200).json({
                success: true,
                count: plans.length,
                plans
            });
        } catch (err) {
            console.error('[AIGatewayController.listPlans]:', err);
            return res.status(500).json({
                success: false,
                error: 'Failed to list block plans'
            });
        }
    }
}

module.exports = new AIGatewayController();
