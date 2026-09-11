/**
 * MaintenanceIngestionService
 * 
 * Standardized, source-independent ingestion pipeline for maintenance requests
 * from any source system (DEMO, BDMS, TDMS, SMMS).
 * 
 * Architecture:
 * DataSource -> Normalized Request -> Validation -> Database (INCOMING -> PENDING) -> Planning Pipeline
 */

const db = require('../config/db');

class MaintenanceIngestionService {
    /**
     * Normalizes a raw maintenance request payload from any external or demo source
     * into the standard canonical representation.
     */
    normalizeRequest(raw = {}) {
        const sourceSystem = (raw.source_system || raw.sourceSystem || raw.source || 'DEMO').toUpperCase();
        const department = (raw.department || raw.department_code || raw.departmentCode || 'ENGG').toUpperCase();
        const maintenanceType = raw.maintenance_type || raw.maintenanceType || 'TRACK_TAMPING';
        const requestedDuration = Number(raw.requested_duration || raw.requestedDuration || raw.requested_duration_minutes || raw.requestedDurationMinutes || raw.duration_minutes || raw.durationMinutes || 120);
        const priority = Math.min(5, Math.max(1, Number(raw.priority || 3)));
        const criticality = (raw.criticality || raw.severity || 'MEDIUM').toUpperCase();
        const urgency = (raw.urgency || raw.risk || 'MEDIUM').toUpperCase();
        const risk = raw.risk ? raw.risk.toUpperCase() : (priority <= 2 ? 'HIGH' : priority <= 3 ? 'MEDIUM' : 'LOW');
        const severity = raw.severity ? raw.severity.toUpperCase() : criticality;

        // Asset extraction
        const asset = typeof raw.asset === 'object' && raw.asset !== null
            ? {
                id: raw.asset.id || raw.asset_id || raw.assetId || null,
                asset_code: raw.asset.asset_code || raw.asset.assetCode || raw.asset_code || raw.assetCode || 'ASSET-GENERIC',
                name: raw.asset.name || raw.asset_name || 'Track Section',
                asset_type: raw.asset.asset_type || raw.asset.assetType || 'TRACK',
                location: raw.asset.location || raw.location || 'Corridor Section',
                start_kilometer: raw.asset.start_kilometer ?? raw.start_kilometer ?? 0.0,
                end_kilometer: raw.asset.end_kilometer ?? raw.end_kilometer ?? 1.0
            }
            : {
                id: raw.asset_id || raw.assetId || null,
                asset_code: raw.asset_code || raw.assetCode || (typeof raw.asset === 'string' ? raw.asset : 'ASSET-GENERIC'),
                name: raw.asset_name || raw.assetName || 'Track Section',
                asset_type: raw.asset_type || raw.assetType || 'TRACK',
                location: raw.location || 'Corridor Section',
                start_kilometer: raw.start_kilometer ?? 0.0,
                end_kilometer: raw.end_kilometer ?? 1.0
            };

        // Defect extraction
        const defect = typeof raw.defect === 'object' && raw.defect !== null
            ? {
                id: raw.defect.id || raw.defect_id || null,
                defect_code: raw.defect.defect_code || raw.defect.defectCode || null,
                defect_type: raw.defect.defect_type || raw.defect.defectType || null,
                severity: raw.defect.severity || severity,
                failure_risk: raw.defect.failure_risk || raw.defect.failureRisk || risk
            }
            : raw.defect_id ? { id: raw.defect_id, defect_code: raw.defect_code || null, severity, failure_risk: risk } : null;

        // Preferred window & resources
        const preferredWindow = raw.preferred_window || raw.preferredWindow || {
            start_time: raw.required_by_date || raw.requiredByDate || null,
            end_time: null,
            preferred_slot: raw.preferred_slot || null
        };

        const requiredResources = raw.required_resources || raw.requiredResources || {
            power_block_required: Boolean(raw.power_block_required ?? raw.powerBlockRequired ?? false),
            traffic_block_required: Boolean(raw.traffic_block_required ?? raw.trafficBlockRequired ?? true),
            speed_restriction_kmph: raw.speed_restriction_kmph ?? raw.speedRestrictionKmph ?? null,
            machinery_required: raw.machinery_required || raw.machine_required || null,
            crew_required: Number(raw.crew_required || raw.crewRequired || 1)
        };

        // Dependencies
        const dependencies = Array.isArray(raw.dependencies)
            ? raw.dependencies
            : Array.isArray(raw.depends_on_task_ids)
                ? raw.depends_on_task_ids
                : [];

        // Canonical Request ID
        const requestId = raw.request_id || raw.requestId || raw.external_record_id || raw.externalId || raw.task_code || raw.taskCode || `REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        return {
            request_id: requestId,
            external_record_id: requestId,
            task_code: raw.task_code || raw.taskCode || `TSK-${sourceSystem}-${String(requestId).slice(-6)}`,
            title: raw.title || `${department} Maintenance Request - ${maintenanceType}`,
            description: raw.description || `Maintenance work on ${asset.asset_code} generated from ${sourceSystem}`,
            source_system: sourceSystem,
            department: department,
            corridor_code: raw.corridor_code || raw.corridorCode || 'NDLS-CNB',
            corridor_id: raw.corridor_id || raw.corridorId || null,
            asset: asset,
            defect: defect,
            location: raw.location || asset.location || 'Corridor Section',
            corridor_section: raw.corridor_section || raw.corridorSection || `${asset.start_kilometer}-${asset.end_kilometer} KM`,
            maintenance_type: maintenanceType,
            priority: priority,
            severity: severity,
            risk: risk,
            requested_duration: requestedDuration,
            preferred_window: preferredWindow,
            required_resources: requiredResources,
            dependencies: dependencies,
            status: (raw.status || 'INCOMING').toUpperCase(),
            required_by_date: raw.required_by_date || raw.requiredByDate || new Date(Date.now() + 7 * 86400000).toISOString(),
            operational_constraints: raw.operational_constraints || raw.operationalConstraints || {},
            created_at: raw.created_at || raw.createdAt || new Date().toISOString()
        };
    }

    /**
     * Validates normalized maintenance request against domain constraints.
     */
    validateRequest(norm) {
        const errors = [];

        if (!norm.request_id) errors.push('request_id is required');
        if (!norm.source_system) errors.push('source_system is required');
        if (!norm.department) errors.push('department is required');
        if (!['ENGG', 'SNT', 'TRD', 'OPTG', 'CIVIL', 'ELECTRICAL', 'SIGNAL'].includes(norm.department.toUpperCase())) {
            errors.push(`Invalid department code: ${norm.department}`);
        }
        if (isNaN(norm.requested_duration) || norm.requested_duration <= 0) {
            errors.push('requested_duration must be a positive number of minutes');
        }
        if (norm.priority < 1 || norm.priority > 5) {
            errors.push('priority must be an integer between 1 (highest) and 5 (routine)');
        }
        if (!norm.asset || (!norm.asset.id && !norm.asset.asset_code)) {
            errors.push('asset must contain at least an id or asset_code');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Ingests, normalizes, validates, and stores a maintenance request.
     * Transitions status from INCOMING to PENDING upon successful validation.
     */
    async ingestRequest(rawPayload, options = {}) {
        const normalized = this.normalizeRequest(rawPayload);
        const validation = this.validateRequest(normalized);

        if (!validation.isValid) {
            throw new Error(`Maintenance request validation failed: ${validation.errors.join('; ')}`);
        }

        // 1. Resolve corridor
        let corridor = null;
        if (normalized.corridor_id) {
            const res = await db.query('SELECT * FROM corridors WHERE id = $1', [normalized.corridor_id]);
            if (res.rows.length > 0) corridor = res.rows[0];
        }
        if (!corridor && normalized.corridor_code) {
            const res = await db.query('SELECT * FROM corridors WHERE code = $1', [normalized.corridor_code.toUpperCase()]);
            if (res.rows.length > 0) corridor = res.rows[0];
        }
        if (!corridor) {
            const res = await db.query('SELECT * FROM corridors WHERE is_active = TRUE ORDER BY code ASC LIMIT 1');
            if (res.rows.length > 0) corridor = res.rows[0];
        }
        if (!corridor) {
            throw new Error('Target corridor could not be identified for maintenance request.');
        }

        // 2. Resolve Integration Source ID
        const srcRes = await db.query('SELECT * FROM integration_sources WHERE code = $1', [normalized.source_system]);
        let sourceId = srcRes.rows.length > 0 ? srcRes.rows[0].id : null;
        if (!sourceId) {
            // Fallback to first available integration source
            const anySrc = await db.query('SELECT * FROM integration_sources LIMIT 1');
            sourceId = anySrc.rows.length > 0 ? anySrc.rows[0].id : 's1111111-1111-1111-1111-111111111111';
        }

        // 3. Resolve Department ID
        let deptCode = normalized.department;
        if (deptCode === 'CIVIL') deptCode = 'ENGG';
        if (deptCode === 'SIGNAL') deptCode = 'SNT';
        if (deptCode === 'ELECTRICAL') deptCode = 'TRD';

        const deptRes = await db.query('SELECT * FROM departments WHERE code = $1', [deptCode]);
        let departmentId = deptRes.rows.length > 0 ? deptRes.rows[0].id : null;
        if (!departmentId) {
            const anyDept = await db.query('SELECT * FROM departments LIMIT 1');
            departmentId = anyDept.rows.length > 0 ? anyDept.rows[0].id : 'd1111111-1111-1111-1111-111111111111';
        }

        // 4. Resolve or create asset
        let assetId = normalized.asset.id || null;
        if (!assetId && normalized.asset.asset_code) {
            const assetRes = await db.query(
                'SELECT * FROM assets WHERE corridor_id = $1 AND asset_code = $2',
                [corridor.id, normalized.asset.asset_code]
            );
            if (assetRes.rows.length > 0) {
                assetId = assetRes.rows[0].id;
            } else {
                // Upsert new asset
                const newAssetRes = await db.query(`
                    INSERT INTO assets (
                        corridor_id, source_system_id, external_record_id, asset_code,
                        name, asset_type, location, start_kilometer, end_kilometer,
                        criticality, health_status, metadata
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    ON CONFLICT (source_system_id, external_record_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        updated_at = NOW()
                    RETURNING id
                `, [
                    corridor.id, sourceId, `AST-${normalized.asset.asset_code}`, normalized.asset.asset_code,
                    normalized.asset.name, normalized.asset.asset_type, normalized.asset.location,
                    normalized.asset.start_kilometer, normalized.asset.end_kilometer,
                    normalized.severity, 'MAINTENANCE_REQUIRED', {}
                ]);
                assetId = newAssetRes.rows[0].id;
            }
        }

        if (!assetId) {
            const fallbackAsset = await db.query('SELECT id FROM assets WHERE corridor_id = $1 LIMIT 1', [corridor.id]);
            assetId = fallbackAsset.rows.length > 0 ? fallbackAsset.rows[0].id : 'a1111111-1111-1111-1111-111111111111';
        }

        // 5. Check/Persist linked defect if provided
        let defectId = null;
        if (normalized.defect && normalized.defect.defect_code) {
            const defectRes = await db.query(`
                INSERT INTO defects (
                    external_record_id, defect_code, defect_type, severity,
                    description, component, failure_risk, status,
                    asset_id, corridor_id, department_id, source_system_id, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING id
            `, [
                `DEF-${normalized.defect.defect_code}`, normalized.defect.defect_code,
                normalized.defect.defect_type || 'TRACK_GEOMETRY', normalized.defect.severity || normalized.severity,
                normalized.description, normalized.asset.asset_type, normalized.defect.failure_risk || normalized.risk,
                'OPEN', assetId, corridor.id, departmentId, sourceId,
                { sourceSystem: normalized.source_system, reportedAt: new Date().toISOString() }
            ]);
            if (defectRes.rows.length > 0) {
                defectId = defectRes.rows[0].id;
            }
        }

        // 6. Transition lifecycle: promote from INCOMING to PENDING
        const targetStatus = options.status || (normalized.status === 'INCOMING' ? 'PENDING' : normalized.status);

        const mergedConstraints = {
            ...normalized.operational_constraints,
            source_system: normalized.source_system,
            risk: normalized.risk,
            severity: normalized.severity,
            defect_id: defectId,
            defect_code: normalized.defect ? normalized.defect.defect_code : null,
            preferred_window: normalized.preferred_window,
            required_resources: normalized.required_resources,
            dependencies: normalized.dependencies
        };

        // 7. Idempotent Upsert into maintenance_tasks
        const upsertSql = `
            INSERT INTO maintenance_tasks (
                source_system_id, external_record_id, corridor_id, asset_id, department_id,
                task_code, title, description, maintenance_type, duration_minutes, priority,
                criticality, urgency, required_by_date, status,
                power_block_required, traffic_block_required, speed_restriction_kmph, operational_constraints
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            ON CONFLICT (source_system_id, external_record_id) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                priority = EXCLUDED.priority,
                criticality = EXCLUDED.criticality,
                urgency = EXCLUDED.urgency,
                duration_minutes = EXCLUDED.duration_minutes,
                required_by_date = EXCLUDED.required_by_date,
                status = EXCLUDED.status,
                power_block_required = EXCLUDED.power_block_required,
                traffic_block_required = EXCLUDED.traffic_block_required,
                speed_restriction_kmph = EXCLUDED.speed_restriction_kmph,
                operational_constraints = EXCLUDED.operational_constraints,
                updated_at = NOW()
            RETURNING *;
        `;

        const params = [
            sourceId,
            normalized.external_record_id,
            corridor.id,
            assetId,
            departmentId,
            normalized.task_code,
            normalized.title,
            normalized.description,
            normalized.maintenance_type,
            normalized.requested_duration,
            normalized.priority,
            normalized.severity,
            normalized.urgency,
            new Date(normalized.required_by_date),
            targetStatus,
            normalized.required_resources.power_block_required,
            normalized.required_resources.traffic_block_required,
            normalized.required_resources.speed_restriction_kmph,
            mergedConstraints
        ];

        const { rows } = await db.query(upsertSql, params);
        const stored = rows[0];

        return {
            ...normalized,
            id: stored.id,
            corridor_id: corridor.id,
            corridor_name: corridor.name,
            asset_id: assetId,
            department_id: departmentId,
            status: stored.status,
            stored_at: stored.updated_at || stored.created_at
        };
    }

    /**
     * Batch ingestion with aggregated results and validation diagnostics
     */
    async ingestBatch(records = [], options = {}) {
        if (!Array.isArray(records)) {
            throw new Error('Records must be an array of maintenance requests');
        }

        const results = {
            total: records.length,
            ingested: 0,
            failed: 0,
            errors: [],
            requests: []
        };

        for (let i = 0; i < records.length; i++) {
            const raw = records[i];
            try {
                const ingested = await this.ingestRequest(raw, options);
                results.requests.push(ingested);
                results.ingested++;
            } catch (err) {
                results.failed++;
                results.errors.push({
                    index: i,
                    request_id: raw.request_id || raw.requestId || raw.task_code || `Item-${i}`,
                    error: err.message
                });
            }
        }

        return results;
    }
}

module.exports = new MaintenanceIngestionService();
