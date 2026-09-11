/**
 * DemoGatewayService
 * 
 * Orchestrates simulation generation, database persistence (PostgreSQL / memoryDb),
 * idempotency, selective replacement, and REST query endpoints.
 */

const db = require('../../config/db');
const demoDataSource = require('./demoDataSource');
const maintenanceIngestionService = require('../maintenanceIngestionService');

class DemoGatewayService {
    /**
     * Helper to resolve corridor ID by code or return default
     */
    async getCorridor(corridorCode = 'NDLS-CNB') {
        const { rows } = await db.query('SELECT id, code, name FROM corridors WHERE code = $1 LIMIT 1', [corridorCode]);
        if (rows.length > 0) return rows[0];
        const all = await db.query('SELECT id, code, name FROM corridors LIMIT 1', []);
        return all.rows.length > 0 ? all.rows[0] : null;
    }

    /**
     * Map departments to IDs
     */
    async getDepartmentMap() {
        const { rows } = await db.query('SELECT id, code FROM departments', []);
        const map = new Map();
        rows.forEach(d => map.set(d.code.toUpperCase(), d.id));
        return map;
    }

    /**
     * Map integration sources to IDs
     */
    async getSourceMap() {
        const { rows } = await db.query('SELECT id, code FROM integration_sources', []);
        const map = new Map();
        rows.forEach(s => map.set(s.code.toUpperCase(), s.id));
        return map;
    }

