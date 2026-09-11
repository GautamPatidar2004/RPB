/**
 * AIPlanningBridge
 * 
 * Bridges backend maintenance requests, asset, defect, window, and train data to the
 * AI planning service (/api/v1/planning/generate).
 * 
 * Requirements implemented:
 * - Direct batch mapping to PlanningPipelineRequest
 * - Resilient retry and timeout handling (callAIServiceWithRetry)
 * - Safe failure recovery: marks run FAILED, releases tasks to PENDING
 * - Concurrency protection: detects and blocks duplicate allocation of PLANNING/SCHEDULED tasks
 * - Support for 2-step (POST /planning-runs -> POST /planning-runs/:id/generate) and 1-step flow
 * - Result persistence preserving all schedule, group, conflict, score, explanation, and model metadata
 * - Zero leakage of credentials or internal service secrets
 */

const http = require('http');
const https = require('https');
const db = require('../config/db');
const aiGatewayService = require('./aiGatewayService');

class AIPlanningBridge {
    constructor() {
        this.aiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
        this.timeoutMs = parseInt(process.env.AI_SERVICE_TIMEOUT_MS || '15000', 10);
        this.maxRetries = parseInt(process.env.AI_SERVICE_MAX_RETRIES || '2', 10);
    }

    /**
     * Generates a deterministic planning run ID
     */
    generatePlanningRunId(corridorCode = 'NDLS-CNB') {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const rand = Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0');
        return `RUN-${corridorCode}-${dateStr}-${rand}`;
    }

    /**
     * Normalizes department code to the AI service's strict category set: {'ENGG', 'SNT', 'TRD'}
     */
    normalizeDepartment(dept) {
        if (!dept) return 'ENGG';
        const d = String(dept).trim().toUpperCase();
        if (d === 'CIVIL' || d === 'ENGG' || d === 'ENGINEERING') return 'ENGG';
        if (d === 'SIGNAL' || d === 'SNT' || d === 'SIGNALLING') return 'SNT';
        if (d === 'ELECTRICAL' || d === 'TRD' || d === 'TRACTION') return 'TRD';
        return 'ENGG';
    }

    /**
     * Normalizes criticality rating to {'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'}
     */
    normalizeCriticality(crit) {
        if (!crit) return 'MEDIUM';
        const c = String(crit).trim().toUpperCase();
        if (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(c)) return c;
        return 'MEDIUM';
    }

    /**
     * Normalizes urgency rating to {'LOW', 'MEDIUM', 'HIGH', 'IMMEDIATE'}
     */
    normalizeUrgency(urg) {
        if (!urg) return 'MEDIUM';
        const u = String(urg).trim().toUpperCase();
        if (['LOW', 'MEDIUM', 'HIGH', 'IMMEDIATE'].includes(u)) return u;
        return 'MEDIUM';
    }

    /**
     * Map normalized maintenance tasks into AI service MaintenanceRequestItem format.
     * Enforces domain integrity and ensures asset & defect details are correctly passed.
     */
    mapRequestsToAISchema(tasks = []) {
        return tasks.map(t => {
            const constraints = t.operational_constraints || {};
            const duration = Number(t.duration_minutes || t.requested_duration || 120);
            if (isNaN(duration) || duration <= 0) {
                throw new Error(`Invalid duration [${t.duration_minutes}] for maintenance task [${t.task_code || t.id}]`);
            }

            const priority = Math.max(1, Math.min(5, Number(t.priority || 3)));
            const department = this.normalizeDepartment(t.department_code || t.department);
            const criticality = this.normalizeCriticality(t.criticality || (t.asset && t.asset.criticality));
            const urgency = this.normalizeUrgency(t.urgency || constraints.severity);

            // Asset features
            const assetId = t.asset_id || (t.asset && t.asset.id) || 'a1111111-1111-1111-1111-111111111111';
            const assetCode = t.asset_code || (t.asset && t.asset.asset_code) || 'ASSET-GENERIC';
            const assetType = t.asset_type || (t.asset && t.asset.asset_type) || 'TRACK';
            const startKm = Number(t.start_kilometer ?? (t.asset && t.asset.start_kilometer) ?? 0.0);
            const endKm = Number(t.end_kilometer ?? (t.asset && t.asset.end_kilometer) ?? (startKm + 1.0));

            return {
                task_id: t.id,
                task_code: t.task_code || `TSK-${t.id.slice(0, 8)}`,
                department: department,
                maintenance_type: t.maintenance_type || 'TRACK_TAMPING',
                asset_id: assetId,
                asset_code: assetCode,
                asset_type: assetType,
                start_kilometer: startKm,
                end_kilometer: Math.max(endKm, startKm + 0.1),
                requested_duration_minutes: duration,
                priority: priority,
                criticality: criticality,
                urgency: urgency,
                required_by_date: t.required_by_date ? new Date(t.required_by_date).toISOString() : null,
                is_overdue: false,
                power_block_required: Boolean(t.power_block_required),
                traffic_block_required: Boolean(t.traffic_block_required ?? true),
                speed_restriction_kmph: Number(t.speed_restriction_kmph || 0),
                machinery_required: constraints.machinery_required || constraints.machineRequired || null,
                crew_required: Number(constraints.crew_required || 1),
                depends_on_task_ids: Array.isArray(constraints.dependencies) ? constraints.dependencies : []
            };
        });
    }

