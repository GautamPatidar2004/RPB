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

async function runCoreApiTests() {
    console.log('[Test] Starting Indian Railways Core Entities & APIs Integration Test Suite...\n');

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    try {
        // -------------------------------------------------------------
        // Step 0: Obtain demo session tokens
        // -------------------------------------------------------------
        const resAdmin = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, {
            username: 'admin',
            password: 'Admin@123'
        });
        const resPlanner = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, {
            username: 'planner',
            password: 'Planner@123'
        });
        const resOps = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, {
            username: 'operations',
            password: 'Operations@123'
        });

        const adminToken = resAdmin.body.token;
        const plannerToken = resPlanner.body.token;
        const opsToken = resOps.body.token;
        const authHeader = { 'Authorization': `Bearer ${plannerToken}` };
        const opsHeader = { 'Authorization': `Bearer ${opsToken}` };

        // -------------------------------------------------------------
        // Step 1: Corridors API Tests
        // -------------------------------------------------------------
        console.log('1. Corridors API');
        const resCorridors = await makeRequest(server, { path: '/api/corridors', headers: authHeader });
        assert.strictEqual(resCorridors.status, 200);
        assert.ok(resCorridors.body.count >= 2);
        const corridorId = resCorridors.body.data[0].id;
        console.log(`  ✓ GET /api/corridors returned ${resCorridors.body.count} corridors`);

        // Filter by zone
        const resCorridorFilter = await makeRequest(server, { path: '/api/corridors?zone=NCR', headers: authHeader });
        assert.strictEqual(resCorridorFilter.status, 200);
        assert.strictEqual(resCorridorFilter.body.data[0].zone, 'NCR');
        console.log('  ✓ GET /api/corridors?zone=NCR filtered correctly');

        // Summary
        const resCorridorSummary = await makeRequest(server, { path: '/api/corridors/summary', headers: authHeader });
        assert.strictEqual(resCorridorSummary.status, 200);
        assert.ok(Number(resCorridorSummary.body.summary.total_corridors) >= 2);
        console.log('  ✓ GET /api/corridors/summary returned track length and corridor counts');

        // Detail
        const resCorridorDetail = await makeRequest(server, { path: `/api/corridors/${corridorId}`, headers: authHeader });
        assert.strictEqual(resCorridorDetail.status, 200);
        assert.strictEqual(resCorridorDetail.body.data.id, corridorId);
        console.log('  ✓ GET /api/corridors/:id returned detail\n');

        // -------------------------------------------------------------
        // Step 2: Assets API Tests
        // -------------------------------------------------------------
        console.log('2. Assets API');
        const resAssets = await makeRequest(server, { path: '/api/assets', headers: authHeader });
        assert.strictEqual(resAssets.status, 200);
        assert.ok(resAssets.body.count >= 3);
        const assetId = resAssets.body.data[0].id;
        console.log(`  ✓ GET /api/assets returned ${resAssets.body.count} assets`);

        // Filters: source_system, criticality, health_status, search
        const resAssetSource = await makeRequest(server, { path: '/api/assets?source_system=TMS', headers: authHeader });
        assert.strictEqual(resAssetSource.status, 200);
        assert.ok(resAssetSource.body.data.every(a => a.source_system === 'TMS'));
        console.log('  ✓ GET /api/assets?source_system=TMS verified');

        const resAssetCrit = await makeRequest(server, { path: '/api/assets?criticality=CRITICAL', headers: authHeader });
        assert.strictEqual(resAssetCrit.status, 200);
        assert.strictEqual(resAssetCrit.body.data[0].criticality, 'CRITICAL');
        console.log('  ✓ GET /api/assets?criticality=CRITICAL verified');

        const resAssetSearch = await makeRequest(server, { path: '/api/assets?search=Khurja', headers: authHeader });
        assert.strictEqual(resAssetSearch.status, 200);
        assert.ok(resAssetSearch.body.data.length >= 1);
        console.log('  ✓ GET /api/assets?search=Khurja search filter verified');

        // Summary
        const resAssetSummary = await makeRequest(server, { path: '/api/assets/summary', headers: authHeader });
        assert.strictEqual(resAssetSummary.status, 200);
        assert.ok(Number(resAssetSummary.body.summary.total_assets) >= 3);
        console.log('  ✓ GET /api/assets/summary metrics verified');

        // Detail
        const resAssetDetail = await makeRequest(server, { path: `/api/assets/${assetId}`, headers: authHeader });
        assert.strictEqual(resAssetDetail.status, 200);
        assert.strictEqual(resAssetDetail.body.data.id, assetId);
        console.log('  ✓ GET /api/assets/:id verified');

        // Update health status
        const resAssetPatch = await makeRequest(server, {
            path: `/api/assets/${assetId}/health`,
            method: 'PATCH',
            headers: authHeader
        }, { health_status: 'UNDER_MAINTENANCE' });
        assert.strictEqual(resAssetPatch.status, 200);
        assert.strictEqual(resAssetPatch.body.data.health_status, 'UNDER_MAINTENANCE');
        console.log('  ✓ PATCH /api/assets/:id/health successfully updated status\n');

        // -------------------------------------------------------------
        // Step 3: Maintenance Tasks API Tests (TMS, SMMS, TDMS)
        // -------------------------------------------------------------
        console.log('3. Maintenance Tasks API (TMS, SMMS, TDMS)');
        const resTasks = await makeRequest(server, { path: '/api/maintenance-tasks', headers: authHeader });
        assert.strictEqual(resTasks.status, 200);
        assert.ok(resTasks.body.count >= 3);
        const taskId = resTasks.body.data[0].id;
        console.log(`  ✓ GET /api/maintenance-tasks returned ${resTasks.body.count} tasks`);

        // Filters: source_system, priority, status, required_by date
        const resTaskTMS = await makeRequest(server, { path: '/api/maintenance-tasks?source_system=TMS', headers: authHeader });
        assert.strictEqual(resTaskTMS.status, 200);
        assert.ok(resTaskTMS.body.data.every(t => t.source_system === 'TMS'));
        console.log('  ✓ Filter source_system=TMS verified');

        const resTaskPriority = await makeRequest(server, { path: '/api/maintenance-tasks?priority=1', headers: authHeader });
        assert.strictEqual(resTaskPriority.status, 200);
        assert.ok(resTaskPriority.body.data.every(t => t.priority === 1));
        console.log('  ✓ Filter priority=1 verified');

        const resTaskDate = await makeRequest(server, { path: '/api/maintenance-tasks?required_by_before=2026-09-16T00:00:00Z', headers: authHeader });
        assert.strictEqual(resTaskDate.status, 200);
        assert.ok(resTaskDate.body.data.length >= 1);
        console.log('  ✓ Filter required_by_before date range verified');

        // Summary
        const resTaskSummary = await makeRequest(server, { path: '/api/maintenance-tasks/summary', headers: authHeader });
        assert.strictEqual(resTaskSummary.status, 200);
        assert.ok(Number(resTaskSummary.body.summary.total_tasks) >= 3);
        console.log('  ✓ GET /api/maintenance-tasks/summary metrics verified');

        // Detail
        const resTaskDetail = await makeRequest(server, { path: `/api/maintenance-tasks/${taskId}`, headers: authHeader });
        assert.strictEqual(resTaskDetail.status, 200);
        assert.strictEqual(resTaskDetail.body.data.id, taskId);
        console.log('  ✓ GET /api/maintenance-tasks/:id verified');

        // Status update (Planner allowed)
        const resTaskPatch = await makeRequest(server, {
            path: `/api/maintenance-tasks/${taskId}/status`,
            method: 'PATCH',
            headers: authHeader
        }, { status: 'IN_PROGRESS' });
        assert.strictEqual(resTaskPatch.status, 200);
        assert.strictEqual(resTaskPatch.body.data.status, 'IN_PROGRESS');
        console.log('  ✓ PATCH /api/maintenance-tasks/:id/status updated status to IN_PROGRESS');

        // Role restriction: Operations cannot update maintenance task status (403)
        const resTaskPatchForbidden = await makeRequest(server, {
            path: `/api/maintenance-tasks/${taskId}/status`,
            method: 'PATCH',
            headers: opsHeader
        }, { status: 'COMPLETED' });
        assert.strictEqual(resTaskPatchForbidden.status, 403);
        console.log('  ✓ Role restriction verified: Operations cannot modify maintenance task status (403)\n');

        // -------------------------------------------------------------
        // Step 4: Block Windows API Tests (COA, BDMS)
        // -------------------------------------------------------------
        console.log('4. Block Windows API (COA, BDMS)');
        const resWindows = await makeRequest(server, { path: '/api/block-windows', headers: opsHeader });
        assert.strictEqual(resWindows.status, 200);
        assert.ok(resWindows.body.count >= 2);
        const windowId = resWindows.body.data[0].id;
        console.log(`  ✓ GET /api/block-windows returned ${resWindows.body.count} windows`);

        // Filter: source_system COA
        const resWinCOA = await makeRequest(server, { path: '/api/block-windows?source_system=COA', headers: opsHeader });
        assert.strictEqual(resWinCOA.status, 200);
        assert.ok(resWinCOA.body.data.every(w => w.source_system === 'COA'));
        console.log('  ✓ Filter source_system=COA verified');

        // Filter: availability_status
        const resWinAvail = await makeRequest(server, { path: '/api/block-windows?availability_status=AVAILABLE', headers: opsHeader });
        assert.strictEqual(resWinAvail.status, 200);
        assert.ok(resWinAvail.body.data.every(w => w.availability_status === 'AVAILABLE'));
        console.log('  ✓ Filter availability_status=AVAILABLE verified');

        // Summary
        const resWinSummary = await makeRequest(server, { path: '/api/block-windows/summary', headers: opsHeader });
        assert.strictEqual(resWinSummary.status, 200);
        assert.ok(Number(resWinSummary.body.summary.total_windows) >= 2);
        console.log('  ✓ GET /api/block-windows/summary metrics verified');

        // Detail
        const resWinDetail = await makeRequest(server, { path: `/api/block-windows/${windowId}`, headers: opsHeader });
        assert.strictEqual(resWinDetail.status, 200);
        assert.strictEqual(resWinDetail.body.data.id, windowId);
        console.log('  ✓ GET /api/block-windows/:id verified');

        // Status update (Operations allowed)
        const resWinPatch = await makeRequest(server, {
            path: `/api/block-windows/${windowId}/status`,
            method: 'PATCH',
            headers: opsHeader
        }, { availability_status: 'RESERVED' });
        assert.strictEqual(resWinPatch.status, 200);
        assert.strictEqual(resWinPatch.body.data.availability_status, 'RESERVED');
        console.log('  ✓ PATCH /api/block-windows/:id/status updated availability_status to RESERVED');

        // Role restriction: Planner cannot update block window status (403)
        const resWinPatchForbidden = await makeRequest(server, {
            path: `/api/block-windows/${windowId}/status`,
            method: 'PATCH',
            headers: authHeader
        }, { availability_status: 'CONFIRMED' });
        assert.strictEqual(resWinPatchForbidden.status, 403);
        console.log('  ✓ Role restriction verified: Planner cannot modify block window status (403)\n');

        // -------------------------------------------------------------
        // Step 5: Train Movements API Tests (COA, BDMS)
        // -------------------------------------------------------------
        console.log('5. Train Movements API (COA, BDMS)');
        const resTrains = await makeRequest(server, { path: '/api/train-movements', headers: opsHeader });
        assert.strictEqual(resTrains.status, 200);
        assert.ok(resTrains.body.count >= 3);
        const trainId = resTrains.body.data[0].id;
        console.log(`  ✓ GET /api/train-movements returned ${resTrains.body.count} train movements`);

        // Filter: train_type
        const resVB = await makeRequest(server, { path: '/api/train-movements?train_type=VANDE_BHARAT', headers: opsHeader });
        assert.strictEqual(resVB.status, 200);
        assert.strictEqual(resVB.body.data[0].train_type, 'VANDE_BHARAT');
        console.log('  ✓ Filter train_type=VANDE_BHARAT verified');

        // Filter: search by train number
        const resTrainSearch = await makeRequest(server, { path: '/api/train-movements?search=12004', headers: opsHeader });
        assert.strictEqual(resTrainSearch.status, 200);
        assert.strictEqual(resTrainSearch.body.data[0].train_number, '12004');
        console.log('  ✓ Filter search=12004 verified');

        // Summary
        const resTrainSummary = await makeRequest(server, { path: '/api/train-movements/summary', headers: opsHeader });
        assert.strictEqual(resTrainSummary.status, 200);
        assert.ok(Number(resTrainSummary.body.summary.total_trains) >= 3);
        console.log('  ✓ GET /api/train-movements/summary metrics verified');

        // Detail
        const resTrainDetail = await makeRequest(server, { path: `/api/train-movements/${trainId}`, headers: opsHeader });
        assert.strictEqual(resTrainDetail.status, 200);
        assert.strictEqual(resTrainDetail.body.data.id, trainId);
        console.log('  ✓ GET /api/train-movements/:id verified');

        // Status update
        const resTrainPatch = await makeRequest(server, {
            path: `/api/train-movements/${trainId}/status`,
            method: 'PATCH',
            headers: opsHeader
        }, { status: 'RUNNING' });
        assert.strictEqual(resTrainPatch.status, 200);
        assert.strictEqual(resTrainPatch.body.data.status, 'RUNNING');
        console.log('  ✓ PATCH /api/train-movements/:id/status updated status to RUNNING');

        // -------------------------------------------------------------
        // Step 6: Unauthenticated access rejection
        // -------------------------------------------------------------
        console.log('\n6. Security & Unauthenticated Access Checks');
        const unauthEndpoints = [
            '/api/corridors',
            '/api/assets',
            '/api/maintenance-tasks',
            '/api/block-windows',
            '/api/train-movements'
        ];
        for (const ep of unauthEndpoints) {
            const res = await makeRequest(server, { path: ep });
            assert.strictEqual(res.status, 401);
        }
        console.log('  ✓ All 5 core entity endpoints properly reject unauthenticated requests with 401\n');

        console.log('====================================================================');
        console.log('🎉 ALL CORE ENTITY APIS & FILTERS TESTED AND PASSED (0 ERRORS)');
        console.log('====================================================================');
    } finally {
        server.close();
    }
}

if (require.main === module) {
    runCoreApiTests()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('❌ Integration tests failed:', err);
            process.exit(1);
        });
}

module.exports = { runCoreApiTests };
