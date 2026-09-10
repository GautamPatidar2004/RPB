const db = require('../config/db');
const railwayAdapters = require('./railwayAdapters');

class SyncGatewayService {
    /**
     * Helper to resolve corridor ID by code
     */
    async getCorridorId(corridorCode = 'NDLS-CNB') {
        const { rows } = await db.query('SELECT id FROM corridors WHERE code = $1 LIMIT 1', [corridorCode]);
        if (rows.length > 0) return rows[0].id;
        const all = await db.query('SELECT id FROM corridors LIMIT 1', []);
        return all.rows.length > 0 ? all.rows[0].id : null;
    }

    /**
     * Helper to resolve department ID by code
     */
    async getDepartmentId(deptCode) {
        const { rows } = await db.query('SELECT id FROM departments WHERE code = $1 LIMIT 1', [deptCode]);
        return rows.length > 0 ? rows[0].id : null;
    }

    /**
     * Get integration source row by system code
     */
    async getSource(sourceCode) {
        const { rows } = await db.query('SELECT id, code, name, is_active, sync_interval_minutes, last_sync_at FROM integration_sources WHERE code = $1 LIMIT 1', [sourceCode.toUpperCase()]);
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Synchronize a specific source system (TMS, SMMS, TDMS, COA, BDMS)
     */
    async syncSource(sourceCode) {
        const code = (sourceCode || '').toUpperCase();
        const source = await this.getSource(code);
        if (!source) {
            throw new Error(`Integration source [${sourceCode}] not recognized in railway catalog.`);
        }
        if (!source.is_active) {
            throw new Error(`Integration source [${sourceCode}] is currently disabled.`);
        }

        // 1. Create In-Progress Sync Run entry
        const startRunRes = await db.query(
            'INSERT INTO sync_runs (source_id, started_at, status) VALUES ($1, NOW(), $2) RETURNING id',
            [source.id, 'IN_PROGRESS']
        );
        const syncRunId = startRunRes.rows[0].id;

        let totalReceived = 0;
        let totalCreated = 0;
        let totalUpdated = 0;
        let totalFailed = 0;
        const errors = [];

        try {
            // 2. Fetch raw feeds from external adapter
            let feedData;
            switch (code) {
                case 'TMS':
                    feedData = await railwayAdapters.fetchTMS();
                    break;
                case 'SMMS':
                    feedData = await railwayAdapters.fetchSMMS();
                    break;
                case 'TDMS':
                    feedData = await railwayAdapters.fetchTDMS();
                    break;
                case 'COA':
                    feedData = await railwayAdapters.fetchCOA();
                    break;
                case 'BDMS':
                    feedData = await railwayAdapters.fetchBDMS();
                    break;
                default:
                    throw new Error(`No adapter implemented for source [${code}]`);
            }

            // 3. Process Maintenance & Asset Feeds (TMS, SMMS, TDMS)
            if (feedData.records && Array.isArray(feedData.records)) {
                totalReceived += feedData.records.length;

                const deptMap = {
                    'TMS': 'ENGG',
                    'SMMS': 'SNT',
                    'TDMS': 'TRD'
                };
                const defaultDeptId = await this.getDepartmentId(deptMap[code] || 'ENGG');

                for (const item of feedData.records) {
                    try {
                        const corridorId = await this.getCorridorId(item.corridorCode);
                        if (!corridorId) throw new Error(`Corridor [${item.corridorCode}] not found`);

                        // Normalize and upsert asset if provided
                        let assetId = null;
                        if (item.asset) {
                            const a = item.asset;
                            if (!a.assetCode || !a.name) {
                                throw new Error(`Asset missing mandatory code or name: ${JSON.stringify(a)}`);
                            }

                            const assetUpsertSql = `
                                INSERT INTO assets (
                                    corridor_id, source_system_id, external_record_id, asset_code,
                                    name, asset_type, location, start_kilometer, end_kilometer,
                                    criticality, health_status, metadata, is_active, updated_at
                                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE, NOW())
                                ON CONFLICT (source_system_id, external_record_id) DO UPDATE SET
                                    name = EXCLUDED.name,
                                    asset_type = EXCLUDED.asset_type,
                                    location = EXCLUDED.location,
                                    start_kilometer = EXCLUDED.start_kilometer,
                                    end_kilometer = EXCLUDED.end_kilometer,
                                    criticality = EXCLUDED.criticality,
                                    health_status = EXCLUDED.health_status,
                                    metadata = EXCLUDED.metadata,
                                    updated_at = NOW()
                                RETURNING id, (xmax = 0) AS is_new;
                            `;

                            const assetParams = [
                                corridorId,
                                source.id,
                                a.externalId || `${code}-AST-${a.assetCode}`,
                                a.assetCode,
                                a.name,
                                a.assetType || 'TRACK',
                                a.location || 'Corridor Section',
                                a.startKm !== undefined ? a.startKm : null,
                                a.endKm !== undefined ? a.endKm : null,
                                (a.criticality || 'MEDIUM').toUpperCase(),
                                (a.healthStatus || 'OPERATIONAL').toUpperCase(),
                                JSON.stringify(a.metadata || {})
                            ];

                            const assetRes = await db.query(assetUpsertSql, assetParams);
                            assetId = assetRes.rows[0].id;
                        }

                        // Validate Task fields
                        if (!item.title || !item.durationMinutes || item.durationMinutes <= 0) {
                            throw new Error(`Task [${item.externalId}] has invalid title or duration`);
                        }
                        if (item.priority && (item.priority < 1 || item.priority > 5)) {
                            throw new Error(`Task [${item.externalId}] priority must be between 1 and 5`);
                        }

                        // Upsert Maintenance Task idempotently
                        const taskUpsertSql = `
                            INSERT INTO maintenance_tasks (
                                source_system_id, external_record_id, corridor_id, asset_id,
                                department_id, task_code, title, description, maintenance_type,
                                duration_minutes, priority, criticality, urgency, required_by_date,
                                status, power_block_required, traffic_block_required, speed_restriction_kmph,
                                operational_constraints, synced_at, updated_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
                            ON CONFLICT (source_system_id, external_record_id) DO UPDATE SET
                                title = EXCLUDED.title,
                                description = EXCLUDED.description,
                                maintenance_type = EXCLUDED.maintenance_type,
                                duration_minutes = EXCLUDED.duration_minutes,
                                priority = EXCLUDED.priority,
                                criticality = EXCLUDED.criticality,
                                urgency = EXCLUDED.urgency,
                                required_by_date = EXCLUDED.required_by_date,
                                power_block_required = EXCLUDED.power_block_required,
                                traffic_block_required = EXCLUDED.traffic_block_required,
                                speed_restriction_kmph = EXCLUDED.speed_restriction_kmph,
                                operational_constraints = EXCLUDED.operational_constraints,
                                synced_at = NOW(),
                                updated_at = NOW()
                            RETURNING id, (xmax = 0) AS is_new;
                        `;

                        const taskParams = [
                            source.id,
                            item.externalId,
                            corridorId,
                            assetId,
                            defaultDeptId,
                            item.taskCode || item.externalId,
                            item.title,
                            item.description || null,
                            (item.maintenanceType || 'ROUTINE').toUpperCase(),
                            parseInt(item.durationMinutes, 10),
                            parseInt(item.priority || 3, 10),
                            (item.criticality || 'MEDIUM').toUpperCase(),
                            (item.urgency || 'MEDIUM').toUpperCase(),
                            new Date(item.requiredByDate || Date.now() + 7 * 86400000),
                            (item.status || 'PENDING').toUpperCase(),
                            Boolean(item.powerBlockRequired),
                            item.trafficBlockRequired !== false,
                            item.speedRestrictionKmph !== undefined ? item.speedRestrictionKmph : null,
                            JSON.stringify(item.operationalConstraints || {})
                        ];

                        const taskRes = await db.query(taskUpsertSql, taskParams);
                        const isNew = taskRes.rows[0].is_new;
                        if (isNew) {
                            totalCreated++;
                        } else {
                            totalUpdated++;
                        }
                    } catch (err) {
                        totalFailed++;
                        errors.push(`Record ${item.externalId || 'unknown'}: ${err.message}`);
                    }
                }
            }

            // 4. Process Block Windows Feeds (COA, BDMS)
            if (feedData.windows && Array.isArray(feedData.windows)) {
                totalReceived += feedData.windows.length;

                for (const win of feedData.windows) {
                    try {
                        const corridorId = await this.getCorridorId(win.corridorCode);
                        if (!corridorId) throw new Error(`Corridor [${win.corridorCode}] not found`);

                        const startTime = new Date(win.startTime);
                        const endTime = new Date(win.endTime);
                        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime()) || endTime <= startTime) {
                            throw new Error(`Window [${win.externalId}] has invalid start/end timestamps`);
                        }

                        const durationMinutes = parseInt(win.durationMinutes || Math.round((endTime - startTime) / 60000), 10);
                        if (durationMinutes <= 0) {
                            throw new Error(`Window [${win.externalId}] duration must be positive`);
                        }

                        const winUpsertSql = `
                            INSERT INTO block_windows (
                                corridor_id, source_system_id, external_record_id, start_time,
                                end_time, duration_minutes, availability_status, block_type,
                                line_designation, start_kilometer, end_kilometer, operational_constraints, updated_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
                            ON CONFLICT (source_system_id, external_record_id) DO UPDATE SET
                                start_time = EXCLUDED.start_time,
                                end_time = EXCLUDED.end_time,
                                duration_minutes = EXCLUDED.duration_minutes,
                                availability_status = EXCLUDED.availability_status,
                                block_type = EXCLUDED.block_type,
                                line_designation = EXCLUDED.line_designation,
                                start_kilometer = EXCLUDED.start_kilometer,
                                end_kilometer = EXCLUDED.end_kilometer,
                                operational_constraints = EXCLUDED.operational_constraints,
                                updated_at = NOW()
                            RETURNING id, (xmax = 0) AS is_new;
                        `;

                        const winParams = [
                            corridorId,
                            source.id,
                            win.externalId,
                            startTime,
                            endTime,
                            durationMinutes,
                            (win.availabilityStatus || 'AVAILABLE').toUpperCase(),
                            (win.blockType || 'TRAFFIC_BLOCK').toUpperCase(),
                            win.lineDesignation || 'MAIN',
                            win.startKm !== undefined ? win.startKm : null,
                            win.endKm !== undefined ? win.endKm : null,
                            JSON.stringify(win.operationalConstraints || {})
                        ];

                        const winRes = await db.query(winUpsertSql, winParams);
                        const isNew = winRes.rows[0].is_new;
                        if (isNew) totalCreated++;
                        else totalUpdated++;
                    } catch (err) {
                        totalFailed++;
                        errors.push(`Window ${win.externalId || 'unknown'}: ${err.message}`);
                    }
                }
            }

            // 5. Process Train Movements Feeds (COA)
            if (feedData.trains && Array.isArray(feedData.trains)) {
                totalReceived += feedData.trains.length;

                for (const trn of feedData.trains) {
                    try {
                        const corridorId = await this.getCorridorId(trn.corridorCode);
                        if (!corridorId) throw new Error(`Corridor [${trn.corridorCode}] not found`);

                        if (!trn.trainNumber || !trn.serviceIdentifier) {
                            throw new Error(`Train movement missing train number or service identifier`);
                        }

                        const startTime = new Date(trn.scheduledStartTime);
                        const endTime = new Date(trn.scheduledEndTime);
                        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime()) || endTime <= startTime) {
                            throw new Error(`Train [${trn.trainNumber}] has invalid scheduled start/end times`);
                        }

                        const trainUpsertSql = `
                            INSERT INTO train_movements (
                                corridor_id, source_system_id, external_record_id, train_number,
                                service_identifier, scheduled_start_time, scheduled_end_time,
                                direction, train_type, priority, status, operational_details, updated_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
                            ON CONFLICT (source_system_id, external_record_id) DO UPDATE SET
                                scheduled_start_time = EXCLUDED.scheduled_start_time,
                                scheduled_end_time = EXCLUDED.scheduled_end_time,
                                direction = EXCLUDED.direction,
                                train_type = EXCLUDED.train_type,
                                priority = EXCLUDED.priority,
                                status = EXCLUDED.status,
                                operational_details = EXCLUDED.operational_details,
                                updated_at = NOW()
                            RETURNING id, (xmax = 0) AS is_new;
                        `;

                        const trainParams = [
                            corridorId,
                            source.id,
                            trn.externalId || `${code}-TRN-${trn.serviceIdentifier}`,
                            trn.trainNumber,
                            trn.serviceIdentifier,
                            startTime,
                            endTime,
                            (trn.direction || 'UP').toUpperCase(),
                            (trn.trainType || 'MAIL_EXPRESS').toUpperCase(),
                            parseInt(trn.priority || 3, 10),
                            (trn.status || 'SCHEDULED').toUpperCase(),
                            JSON.stringify(trn.operationalDetails || {})
                        ];

                        const trainRes = await db.query(trainUpsertSql, trainParams);
                        const isNew = trainRes.rows[0].is_new;
                        if (isNew) totalCreated++;
                        else totalUpdated++;
                    } catch (err) {
                        totalFailed++;
                        errors.push(`Train ${trn.trainNumber || 'unknown'}: ${err.message}`);
                    }
                }
            }

            // Determine final run status
            const finalStatus = totalFailed === 0
                ? 'SUCCESS'
                : (totalCreated + totalUpdated > 0 ? 'PARTIAL_SUCCESS' : 'FAILED');

            const errorSummary = errors.length > 0 ? errors.slice(0, 10).join('; ') : null;

            // Complete the sync_runs record
            const updateRunRes = await db.query(`
                UPDATE sync_runs
                SET status = $1, completed_at = NOW(), records_received = $2,
                    records_created = $3, records_updated = $4, records_failed = $5,
                    error_summary = $6
                WHERE id = $7
                RETURNING *
            `, [finalStatus, totalReceived, totalCreated, totalUpdated, totalFailed, errorSummary, syncRunId]);

            // Update source last sync time
            await db.query('UPDATE integration_sources SET last_sync_at = NOW() WHERE id = $1', [source.id]);

            return {
                success: finalStatus !== 'FAILED',
                sourceCode: code,
                sourceName: source.name,
                syncRun: updateRunRes.rows[0]
            };

        } catch (fatalErr) {
            // Mark sync run as FAILED on unexpected exception
            await db.query(`
                UPDATE sync_runs
                SET status = 'FAILED', completed_at = NOW(), records_received = $1,
                    records_created = $2, records_updated = $3, records_failed = $4,
                    error_summary = $5
                WHERE id = $6
            `, [totalReceived, totalCreated, totalUpdated, totalFailed + 1, fatalErr.message, syncRunId]);

            throw fatalErr;
        }
    }

    /**
     * Synchronize all active railway integration sources sequentially
     */
    async syncAll() {
        const sources = ['TMS', 'SMMS', 'TDMS', 'COA', 'BDMS'];
        const results = [];
        for (const code of sources) {
            try {
                const res = await this.syncSource(code);
                results.push(res);
            } catch (err) {
                results.push({
                    success: false,
                    sourceCode: code,
                    error: err.message
                });
            }
        }
        return results;
    }

    /**
     * Retrieve current status across all integration sources
     */
    async getSyncStatus() {
        const sourcesRes = await db.query('SELECT * FROM integration_sources ORDER BY code ASC', []);
        const sources = sourcesRes.rows;

        const latestRuns = await db.query(`
            SELECT DISTINCT ON (source_id)
                id, source_id, started_at, completed_at, status,
                records_received, records_created, records_updated, records_failed, error_summary
            FROM sync_runs
            ORDER BY source_id, started_at DESC
        `, []);

        const runMap = new Map();
        for (const r of latestRuns.rows) {
            runMap.set(r.source_id, r);
        }

        return sources.map(s => ({
            ...s,
            latestSyncRun: runMap.get(s.id) || null
        }));
    }

    /**
     * Retrieve paginated history of sync runs
     */
    async getSyncHistory(filters = {}) {
        const { source, status } = filters;
        const queryText = `
            SELECT 
                r.id, r.started_at, r.completed_at, r.status,
                r.records_received, r.records_created, r.records_updated, r.records_failed,
                r.error_summary, r.metadata,
                s.code AS source_code, s.name AS source_name, s.system_type
            FROM sync_runs r
            JOIN integration_sources s ON r.source_id = s.id
            WHERE ($1::varchar IS NULL OR s.code = $1)
              AND ($2::varchar IS NULL OR r.status = $2)
            ORDER BY r.started_at DESC
            LIMIT 50
        `;

        const { rows } = await db.query(queryText, [
            source ? source.toUpperCase() : null,
            status ? status.toUpperCase() : null
        ]);

        return rows;
    }

    /**
     * Get integration sources configuration
     */
    async getSources() {
        const { rows } = await db.query('SELECT * FROM integration_sources ORDER BY code ASC', []);
        return rows;
    }
}

module.exports = new SyncGatewayService();
