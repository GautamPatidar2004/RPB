const db = require('../config/db');

const VALID_WINDOW_STATUSES = [
    'AVAILABLE',
    'RESERVED',
    'CONFIRMED',
    'UTILIZED',
    'CANCELLED',
    'RESCHEDULED'
];

class BlockWindowController {
    /**
     * GET /api/block-windows
     * Query params: corridor_id, source_system, block_type, availability_status, start_time_after, end_time_before
     */
    async list(req, res) {
        try {
            const {
                corridor_id,
                source_system,
                block_type,
                availability_status,
                start_time_after,
                end_time_before
            } = req.query;

            const queryText = `
                SELECT 
                    w.id, w.start_time, w.end_time, w.duration_minutes,
                    w.availability_status, w.block_type, w.line_designation,
                    w.start_kilometer, w.end_kilometer, w.operational_constraints,
                    w.external_record_id, w.created_at, w.updated_at,
                    c.id AS corridor_id, c.code AS corridor_code, c.name AS corridor_name,
                    s.code AS source_system
                FROM block_windows w
                JOIN corridors c ON w.corridor_id = c.id
                JOIN integration_sources s ON w.source_system_id = s.id
                WHERE ($1::uuid IS NULL OR w.corridor_id = $1)
                  AND ($2::varchar IS NULL OR s.code = $2)
                  AND ($3::varchar IS NULL OR w.block_type = $3)
                  AND ($4::varchar IS NULL OR w.availability_status = $4)
                  AND ($5::timestamptz IS NULL OR w.start_time >= $5)
                  AND ($6::timestamptz IS NULL OR w.end_time <= $6)
                ORDER BY w.start_time ASC
            `;

            const params = [
                corridor_id || null,
                source_system ? source_system.toUpperCase() : null,
                block_type ? block_type.toUpperCase() : null,
                availability_status ? availability_status.toUpperCase() : null,
                start_time_after || null,
                end_time_before || null
            ];

            const { rows } = await db.query(queryText, params);
            return res.status(200).json({
                success: true,
                count: rows.length,
                data: rows
            });
        } catch (err) {
            console.error('[BlockWindowController.list]:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch block windows' });
        }
    }

    /**
     * GET /api/block-windows/summary
     */
    async summary(req, res) {
        try {
            const queryText = `
                SELECT 
                    COUNT(*)::int AS total_windows,
                    COUNT(*) FILTER (WHERE availability_status = 'AVAILABLE')::int AS available_windows,
                    COUNT(*) FILTER (WHERE availability_status = 'RESERVED')::int AS reserved_windows,
                    COUNT(*) FILTER (WHERE availability_status = 'UTILIZED')::int AS utilized_windows,
                    COALESCE(SUM(duration_minutes) FILTER (WHERE availability_status = 'AVAILABLE'), 0)::int AS total_available_duration_minutes
                FROM block_windows
            `;

            const { rows } = await db.query(queryText, []);
            return res.status(200).json({
                success: true,
                summary: rows[0] || {}
            });
        } catch (err) {
            console.error('[BlockWindowController.summary]:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch block windows summary' });
        }
    }

    /**
     * GET /api/block-windows/:id
     */
    async getById(req, res) {
        try {
            const { id } = req.params;
            const queryText = `
                SELECT 
                    w.id, w.start_time, w.end_time, w.duration_minutes,
                    w.availability_status, w.block_type, w.line_designation,
                    w.start_kilometer, w.end_kilometer, w.operational_constraints,
                    w.external_record_id, w.created_at, w.updated_at,
                    c.id AS corridor_id, c.code AS corridor_code, c.name AS corridor_name,
                    s.code AS source_system
                FROM block_windows w
                JOIN corridors c ON w.corridor_id = c.id
                JOIN integration_sources s ON w.source_system_id = s.id
                WHERE w.id = $1
            `;

            const { rows } = await db.query(queryText, [id]);
            if (rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Block window not found' });
            }

            return res.status(200).json({ success: true, data: rows[0] });
        } catch (err) {
            console.error('[BlockWindowController.getById]:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch block window' });
        }
    }

    /**
     * PATCH /api/block-windows/:id/status
     * Body: { availability_status: 'AVAILABLE' | 'RESERVED' | 'CONFIRMED' | 'UTILIZED' | 'CANCELLED' | 'RESCHEDULED' }
     */
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const availability_status = req.body?.availability_status || req.body?.availabilityStatus;

            if (!availability_status || !VALID_WINDOW_STATUSES.includes(availability_status.toUpperCase())) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid availability_status. Allowed values: [${VALID_WINDOW_STATUSES.join(', ')}]`
                });
            }

            const queryText = `
                UPDATE block_windows
                SET availability_status = $1, updated_at = NOW()
                WHERE id = $2
                RETURNING id, availability_status, duration_minutes, updated_at
            `;

            const { rows } = await db.query(queryText, [availability_status.toUpperCase(), id]);
            if (rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Block window not found' });
            }

            return res.status(200).json({
                success: true,
                message: `Block window status updated to ${rows[0].availability_status}`,
                data: rows[0]
            });
        } catch (err) {
            console.error('[BlockWindowController.updateStatus]:', err);
            return res.status(500).json({ success: false, error: 'Failed to update block window status' });
        }
    }
}

module.exports = new BlockWindowController();
