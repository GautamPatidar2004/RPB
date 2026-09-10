const db = require('../config/db');

const VALID_HEALTH_STATUSES = [
    'OPERATIONAL',
    'DEGRADED',
    'MAINTENANCE_REQUIRED',
    'UNDER_MAINTENANCE',
    'FAILED',
    'DECOMMISSIONED'
];

class AssetController {
    /**
     * GET /api/assets
     * Query params: corridor_id, asset_type, criticality, health_status, source_system, search
     */
    async list(req, res) {
        try {
            const { corridor_id, asset_type, criticality, health_status, source_system, search } = req.query;

            const queryText = `
                SELECT 
                    a.id, a.asset_code, a.asset_type, a.name, a.location,
                    a.start_kilometer, a.end_kilometer, a.criticality, a.health_status,
                    a.external_record_id, a.metadata, a.is_active, a.created_at, a.updated_at,
                    c.id AS corridor_id, c.code AS corridor_code, c.name AS corridor_name,
                    s.code AS source_system, s.name AS source_system_name
                FROM assets a
                JOIN corridors c ON a.corridor_id = c.id
                JOIN integration_sources s ON a.source_system_id = s.id
                WHERE ($1::uuid IS NULL OR a.corridor_id = $1)
                  AND ($2::varchar IS NULL OR a.asset_type = $2)
                  AND ($3::varchar IS NULL OR a.criticality = $3)
                  AND ($4::varchar IS NULL OR a.health_status = $4)
                  AND ($5::varchar IS NULL OR s.code = $5)
                  AND ($6::varchar IS NULL OR (a.name ILIKE $6 OR a.asset_code ILIKE $6 OR a.location ILIKE $6))
                ORDER BY a.asset_code ASC
            `;

            const params = [
                corridor_id || null,
                asset_type || null,
                criticality ? criticality.toUpperCase() : null,
                health_status ? health_status.toUpperCase() : null,
                source_system ? source_system.toUpperCase() : null,
                search ? `%${search}%` : null
            ];

            const { rows } = await db.query(queryText, params);
            return res.status(200).json({
                success: true,
                count: rows.length,
                data: rows
            });
        } catch (err) {
            console.error('[AssetController.list]:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch assets' });
        }
    }

    /**
     * GET /api/assets/summary
     */
    async summary(req, res) {
        try {
            const queryText = `
                SELECT 
                    COUNT(*)::int AS total_assets,
                    COUNT(*) FILTER (WHERE health_status = 'OPERATIONAL')::int AS operational_count,
                    COUNT(*) FILTER (WHERE health_status IN ('MAINTENANCE_REQUIRED', 'DEGRADED'))::int AS maintenance_required_count,
                    COUNT(*) FILTER (WHERE health_status = 'UNDER_MAINTENANCE')::int AS under_maintenance_count,
                    COUNT(*) FILTER (WHERE criticality = 'CRITICAL')::int AS critical_assets_count,
                    COUNT(*) FILTER (WHERE criticality = 'HIGH')::int AS high_criticality_count
                FROM assets
            `;

            const { rows } = await db.query(queryText, []);
            return res.status(200).json({
                success: true,
                summary: rows[0] || {}
            });
        } catch (err) {
            console.error('[AssetController.summary]:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch assets summary' });
        }
    }

    /**
     * GET /api/assets/:id
     */
    async getById(req, res) {
        try {
            const { id } = req.params;
            const queryText = `
                SELECT 
                    a.id, a.asset_code, a.asset_type, a.name, a.location,
                    a.start_kilometer, a.end_kilometer, a.criticality, a.health_status,
                    a.external_record_id, a.metadata, a.is_active, a.created_at, a.updated_at,
                    c.id AS corridor_id, c.code AS corridor_code, c.name AS corridor_name,
                    s.code AS source_system, s.name AS source_system_name
                FROM assets a
                JOIN corridors c ON a.corridor_id = c.id
                JOIN integration_sources s ON a.source_system_id = s.id
                WHERE a.id = $1
            `;

            const { rows } = await db.query(queryText, [id]);
            if (rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Asset not found' });
            }

            return res.status(200).json({ success: true, data: rows[0] });
        } catch (err) {
            console.error('[AssetController.getById]:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch asset' });
        }
    }

    /**
     * PATCH /api/assets/:id/health
     * Body: { health_status: 'OPERATIONAL' | 'DEGRADED' | 'MAINTENANCE_REQUIRED' | 'UNDER_MAINTENANCE' | 'FAILED' | 'DECOMMISSIONED' }
     */
    async updateHealthStatus(req, res) {
        try {
            const { id } = req.params;
            const { health_status } = req.body || {};

            if (!health_status || !VALID_HEALTH_STATUSES.includes(health_status.toUpperCase())) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid health_status. Allowed values: [${VALID_HEALTH_STATUSES.join(', ')}]`
                });
            }

            const queryText = `
                UPDATE assets
                SET health_status = $1, updated_at = NOW()
                WHERE id = $2
                RETURNING id, asset_code, name, health_status, updated_at
            `;

            const { rows } = await db.query(queryText, [health_status.toUpperCase(), id]);
            if (rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Asset not found' });
            }

            return res.status(200).json({
                success: true,
                message: `Asset health status updated to ${rows[0].health_status}`,
                data: rows[0]
            });
        } catch (err) {
            console.error('[AssetController.updateHealthStatus]:', err);
            return res.status(500).json({ success: false, error: 'Failed to update asset health status' });
        }
    }
}

module.exports = new AssetController();
