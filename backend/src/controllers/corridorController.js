const db = require('../config/db');

class CorridorController {
    /**
     * GET /api/corridors
     * Query params: zone, division, electrified, is_active
     */
    async list(req, res) {
        try {
            const { zone, division, electrified, is_active } = req.query;

            const queryText = `
                SELECT 
                    id, code, name, zone, division, start_station, end_station,
                    start_kilometer, end_kilometer, total_length_km, line_type,
                    electrified, is_active, created_at, updated_at
                FROM corridors
                WHERE ($1::varchar IS NULL OR zone = $1)
                  AND ($2::varchar IS NULL OR division = $2)
                  AND ($3::boolean IS NULL OR electrified = $3)
                  AND ($4::boolean IS NULL OR is_active = $4)
                ORDER BY code ASC
            `;

            const params = [
                zone || null,
                division || null,
                electrified !== undefined ? electrified === 'true' : null,
                is_active !== undefined ? is_active === 'true' : null
            ];

            const { rows } = await db.query(queryText, params);
            return res.status(200).json({
                success: true,
                count: rows.length,
                data: rows
            });
        } catch (err) {
            console.error('[CorridorController.list]:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch corridors' });
        }
    }

    /**
     * GET /api/corridors/summary
     */
    async summary(req, res) {
        try {
            const queryText = `
                SELECT 
                    COUNT(*)::int AS total_corridors,
                    COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active_corridors,
                    COUNT(*) FILTER (WHERE electrified = TRUE)::int AS electrified_corridors,
                    COALESCE(SUM(total_length_km), 0)::numeric(10, 2) AS total_track_length_km
                FROM corridors
            `;

            const { rows } = await db.query(queryText, []);
            return res.status(200).json({
                success: true,
                summary: rows[0] || {
                    total_corridors: 0,
                    active_corridors: 0,
                    electrified_corridors: 0,
                    total_track_length_km: '0.00'
                }
            });
        } catch (err) {
            console.error('[CorridorController.summary]:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch corridors summary' });
        }
    }

    /**
     * GET /api/corridors/:id
     */
    async getById(req, res) {
        try {
            const { id } = req.params;
            const queryText = `
                SELECT 
                    id, code, name, zone, division, start_station, end_station,
                    start_kilometer, end_kilometer, total_length_km, line_type,
                    electrified, is_active, created_at, updated_at
                FROM corridors
                WHERE id = $1
            `;

            const { rows } = await db.query(queryText, [id]);
            if (rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Corridor not found' });
            }

            return res.status(200).json({ success: true, data: rows[0] });
        } catch (err) {
            console.error('[CorridorController.getById]:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch corridor' });
        }
    }
}

module.exports = new CorridorController();
