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

async function runSyncGatewayTests() {
    console.log('[Test] Starting Railway Data Gateway & Sync Integration Test Suite...\n');

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
        const adminToken = resAdmin.body.token;
        const authHeader = { 'Authorization': `Bearer ${adminToken}` };

        // -------------------------------------------------------------
        // Step 1: List configured integration sources
        // -------------------------------------------------------------
        console.log('1. Integration Sources Catalog');
        const resSources = await makeRequest(server, { path: '/api/sync/sources', headers: authHeader });
        assert.strictEqual(resSources.status, 200);
        assert.strictEqual(resSources.body.success, true);
        const sourceCodes = resSources.body.sources.map(s => s.code);
        for (const expected of ['TMS', 'SMMS', 'TDMS', 'COA', 'BDMS']) {
            assert.ok(sourceCodes.includes(expected), `Missing source code ${expected}`);
        }
        console.log(`  ✓ All 5 integration sources verified: ${sourceCodes.join(', ')}\n`);

        // -------------------------------------------------------------
        // Step 2: Trigger sync for TMS (Track Management System)
        // -------------------------------------------------------------
        console.log('2. Sync TMS (Track Tasks & Assets)');
        const resSyncTMS = await makeRequest(server, {
            path: '/api/sync/trigger/TMS',
            method: 'POST',
            headers: authHeader
        });
        assert.strictEqual(resSyncTMS.status, 200);
        assert.strictEqual(resSyncTMS.body.success, true);
        assert.strictEqual(resSyncTMS.body.result.sourceCode, 'TMS');
        assert.ok(resSyncTMS.body.result.syncRun.records_received >= 2);
        console.log(`  ✓ TMS sync completed: received=${resSyncTMS.body.result.syncRun.records_received}, created=${resSyncTMS.body.result.syncRun.records_created}, updated=${resSyncTMS.body.result.syncRun.records_updated}`);

        // Verify task exists in maintenance-tasks
        const resTasksAfterTMS = await makeRequest(server, { path: '/api/maintenance-tasks?source_system=TMS', headers: authHeader });
        assert.strictEqual(resTasksAfterTMS.status, 200);
        assert.ok(resTasksAfterTMS.body.data.some(t => t.external_record_id === 'TMS-TASK-9921'));
        console.log('  ✓ Verified TMS-TASK-9921 present in maintenance tasks\n');

        // -------------------------------------------------------------
        // Step 3: Test Idempotency (Sync TMS second time)
        // -------------------------------------------------------------
        console.log('3. Idempotency Verification (Re-sync TMS)');
        const resReSyncTMS = await makeRequest(server, {
            path: '/api/sync/trigger/TMS',
            method: 'POST',
            headers: authHeader
        });
        assert.strictEqual(resReSyncTMS.status, 200);
        assert.strictEqual(resReSyncTMS.body.result.syncRun.records_created, 0, 'Re-sync must create 0 new records');
        assert.ok(resReSyncTMS.body.result.syncRun.records_updated >= 2, 'Re-sync must update existing records');
        console.log('  ✓ Idempotency confirmed: records_created=0, records_updated>=2, zero duplicates created\n');

        // -------------------------------------------------------------
        // Step 4: Sync SMMS & TDMS
        // -------------------------------------------------------------
        console.log('4. Sync SMMS & TDMS (Signal & OHE Tasks)');
        const resSyncSMMS = await makeRequest(server, {
            path: '/api/sync/trigger/SMMS',
            method: 'POST',
            headers: authHeader
        });
        assert.strictEqual(resSyncSMMS.status, 200);
        assert.strictEqual(resSyncSMMS.body.result.sourceCode, 'SMMS');
        console.log('  ✓ SMMS sync completed');

        const resSyncTDMS = await makeRequest(server, {
            path: '/api/sync/trigger/TDMS',
            method: 'POST',
            headers: authHeader
        });
        assert.strictEqual(resSyncTDMS.status, 200);
        assert.strictEqual(resSyncTDMS.body.result.sourceCode, 'TDMS');
        console.log('  ✓ TDMS sync completed\n');

        // -------------------------------------------------------------
        // Step 5: Sync COA (Block Windows + Train Movements)
        // -------------------------------------------------------------
        console.log('5. Sync COA (Block Windows + Trains)');
        const resSyncCOA = await makeRequest(server, {
            path: '/api/sync/trigger/COA',
            method: 'POST',
            headers: authHeader
        });
        assert.strictEqual(resSyncCOA.status, 200);
        assert.strictEqual(resSyncCOA.body.result.sourceCode, 'COA');
        assert.ok(resSyncCOA.body.result.syncRun.records_received >= 3);
        console.log(`  ✓ COA sync completed: windows & train movements normalized\n`);

        // -------------------------------------------------------------
        // Step 6: Sync BDMS (Integrated & Breakdown Windows)
        // -------------------------------------------------------------
        console.log('6. Sync BDMS');
        const resSyncBDMS = await makeRequest(server, {
            path: '/api/sync/trigger/BDMS',
            method: 'POST',
            headers: authHeader
        });
        assert.strictEqual(resSyncBDMS.status, 200);
        assert.strictEqual(resSyncBDMS.body.result.sourceCode, 'BDMS');
        console.log('  ✓ BDMS sync completed\n');

        // -------------------------------------------------------------
        // Step 7: Test Sync Status & History Endpoints
        // -------------------------------------------------------------
        console.log('7. Sync Status & History');
        const resStatus = await makeRequest(server, { path: '/api/sync/status', headers: authHeader });
        assert.strictEqual(resStatus.status, 200);
        assert.strictEqual(resStatus.body.sources.length, 5);
        assert.ok(resStatus.body.sources.every(s => s.latestSyncRun !== null));
        console.log('  ✓ GET /api/sync/status returns status and latest run for each source');

        const resHistory = await makeRequest(server, { path: '/api/sync/history', headers: authHeader });
        assert.strictEqual(resHistory.status, 200);
        assert.ok(resHistory.body.count >= 5);
        console.log(`  ✓ GET /api/sync/history returned ${resHistory.body.count} historical sync runs\n`);

        // -------------------------------------------------------------
        // Step 8: Error Handling for Unknown Source
        // -------------------------------------------------------------
        console.log('8. Error Handling');
        const resBadSource = await makeRequest(server, {
            path: '/api/sync/trigger/INVALID_SYSTEM',
            method: 'POST',
            headers: authHeader
        });
        assert.strictEqual(resBadSource.status, 400);
        assert.strictEqual(resBadSource.body.success, false);
        console.log('  ✓ Unknown source properly rejected with 400 Bad Request');

        // Unauthenticated access rejection
        const resUnauth = await makeRequest(server, { path: '/api/sync/status' });
        assert.strictEqual(resUnauth.status, 401);
        console.log('  ✓ Unauthenticated access rejected with 401\n');

        console.log('====================================================================');
        console.log('🎉 ALL 8 RAILWAY GATEWAY & SYNC TESTS PASSED (0 ERRORS)');
        console.log('====================================================================');
    } finally {
        server.close();
    }
}

if (require.main === module) {
    runSyncGatewayTests()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('❌ Sync tests failed:', err);
            process.exit(1);
        });
}

module.exports = { runSyncGatewayTests };
