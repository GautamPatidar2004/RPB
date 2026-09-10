const http = require('http');
const assert = require('assert');
const app = require('./src/app');

function makeRequest(server, options, body = null) {
    return new Promise((resolve, reject) => {
        const addr = server.address();
        const reqOptions = {
            hostname: '127.0.0.1',
            port: addr.port,
            path: options.path,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        };

        const req = http.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsed;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    parsed = data;
                }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runAIGatewayTests() {
    console.log('[Test] Starting Indian Railways AI Gateway Integration Test Suite...\n');

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    try {
        // -------------------------------------------------------------
        // Step 0: Authenticate as Planner
        // -------------------------------------------------------------
        const resLogin = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, {
            username: 'planner',
            password: 'Planner@123'
        });
        assert.strictEqual(resLogin.status, 200);
        const token = resLogin.body.token;
        const authHeader = { 'Authorization': `Bearer ${token}` };

        // -------------------------------------------------------------
        // Step 1: Test GET /api/v1/ai/planning-data
        // -------------------------------------------------------------
        console.log('1. GET /api/v1/ai/planning-data');
        const resData = await makeRequest(server, {
            path: '/api/v1/ai/planning-data?corridor_code=NDLS-CNB&horizon_start=2026-09-12T00:00:00Z&horizon_end=2026-09-14T00:00:00Z',
            headers: authHeader
        });
        assert.strictEqual(resData.status, 200);
        assert.strictEqual(resData.body.success, true);
        assert.ok(resData.body.planningHorizon);
        assert.strictEqual(resData.body.planningHorizon.corridorCode, 'NDLS-CNB');

        // Verify all required datasets are present
        assert.ok(Array.isArray(resData.body.maintenanceTasks), 'Must contain maintenanceTasks');
        assert.ok(Array.isArray(resData.body.assets), 'Must contain assets');
        assert.ok(Array.isArray(resData.body.blockWindows), 'Must contain blockWindows');
        assert.ok(Array.isArray(resData.body.trainMovements), 'Must contain trainMovements');
        assert.ok(resData.body.operationalConstraints, 'Must contain operationalConstraints');

        const corridorId = resData.body.planningHorizon.corridorId;
        const tasks = resData.body.maintenanceTasks;
        const windows = resData.body.blockWindows;
        const trains = resData.body.trainMovements;

        assert.ok(tasks.length >= 1, 'Should have tasks to plan');
        assert.ok(windows.length >= 1, 'Should have windows available');
        console.log(`  ✓ Planning data extracted: ${tasks.length} tasks, ${windows.length} windows, ${trains.length} trains`);
        console.log(`  ✓ Operational constraints & safety buffers included\n`);

        // -------------------------------------------------------------
        // Step 2: Formulate AI-Generated Plan Payload & Test POST /api/v1/ai/plans
        // -------------------------------------------------------------
        console.log('2. POST /api/v1/ai/plans (Ingest & Validate AI Plan)');
        const targetTask = tasks[0];
        const targetWindow = windows[0];

        const planPayload = {
            planReference: `BP-NDLS-CNB-${Date.now()}-V1`,
            corridorId: corridorId,
            horizonStartDate: '2026-09-12T00:00:00.000Z',
            horizonEndDate: '2026-09-14T00:00:00.000Z',
            version: 1,
            aiOptimizationMetadata: {
                solver: 'CP-SAT Railway Optimizer',
                algorithmVersion: '1.8.4',
                solveDurationMs: 1420,
                objectiveValue: 98.4
            },
            assignedTasks: [
                {
                    maintenanceTaskId: targetTask.id,
                    assignedBlockWindowId: targetWindow.id,
                    // Assign slot within window
                    assignedStartTime: '2026-09-12T01:30:00.000Z',
                    assignedEndTime: '2026-09-12T04:30:00.000Z',
                    sequenceOrder: 1,
                    aiRecommendationScore: 0.9650,
                    shadowTask: false,
                    notes: 'Optimal night slot minimizing Shatabdi & Vande Bharat disruption'
                }
            ]
        };

        const resCreatePlan = await makeRequest(server, {
            path: '/api/v1/ai/plans',
            method: 'POST',
            headers: authHeader
        }, planPayload);

        assert.strictEqual(resCreatePlan.status, 201);
        assert.strictEqual(resCreatePlan.body.success, true);
        assert.ok(resCreatePlan.body.plan.id);
        const createdPlanId = resCreatePlan.body.plan.id;

        // Verify task assigned
        assert.strictEqual(resCreatePlan.body.assignedTasks.length, 1);
        assert.strictEqual(resCreatePlan.body.assignedTasks[0].maintenance_task_id, targetTask.id);

        // Verify metrics
        assert.strictEqual(resCreatePlan.body.plan.task_count, 1);
        assert.ok(resCreatePlan.body.plan.total_block_duration_minutes > 0);
        assert.ok(resCreatePlan.body.plan.operational_impact_metrics);
        console.log(`  ✓ AI Plan [${planPayload.planReference}] created and registered in PostgreSQL`);
        console.log(`  ✓ Assigned tasks: ${resCreatePlan.body.assignedTasks.length}, Total block minutes: ${resCreatePlan.body.plan.total_block_duration_minutes}`);
        console.log(`  ✓ Detected conflicts logged: ${resCreatePlan.body.conflicts.length}\n`);

        // -------------------------------------------------------------
        // Step 3: GET /api/v1/ai/plans/:id (Inspection)
        // -------------------------------------------------------------
        console.log('3. GET /api/v1/ai/plans/:id (Inspect Plan & Conflicts)');
        const resGetPlan = await makeRequest(server, {
            path: `/api/v1/ai/plans/${createdPlanId}`,
            headers: authHeader
        });
        assert.strictEqual(resGetPlan.status, 200);
        assert.strictEqual(resGetPlan.body.plan.id, createdPlanId);
        assert.strictEqual(resGetPlan.body.plan.tasks.length, 1);
        console.log('  ✓ Retrieved plan detail with joined tasks and conflict reports\n');

        // -------------------------------------------------------------
        // Step 4: GET /api/v1/ai/plans (List)
        // -------------------------------------------------------------
        console.log('4. GET /api/v1/ai/plans');
        const resListPlans = await makeRequest(server, {
            path: `/api/v1/ai/plans?corridor_id=${corridorId}`,
            headers: authHeader
        });
        assert.strictEqual(resListPlans.status, 200);
        assert.ok(resListPlans.body.count >= 1);
        console.log(`  ✓ Listed ${resListPlans.body.count} registered block plans\n`);

        // -------------------------------------------------------------
        // Step 5: Validation & Error Handling
        // -------------------------------------------------------------
        console.log('5. Validation & Edge Cases');
        // Invalid horizon order
        const resBadHorizon = await makeRequest(server, {
            path: '/api/v1/ai/plans',
            method: 'POST',
            headers: authHeader
        }, {
            planReference: 'BAD-HORIZON',
            corridorId: corridorId,
            horizonStartDate: '2026-09-15T00:00:00Z',
            horizonEndDate: '2026-09-12T00:00:00Z', // End before start
            assignedTasks: [{ maintenanceTaskId: targetTask.id, assignedStartTime: '2026-09-12T01:00:00Z', assignedEndTime: '2026-09-12T03:00:00Z' }]
        });
        assert.strictEqual(resBadHorizon.status, 400);
        console.log('  ✓ Rejected invalid planning horizon order with 400');

        // Empty assignedTasks
        const resEmptyTasks = await makeRequest(server, {
            path: '/api/v1/ai/plans',
            method: 'POST',
            headers: authHeader
        }, {
            planReference: 'NO-TASKS',
            corridorId: corridorId,
            horizonStartDate: '2026-09-12T00:00:00Z',
            horizonEndDate: '2026-09-14T00:00:00Z',
            assignedTasks: []
        });
        assert.strictEqual(resEmptyTasks.status, 400);
        console.log('  ✓ Rejected empty task list with 400');

        // Non-existent maintenance task
        const resGhostTask = await makeRequest(server, {
            path: '/api/v1/ai/plans',
            method: 'POST',
            headers: authHeader
        }, {
            planReference: 'GHOST-TASK',
            corridorId: corridorId,
            horizonStartDate: '2026-09-12T00:00:00Z',
            horizonEndDate: '2026-09-14T00:00:00Z',
            assignedTasks: [{ maintenanceTaskId: 'ffffffff-ffff-ffff-ffff-ffffffffffff', assignedStartTime: '2026-09-12T01:00:00Z', assignedEndTime: '2026-09-12T03:00:00Z' }]
        });
        assert.strictEqual(resGhostTask.status, 400);
        console.log('  ✓ Rejected non-existent task reference with 400');

        // Unauthenticated access
        const resUnauth = await makeRequest(server, { path: '/api/v1/ai/planning-data' });
        assert.strictEqual(resUnauth.status, 401);
        console.log('  ✓ Unauthenticated access rejected with 401\n');

        console.log('====================================================================');
        console.log('🎉 ALL AI GATEWAY GET → PLAN → POST → DB TESTS PASSED (0 ERRORS)');
        console.log('====================================================================');

    } finally {
        server.close();
    }
}

if (require.main === module) {
    runAIGatewayTests()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('❌ AI Gateway tests failed:', err);
            process.exit(1);
        });
}

module.exports = { runAIGatewayTests };