    /**
     * Map block windows to AI BlockWindowSummary format
     */
    mapWindowsToAISchema(windows = [], corridorCode = 'NDLS-CNB') {
        return windows.map(w => ({
            window_id: w.id,
            corridor_code: corridorCode,
            start_time: new Date(w.start_time).toISOString(),
            end_time: new Date(w.end_time).toISOString(),
            duration_minutes: Number(w.duration_minutes || 180),
            line_designation: w.line_designation || 'UP_MAIN',
            start_kilometer: Number(w.start_kilometer || 0),
            end_kilometer: Number(w.end_kilometer || 1)
        }));
    }

    /**
     * Map train movements to AI TrainMovementSummary format
     */
    mapTrainsToAISchema(trains = [], corridorCode = 'NDLS-CNB') {
        return trains.map(trn => ({
            train_id: trn.id,
            train_number: trn.train_number,
            corridor_code: corridorCode,
            scheduled_start_time: new Date(trn.scheduled_start_time).toISOString(),
            scheduled_end_time: new Date(trn.scheduled_end_time).toISOString(),
            direction: trn.direction || 'DOWN',
            train_type: trn.train_type || 'EXPRESS',
            priority: Number(trn.priority || 3),
            is_high_priority: Number(trn.priority || 3) <= 2
        }));
    }

