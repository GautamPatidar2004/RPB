const db = require('../config/db');

const VALID_TRAIN_STATUSES = [
    'SCHEDULED',
    'RUNNING',
    'DIVERTED',
    'REGULATED',
    'CANCELLED',
    'TERMINATED'
];

class TrainMovementController {
    /**
     * GET /api/train-movements
     * Query params: corridor_id, source_system, train_type, priority, direction, status, start_time_after, end_time_before, search
     */
    async list(req, res) {
        try {
            const {
                corridor_id,
                source_system,
                train_type,
                priority,
                direction,
                status,
                start_time_after,
                end_time_before,
                search
            } = req.query;

            const queryText = `
                SELECT 
                    m.id, m.train_number, m.service_identifier, m.scheduled_start_time,
                    m.scheduled_end_time, m.direction, m.train_type, m.priority,
                    m.status, m.operational_details, m.external_record_id,
                    m.created_at, m.updated_at,
                    c.id AS corridor_id, c.code AS corridor_code, c.name AS corridor_name,
                    s.code AS source_system
                FROM train_movements m
                JOIN corridors c ON m.corridor_id = c.id
                JOIN integration_sources s ON m.source_system_id = s.id
                WHERE ($1::uuid IS NULL OR m.corridor_id = $1)
                  AND ($2::varchar IS NULL OR s.code = $2)
                  AND ($3::varchar IS NULL OR m.train_type = $3)
                  AND ($4::int IS NULL OR m.priority = $4)
                  AND ($5::varchar IS NULL OR m.direction = $5)
                  AND ($6::varchar IS NULL OR m.status = $6)
                  AND ($7::timestamptz IS NULL OR m.scheduled_start_time >= $7)
                  AND ($8::timestamptz IS NULL OR m.scheduled_end_time <= $8)
                  AND ($9::varchar IS NULL OR (m.train_number ILIKE $9 OR m.service_identifier ILIKE $9))
                ORDER BY m.scheduled_start_time ASC
            `;

            const params = [
                corridor_id || null,
                source_system ? source_system.toUpperCase() : null,
                train_type ? train_type.toUpperCase() : null,
                priority ? parseInt(priority, 10) : null,
                direction ? direction.toUpperCase() : null,
                status ? status.toUpperCase() : null,
                start_time_after || null,
                end_time_before || null,
                search ? `%${search}%` : null
            ];

            const { rows } = await db.query(queryText, params);
            return res.status(200).json({
                success: true,
                count: rows.length,
                data: rows
            });
        } catch (err) {
            console.error('[TrainMovementController.list]:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch train movements' });
        }
    }

    /**
     * GET /api/train-movements/summary
     */
    async summary(req, res) {
        try {
            const queryText = `
                SELECT 
                    COUNT(*)::int AS total_trains,
                    COUNT(*) FILTER (WHERE status = 'SCHEDULED')::int AS scheduled_count,
                    COUNT(*) FILTER (WHERE status = 'RUNNING')::int AS running_count,
                    COUNT(*) FILTER (WHERE status = 'REGULATED')::int AS regulated_count,
                    COUNT(*) FILTER (WHERE status = 'DIVERTED')::int AS diverted_count,
                    COUNT(*) FILTER (WHERE priority = 1)::int AS high_priority_trains
                FROM train_movements
            `;

            const { rows } = await db.query(queryText, []);
            return res.status(200).json({
                success: true,
                summary: rows[0] || {}
            });
        } catch (err) {
            console.error('[TrainMovementController.summary]:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch train movements summary' });
        }
    }

    /**
     * GET /api/train-movements/:id
     */
    async getById(req, res) {
        try {
            const { id } = req.params;
            const queryText = `
                SELECT 
                    m.id, m.train_number, m.service_identifier, m.scheduled_start_time,
                    m.scheduled_end_time, m.direction, m.train_type, m.priority,
                    m.status, m.operational_details, m.external_record_id,
                    m.created_at, m.updated_at,
                    c.id AS corridor_id, c.code AS corridor_code, c.name AS corridor_name,
                    s.code AS source_system
                FROM train_movements m
                JOIN corridors c ON m.corridor_id = c.id
                JOIN integration_sources s ON m.source_system_id = s.id
                WHERE m.id = $1
            `;

            const { rows } = await db.query(queryText, [id]);
            if (rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Train movement not found' });
            }

            return res.status(200).json({ success: true, data: rows[0] });
        } catch (err) {
            console.error('[TrainMovementController.getById]:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch train movement' });
        }
    }

    /**
     * PATCH /api/train-movements/:id/status
     * Body: { status: 'SCHEDULED' | 'RUNNING' | 'DIVERTED' | 'REGULATED' | 'CANCELLED' | 'TERMINATED' }
     */
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body || {};

            if (!status || !VALID_TRAIN_STATUSES.includes(status.toUpperCase())) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid status. Allowed values: [${VALID_TRAIN_STATUSES.join(', ')}]`
                });
            }

            const queryText = `
                UPDATE train_movements
                SET status = $1, updated_at = NOW()
                WHERE id = $2
                RETURNING id, train_number, service_identifier, status, updated_at
            `;

            const { rows } = await db.query(queryText, [status.toUpperCase(), id]);
            if (rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Train movement not found' });
            }

            return res.status(200).json({
                success: true,
                message: `Train movement status updated to ${rows[0].status}`,
                data: rows[0]
            });
        } catch (err) {
            console.error('[TrainMovementController.updateStatus]:', err);
            return res.status(500).json({ success: false, error: 'Failed to update train movement status' });
        }
    }
}

module.exports = new TrainMovementController();
