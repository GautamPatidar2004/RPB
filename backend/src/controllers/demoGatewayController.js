/**
 * DemoGatewayController
 * 
 * Endpoints for generating, inspecting, and querying simulated external railway data.
 */

const demoGatewayService = require('../services/demoGateway/demoGatewayService');

class DemoGatewayController {
    /**
     * POST /api/demo/generate
     * Generate configurable demo data across BDMS, TDMS, SMMS, and COA
     */
    async generate(req, res) {
        try {
            const {
                corridorCode,
                requestCount,
                departmentDistribution,
                horizonStart,
                horizonEnd,
                seed,
                replaceExisting
            } = req.body || {};

            const result = await demoGatewayService.generateAndPersist({
                corridorCode,
                requestCount: requestCount ? parseInt(requestCount, 10) : undefined,
                departmentDistribution,
                horizonStart,
                horizonEnd,
                seed,
                replaceExisting: Boolean(replaceExisting)
            });

            return res.status(201).json(result);
        } catch (err) {
            console.error('[DemoGatewayController.generate]:', err.message);
            return res.status(400).json({
                success: false,
                error: err.message
            });
        }
    }

    /**
     * GET /api/demo/maintenance-requests
     * Query demo maintenance requests
     */
    async getMaintenanceRequests(req, res) {
        try {
            const result = await demoGatewayService.getMaintenanceRequests(req.query);
            return res.status(200).json({
                success: true,
                ...result
            });
        } catch (err) {
            console.error('[DemoGatewayController.getMaintenanceRequests]:', err.message);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }

    /**
     * GET /api/demo/assets
     * Query demo infrastructure assets
     */
    async getAssets(req, res) {
        try {
            const result = await demoGatewayService.getAssets(req.query);
            return res.status(200).json({
                success: true,
                ...result
            });
        } catch (err) {
            console.error('[DemoGatewayController.getAssets]:', err.message);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }

    /**
     * GET /api/demo/defects
     * Query demo defects and failures
     */
    async getDefects(req, res) {
        try {
            const result = await demoGatewayService.getDefects(req.query);
            return res.status(200).json({
                success: true,
                ...result
            });
        } catch (err) {
            console.error('[DemoGatewayController.getDefects]:', err.message);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }

    /**
     * GET /api/demo/trains
     * Query demo train operational schedules and movements
     */
    async getTrains(req, res) {
        try {
            const result = await demoGatewayService.getTrains(req.query);
            return res.status(200).json({
                success: true,
                ...result
            });
        } catch (err) {
            console.error('[DemoGatewayController.getTrains]:', err.message);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
}

module.exports = new DemoGatewayController();