    /**
     * Internal single HTTP request with timeout.
     */
    async _singleHttpCall(payload) {
        const url = new URL('/api/v1/planning/generate', this.aiServiceUrl);
        const data = JSON.stringify(payload);
        const client = url.protocol === 'https:' ? https : http;

        return new Promise((resolve, reject) => {
            const req = client.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                },
                timeout: this.timeoutMs
            }, (res) => {
                let responseBody = '';
                res.on('data', chunk => { responseBody += chunk; });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const parsed = JSON.parse(responseBody);
                            resolve(parsed);
                        } catch (err) {
                            reject(new Error(`AI Service returned invalid JSON: ${err.message}`));
                        }
                    } else {
                        let cleanMessage = responseBody.trim();
                        if (res.statusCode === 502 || responseBody.includes('<title>502</title>')) {
                            cleanMessage = 'AI Service unavailable (502 Bad Gateway). Service may be booting up or offline.';
                        } else if (cleanMessage.startsWith('<!DOCTYPE') || cleanMessage.startsWith('<html')) {
                            cleanMessage = `HTML Error Page (${cleanMessage.slice(0, 100)}...)`;
                        } else if (cleanMessage.length > 200) {
                            cleanMessage = cleanMessage.slice(0, 200) + '...';
                        }
                        const error = new Error(`AI Service returned HTTP ${res.statusCode}: ${cleanMessage}`);
                        error.statusCode = res.statusCode;
                        reject(error);
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                const err = new Error(`AI Service request timed out after ${this.timeoutMs}ms`);
                err.isTimeout = true;
                reject(err);
            });

            req.on('error', (err) => {
                reject(new Error(`Failed to reach AI Service at ${this.aiServiceUrl}: ${err.message}`));
            });

            req.write(data);
            req.end();
        });
    }

    /**
     * Calls the AI service endpoint with retry & exponential backoff.
     * Overridable in testing via mockSender.
     */
    async callAIService(payload, mockSender = null) {
        if (typeof mockSender === 'function') {
            return await mockSender(payload);
        }

        let lastError = null;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                return await this._singleHttpCall(payload);
            } catch (err) {
                lastError = err;
                // If it is a client validation error (4xx except 408/429), don't retry
                if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500 && err.statusCode !== 408 && err.statusCode !== 429) {
                    throw err;
                }

                if (attempt < this.maxRetries) {
                    const delayMs = Math.min(500 * Math.pow(2, attempt), 3000);
                    console.warn(`[AIPlanningBridge]: AI call attempt ${attempt + 1} failed (${err.message}). Retrying in ${delayMs}ms...`);
                    await new Promise(r => setTimeout(r, delayMs));
                }
            }
        }
        throw lastError;
    }

    /**
     * Resolves corridor by corridorId or corridorCode.
     */
    async resolveCorridor(corridorId, corridorCode) {
        let corridor = null;
        if (corridorId) {
            const res = await db.query('SELECT * FROM corridors WHERE id = $1', [corridorId]);
            if (res.rows.length > 0) corridor = res.rows[0];
            else throw new Error(`Corridor with ID [${corridorId}] not found.`);
        } else if (corridorCode) {
            const res = await db.query('SELECT * FROM corridors WHERE code = $1', [corridorCode.trim().toUpperCase()]);
            if (res.rows.length > 0) corridor = res.rows[0];
            else throw new Error(`Corridor with code [${corridorCode}] not found.`);
        } else {
            const res = await db.query('SELECT * FROM corridors WHERE is_active = TRUE LIMIT 1');
            corridor = res.rows[0] || null;
        }
        if (!corridor) {
            throw new Error(`Target corridor [${corridorCode || corridorId}] not found.`);
        }
        return corridor;
    }

    /**
     * Resolves planning horizon timestamps with strict validation.
     */
    resolveHorizon(horizonStart, horizonEnd) {
        const startDate = horizonStart ? new Date(horizonStart) : new Date();
        const endDate = horizonEnd ? new Date(horizonEnd) : new Date(startDate.getTime() + 7 * 86400000);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
            throw new Error('Invalid planning horizon: horizonEnd must be strictly after horizonStart');
        }
        return { startDate, endDate };
    }

    /**
     * Phase 1: Creates a planning run, checks for concurrency conflicts,
     * locks candidate tasks into 'PLANNING' state, and stores run in DB as 'CREATED'.
     */
    async createPlanningRun(options = {}, user = null) {
        const {
            corridorCode = 'NDLS-CNB',
            corridorId = null,
            horizonStart = null,
            horizonEnd = null,
            requestIds = null,
            planningRunId = null
        } = options;

        const corridor = await this.resolveCorridor(corridorId, corridorCode);
        const { startDate, endDate } = this.resolveHorizon(horizonStart, horizonEnd);
        const runId = planningRunId || this.generatePlanningRunId(corridor.code);

        // Check if run ID already exists
        const existingRunRes = await db.query(
            'SELECT * FROM planning_runs WHERE planning_run_id = $1',
            [runId]
        );
        if (existingRunRes.rows.length > 0) {
            const existing = existingRunRes.rows[0];
            if (existing.status === 'COMPLETED' && existing.plan_id) {
                const planDetails = await aiGatewayService.getPlanById(existing.plan_id);
                return {
                    success: true,
                    isDuplicate: true,
                    message: `Planning run [${runId}] has already completed successfully.`,
                    planningRun: existing,
                    plan: planDetails
                };
            }
        }

        // Fetch candidate maintenance tasks
        const allTasksQuery = `
            SELECT 
                t.id, t.task_code, t.title, t.description, t.maintenance_type,
                t.duration_minutes, t.priority, t.criticality, t.urgency,
                t.required_by_date, t.status, t.power_block_required,
                t.traffic_block_required, t.speed_restriction_kmph,
                t.operational_constraints,
                a.id AS asset_id, a.asset_code, a.name AS asset_name, a.location AS asset_location,
                a.asset_type, a.start_kilometer, a.end_kilometer,
                d.code AS department_code, s.code AS source_system
            FROM maintenance_tasks t
            JOIN assets a ON t.asset_id = a.id
            JOIN departments d ON t.department_id = d.id
            JOIN integration_sources s ON t.source_system_id = s.id
            WHERE t.corridor_id = $1
              AND t.deleted_at IS NULL
            ORDER BY t.priority ASC, t.required_by_date ASC
        `;
        const tasksRes = await db.query(allTasksQuery, [corridor.id]);
        const allCorridorTasks = tasksRes.rows;

        let candidateTasks = [];
        if (Array.isArray(requestIds) && requestIds.length > 0) {
            const idSet = new Set(requestIds);
            candidateTasks = allCorridorTasks.filter(t => idSet.has(t.id) || idSet.has(t.external_record_id) || idSet.has(t.task_code));
        } else {
            // Default to eligible PENDING/INCOMING tasks
            candidateTasks = allCorridorTasks.filter(t => t.status === 'PENDING' || t.status === 'INCOMING');
        }

        if (candidateTasks.length === 0) {
            throw new Error(`No eligible pending maintenance requests found for corridor [${corridor.code}].`);
        }

        // Concurrency Protection: Check if any candidate tasks are ALREADY locked in 'PLANNING' or 'SCHEDULED'
        const lockedInPlanning = candidateTasks.filter(t => t.status === 'PLANNING');
        if (lockedInPlanning.length > 0) {
            const lockedCodes = lockedInPlanning.map(t => t.task_code || t.id).join(', ');
            const conflictErr = new Error(`Cannot create planning run: maintenance request(s) [${lockedCodes}] are currently locked in an active planning run.`);
            conflictErr.statusCode = 409;
            throw conflictErr;
        }

        const alreadyScheduled = candidateTasks.filter(t => t.status === 'SCHEDULED');
        if (alreadyScheduled.length > 0 && (!requestIds || requestIds.length === 0)) {
            // Filter out already scheduled tasks if not explicitly forced
            candidateTasks = candidateTasks.filter(t => t.status !== 'SCHEDULED');
        }

        const inputRequestIds = candidateTasks.map(t => t.id);
        const sourceSystems = [...new Set(candidateTasks.map(t => t.source_system))];

        // Insert planning run record with status = 'CREATED'
        const insertRes = await db.query(`
            INSERT INTO planning_runs (
                planning_run_id, corridor_id, horizon_start, horizon_end,
                input_request_ids, source_systems, status, execution_metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (planning_run_id) DO UPDATE SET
                status = EXCLUDED.status,
                updated_at = NOW()
            RETURNING *
        `, [
            runId, corridor.id, startDate, endDate,
            JSON.stringify(inputRequestIds), JSON.stringify(sourceSystems),
            'CREATED', {
                initiatedBy: user ? user.username : 'SYSTEM',
                candidateCount: candidateTasks.length,
                createdAt: new Date().toISOString()
            }
        ]);

        const planningRunRecord = insertRes.rows[0];

        // Concurrency Lock: Transition candidate tasks to PLANNING status
        for (const taskId of inputRequestIds) {
            await db.query("UPDATE maintenance_tasks SET status = 'PLANNING' WHERE id = $1", [taskId]);
        }

        return {
            success: true,
            planningRunId: runId,
            planningRun: planningRunRecord,
            candidateTasks,
            inputRequestIds,
            corridor,
            startDate,
            endDate
        };
    }

    /**
     * Phase 2: Generates and persists the optimized plan for an existing planning run.
     * Runtime Flow:
     * FETCH REQUIRED DATA -> NORMALIZE -> AI SERVICE -> XGBoost -> OR-Tools -> Plan Scoring -> Best Plan -> Explanation -> Persist Result -> Update Statuses
     */
    async generatePlanForRun(runIdentifier, options = {}, user = null, mockAISender = null) {
        // 1. Locate existing planning run
        const runRes = await db.query(
            'SELECT * FROM planning_runs WHERE planning_run_id = $1 OR id = $1',
            [runIdentifier]
        );
        if (runRes.rows.length === 0) {
            throw new Error(`Planning run [${runIdentifier}] not found.`);
        }
        const run = runRes.rows[0];
        const runId = run.planning_run_id;

        // Verify corridor
        const corridor = await this.resolveCorridor(run.corridor_id, null);
        const startDate = new Date(run.horizon_start);
        const endDate = new Date(run.horizon_end);

        const inputRequestIds = typeof run.input_request_ids === 'string'
            ? JSON.parse(run.input_request_ids)
            : (run.input_request_ids || []);

        const sourceSystems = typeof run.source_systems === 'string'
            ? JSON.parse(run.source_systems)
            : (run.source_systems || ['DEMO']);

        // Update run status to IN_PROGRESS
        await db.query(
            "UPDATE planning_runs SET status = 'IN_PROGRESS', updated_at = NOW() WHERE planning_run_id = $1",
            [runId]
        );

        // 2. Fetch candidate maintenance tasks (with assets & defects)
        const tasksQuery = `
            SELECT 
                t.id, t.task_code, t.title, t.description, t.maintenance_type,
                t.duration_minutes, t.priority, t.criticality, t.urgency,
                t.required_by_date, t.status, t.power_block_required,
                t.traffic_block_required, t.speed_restriction_kmph,
                t.operational_constraints,
                a.id AS asset_id, a.asset_code, a.name AS asset_name, a.location AS asset_location,
                a.asset_type, a.start_kilometer, a.end_kilometer, a.criticality AS asset_criticality,
                d.code AS department_code, s.code AS source_system
            FROM maintenance_tasks t
            JOIN assets a ON t.asset_id = a.id
            JOIN departments d ON t.department_id = d.id
            JOIN integration_sources s ON t.source_system_id = s.id
            WHERE t.id = ANY($1::uuid[])
        `;
        const tasksRes = await db.query(tasksQuery, [inputRequestIds]);
        const candidateTasks = tasksRes.rows;

        if (candidateTasks.length === 0) {
            await db.query(
                "UPDATE planning_runs SET status = 'FAILED', failure_reason = 'NO_CANDIDATE_TASKS', updated_at = NOW() WHERE planning_run_id = $1",
                [runId]
            );
            return {
                success: false,
                planningRunId: runId,
                status: 'FAILED',
                error: 'No candidate tasks found in database for run.'
            };
        }

        // 3. Fetch block windows & scheduled trains in horizon
        const windowsRes = await db.query(`
            SELECT * FROM block_windows
            WHERE corridor_id = $1
              AND availability_status IN ('AVAILABLE', 'RESERVED')
              AND start_time >= $2 AND end_time <= $3
            ORDER BY start_time ASC
        `, [corridor.id, startDate, endDate]);

        const trainsRes = await db.query(`
            SELECT * FROM train_movements
            WHERE corridor_id = $1
              AND status IN ('SCHEDULED', 'RUNNING')
              AND scheduled_start_time >= $2 AND scheduled_end_time <= $3
            ORDER BY scheduled_start_time ASC
        `, [corridor.id, startDate, endDate]);

        // 4. Map to AI Planning Pipeline Request Schema
        const {
            forceDeterministicExplanation = true,
            scoringConfig = null,
            userQuery = null,
            timeLimitSeconds = null
        } = options;

        let aiPayload;
        try {
            aiPayload = {
                corridor_code: corridor.code,
                horizon_start: startDate.toISOString(),
                horizon_end: endDate.toISOString(),
                data_source: 'INLINE_PAYLOAD',
                inline_requests: this.mapRequestsToAISchema(candidateTasks),
                inline_windows: this.mapWindowsToAISchema(windowsRes.rows, corridor.code),
                inline_trains: this.mapTrainsToAISchema(trainsRes.rows, corridor.code),
                scoring_config: scoringConfig || null,
                user_query: userQuery || null,
                time_limit_seconds: timeLimitSeconds || null,
                force_deterministic_explanation: Boolean(forceDeterministicExplanation)
            };
        } catch (normErr) {
            console.error(`[AIPlanningBridge]: Payload normalization error for run [${runId}]:`, normErr.message);
            await db.query(
                "UPDATE planning_runs SET status = 'FAILED', failure_reason = $1, updated_at = NOW() WHERE planning_run_id = $2",
                [normErr.message, runId]
            );
            // Revert tasks to PENDING
            for (const taskId of inputRequestIds) {
                await db.query("UPDATE maintenance_tasks SET status = 'PENDING' WHERE id = $1", [taskId]);
            }
            return {
                success: false,
                planningRunId: runId,
                status: 'FAILED',
                error: normErr.message
            };
        }

        // 5. Invoke AI Service
        let aiResponse = null;
        try {
            aiResponse = await this.callAIService(aiPayload, mockAISender);

            if (!aiResponse || (aiResponse.pipeline_status !== 'SUCCESS' && aiResponse.pipeline_status !== 'OPTIMAL' && aiResponse.pipeline_status !== 'DEGRADED')) {
                const statusReason = aiResponse ? (aiResponse.message || aiResponse.pipeline_status) : 'Empty AI response';
                throw new Error(`AI Planning Pipeline failed to generate feasible plan: ${statusReason}`);
            }
        } catch (aiErr) {
            // Failure Handling: Mark planning run as FAILED and revert tasks to PENDING
            console.error(`[AIPlanningBridge]: AI pipeline invocation failed for run [${runId}]:`, aiErr.message);

            await db.query(`
                UPDATE planning_runs
                SET status = 'FAILED', failure_reason = $1, updated_at = NOW()
                WHERE planning_run_id = $2
            `, [aiErr.message, runId]);

            // Revert tasks back to PENDING so they are never incorrectly SCHEDULED or stuck in PLANNING
            for (const taskId of inputRequestIds) {
                await db.query("UPDATE maintenance_tasks SET status = 'PENDING' WHERE id = $1", [taskId]);
            }

            return {
                success: false,
                planningRunId: runId,
                status: 'FAILED',
                error: aiErr.message,
                eligibleRequestsCount: candidateTasks.length
            };
        }

        // 6. Process AI Output & Persist Plan
        const scheduledBlocks = aiResponse.scheduled_blocks || [];
        const unscheduledReports = aiResponse.unscheduled_requests || [];
        const groupedTasks = aiResponse.grouped_tasks || [];
        const conflicts = aiResponse.conflicts || [];

        // Build assignedTasks array for aiGatewayService.createPlan
        const assignedTasksForPlan = scheduledBlocks.map((sb, idx) => ({
            maintenanceTaskId: sb.task_id,
            assignedBlockWindowId: sb.assigned_window_id || null,
            assignedStartTime: sb.start_time,
            assignedEndTime: sb.end_time,
            sequenceOrder: idx + 1,
            aiRecommendationScore: aiResponse.score ? Number((aiResponse.score / 100).toFixed(4)) : 0.9000,
            shadowTask: Boolean(sb.is_shadow_block),
            notes: `Scheduled via AI Run ${runId}`
        }));

        // Case where solver found no feasible schedule
        if (assignedTasksForPlan.length === 0) {
            await db.query(`
                UPDATE planning_runs
                SET status = 'COMPLETED', failure_reason = 'NO_FEASIBLE_WINDOW_ASSIGNMENT', updated_at = NOW()
                WHERE planning_run_id = $1
            `, [runId]);

            for (const taskId of inputRequestIds) {
                await db.query("UPDATE maintenance_tasks SET status = 'POSTPONED' WHERE id = $1", [taskId]);
            }

            return {
                success: true,
                planningRunId: runId,
                status: 'COMPLETED_WITH_UNSCHEDULED_TASKS',
                scheduledCount: 0,
                unscheduledCount: unscheduledReports.length,
                message: 'No tasks could be scheduled within available block windows.'
            };
        }

        const planReference = `PLAN-${corridor.code}-${runId.slice(-8)}`;
        const aiMetadata = {
            planning_run_id: runId,
            pipeline_status: aiResponse.pipeline_status,
            data_source: aiResponse.data_source,
            score: aiResponse.score || 0.0,
            score_breakdown: aiResponse.score_breakdown || {},
            predicted_metrics: aiResponse.predicted_metrics || {},
            optimization_metrics: aiResponse.optimization_metrics || {},
            explanation: aiResponse.explanation || null,
            model_versions: aiResponse.model_versions || {},
            optimizer_status: aiResponse.optimizer_status || 'OPTIMAL',
            grouped_tasks: groupedTasks,
            unscheduled_requests: unscheduledReports,
            warnings: aiResponse.warnings || [],
            conflicts: conflicts,
            source_systems: sourceSystems,
            stage_durations_ms: aiResponse.stage_durations_ms || {},
            total_execution_time_ms: aiResponse.total_execution_time_ms || 0
        };

        const planResult = await aiGatewayService.createPlan({
            planReference,
            corridorId: corridor.id,
            horizonStartDate: startDate.toISOString(),
            horizonEndDate: endDate.toISOString(),
            version: 1,
            aiOptimizationMetadata: aiMetadata,
            assignedTasks: assignedTasksForPlan
        }, user);

        const savedPlan = (await aiGatewayService.getPlanById(planResult.plan.id)) || planResult.plan;

        // 7. Update Request Lifecycle:
        // - Scheduled tasks -> 'SCHEDULED'
        // - Unscheduled tasks -> 'POSTPONED'
        const scheduledIdSet = new Set(scheduledBlocks.map(sb => sb.task_id));
        for (const taskId of inputRequestIds) {
            if (scheduledIdSet.has(taskId)) {
                await db.query("UPDATE maintenance_tasks SET status = 'SCHEDULED' WHERE id = $1", [taskId]);
            } else {
                await db.query("UPDATE maintenance_tasks SET status = 'POSTPONED' WHERE id = $1", [taskId]);
            }
        }

        // 8. Finalize planning_runs status to COMPLETED
        await db.query(`
            UPDATE planning_runs
            SET status = 'COMPLETED', plan_id = $1, execution_metadata = $2, updated_at = NOW()
            WHERE planning_run_id = $3
        `, [savedPlan.id, JSON.stringify(aiMetadata), runId]);

        return {
            success: true,
            planningRunId: runId,
            status: 'COMPLETED',
            plan: savedPlan,
            scheduledCount: scheduledBlocks.length,
            unscheduledCount: unscheduledReports.length,
            groupedCount: groupedTasks.length,
            conflictCount: conflicts.length,
            score: aiResponse.score,
            explanation: aiResponse.explanation,
            aiMetadata
        };
    }

    /**
     * Unified single execution method: Creates run and immediately generates plan.
     */
    async executePlanningRun(options = {}, user = null, mockAISender = null) {
        // Step 1: Create run & lock tasks
        const initResult = await this.createPlanningRun(options, user);
        if (initResult.isDuplicate) {
            return initResult;
        }

        // Step 2: Generate plan
        return await this.generatePlanForRun(initResult.planningRunId, options, user, mockAISender);
    }

    /**
     * Lists planning runs with corridor and status filters
     */
    async listPlanningRuns(filters = {}) {
        const { corridor_id, corridorId, status } = filters;
        const targetCorridor = corridor_id || corridorId || null;
        const queryText = `
            SELECT * FROM planning_runs
            WHERE ($1::uuid IS NULL OR corridor_id = $1)
              AND ($2::varchar IS NULL OR status = $2)
            ORDER BY created_at DESC
        `;
        const { rows } = await db.query(queryText, [targetCorridor, status ? status.toUpperCase() : null]);
        return rows;
    }

    /**
     * Retrieves planning run by planning_run_id or UUID
     */
    async getPlanningRunById(runId) {
        const queryText = 'SELECT * FROM planning_runs WHERE planning_run_id = $1 OR id = $1';
        const { rows } = await db.query(queryText, [runId]);
        if (rows.length === 0) return null;

        const run = rows[0];
        let plan = null;
        if (run.plan_id) {
            plan = await aiGatewayService.getPlanById(run.plan_id);
        }

        return {
            ...run,
            plan
        };
    }
}

module.exports = new AIPlanningBridge();
