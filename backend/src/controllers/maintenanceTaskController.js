const db = require('../config/db');

const VALID_TASK_STATUSES = [
    'PENDING',
    'SCHEDULED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
    'DEFERRED'
];

class MaintenanceTaskController {
    /**
     * GET /api/maintenance-tasks
     * Query params: corridor_id, asset_id, department_id, source_system, status, priority, criticality, required_by_before, required_by_after
     */
    async list(req, res) {
        try {
            const {
                corridor_id,
                asset_id,
                department_id,
                source_system,
                status,
                priority,
                criticality,
                required_by_before,
                required_by_after
            } = req.query;

            const queryText = `
                SELECT 
                    t.id, t.task_code, t.title, t.description, t.maintenance_type,
                    t.duration_minutes, t.priority, t.criticality, t.urgency,
                    t.required_by_date, t.status, t.power_block_required,
                    t.traffic_block_required, t.speed_restriction_kmph,
                    t.operational_constraints, t.external_record_id, t.synced_at,
                    t.created_at, t.updated_at,
                    c.id AS corridor_id, c.code AS corridor_code, c.name AS corridor_name,
                    a.id AS asset_id, a.asset_code, a.name AS asset_name, a.location AS asset_location,
                    d.id AS department_id, d.code AS department_code, d.name AS department_name,
                    s.code AS source_system
                FROM maintenance_tasks t
                JOIN corridors c ON t.corridor_id = c.id
                JOIN assets a ON t.asset_id = a.id
                JOIN departments d ON t.department_id = d.id
                JOIN integration_sources s ON t.source_system_id = s.id
                WHERE t.deleted_at IS NULL
                  AND ($1::uuid IS NULL OR t.corridor_id = $1)
                  AND ($2::uuid IS NULL OR t.asset_id = $2)
                  AND ($3::uuid IS NULL OR t.department_id = $3)
                  AND ($4::varchar IS NULL OR s.code = $4)
                  AND ($5::varchar IS NULL OR t.status = $5)
                  AND ($6::int IS NULL OR t.priority = $6)
                  AND ($7::varchar IS NULL OR t.criticality = $7)
                  AND ($8::timestamptz IS NULL OR t.required_by_date <= $8)
                  AND ($9::timestamptz IS NULL OR t.required_by_date >= $9)
                ORDER BY t.priority ASC, t.required_by_date ASC
            `;

            const params = [
                corridor_id || null,
                asset_id || null,
                department_id || null,
                source_system ? source_system.toUpperCase() : null,
                status ? status.toUpperCase() : null,
                priority ? parseInt(priority, 10) : null,
                criticality ? criticality.toUpperCase() : null,
                required_by_before || null,
                required_by_after || null
            ];

            const { rows } = await db.query(queryText, params);
            return res.status(200).json({
                success: true,
                count: rows.length,
                data: rows
            });
        } catch (err) {
            console.error('[MaintenanceTaskController.list]:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch maintenance tasks' });
        }
    }

    /**
     * GET /api/maintenance-tasks/summary
     */
    async summary(req, res) {
        try {
            const queryText = `
                SELECT 
                    COUNT(*)::int AS total_tasks,
                    COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_count,
                    COUNT(*) FILTER (WHERE status = 'SCHEDULED')::int AS scheduled_count,
                    COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress_count,
                    COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_count,
                    COUNT(*) FILTER (WHERE priority = 1)::int AS priority_1_urgent_count,
                    COUNT(*) FILTER (WHERE power_block_required = TRUE)::int AS power_block_tasks,
                    COUNT(*) FILTER (WHERE traffic_block_required = TRUE)::int AS traffic_block_tasks
                FROM maintenance_tasks
                WHERE deleted_at IS NULL
            `;

            const { rows } = await db.query(queryText, []);
            return res.status(200).json({
                success: true,
                summary: rows[0] || {}
            });
        } catch (err) {
            console.error('[MaintenanceTaskController.summary]:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch maintenance tasks summary' });
        }
    }

    /**
     * GET /api/maintenance-tasks/:id
     */
    async getById(req, res) {
        try {
            const { id } = req.params;
            const queryText = `
                SELECT 
                    t.id, t.task_code, t.title, t.description, t.maintenance_type,
                    t.duration_minutes, t.priority, t.criticality, t.urgency,
                    t.required_by_date, t.status, t.power_block_required,
                    t.traffic_block_required, t.speed_restriction_kmph,
                    t.operational_constraints, t.external_record_id, t.synced_at,
                    t.created_at, t.updated_at,
                    c.id AS corridor_id, c.code AS corridor_code, c.name AS corridor_name,
                    a.id AS asset_id, a.asset_code, a.name AS asset_name, a.location AS asset_location,
                    d.id AS department_id, d.code AS department_code, d.name AS department_name,
                    s.code AS source_system
                FROM maintenance_tasks t
                JOIN corridors c ON t.corridor_id = c.id
                JOIN assets a ON t.asset_id = a.id
                JOIN departments d ON t.department_id = d.id
                JOIN integration_sources s ON t.source_system_id = s.id
                WHERE t.id = $1 AND t.deleted_at IS NULL
            `;

            const { rows } = await db.query(queryText, [id]);
            if (rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Maintenance task not found' });
            }

            return res.status(200).json({ success: true, data: rows[0] });
        } catch (err) {
            console.error('[MaintenanceTaskController.getById]:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch maintenance task' });
        }
    }

    /**
     * PATCH /api/maintenance-tasks/:id/status
     * Body: { status: 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'DEFERRED' }
     */
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body || {};

            if (!status || !VALID_TASK_STATUSES.includes(status.toUpperCase())) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid status. Allowed values: [${VALID_TASK_STATUSES.join(', ')}]`
                });
            }

            const queryText = `
                UPDATE maintenance_tasks
                SET status = $1, updated_at = NOW()
                WHERE id = $2 AND deleted_at IS NULL
                RETURNING id, task_code, title, status, updated_at
            `;

            const { rows } = await db.query(queryText, [status.toUpperCase(), id]);
            if (rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Maintenance task not found' });
            }

            return res.status(200).json({
                success: true,
                message: `Maintenance task status updated to ${rows[0].status}`,
                data: rows[0]
            });
        } catch (err) {
            console.error('[MaintenanceTaskController.updateStatus]:', err);
            return res.status(500).json({ success: false, error: 'Failed to update maintenance task status' });
        }
    }
}

module.exports = new MaintenanceTaskController();