    /**
     * Generate realistic demo data and persist into database
     * @param {Object} options Generation options
     */
    async generateAndPersist(options = {}) {
        const {
            corridorCode = 'NDLS-CNB',
            replaceExisting = false
        } = options;

        const corridor = await this.getCorridor(corridorCode);
        if (!corridor) {
            throw new Error(`Corridor [${corridorCode}] not found in database.`);
        }

        const deptMap = await this.getDepartmentMap();
        const sourceMap = await this.getSourceMap();

        // 1. Generate realistic interconnected dataset
        const dataset = demoDataSource.generateDataset({
            ...options,
            corridorCode: corridor.code
        });

        // 2. If replacement requested, clear previous DEMO records for this corridor
        if (replaceExisting) {
            await db.query('DELETE FROM maintenance_tasks WHERE corridor_id = $1', [corridor.id]);
            await db.query('DELETE FROM block_windows WHERE corridor_id = $1', [corridor.id]);
            await db.query('DELETE FROM train_movements WHERE corridor_id = $1', [corridor.id]);
            await db.query('DELETE FROM defects WHERE corridor_id = $1', [corridor.id]);
        }

        const results = {
            assetsCreated: 0,
            defectsCreated: 0,
            tasksCreated: 0,
            windowsCreated: 0,
            trainsCreated: 0,
            dependenciesCreated: 0
        };

        const assetIdMap = new Map(); // assetCode -> UUID
        const taskIdMap = new Map();  // externalId -> UUID

        // 3. Persist Assets
        for (const a of dataset.assets) {
            const sourceId = sourceMap.get(a.sourceSystem) || sourceMap.get('DEMO') || sourceMap.get('BDMS') || sourceMap.get('TMS');
            if (!sourceId) continue;

            const res = await db.query(`
                INSERT INTO assets (
                    corridor_id, source_system_id, external_record_id, asset_code,
                    name, asset_type, location, start_kilometer, end_kilometer,
                    criticality, health_status, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (source_system_id, external_record_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    criticality = EXCLUDED.criticality,
                    health_status = EXCLUDED.health_status,
                    updated_at = NOW()
                RETURNING id, asset_code
            `, [
                corridor.id, sourceId, a.externalId, a.assetCode,
                a.name, a.assetType, a.location, a.startKm, a.endKm,
                a.criticality, a.healthStatus, a.metadata
            ]);

            if (res.rows.length > 0) {
                assetIdMap.set(a.assetCode, res.rows[0].id);
                results.assetsCreated++;
            }
        }

        // 4. Persist Defects
        for (const d of dataset.defects) {
            const sourceId = sourceMap.get(d.sourceSystem) || sourceMap.get('DEMO') || sourceMap.get('BDMS') || sourceMap.get('TMS');
            const deptId = deptMap.get(d.departmentCode) || deptMap.get('ENGG');
            const assetId = assetIdMap.get(d.assetCode) || null;

            const res = await db.query(`
                INSERT INTO defects (
                    external_record_id, defect_code, defect_type, severity,
                    description, component, failure_risk, status,
                    asset_id, corridor_id, department_id, source_system_id, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING id
            `, [
                d.externalId, d.defectCode, d.defectType, d.severity,
                d.description, d.component, d.failureRisk, d.status,
                assetId, corridor.id, deptId, sourceId,
                { dataSourceType: 'DEMO', sourceSystem: d.sourceSystem, reportedAt: d.reportedAt }
            ]);

            if (res.rows.length > 0) {
                results.defectsCreated++;
            }
        }

        // 5. Persist Maintenance Tasks through the standardized ingestion pipeline
        for (const t of dataset.maintenanceRequests) {
            const assetId = assetIdMap.get(t.asset.assetCode) || null;
            const ingested = await maintenanceIngestionService.ingestRequest({
                ...t,
                request_id: t.externalId,
                external_record_id: t.externalId,
                corridor_id: corridor.id,
                corridor_code: corridor.code,
                asset_id: assetId,
                status: t.status || 'PENDING'
            });

            if (ingested && ingested.id) {
                taskIdMap.set(t.externalId, ingested.id);
                results.tasksCreated++;
            }
        }

        // 6. Persist Block Windows
        for (const w of dataset.blockWindows) {
            const sourceId = sourceMap.get(w.sourceSystem) || sourceMap.get('DEMO') || sourceMap.get('COA');

            const res = await db.query(`
                INSERT INTO block_windows (
                    corridor_id, source_system_id, external_record_id,
                    start_time, end_time, duration_minutes, availability_status,
                    block_type, line_designation, start_kilometer, end_kilometer, operational_constraints
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (source_system_id, external_record_id) DO UPDATE SET
                    start_time = EXCLUDED.start_time,
                    end_time = EXCLUDED.end_time,
                    duration_minutes = EXCLUDED.duration_minutes,
                    updated_at = NOW()
                RETURNING id
            `, [
                corridor.id, sourceId, w.externalId,
                w.startTime, w.endTime, w.durationMinutes, w.availabilityStatus,
                w.blockType, w.lineDesignation, w.startKm, w.endKm, w.operationalConstraints
            ]);

            if (res.rows.length > 0) {
                results.windowsCreated++;
            }
        }

        // 7. Persist Train Movements
        for (const trn of dataset.trainMovements) {
            const sourceId = sourceMap.get(trn.sourceSystem) || sourceMap.get('DEMO') || sourceMap.get('COA');

            const res = await db.query(`
                INSERT INTO train_movements (
                    corridor_id, source_system_id, external_record_id, train_number,
                    service_identifier, scheduled_start_time, scheduled_end_time,
                    direction, train_type, priority, status, operational_details
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (source_system_id, external_record_id) DO UPDATE SET
                    scheduled_start_time = EXCLUDED.scheduled_start_time,
                    scheduled_end_time = EXCLUDED.scheduled_end_time,
                    status = EXCLUDED.status,
                    updated_at = NOW()
                RETURNING id
            `, [
                corridor.id, sourceId, trn.externalId, trn.trainNumber,
                trn.serviceIdentifier, trn.scheduledStartTime, trn.scheduledEndTime,
                trn.direction, trn.trainType, trn.priority, trn.status, trn.operationalDetails
            ]);

            if (res.rows.length > 0) {
                results.trainsCreated++;
            }
        }

        // 8. Persist Task Dependencies
        for (const dep of dataset.dependencies) {
            const taskId = taskIdMap.get(dep.taskExternalId);
            const dependsOnId = taskIdMap.get(dep.dependsOnTaskExternalId);

            if (taskId && dependsOnId && taskId !== dependsOnId) {
                await db.query(`
                    INSERT INTO maintenance_dependencies (
                        task_id, depends_on_task_id, dependency_type, lag_minutes
                    ) VALUES ($1, $2, $3, $4)
                `, [taskId, dependsOnId, dep.dependencyType, dep.lagMinutes]);
                results.dependenciesCreated++;
            }
        }

        return {
            success: true,
            message: 'Demo dataset generated, validated, and persisted successfully.',
            metadata: {
                corridorCode: corridor.code,
                corridorId: corridor.id,
                dataSourceType: 'DEMO',
                sourceSystems: ['BDMS', 'TDMS', 'SMMS', 'COA'],
                recordsCreated: results
            }
        };
    }

