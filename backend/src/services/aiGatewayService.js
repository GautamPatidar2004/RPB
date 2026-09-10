const db = require('../config/db');

class AIGatewayService {
    /**
     * Retrieve all input data required for AI optimization within a planning horizon
     */
    async getPlanningData(filters = {}) {
        const {
            corridor_id,
            corridor_code,
            start_date,
            end_date,
            horizon_start,
            horizon_end
        } = filters;

        // 1. Resolve Corridor
        let corridor = null;
        if (corridor_id) {
            const { rows } = await db.query('SELECT * FROM corridors WHERE id = $1', [corridor_id]);
            corridor = rows[0] || null;
        } else if (corridor_code) {
            const { rows } = await db.query('SELECT * FROM corridors WHERE code = $1', [corridor_code.toUpperCase()]);
            corridor = rows[0] || null;
        } else {
            const { rows } = await db.query('SELECT * FROM corridors WHERE is_active = TRUE ORDER BY code ASC LIMIT 1', []);
            corridor = rows[0] || null;
        }

        if (!corridor) {
            throw new Error('Target corridor could not be identified for AI planning.');
        }

        const horizonStart = new Date(start_date || horizon_start || Date.now());
        const horizonEnd = new Date(end_date || horizon_end || Date.now() + 3 * 86400000); // 72-hour default horizon

        // 2. Query Maintenance Tasks for Corridor
        const tasksQuery = `
            SELECT 
                t.id, t.task_code, t.title, t.description, t.maintenance_type,
                t.duration_minutes, t.priority, t.criticality, t.urgency,
                t.required_by_date, t.status, t.power_block_required,
                t.traffic_block_required, t.speed_restriction_kmph,
                t.operational_constraints,
                a.id AS asset_id, a.asset_code, a.name AS asset_name, a.location AS asset_location,
                d.code AS department_code, s.code AS source_system
            FROM maintenance_tasks t
            JOIN assets a ON t.asset_id = a.id
            JOIN departments d ON t.department_id = d.id
            JOIN integration_sources s ON t.source_system_id = s.id
            WHERE t.corridor_id = $1
              AND t.deleted_at IS NULL
              AND t.status IN ('PENDING', 'SCHEDULED', 'DEFERRED')
            ORDER BY t.priority ASC, t.required_by_date ASC
        `;
        const tasksRes = await db.query(tasksQuery, [corridor.id]);

        // 3. Query Corridor Assets
        const assetsQuery = `
            SELECT 
                a.id, a.asset_code, a.asset_type, a.name, a.location,
                a.start_kilometer, a.end_kilometer, a.criticality, a.health_status,
                s.code AS source_system
            FROM assets a
            JOIN integration_sources s ON a.source_system_id = s.id
            WHERE a.corridor_id = $1 AND a.is_active = TRUE
            ORDER BY a.start_kilometer ASC
        `;
        const assetsRes = await db.query(assetsQuery, [corridor.id]);

        // 4. Query Available Block Windows in Horizon
        const windowsQuery = `
            SELECT 
                w.id, w.start_time, w.end_time, w.duration_minutes,
                w.availability_status, w.block_type, w.line_designation,
                w.start_kilometer, w.end_kilometer, w.operational_constraints,
                s.code AS source_system
            FROM block_windows w
            JOIN integration_sources s ON w.source_system_id = s.id
            WHERE w.corridor_id = $1
              AND w.availability_status IN ('AVAILABLE', 'RESERVED')
              AND w.start_time >= $2 AND w.end_time <= $3
            ORDER BY w.start_time ASC
        `;
        const windowsRes = await db.query(windowsQuery, [corridor.id, horizonStart, horizonEnd]);

        // 5. Query Scheduled Train Movements in Horizon
        const trainsQuery = `
            SELECT 
                m.id, m.train_number, m.service_identifier, m.scheduled_start_time,
                m.scheduled_end_time, m.direction, m.train_type, m.priority,
                m.status, m.operational_details, s.code AS source_system
            FROM train_movements m
            JOIN integration_sources s ON m.source_system_id = s.id
            WHERE m.corridor_id = $1
              AND m.status IN ('SCHEDULED', 'RUNNING')
              AND m.scheduled_start_time >= $2 AND m.scheduled_end_time <= $3
            ORDER BY m.scheduled_start_time ASC
        `;
        const trainsRes = await db.query(trainsQuery, [corridor.id, horizonStart, horizonEnd]);

        // 6. Maintenance Dependencies
        const depsQuery = `
            SELECT 
                d.id, d.task_id, d.depends_on_task_id, d.dependency_type, d.lag_minutes
            FROM maintenance_dependencies d
            JOIN maintenance_tasks t ON d.task_id = t.id
            WHERE t.corridor_id = $1
        `;
        const depsRes = await db.query(depsQuery, [corridor.id]);

        return {
            success: true,
            planningHorizon: {
                corridorId: corridor.id,
                corridorCode: corridor.code,
                corridorName: corridor.name,
                zone: corridor.zone,
                division: corridor.division,
                horizonStart: horizonStart.toISOString(),
                horizonEnd: horizonEnd.toISOString()
            },
            corridor: {
                id: corridor.id,
                code: corridor.code,
                name: corridor.name,
                lengthKm: corridor.total_length_km,
                lineType: corridor.line_type,
                electrified: corridor.electrified
            },
            maintenanceTasks: tasksRes.rows,
            assets: assetsRes.rows,
            blockWindows: windowsRes.rows,
            trainMovements: trainsRes.rows,
            dependencies: depsRes.rows,
            operationalConstraints: {
                maxConcurrentBlocksPerSection: 1,
                minHeadwayBufferMinutes: 15,
                ohePowerIsolationBufferMinutes: 10,
                speedRestrictionRecoveryMinutes: 20
            }
        };
    }

