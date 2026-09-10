const syncGatewayService = require('../services/syncGatewayService');

class SyncController {
    /**
     * POST /api/sync/trigger/:source?
     * Trigger sync for a specific source (TMS, SMMS, TDMS, COA, BDMS) or ALL
     */
    async triggerSync(req, res) {
        try {
            const sourceParam = req.params.source || (req.body && req.body.source);

            if (!sourceParam || sourceParam.toUpperCase() === 'ALL') {
                const results = await syncGatewayService.syncAll();
                return res.status(200).json({
                    success: true,
                    message: 'Synchronization triggered across all active Railway sources',
                    results
                });
            }

            const result = await syncGatewayService.syncSource(sourceParam);
            return res.status(200).json({
                success: true,
                message: `Source [${sourceParam.toUpperCase()}] synchronized successfully`,
                result
            });
        } catch (err) {
            console.error('[SyncController.triggerSync]:', err);
            return res.status(400).json({
                success: false,
                error: err.message || 'Synchronization failed'
            });
        }
    }

    /**
     * GET /api/sync/status
     */
    async getStatus(req, res) {
        try {
            const status = await syncGatewayService.getSyncStatus();
            return res.status(200).json({
                success: true,
                sources: status
            });
        } catch (err) {
            console.error('[SyncController.getStatus]:', err);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch sync status'
            });
        }
    }

    /**
     * GET /api/sync/history
     * Query params: source, status
     */
    async getHistory(req, res) {
        try {
            const history = await syncGatewayService.getSyncHistory(req.query);
            return res.status(200).json({
                success: true,
                count: history.length,
                history
            });
        } catch (err) {
            console.error('[SyncController.getHistory]:', err);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch sync history'
            });
        }
    }

    /**
     * GET /api/sync/sources
     */
    async getSources(req, res) {
        try {
            const sources = await syncGatewayService.getSources();
            return res.status(200).json({
                success: true,
                count: sources.length,
                sources
            });
        } catch (err) {
            console.error('[SyncController.getSources]:', err);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch integration sources'
            });
        }
    }
}

module.exports = new SyncController();