    /**
     * Query demo maintenance requests
     */
    async getMaintenanceRequests(filters = {}) {
        const {
            corridor_id,
            corridor_code,
            department,
            source_system,
            severity,
            priority,
            limit = 50,
            offset = 0
        } = filters;

        let corridorId = corridor_id;
        if (!corridorId && corridor_code) {
            const c = await this.getCorridor(corridor_code);
            corridorId = c ? c.id : null;
        }

        const { rows } = await db.query(`
            SELECT 
                t.id, t.external_record_id, t.task_code, t.title, t.description,
                t.maintenance_type, t.duration_minutes, t.priority, t.criticality, t.urgency,
                t.required_by_date, t.status, t.power_block_required, t.traffic_block_required,
                t.speed_restriction_kmph, t.operational_constraints,
                a.id AS asset_id, a.asset_code, a.name AS asset_name, a.location AS asset_location,
                d.code AS department_code, d.name AS department_name,
                s.code AS source_system, c.code AS corridor_code
            FROM maintenance_tasks t
            JOIN assets a ON t.asset_id = a.id
            JOIN departments d ON t.department_id = d.id
            JOIN integration_sources s ON t.source_system_id = s.id
            JOIN corridors c ON t.corridor_id = c.id
            WHERE t.deleted_at IS NULL
              AND ($1::varchar IS NULL OR t.corridor_id = $1::uuid OR c.code = $1)
            ORDER BY t.priority ASC, t.required_by_date ASC
        `, [corridorId || null]);

        let filtered = rows.filter(r => {
            const constraints = r.operational_constraints || {};
            return constraints.dataSourceType === 'DEMO' || constraints.data_source_type === 'DEMO';
        });

        if (department) {
            filtered = filtered.filter(r => (r.department_code || '').toLowerCase() === department.toLowerCase());
        }
        if (source_system) {
            filtered = filtered.filter(r => (r.source_system || '').toLowerCase() === source_system.toLowerCase());
        }
        if (severity) {
            filtered = filtered.filter(r => (r.criticality || '').toLowerCase() === severity.toLowerCase());
        }
        if (priority) {
            filtered = filtered.filter(r => Number(r.priority) === Number(priority));
        }

        return {
            count: filtered.length,
            data: filtered.slice(Number(offset), Number(offset) + Number(limit))
        };
    }

    /**
     * Query demo assets
     */
    async getAssets(filters = {}) {
        const {
            corridor_id,
            corridor_code,
            asset_type,
            criticality,
            health_status,
            source_system,
            limit = 50,
            offset = 0
        } = filters;

        let corridorId = corridor_id;
        if (!corridorId && corridor_code) {
            const c = await this.getCorridor(corridor_code);
            corridorId = c ? c.id : null;
        }

        const { rows } = await db.query(`
            SELECT 
                a.id, a.external_record_id, a.asset_code, a.name, a.asset_type, a.location,
                a.start_kilometer, a.end_kilometer, a.criticality, a.health_status, a.metadata,
                s.code AS source_system, c.code AS corridor_code
            FROM assets a
            JOIN integration_sources s ON a.source_system_id = s.id
            JOIN corridors c ON a.corridor_id = c.id
            WHERE a.is_active = TRUE
              AND ($1::varchar IS NULL OR a.corridor_id = $1::uuid OR c.code = $1)
            ORDER BY a.start_kilometer ASC
        `, [corridorId || null]);

        let filtered = rows.filter(r => {
            const meta = r.metadata || {};
            return meta.dataSourceType === 'DEMO' || meta.data_source_type === 'DEMO';
        });

        if (asset_type) {
            filtered = filtered.filter(r => (r.asset_type || '').toLowerCase() === asset_type.toLowerCase());
        }
        if (criticality) {
            filtered = filtered.filter(r => (r.criticality || '').toLowerCase() === criticality.toLowerCase());
        }
        if (health_status) {
            filtered = filtered.filter(r => (r.health_status || '').toLowerCase() === health_status.toLowerCase());
        }
        if (source_system) {
            filtered = filtered.filter(r => (r.source_system || '').toLowerCase() === source_system.toLowerCase());
        }

        return {
            count: filtered.length,
            data: filtered.slice(Number(offset), Number(offset) + Number(limit))
        };
    }

