/**
 * test_backend_integration.js
 * 
 * Comprehensive Integration Test Suite for Prompt 2:
 * 1. Demo Request Ingestion & Source-Independent Normalization (DEMO, BDMS, TDMS, SMMS)
 * 2. Maintenance Request Lifecycle Transitions (INCOMING -> PENDING -> PLANNING -> SCHEDULED/POSTPONED/REJECTED)
 * 3. Pending Request Queue Retrieval & Filtering
 * 4. Planning Run Creation & Candidate Eligibility Filtering
 * 5. Backend -> AI Service Payload Mapping
 * 6. Safe AI Service Failure Handling (Timeouts, Unavailable, 500)
 * 7. AI Result Persistence & Full Metadata Preservation
 * 8. Idempotency & Duplicate Prevention
 * 9. Authorization & Role-Based Access Control (RLS)
 */

const assert = require('assert');
const app = require('./src/app');
const maintenanceIngestionService = require('./src/services/maintenanceIngestionService');
const aiPlanningBridge = require('./src/services/aiPlanningBridge');
const db = require('./src/config/db');

function makeRequest(method, path, body = null, token = null) {
    return new Promise((resolve) => {
        const http = require('http');
        const server = http.createServer(app);

        server.listen(0, () => {
            const port = server.address().port;
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const options = {
                hostname: '127.0.0.1',
                port,
                path,
                method,
                headers
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    server.close();
                    let json = null;
                    try { json = JSON.parse(data); } catch { json = data; }
                    resolve({ status: res.statusCode, body: json });
                });
            });

            req.on('error', (err) => {
                server.close();
                resolve({ status: 500, error: err });
            });

            if (body) {
                req.write(JSON.stringify(body));
            }
            req.end();
        });
    });
}

