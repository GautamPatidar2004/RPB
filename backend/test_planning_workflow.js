const assert = require('assert');
const app = require('./src/app');

// Helper to simulate HTTP requests against Express app
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
    console.log('[Test] Starting Indian Railways Complete Planning Workflow Test Suite...\n');

    // 0. Authenticate users
    const plannerLogin = await makeRequest('POST', '/api/auth/login', {
        username: 'planner',
        password: 'Planner@123'
    });
    assert.strictEqual(plannerLogin.status, 200, 'Planner login should succeed');
    const plannerToken = plannerLogin.body.token;

    const opsLogin = await makeRequest('POST', '/api/auth/login', {
        username: 'operations',
        password: 'Operations@123'
    });
    assert.strictEqual(opsLogin.status, 200, 'Operations login should succeed');
    const opsToken = opsLogin.body.token;

    // =========================================================================
    // 1. Generate Planning Job / Plan Request (Weekly Horizon)
    // =========================================================================
    console.log('1. POST /api/plans/generate (Weekly Planning Job)');
    const genRes = await makeRequest('POST', '/api/plans/generate', {
        corridorCode: 'NDLS-CNB',
        horizonMode: 'WEEKLY',
        startDate: '2026-09-12T00:00:00Z',
        optimizationGoal: 'BALANCED_MIN_CONFLICTS'
    }, plannerToken);

    assert.strictEqual(genRes.status, 201, `Expected 201 Created, got ${genRes.status}: ${JSON.stringify(genRes.body)}`);
    assert.strictEqual(genRes.body.success, true);
    assert.ok(genRes.body.plan, 'Plan object must be present');
    assert.ok(genRes.body.plan.id, 'Plan must have an id');
    assert.ok(genRes.body.assignedTasks.length > 0, 'Assigned tasks must be non-empty');
    assert.ok(genRes.body.metrics, 'Metrics object must be present');
    assert.ok(Number(genRes.body.metrics.utilizationPercentage) >= 0, 'Utilization % calculated');
    assert.ok(Number(genRes.body.metrics.totalDurationMinutes) > 0, 'Total block duration calculated');

    const createdPlanId = genRes.body.plan.id;
    const initialTasks = genRes.body.assignedTasks;
    const initialConflicts = genRes.body.conflicts;
    console.log(`  ✓ Generated Plan [${genRes.body.plan.plan_reference}] with ${initialTasks.length} tasks and ${initialConflicts.length} conflicts`);
    console.log(`  ✓ Plan Metrics: Utilization: ${genRes.body.metrics.utilizationPercentage}%, Duration: ${genRes.body.metrics.totalDurationMinutes} mins`);

    // =========================================================================
    // 2. GET /api/plans (List & Filter by Date-Range / Weekly)
    // =========================================================================
    console.log('\n2. GET /api/plans (List with Date-Range & Corridor Filters)');
    const listRes = await makeRequest('GET', '/api/plans?corridor_code=NDLS-CNB&horizon_mode=WEEKLY&start_date=2026-09-12T00:00:00Z', null, plannerToken);
    assert.strictEqual(listRes.status, 200);
    assert.strictEqual(listRes.body.success, true);
    assert.ok(listRes.body.data.length >= 1, 'Should find at least 1 plan in NDLS-CNB weekly horizon');
    console.log(`  ✓ Found ${listRes.body.data.length} plans matching weekly date-range filter`);

    // =========================================================================
    // 3. GET /api/plans/:id (Plan Details with Tasks, Windows, Conflicts, Metrics)
    // =========================================================================
    console.log('\n3. GET /api/plans/:id (Plan Details)');
    const detailRes = await makeRequest('GET', `/api/plans/${createdPlanId}`, null, plannerToken);
    assert.strictEqual(detailRes.status, 200);
    assert.strictEqual(detailRes.body.data.id, createdPlanId);
    assert.ok(Array.isArray(detailRes.body.data.tasks), 'Plan details must include tasks');
    assert.ok(Array.isArray(detailRes.body.data.conflicts), 'Plan details must include conflicts');
    assert.ok(detailRes.body.data.metrics, 'Plan details must include operational metrics');

    // Verify assigned block window information
    const firstTask = detailRes.body.data.tasks[0];
    assert.ok(firstTask.task_code, 'Task must have task_code');
    assert.ok(firstTask.assigned_start_time, 'Task must have assigned_start_time');
    assert.ok(firstTask.assigned_end_time, 'Task must have assigned_end_time');
    console.log(`  ✓ Task [${firstTask.task_code}] assigned to Block Window [${firstTask.block_external_id || 'AUTO_SLOT'}]`);
    console.log(`  ✓ Conflicts recorded: ${detailRes.body.data.conflicts.length}`);

    // =========================================================================
    // 4. PATCH /api/plans/:id/conflicts/:conflictId (Conflict Resolution)
    // =========================================================================
    console.log('\n4. PATCH /api/plans/:id/conflicts/:conflictId (Conflict Resolution)');
    if (initialConflicts.length > 0) {
        const targetConflict = initialConflicts[0];
        const resolveRes = await makeRequest('PATCH', `/api/plans/${createdPlanId}/conflicts/${targetConflict.id}`, {
            resolutionStatus: 'TRAIN_REGULATED',
            resolutionDetails: {
                action: 'Regulated train at preceding loop line by 18 minutes',
                operatingOfficer: 'Amit Verma'
            }
        }, opsToken);

        assert.strictEqual(resolveRes.status, 200, 'Conflict resolution should succeed');
        assert.strictEqual(resolveRes.body.conflict.resolution_status, 'TRAIN_REGULATED');
        console.log(`  ✓ Conflict [${targetConflict.id}] updated to TRAIN_REGULATED`);
    } else {
        console.log('  - Skipped conflict resolution: no conflicts detected in this sample');
    }

    // =========================================================================
    // 5. PUT /api/plans/:id/modify (Planner Modifies Plan)
    // =========================================================================
    console.log('\n5. PUT /api/plans/:id/modify (Plan Modification & Re-calculation)');
    const modifiedTasks = initialTasks.map(t => ({
        maintenanceTaskId: t.maintenance_task_id,
        assignedBlockWindowId: t.assigned_block_window_id,
        assignedStartTime: new Date('2026-09-12T01:30:00Z').toISOString(),
        assignedEndTime: new Date('2026-09-12T03:30:00Z').toISOString(),
        sequenceOrder: t.sequence_order,
        shadowTask: t.shadow_task,
        notes: 'Planner manually adjusted window slot for clear track clearance'
    }));

    const modRes = await makeRequest('PUT', `/api/plans/${createdPlanId}/modify`, {
        assignedTasks: modifiedTasks,
        notes: 'Shifted schedule 30 minutes later to avoid passenger peak'
    }, plannerToken);

    assert.strictEqual(modRes.status, 200, `Modification failed: ${JSON.stringify(modRes.body)}`);
    assert.strictEqual(modRes.body.plan.version, 2, 'Version must be incremented to 2');
    assert.strictEqual(modRes.body.plan.status, 'UNDER_REVIEW', 'Status should be set to UNDER_REVIEW');
    console.log(`  ✓ Plan version updated to v${modRes.body.plan.version}, status: ${modRes.body.plan.status}`);

    // =========================================================================
    // 6. POST /api/plans/:id/reject & approve (Workflow Decisions)
    // =========================================================================
    console.log('\n6. Decisions: Rejection & Approval Workflows');
    // Generate a secondary plan to test REJECT
    const rejectJob = await makeRequest('POST', '/api/plans/generate', {
        corridorCode: 'NDLS-CNB',
        horizonMode: 'WEEKLY',
        startDate: '2026-09-15T00:00:00Z'
    }, plannerToken);
    const rejectPlanId = rejectJob.body.plan.id;

    const rejectRes = await makeRequest('POST', `/api/plans/${rejectPlanId}/reject`, {
        reason: 'VIP Special train scheduled in the same corridor block'
    }, opsToken);
    assert.strictEqual(rejectRes.status, 200);
    assert.strictEqual(rejectRes.body.plan.status, 'REJECTED');
    assert.strictEqual(rejectRes.body.approval.action, 'REJECT');
    console.log(`  ✓ Plan [${rejectPlanId}] rejected by Operations controller`);

    // Approve the modified primary plan
    const approveRes = await makeRequest('POST', `/api/plans/${createdPlanId}/approve`, {
        comments: 'Verified with Section Controller and TRD. Block approved.'
    }, opsToken);
    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.body.plan.status, 'APPROVED');
    assert.strictEqual(approveRes.body.approval.action, 'APPROVE');
    console.log(`  ✓ Plan [${createdPlanId}] approved by Operations controller`);

    // =========================================================================
    // 7. GET /api/plans/:id/audit-logs (Audit Trail Verification)
    // =========================================================================
    console.log('\n7. GET /api/plans/:id/audit-logs (Audit Trail Inspection)');
    const auditRes = await makeRequest('GET', `/api/plans/${createdPlanId}/audit-logs`, null, plannerToken);
    assert.strictEqual(auditRes.status, 200);
    assert.ok(auditRes.body.data.length >= 3, `Expected at least 3 audit log entries, found ${auditRes.body.data.length}`);

    const actionsLogged = auditRes.body.data.map(l => l.action);
    assert.ok(actionsLogged.includes('PLAN_GENERATED'), 'Audit must contain PLAN_GENERATED');
    assert.ok(actionsLogged.includes('PLAN_MODIFIED'), 'Audit must contain PLAN_MODIFIED');
    assert.ok(actionsLogged.includes('PLAN_APPROVED'), 'Audit must contain PLAN_APPROVED');
    console.log(`  ✓ Audit trail logged actions: ${actionsLogged.join(' → ')}`);

    // =========================================================================
    // 8. Role-Based Route Protection & Validation Checks
    // =========================================================================
    console.log('\n8. Role Protection & Edge Cases');
    // Operations role cannot generate or modify plans (restricted to Planner, Admin)
    const opsGen = await makeRequest('POST', '/api/plans/generate', { corridorCode: 'NDLS-CNB' }, opsToken);
    assert.strictEqual(opsGen.status, 403, 'Operations should not be allowed to generate plans (403)');
    console.log('  ✓ Operations role denied from generating plans (403 Forbidden)');

    // Unauthenticated access blocked
    const unauth = await makeRequest('GET', '/api/plans');
    assert.strictEqual(unauth.status, 401, 'Unauthenticated request should return 401');
    console.log('  ✓ Unauthenticated access denied (401 Unauthorized)');

    console.log('\n====================================================================');
    console.log('🎉 ALL PLANNING WORKFLOW TESTS PASSED CLEANLY (0 ERRORS)');
    console.log('====================================================================\n');
}

runTests().catch(err => {
    console.error('\n❌ Test failure:', err);
    process.exit(1);
});