    /**
     * Ingest and validate an AI-generated optimized block plan
     */
    async createPlan(payload, user = null) {
        const {
            planReference,
            corridorId,
            horizonStartDate,
            horizonEndDate,
            version = 1,
            aiOptimizationMetadata = {},
            assignedTasks = []
        } = payload || {};

        // Validation 1: Required header metadata
        if (!planReference || !corridorId || !horizonStartDate || !horizonEndDate) {
            throw new Error('planReference, corridorId, horizonStartDate, and horizonEndDate are required');
        }

        const horizonStart = new Date(horizonStartDate);
        const horizonEnd = new Date(horizonEndDate);
        if (isNaN(horizonStart.getTime()) || isNaN(horizonEnd.getTime()) || horizonEnd <= horizonStart) {
            throw new Error('Invalid planning horizon dates: horizonEndDate must be strictly after horizonStartDate');
        }

        // Validation 2: Assigned tasks non-empty
        if (!Array.isArray(assignedTasks) || assignedTasks.length === 0) {
            throw new Error('Plan must contain at least one assignedTask');
        }

        // 1. Fetch available trains in this corridor horizon to check for conflicts
        const trainsRes = await db.query(
            'SELECT * FROM train_movements WHERE corridor_id = $1 AND scheduled_start_time >= $2 AND scheduled_end_time <= $3',
            [corridorId, horizonStart, horizonEnd]
        );
        const corridorTrains = trainsRes.rows;

        // 2. Fetch block windows to validate window boundaries
        const windowsRes = await db.query(
            'SELECT * FROM block_windows WHERE corridor_id = $1',
            [corridorId]
        );
        const windowMap = new Map(windowsRes.rows.map(w => [w.id, w]));

        let totalBlockDuration = 0;
        const detectedConflicts = [];
        const validatedTasks = [];

        // 3. Validate each task assignment and check for overlaps/conflicts
        for (let i = 0; i < assignedTasks.length; i++) {
            const at = assignedTasks[i];
            const startTime = new Date(at.assignedStartTime);
            const endTime = new Date(at.assignedEndTime);

            if (isNaN(startTime.getTime()) || isNaN(endTime.getTime()) || endTime <= startTime) {
                throw new Error(`Task #${i + 1} has invalid assigned start/end time`);
            }

            const slotDurationMinutes = Math.round((endTime - startTime) / 60000);
            totalBlockDuration += slotDurationMinutes;

            // Check task in DB
            const taskRes = await db.query('SELECT * FROM maintenance_tasks WHERE id = $1', [at.maintenanceTaskId]);
            if (taskRes.rows.length === 0) {
                throw new Error(`Maintenance task [${at.maintenanceTaskId}] not found in database`);
            }
            const task = taskRes.rows[0];

            // Verify window boundary if assigned to a specific window
            if (at.assignedBlockWindowId) {
                const win = windowMap.get(at.assignedBlockWindowId);
                if (win) {
                    const winStart = new Date(win.start_time);
                    const winEnd = new Date(win.end_time);
                    if (startTime < winStart || endTime > winEnd) {
                        detectedConflicts.push({
                            maintenanceTaskId: task.id,
                            trainMovementId: null,
                            conflictType: 'TIME_WINDOW_EXCEEDED',
                            severity: 'MEDIUM',
                            description: `Assigned task [${task.task_code}] exceeds window [${win.external_record_id}] boundaries.`,
                            resolutionStatus: 'UNRESOLVED',
                            resolutionDetails: {
                                assignedSlot: { start: startTime.toISOString(), end: endTime.toISOString() },
                                windowSlot: { start: winStart.toISOString(), end: winEnd.toISOString() }
                            }
                        });
                    }
                }
            }

            // Detect Conflicts against Train Movements (Temporal Overlap)
            for (const trn of corridorTrains) {
                const trnStart = new Date(trn.scheduled_start_time);
                const trnEnd = new Date(trn.scheduled_end_time);

                // Check overlap condition: (StartA <= EndB) and (EndA >= StartB)
                const isOverlapping = (startTime < trnEnd && endTime > trnStart);
                if (isOverlapping) {
                    const isHighPriority = trn.priority <= 2;
                    detectedConflicts.push({
                        maintenanceTaskId: task.id,
                        trainMovementId: trn.id,
                        conflictType: 'TRAIN_PATH_OVERLAP',
                        severity: isHighPriority ? 'CRITICAL' : 'HIGH',
                        description: `Block slot for [${task.task_code}] conflicts with Train #${trn.train_number} (${trn.train_type}) path.`,
                        resolutionStatus: 'UNRESOLVED',
                        resolutionDetails: {
                            trainNumber: trn.train_number,
                            trainType: trn.train_type,
                            priority: trn.priority,
                            conflictWindow: {
                                start: new Date(Math.max(startTime, trnStart)).toISOString(),
                                end: new Date(Math.min(endTime, trnEnd)).toISOString()
                            }
                        }
                    });
                }
            }

            validatedTasks.push({
                ...at,
                startTime,
                endTime,
                slotDurationMinutes
            });
        }

        // 4. Calculate Plan Metrics
        const totalAvailWindowsRes = await db.query(`
            SELECT COALESCE(SUM(duration_minutes), 0)::int AS total_avail
            FROM block_windows
            WHERE corridor_id = $1 AND start_time >= $2 AND end_time <= $3
        `, [corridorId, horizonStart, horizonEnd]);
        const availMinutes = Math.max(totalAvailWindowsRes.rows[0].total_avail, 1);
        const utilization = Math.min(100.00, Number(((totalBlockDuration / availMinutes) * 100).toFixed(2)));

        const operationalImpact = {
            totalSlotMinutes: totalBlockDuration,
            conflictedTrainsCount: detectedConflicts.filter(c => c.conflictType === 'TRAIN_PATH_OVERLAP').length,
            estimatedDelayMinutes: detectedConflicts.length * 25,
            punctualityImpactIndex: (1.0 - (detectedConflicts.length * 0.05)).toFixed(2)
        };

        // 5. Insert block_plans row
        const planInsertSql = `
            INSERT INTO block_plans (
                plan_reference, corridor_id, horizon_start_date, horizon_end_date,
                generated_by_user_id, status, approval_state, version,
                total_block_duration_minutes, task_count, utilization_percentage,
                conflict_count, operational_impact_metrics, ai_optimization_metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *;
        `;
        const planParams = [
            planReference,
            corridorId,
            horizonStart,
            horizonEnd,
            user ? user.id : null,
            'OPTIMIZED',
            'PENDING',
            version,
            totalBlockDuration,
            validatedTasks.length,
            utilization,
            detectedConflicts.length,
            JSON.stringify(operationalImpact),
            JSON.stringify(aiOptimizationMetadata)
        ];
        const planRes = await db.query(planInsertSql, planParams);
        const savedPlan = planRes.rows[0];

        // 6. Insert block_plan_tasks
        const savedTasks = [];
        for (let i = 0; i < validatedTasks.length; i++) {
            const vt = validatedTasks[i];
            const taskInsertSql = `
                INSERT INTO block_plan_tasks (
                    plan_id, maintenance_task_id, assigned_block_window_id,
                    assigned_start_time, assigned_end_time, sequence_order,
                    status, ai_recommendation_score, shadow_task, notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *;
            `;
            const taskParams = [
                savedPlan.id,
                vt.maintenanceTaskId,
                vt.assignedBlockWindowId || null,
                vt.startTime,
                vt.endTime,
                vt.sequenceOrder || (i + 1),
                'SCHEDULED',
                vt.aiRecommendationScore !== undefined ? vt.aiRecommendationScore : 0.9000,
                Boolean(vt.shadowTask),
                vt.notes || null
            ];
            const insRes = await db.query(taskInsertSql, taskParams);
            savedTasks.push(insRes.rows[0]);

            // Mark maintenance task status as SCHEDULED in database
            await db.query("UPDATE maintenance_tasks SET status = 'SCHEDULED' WHERE id = $1", [vt.maintenanceTaskId]);
        }

        // 7. Insert detected conflicts
        const savedConflicts = [];
        for (const cf of detectedConflicts) {
            const cfInsertSql = `
                INSERT INTO conflicts (
                    plan_id, maintenance_task_id, train_movement_id,
                    conflict_type, severity, description, resolution_status, resolution_details
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *;
            `;
            const cfParams = [
                savedPlan.id,
                cf.maintenanceTaskId,
                cf.trainMovementId,
                cf.conflictType,
                cf.severity,
                cf.description,
                cf.resolutionStatus,
                JSON.stringify(cf.resolutionDetails)
            ];
            const cfRes = await db.query(cfInsertSql, cfParams);
            savedConflicts.push(cfRes.rows[0]);
        }

        // 8. Record in audit logs
        try {
            await db.query(`
                INSERT INTO audit_logs (
                    user_id, action, entity_type, entity_id, old_values, new_values
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                user ? user.id : null,
                'PLAN_GENERATED',
                'BLOCK_PLAN',
                savedPlan.id,
                null,
                JSON.stringify({
                    planReference,
                    taskCount: savedTasks.length,
                    conflictCount: savedConflicts.length,
                    utilization
                })
            ]);
        } catch (auditErr) {
            console.error('[AIGatewayService]: Audit log insert warning:', auditErr.message);
        }

        return {
            success: true,
            message: `AI Optimized Block Plan [${planReference}] created and registered in PostgreSQL`,
            plan: savedPlan,
            assignedTasks: savedTasks,
            conflicts: savedConflicts
        };
    }

    /**
     * Retrieve complete plan detail with tasks and conflicts
     */
    async getPlanById(planId) {
        const planRes = await db.query('SELECT * FROM block_plans WHERE id = $1', [planId]);
        if (planRes.rows.length === 0) return null;
        const plan = planRes.rows[0];

        const tasksRes = await db.query('SELECT * FROM block_plan_tasks WHERE plan_id = $1 ORDER BY sequence_order ASC', [planId]);
        const conflictsRes = await db.query('SELECT * FROM conflicts WHERE plan_id = $1 ORDER BY created_at ASC', [planId]);

        return {
            ...plan,
            tasks: tasksRes.rows,
            conflicts: conflictsRes.rows
        };
    }

    /**
     * List generated block plans
     */
    async listPlans(filters = {}) {
        const { corridor_id, status } = filters;
        const queryText = `
            SELECT * FROM block_plans
            WHERE ($1::uuid IS NULL OR corridor_id = $1)
              AND ($2::varchar IS NULL OR status = $2)
            ORDER BY generated_at DESC
        `;
        const { rows } = await db.query(queryText, [corridor_id || null, status ? status.toUpperCase() : null]);
        return rows;
    }
}

module.exports = new AIGatewayService();