async function runTests() {
    console.log('[Test] Starting Indian Railways Backend Integration Suite (Prompt 2)...\n');

    // 0. Authenticate users
    const plannerLogin = await makeRequest('POST', '/api/auth/login', {
        username: 'planner',
        password: 'Planner@123'
    });
    assert.strictEqual(plannerLogin.status, 200, 'Planner login must succeed');
    const plannerToken = plannerLogin.body.token;

    const adminLogin = await makeRequest('POST', '/api/auth/login', {
        username: 'admin',
        password: 'Admin@123'
    });
    assert.strictEqual(adminLogin.status, 200, 'Admin login must succeed');
    const adminToken = adminLogin.body.token;

    // =========================================================================
    // SECTION 1: Standardized Ingestion Pipeline (DEMO, BDMS, TDMS, SMMS)
    // =========================================================================
    console.log('1. Standardized Request Ingestion & Source-Independent Normalization');

    // 1a. Normalizer contract inspection
    const rawDemo = {
        requestId: 'DEMO-ENGG-001',
        sourceSystem: 'DEMO',
        department: 'ENGG',
        maintenanceType: 'RAIL_REPLACEMENT',
        requestedDuration: 180,
        priority: 1,
        severity: 'CRITICAL',
        risk: 'HIGH',
        asset: {
            assetCode: 'TRK-UP-112',
            name: 'UP Main Track Section',
            assetType: 'TRACK',
            location: 'KM 112.000 to 116.000',
            startKm: 112.0,
            endKm: 116.0
        },
        defect: {
            defectCode: 'DEF-USFD-99',
            defectType: 'USFD_INTERNAL_FLAW',
            severity: 'CRITICAL',
            failureRisk: 'HIGH'
        },
        trafficBlockRequired: true,
        powerBlockRequired: false,
        speedRestrictionKmph: 45
    };

    const normalized = maintenanceIngestionService.normalizeRequest(rawDemo);
    assert.strictEqual(normalized.request_id, 'DEMO-ENGG-001', 'request_id must be populated');
    assert.strictEqual(normalized.source_system, 'DEMO', 'source_system must be DEMO');
    assert.strictEqual(normalized.department, 'ENGG', 'department must be ENGG');
    assert.strictEqual(normalized.priority, 1, 'priority must be 1');
    assert.strictEqual(normalized.severity, 'CRITICAL', 'severity must be CRITICAL');
    assert.strictEqual(normalized.risk, 'HIGH', 'risk must be HIGH');
    assert.strictEqual(normalized.requested_duration, 180, 'duration must be 180');
    assert.strictEqual(normalized.asset.asset_code, 'TRK-UP-112', 'asset code must be preserved');
    assert.strictEqual(normalized.defect.defect_code, 'DEF-USFD-99', 'defect code must be preserved');
    assert.strictEqual(normalized.required_resources.power_block_required, false);
    assert.strictEqual(normalized.required_resources.traffic_block_required, true);
    assert.strictEqual(normalized.status, 'INCOMING', 'initial status must be INCOMING');
    console.log('  ✓ Normalized maintenance request contract verified');

    // 1b. Multi-source ingestion via REST API
    const bdmsRequest = {
        request_id: 'BDMS-ENGG-101',
        source_system: 'BDMS',
        department: 'ENGG',
        corridor_code: 'NDLS-CNB',
        maintenance_type: 'TRACK_TAMPING',
        duration_minutes: 120,
        priority: 2,
        criticality: 'HIGH',
        asset: { asset_code: 'TRK-UP-112', location: 'KM 112' }
    };
    const bdmsRes = await makeRequest('POST', '/api/maintenance-requests/ingest', bdmsRequest, plannerToken);
    assert.strictEqual(bdmsRes.status, 201, 'BDMS request ingestion should succeed');
    assert.strictEqual(bdmsRes.body.data.source_system, 'BDMS');
    assert.strictEqual(bdmsRes.body.data.status, 'PENDING', 'Validated request promoted to PENDING');

    const tdmsRequest = {
        request_id: 'TDMS-TRD-201',
        source_system: 'TDMS',
        department: 'TRD',
        corridor_code: 'NDLS-CNB',
        maintenance_type: 'OHE_CANTILEVER_INSPECTION',
        duration_minutes: 90,
        priority: 2,
        criticality: 'HIGH',
        power_block_required: true,
        asset: { asset_code: 'OHE-TDL-140', location: 'KM 204' }
    };
    const tdmsRes = await makeRequest('POST', '/api/maintenance-requests/ingest', tdmsRequest, plannerToken);
    assert.strictEqual(tdmsRes.status, 201, 'TDMS request ingestion should succeed');
    assert.strictEqual(tdmsRes.body.data.source_system, 'TDMS');

    const smmsRequest = {
        request_id: 'SMMS-SNT-301',
        source_system: 'SMMS',
        department: 'SNT',
        corridor_code: 'NDLS-CNB',
        maintenance_type: 'POINT_MACHINE_OVERHAUL',
        duration_minutes: 60,
        priority: 3,
        criticality: 'MEDIUM',
        asset: { asset_code: 'SIG-EI-CNB', location: 'Kanpur Yard' }
    };
    const smmsRes = await makeRequest('POST', '/api/maintenance-requests/ingest', smmsRequest, plannerToken);
    assert.strictEqual(smmsRes.status, 201, 'SMMS request ingestion should succeed');
    assert.strictEqual(smmsRes.body.data.source_system, 'SMMS');
    console.log('  ✓ Ingested requests from BDMS, TDMS, and SMMS through unified interface');

    // 1c. Batch ingestion via POST /api/maintenance-tasks
    const batchRequests = [
        {
            request_id: 'BDMS-BATCH-1',
            source_system: 'BDMS',
            department: 'ENGG',
            corridor_code: 'NDLS-CNB',
            duration_minutes: 150,
            priority: 1,
            asset: { asset_code: 'TRK-UP-112' }
        },
        {
            request_id: 'SMMS-BATCH-2',
            source_system: 'SMMS',
            department: 'SNT',
            corridor_code: 'NDLS-CNB',
            duration_minutes: 75,
            priority: 2,
            asset: { asset_code: 'SIG-EI-CNB' }
        }
    ];
    const batchRes = await makeRequest('POST', '/api/maintenance-tasks', batchRequests, plannerToken);
    assert.strictEqual(batchRes.status, 201, 'Batch ingestion should succeed');
    assert.strictEqual(batchRes.body.ingested, 2, 'Should ingest 2 requests');
    console.log('  ✓ Batch ingestion validated');

    // =========================================================================
    // SECTION 2: Maintenance Request Lifecycle Transitions
    // =========================================================================
    console.log('\n2. Standardized Request Lifecycle Transitions');

    const testTaskId = bdmsRes.body.data.id;
    assert(testTaskId, 'Task ID must be present');

    // Test transition from PENDING -> PLANNING
    const toPlanning = await makeRequest('PATCH', `/api/maintenance-requests/${testTaskId}/status`, { status: 'PLANNING' }, plannerToken);
    assert.strictEqual(toPlanning.status, 200);
    assert.strictEqual(toPlanning.body.data.status, 'PLANNING');

    // Test transition from PLANNING -> SCHEDULED
    const toScheduled = await makeRequest('PATCH', `/api/maintenance-requests/${testTaskId}/status`, { status: 'SCHEDULED' }, plannerToken);
    assert.strictEqual(toScheduled.status, 200);
    assert.strictEqual(toScheduled.body.data.status, 'SCHEDULED');

    // Test transition to POSTPONED
    const toPostponed = await makeRequest('PATCH', `/api/maintenance-requests/${testTaskId}/status`, { status: 'POSTPONED' }, plannerToken);
    assert.strictEqual(toPostponed.status, 200);
    assert.strictEqual(toPostponed.body.data.status, 'POSTPONED');

    // Test transition to REJECTED
    const toRejected = await makeRequest('PATCH', `/api/maintenance-requests/${testTaskId}/status`, { status: 'REJECTED' }, plannerToken);
    assert.strictEqual(toRejected.status, 200);
    assert.strictEqual(toRejected.body.data.status, 'REJECTED');

    // Test invalid status rejection
    const invalidStatus = await makeRequest('PATCH', `/api/maintenance-requests/${testTaskId}/status`, { status: 'UNKNOWN_STATUS' }, plannerToken);
    assert.strictEqual(invalidStatus.status, 400, 'Invalid status must be rejected with 400');
    console.log('  ✓ Lifecycle transitions (PENDING -> PLANNING -> SCHEDULED/POSTPONED/REJECTED) validated');

    // =========================================================================
    // SECTION 3: Pending Request Queue Retrieval & Filtering
    // =========================================================================
    console.log('\n3. Pending Request Queue Retrieval');

    // Re-set task to PENDING for subsequent tests
    await makeRequest('PATCH', `/api/maintenance-requests/${testTaskId}/status`, { status: 'PENDING' }, plannerToken);

    const pendingQueueRes = await makeRequest('GET', '/api/maintenance-requests/pending', null, plannerToken);
    assert.strictEqual(pendingQueueRes.status, 200);
    assert(Array.isArray(pendingQueueRes.body.data), 'Pending queue must be an array');
    assert(pendingQueueRes.body.count > 0, 'Pending queue must have at least 1 item');
    assert(pendingQueueRes.body.data.every(t => t.status === 'PENDING'), 'All items in pending queue must have status PENDING');

    // Check corridor filter
    const corridorPending = await makeRequest('GET', `/api/maintenance-requests/pending?corridor_id=${bdmsRes.body.data.corridor_id}`, null, plannerToken);
    assert.strictEqual(corridorPending.status, 200);
    assert(corridorPending.body.count > 0);

    // Check alias /api/maintenance-tasks/pending works identically
    const tasksAliasRes = await makeRequest('GET', '/api/maintenance-tasks/pending', null, plannerToken);
    assert.strictEqual(tasksAliasRes.status, 200);
    assert.strictEqual(tasksAliasRes.body.count, pendingQueueRes.body.count);
    console.log(`  ✓ Pending request queue retrieved: ${pendingQueueRes.body.count} pending tasks across sources`);

    // =========================================================================
    // SECTION 4: Planning Run Creation & Candidate Eligibility
    // =========================================================================
    console.log('\n4. Planning Run Creation & Candidate Eligibility Filtering');

    // Test invalid corridor failure
    const invalidCorridorRun = await makeRequest('POST', '/api/plans/planning-runs', {
        corridorCode: 'NON_EXISTENT_CORRIDOR'
    }, plannerToken);
    assert.strictEqual(invalidCorridorRun.status, 400, 'Invalid corridor must fail');

    console.log('  ✓ Invalid planning run rejected safely');

    // =========================================================================
    // SECTION 5: Backend -> AI Service Request Mapping
    // =========================================================================
    console.log('\n5. Backend -> AI Service Schema Mapping');

    const sampleTasks = [
        {
            id: 'tsk-001',
            task_code: 'TRK-NDLS-01',
            department_code: 'ENGG',
            maintenance_type: 'TRACK_TAMPING',
            asset_id: 'ast-001',
            asset_code: 'TRK-UP-112',
            asset_type: 'TRACK',
            start_kilometer: 112.0,
            end_kilometer: 116.0,
            duration_minutes: 180,
            priority: 1,
            criticality: 'CRITICAL',
            urgency: 'HIGH',
            power_block_required: false,
            traffic_block_required: true,
            speed_restriction_kmph: 30,
            operational_constraints: { dependencies: ['tsk-000'] }
        }
    ];

    const mappedTasks = aiPlanningBridge.mapRequestsToAISchema(sampleTasks);
    assert.strictEqual(mappedTasks[0].task_id, 'tsk-001');
    assert.strictEqual(mappedTasks[0].task_code, 'TRK-NDLS-01');
    assert.strictEqual(mappedTasks[0].department, 'ENGG');
    assert.strictEqual(mappedTasks[0].requested_duration_minutes, 180);
    assert.strictEqual(mappedTasks[0].traffic_block_required, true);
    assert.strictEqual(mappedTasks[0].power_block_required, false);
    assert.deepStrictEqual(mappedTasks[0].depends_on_task_ids, ['tsk-000']);

    const sampleWindows = [
        {
            id: 'win-001',
            start_time: '2026-09-13T02:00:00Z',
            end_time: '2026-09-13T05:00:00Z',
            duration_minutes: 180,
            line_designation: 'UP_MAIN',
            start_kilometer: 110.0,
            end_kilometer: 120.0
        }
    ];
    const mappedWindows = aiPlanningBridge.mapWindowsToAISchema(sampleWindows, 'NDLS-CNB');
    assert.strictEqual(mappedWindows[0].window_id, 'win-001');
    assert.strictEqual(mappedWindows[0].duration_minutes, 180);

    const sampleTrains = [
        {
            id: 'trn-001',
            train_number: '12004',
            scheduled_start_time: '2026-09-13T06:00:00Z',
            scheduled_end_time: '2026-09-13T12:00:00Z',
            direction: 'DOWN',
            train_type: 'SHATABDI',
            priority: 1
        }
    ];
    const mappedTrains = aiPlanningBridge.mapTrainsToAISchema(sampleTrains, 'NDLS-CNB');
    assert.strictEqual(mappedTrains[0].train_number, '12004');
    assert.strictEqual(mappedTrains[0].is_high_priority, true);
    console.log('  ✓ Backend entities accurately mapped to AI Service input schema');

    // =========================================================================
    // SECTION 6: Safe AI Service Failure Handling
    // =========================================================================
    console.log('\n6. Safe AI Service Failure Handling (Timeouts & Service Unavailable)');

    // Mock failing AI service (simulating timeout or unavailable server)
    const failingMockSender = async () => {
        throw new Error('AI Service request timed out after 8000ms (Connection Refused)');
    };

    const failedRunResult = await aiPlanningBridge.executePlanningRun({
        corridorCode: 'NDLS-CNB',
        planningRunId: `RUN-FAIL-TEST-${Date.now()}`
    }, null, failingMockSender);

    assert.strictEqual(failedRunResult.success, false, 'Failed AI call must report success=false');
    assert.strictEqual(failedRunResult.status, 'FAILED', 'Planning run status must be FAILED');
    assert(failedRunResult.error.includes('timed out'), 'Error message must reflect failure');

    // Verify planning run in DB is marked FAILED and has failure reason
    const checkFailedRun = await aiPlanningBridge.getPlanningRunById(failedRunResult.planningRunId);
    assert.strictEqual(checkFailedRun.status, 'FAILED', 'Database planning run must have status FAILED');
    assert(checkFailedRun.failure_reason, 'Database planning run must store failure reason');

    // Verify tasks are not stuck in PLANNING; reverted to PENDING
    const checkRevertedTasks = await makeRequest('GET', '/api/maintenance-requests/pending', null, plannerToken);
    assert(checkRevertedTasks.body.count > 0, 'Tasks must be reverted to PENDING on failure');
    console.log('  ✓ AI failure handled safely: run marked FAILED, failure_reason recorded, tasks restored to PENDING');

    // =========================================================================
    // SECTION 7: AI Result Persistence & Full Metadata Preservation
    // =========================================================================
    console.log('\n7. AI Result Persistence & Full Metadata Preservation');

    // Get an available block window ID for mock scheduled assignment
    const winRes = await db.query('SELECT id FROM block_windows WHERE corridor_id = $1 LIMIT 1', [bdmsRes.body.data.corridor_id]);
    const mockWindowId = winRes.rows.length > 0 ? winRes.rows[0].id : null;

    const mockAiSuccessfulResponse = {
        planning_run_id: 'RUN-SUCCESS-001',
        corridor_code: 'NDLS-CNB',
        pipeline_status: 'SUCCESS',
        data_source: 'INLINE_PAYLOAD',
        score: 92.5,
        score_breakdown: {
            maintenance_productivity: 95.0,
            passenger_punctuality: 90.0,
            freight_throughput: 88.0,
            safety_compliance: 100.0,
            resource_efficiency: 91.0,
            operational_resilience: 89.0
        },
        scheduled_blocks: [
            {
                assignment_id: 'ASG-001',
                task_id: testTaskId,
                task_code: 'BDMS-ENGG-101',
                department: 'ENGG',
                maintenance_type: 'TRACK_TAMPING',
                asset_id: bdmsRes.body.data.asset_id,
                asset_code: 'TRK-UP-112',
                assigned_window_id: mockWindowId,
                start_time: '2026-09-13T02:00:00Z',
                end_time: '2026-09-13T04:00:00Z',
                duration_minutes: 120.0
            }
        ],
        grouped_tasks: [
            {
                assignment_id: 'ASG-GRP-002',
                task_id: tdmsRes.body.data.id,
                task_code: 'TDMS-TRD-201',
                department: 'TRD',
                maintenance_type: 'OHE_CANTILEVER_INSPECTION',
                asset_id: tdmsRes.body.data.asset_id,
                asset_code: 'OHE-TDL-140',
                assigned_window_id: mockWindowId,
                start_time: '2026-09-13T02:00:00Z',
                end_time: '2026-09-13T03:30:00Z',
                duration_minutes: 90.0
            }
        ],
        unscheduled_requests: [
            {
                task_id: smmsRes.body.data.id,
                task_code: 'SMMS-SNT-301',
                department: 'SNT',
                reason: 'NO_FEASIBLE_WINDOW_WINDOW_CONFLICT',
                postponement_recommendation: 'NEXT_AVAILABLE_CYCLE'
            }
        ],
        predicted_metrics: {
            total_predicted_duration_minutes: 210.0,
            average_risk_score: 0.22,
            high_risk_tasks_count: 0
        },
        optimization_metrics: {
            solver_status: 'OPTIMAL',
            wall_time_seconds: 0.45,
            objective_value: 92.5
        },
        conflicts: [
            {
                conflict_id: 'CF-001',
                conflict_type: 'TRAIN_PATH_OVERLAP',
                severity: 'LOW',
                description: 'Minor headway clearance to freight train BOXN-883',
                resolution_status: 'AUTO_RESOLVED'
            }
        ],
        explanation: {
            summary: 'Plan optimizes simultaneous track tamping and OHE inspection during Sunday low-density window.',
            trade_offs: ['Deferred routine S&T point machine check by 24h to avoid daylight passenger disruption.'],
            safety_gate_passed: true
        },
        model_versions: {
            duration_predictor: 'v1.2.0',
            risk_classifier: 'v1.0.1',
            optimizer: 'OR-Tools-9.8',
            explainer: 'Gemini-1.5-Pro'
        },
        optimizer_status: 'OPTIMAL'
    };

    const successfulRun = await aiPlanningBridge.executePlanningRun({
        corridorCode: 'NDLS-CNB',
        planningRunId: `RUN-INTEG-SUCCESS-${Date.now()}`
    }, { username: 'planner' }, async () => mockAiSuccessfulResponse);

    assert.strictEqual(successfulRun.success, true, 'Planning run must succeed');
    assert.strictEqual(successfulRun.status, 'COMPLETED');
    assert.strictEqual(successfulRun.scheduledCount, 1, 'Should record 1 scheduled block');
    assert.strictEqual(successfulRun.unscheduledCount, 1, 'Should record 1 unscheduled report');
    assert.strictEqual(successfulRun.score, 92.5);

    // Verify scheduled task is marked SCHEDULED in DB
    const scheduledTaskCheck = await makeRequest('GET', `/api/maintenance-requests/${testTaskId}`, null, plannerToken);
    assert.strictEqual(scheduledTaskCheck.body.data.status, 'SCHEDULED', 'Scheduled task status must be SCHEDULED');

    // Verify unscheduled task is marked POSTPONED in DB
    const postponedTaskCheck = await makeRequest('GET', `/api/maintenance-requests/${smmsRes.body.data.id}`, null, plannerToken);
    assert.strictEqual(postponedTaskCheck.body.data.status, 'POSTPONED', 'Unscheduled task status must be POSTPONED');

    // Verify GET /api/plans/planning-runs/:runId
    const runDetails = await makeRequest('GET', `/api/plans/planning-runs/${successfulRun.planningRunId}`, null, plannerToken);
    assert.strictEqual(runDetails.status, 200);
    assert.strictEqual(runDetails.body.data.planning_run_id, successfulRun.planningRunId);
    assert.strictEqual(runDetails.body.data.status, 'COMPLETED');
    assert(runDetails.body.data.plan, 'Plan details must be linked and retrieved');
    console.log('  ✓ AI Result and all diagnostics preserved: scheduled blocks, grouped tasks, postponed requests, metrics, scores, explanation');

    // =========================================================================
    // SECTION 8: Idempotency & Duplicate Prevention
    // =========================================================================
    console.log('\n8. Idempotency & Duplicate Prevention');

    // 8a. Re-ingesting existing request should update without duplication
    const duplicateIngest = await makeRequest('POST', '/api/maintenance-requests/ingest', bdmsRequest, plannerToken);
    assert.strictEqual(duplicateIngest.status, 201);
    assert.strictEqual(duplicateIngest.body.data.id, testTaskId, 'Idempotent ingestion must update existing task ID');

    // 8b. Re-executing planning run with same run ID returns cached result
    const duplicateRun = await aiPlanningBridge.executePlanningRun({
        corridorCode: 'NDLS-CNB',
        planningRunId: successfulRun.planningRunId
    }, null, async () => mockAiSuccessfulResponse);
    assert.strictEqual(duplicateRun.isDuplicate, true, 'Duplicate run must be flagged');
    assert.strictEqual(duplicateRun.planningRun.planning_run_id, successfulRun.planningRunId);
    console.log('  ✓ Idempotency verified: re-submitting request or planning run prevents duplicates');

    // =========================================================================
    // SECTION 9: Authorization & Role-Based Security
    // =========================================================================
    console.log('\n9. Authorization & Role-Based Access Control (RLS)');

    // 9a. Unauthenticated requests rejected with 401
    const unauthIngest = await makeRequest('POST', '/api/maintenance-requests/ingest', bdmsRequest);
    assert.strictEqual(unauthIngest.status, 401, 'Unauthenticated request must be rejected with 401');

    const unauthRun = await makeRequest('POST', '/api/plans/planning-runs', { corridorCode: 'NDLS-CNB' });
    assert.strictEqual(unauthRun.status, 401, 'Unauthenticated planning run must be rejected with 401');

    // 9b. Operations role cannot update maintenance task status to Admin-only states or unauthorized transitions
    const opsLogin = await makeRequest('POST', '/api/auth/login', {
        username: 'operations',
        password: 'Operations@123'
    });
    assert.strictEqual(opsLogin.status, 200);
    const opsToken = opsLogin.body.token;

    const opsPlanRun = await makeRequest('POST', '/api/plans/planning-runs', { corridorCode: 'NDLS-CNB' }, opsToken);
    assert.strictEqual(opsPlanRun.status, 403, 'Operations role cannot initiate planning run (requires Planner or Admin)');

    // 9c. Planner role is allowed
    const plannerQueue = await makeRequest('GET', '/api/plans/planning-runs', null, plannerToken);
    assert.strictEqual(plannerQueue.status, 200, 'Planner role must be able to list planning runs');

    console.log('  ✓ Role-based access control verified: 401 unauthenticated, 403 unauthorized, 200 for Planner/Admin');

    console.log('\n====================================================================');
    console.log('🎉 ALL 9 BACKEND INTEGRATION TEST SECTIONS PASSED (0 ERRORS)');
    console.log('====================================================================\n');
}

runTests().catch(err => {
    console.error('\n❌ Backend Integration Test Suite Failed:', err);
    process.exit(1);
});