    /**
     * Query demo defects
     */
    async getDefects(filters = {}) {
        const {
            corridor_id,
            corridor_code,
            department,
            severity,
            status,
            source_system,
            limit = 50,
            offset = 0
        } = filters;

        let corridorId = corridor_id;
        if (!corridorId && corridor_code) {
            const c = await this.getCorridor(corridor_code);
            corridorId = c ? c.id : null;
        }

        const { rows } = await db.query(`
            SELECT 
                d.id, d.external_record_id, d.defect_code, d.defect_type, d.severity,
                d.description, d.component, d.failure_risk, d.status, d.reported_at, d.metadata,
                d.corridor_id, d.department_code, d.source_system
            FROM defects d
        `, [corridorId || null, department || null, severity || null, status || null]);

        let filtered = rows;
        if (corridorId) {
            filtered = filtered.filter(r => r.corridor_id === corridorId);
        }
        if (department) {
            filtered = filtered.filter(r => (r.department_code || '').toLowerCase() === department.toLowerCase());
        }
        if (severity) {
            filtered = filtered.filter(r => (r.severity || '').toLowerCase() === severity.toLowerCase());
        }
        if (status) {
            filtered = filtered.filter(r => (r.status || '').toLowerCase() === status.toLowerCase());
        }
        if (source_system) {
            filtered = filtered.filter(r => (r.source_system || '').toLowerCase() === source_system.toLowerCase());
        }

        return {
            count: filtered.length,
            data: filtered.slice(Number(offset), Number(offset) + Number(limit))
        };
    }

    /**
     * Query demo train movements
     */
    async getTrains(filters = {}) {
        const {
            corridor_id,
            corridor_code,
            train_type,
            direction,
            priority,
            limit = 50,
            offset = 0
        } = filters;

        let corridorId = corridor_id;
        if (!corridorId && corridor_code) {
            const c = await this.getCorridor(corridor_code);
            corridorId = c ? c.id : null;
        }

        const { rows } = await db.query(`
            SELECT 
                m.id, m.external_record_id, m.train_number, m.service_identifier,
                m.scheduled_start_time, m.scheduled_end_time, m.direction,
                m.train_type, m.priority, m.status, m.operational_details,
                s.code AS source_system, c.code AS corridor_code
            FROM train_movements m
            JOIN integration_sources s ON m.source_system_id = s.id
            JOIN corridors c ON m.corridor_id = c.id
            WHERE ($1::varchar IS NULL OR m.corridor_id = $1::uuid OR c.code = $1)
            ORDER BY m.scheduled_start_time ASC
        `, [corridorId || null]);

        let filtered = rows.filter(r => {
            const details = r.operational_details || {};
            return details.dataSourceType === 'DEMO' || details.data_source_type === 'DEMO';
        });

        if (train_type) {
            filtered = filtered.filter(r => (r.train_type || '').toLowerCase() === train_type.toLowerCase());
        }
        if (direction) {
            filtered = filtered.filter(r => (r.direction || '').toLowerCase() === direction.toLowerCase());
        }
        if (priority) {
            filtered = filtered.filter(r => Number(r.priority) === Number(priority));
        }

        return {
            count: filtered.length,
            data: filtered.slice(Number(offset), Number(offset) + Number(limit))
        };
    }
}

module.exports = new DemoGatewayService();
