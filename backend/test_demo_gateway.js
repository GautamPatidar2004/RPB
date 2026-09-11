/**
 * Indian Railways Demo Data Gateway Test Suite
 * 
 * Tests for:
 * 1. Data source interface compliance (Maintenance, Asset, Defect, Operations)
 * 2. Schema and semantic validation (DemoDataValidator)
 * 3. Source metadata and explicit DEMO tagging (BDMS, TDMS, SMMS, COA)
 * 4. Configurable department distribution (ENGG, SNT, TRD)
 * 5. Interconnected asset/defect/maintenance request data
 * 6. API responses (/api/demo/generate, /maintenance-requests, /assets, /defects, /trains)
 * 7. Regeneration and duplicate prevention behavior
 */

const http = require('http');
const assert = require('assert');
const app = require('./src/app');
const db = require('./src/config/db');

// Interfaces & Services
const MaintenanceDataSource = require('./src/services/dataSources/maintenanceDataSource');
const AssetDataSource = require('./src/services/dataSources/assetDataSource');
const DefectDataSource = require('./src/services/dataSources/defectDataSource');
const OperationsDataSource = require('./src/services/dataSources/operationsDataSource');
const DemoDataValidator = require('./src/services/demoGateway/demoDataValidator');
const demoDataSource = require('./src/services/demoGateway/demoDataSource');
const demoGatewayService = require('./src/services/demoGateway/demoGatewayService');

function makeRequest(server, options, body = null) {
    return new Promise((resolve, reject) => {
        const address = server.address();
        const reqOptions = {
            hostname: '127.0.0.1',
            port: address.port,
            path: options.path,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        };

        const req = http.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsedBody;
                try {
                    parsedBody = JSON.parse(data);
                } catch {
                    parsedBody = data;
                }
                resolve({ status: res.statusCode, headers: res.headers, body: parsedBody });
            });
        });

        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runDemoGatewayTests() {
    console.log('[Test] Starting Indian Railways Demo Data Gateway Integration Suite...\n');

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    try {
        // -------------------------------------------------------------
        // Step 1: Standardized Data Source Interface Contracts
        // -------------------------------------------------------------
        console.log('1. Standardized Internal Interfaces Compliance');
        const baseMaint = new MaintenanceDataSource();
        await assert.rejects(async () => await baseMaint.fetchMaintenanceRequests(), /must be implemented/);
        await assert.rejects(async () => await baseMaint.getMaintenanceRequestById('1'), /must be implemented/);

        const baseAsset = new AssetDataSource();
        await assert.rejects(async () => await baseAsset.fetchAssets(), /must be implemented/);

        const baseDefect = new DefectDataSource();
        await assert.rejects(async () => await baseDefect.fetchDefects(), /must be implemented/);

        const baseOps = new OperationsDataSource();
        await assert.rejects(async () => await baseOps.fetchTrainMovements(), /must be implemented/);
        await assert.rejects(async () => await baseOps.fetchBlockWindows(), /must be implemented/);

        // Verify DemoDataSource implements all contracts
        assert.strictEqual(typeof demoDataSource.fetchMaintenanceRequests, 'function');
        assert.strictEqual(typeof demoDataSource.fetchAssets, 'function');
        assert.strictEqual(typeof demoDataSource.fetchDefects, 'function');
        assert.strictEqual(typeof demoDataSource.fetchTrainMovements, 'function');
        assert.strictEqual(typeof demoDataSource.fetchBlockWindows, 'function');
        console.log('  ✓ MaintenanceDataSource, AssetDataSource, DefectDataSource, OperationsDataSource contracts verified');

        // -------------------------------------------------------------
        // Step 2: Schema & Consistency Validation
        // -------------------------------------------------------------
        console.log('\n2. Schema & Semantic Validation (DemoDataValidator)');
        // Valid validation
        const sampleDataset = demoDataSource.generateDataset({ requestCount: 3 });
        assert.strictEqual(DemoDataValidator.validateMaintenanceRequests(sampleDataset.maintenanceRequests), true);
        assert.strictEqual(DemoDataValidator.validateAssets(sampleDataset.assets), true);
        assert.strictEqual(DemoDataValidator.validateDefects(sampleDataset.defects), true);
        assert.strictEqual(DemoDataValidator.validateTrainMovements(sampleDataset.trainMovements), true);
        assert.strictEqual(DemoDataValidator.validateBlockWindows(sampleDataset.blockWindows), true);

        // Invalid validation rejections
        assert.throws(() => {
            DemoDataValidator.validateMaintenanceRequests([{ ...sampleDataset.maintenanceRequests[0], durationMinutes: -10 }]);
        }, /positive integer/);

        assert.throws(() => {
            DemoDataValidator.validateMaintenanceRequests([{ ...sampleDataset.maintenanceRequests[0], priority: 5, criticality: 'CRITICAL' }]);
        }, /semantic inconsistency/);

        assert.throws(() => {
            DemoDataValidator.validateMaintenanceRequests([{ ...sampleDataset.maintenanceRequests[0], departmentCode: 'INVALID' }]);
        }, /invalid departmentCode/);

        assert.throws(() => {
            DemoDataValidator.validateTrainMovements([{ ...sampleDataset.trainMovements[0], scheduledEndTime: sampleDataset.trainMovements[0].scheduledStartTime }]);
        }, /scheduledEndTime must be strictly after/);

        console.log('  ✓ Schema validation passed; invalid/inconsistent records properly rejected');

        // -------------------------------------------------------------
        // Step 3: Source Metadata & Explicit Demo Marking
        // -------------------------------------------------------------
        console.log('\n3. Source Metadata & Explicit Source System Marking');
        const demoData = demoDataSource.generateDataset({
            requestCount: 6,
            departmentDistribution: { ENGG: 2, SNT: 2, TRD: 2 }
        });

        assert.strictEqual(demoData.metadata.dataSourceType, 'DEMO');

        for (const req of demoData.maintenanceRequests) {
            assert.strictEqual(req.dataSourceType, 'DEMO', 'Every request must be marked DEMO');
            assert.ok(['BDMS', 'TDMS', 'SMMS'].includes(req.sourceSystem), `Unexpected source: ${req.sourceSystem}`);
            if (req.departmentCode === 'ENGG') assert.strictEqual(req.sourceSystem, 'BDMS');
            if (req.departmentCode === 'SNT') assert.strictEqual(req.sourceSystem, 'SMMS');
            if (req.departmentCode === 'TRD') assert.strictEqual(req.sourceSystem, 'TDMS');
        }

        for (const trn of demoData.trainMovements) {
            assert.strictEqual(trn.dataSourceType, 'DEMO');
            assert.strictEqual(trn.sourceSystem, 'COA');
        }

        console.log('  ✓ Explicit source tags verified: BDMS (Engg), TDMS (Traction), SMMS (S&T), COA (Operations)');
        console.log('  ✓ No false claims of live API connections; all marked data_source_type="DEMO"');

        // -------------------------------------------------------------
        // Step 4: Configurable Department Distribution
        // -------------------------------------------------------------
        console.log('\n4. Configurable Department Distribution');
        const customDistData = demoDataSource.generateDataset({
            departmentDistribution: { ENGG: 3, SNT: 2, TRD: 1 }
        });

        const enggCount = customDistData.maintenanceRequests.filter(r => r.departmentCode === 'ENGG').length;
        const sntCount = customDistData.maintenanceRequests.filter(r => r.departmentCode === 'SNT').length;
        const trdCount = customDistData.maintenanceRequests.filter(r => r.departmentCode === 'TRD').length;

        assert.strictEqual(enggCount, 3, 'Expected 3 ENGG requests');
        assert.strictEqual(sntCount, 2, 'Expected 2 SNT requests');
        assert.strictEqual(trdCount, 1, 'Expected 1 TRD request');
        console.log(`  ✓ Configured distribution verified: ENGG=${enggCount}, SNT=${sntCount}, TRD=${trdCount}`);

        // -------------------------------------------------------------
        // Step 5: Interconnected Asset/Defect/Maintenance Request Data
        // -------------------------------------------------------------
        console.log('\n5. Interconnected Asset, Defect, and Operational Data');
        const critEngg = demoData.maintenanceRequests.find(r => r.criticality === 'CRITICAL' && r.departmentCode === 'ENGG');
        assert.ok(critEngg, 'Critical engineering task present');
        assert.strictEqual(critEngg.priority, 1, 'Critical task must have priority 1');
        assert.ok(critEngg.durationMinutes >= 180, 'Complex heavy repair must have longer duration');
        assert.strictEqual(critEngg.trafficBlockRequired, true);
        assert.ok(critEngg.defect, 'Must link to underlying defect');
        assert.strictEqual(critEngg.defect.severity, 'CRITICAL');

        const trdTask = demoData.maintenanceRequests.find(r => r.departmentCode === 'TRD');
        assert.ok(trdTask, 'Traction task present');
        assert.strictEqual(trdTask.powerBlockRequired, true, 'OHE electrical task requires power block');

        assert.ok(demoData.dependencies.length > 0, 'Dependencies present (integrated block)');
        console.log('  ✓ Realistic domain interconnections verified: critical defect -> high priority, OHE -> power block, integrated block dependency');

        // -------------------------------------------------------------
        // Step 6: Authentication & API Endpoints
        // -------------------------------------------------------------
        console.log('\n6. Demo Gateway REST API Endpoints');

        // Login as Planner to obtain token
        const loginRes = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, {
            username: 'planner',
            password: 'Planner@123'
        });
        assert.strictEqual(loginRes.status, 200);
        const token = loginRes.body.token;
        const authHeader = { Authorization: `Bearer ${token}` };

        // Test POST /api/demo/generate
        console.log('  Testing POST /api/demo/generate');
        const genRes = await makeRequest(server, {
            path: '/api/demo/generate',
            method: 'POST',
            headers: authHeader
        }, {
            corridorCode: 'NDLS-CNB',
            requestCount: 6,
            departmentDistribution: { ENGG: 2, SNT: 2, TRD: 2 },
            replaceExisting: true
        });

        assert.strictEqual(genRes.status, 201);
        assert.strictEqual(genRes.body.success, true);
        assert.ok(genRes.body.metadata.recordsCreated.tasksCreated >= 6);
        assert.ok(genRes.body.metadata.recordsCreated.assetsCreated >= 3);
        assert.ok(genRes.body.metadata.recordsCreated.defectsCreated >= 6);
        assert.ok(genRes.body.metadata.recordsCreated.trainsCreated >= 4);
        console.log('    ✓ POST /api/demo/generate returned 201 with created record counts');

        // Test GET /api/demo/maintenance-requests
        console.log('  Testing GET /api/demo/maintenance-requests');
        const reqsRes = await makeRequest(server, {
            path: '/api/demo/maintenance-requests?corridor_code=NDLS-CNB',
            method: 'GET',
            headers: authHeader
        });
        assert.strictEqual(reqsRes.status, 200);
        assert.ok(reqsRes.body.data.length >= 6);

        // Filter by department=ENGG
        const enggRes = await makeRequest(server, {
            path: '/api/demo/maintenance-requests?department=ENGG',
            method: 'GET',
            headers: authHeader
        });
        assert.strictEqual(enggRes.status, 200);
        assert.ok(enggRes.body.data.every(r => r.department_code === 'ENGG'));
        console.log('    ✓ GET /api/demo/maintenance-requests returned records and filtered by department');

        // Test GET /api/demo/assets
        console.log('  Testing GET /api/demo/assets');
        const assetsRes = await makeRequest(server, {
            path: '/api/demo/assets?corridor_code=NDLS-CNB',
            method: 'GET',
            headers: authHeader
        });
        assert.strictEqual(assetsRes.status, 200);
        assert.ok(assetsRes.body.data.length >= 3);
        console.log(`    ✓ GET /api/demo/assets returned ${assetsRes.body.count} assets`);

        // Test GET /api/demo/defects
        console.log('  Testing GET /api/demo/defects');
        const defectsRes = await makeRequest(server, {
            path: '/api/demo/defects?corridor_code=NDLS-CNB',
            method: 'GET',
            headers: authHeader
        });
        assert.strictEqual(defectsRes.status, 200);
        assert.ok(defectsRes.body.data.length >= 6);
        console.log(`    ✓ GET /api/demo/defects returned ${defectsRes.body.count} defects`);

        // Test GET /api/demo/trains
        console.log('  Testing GET /api/demo/trains');
        const trainsRes = await makeRequest(server, {
            path: '/api/demo/trains?corridor_code=NDLS-CNB',
            method: 'GET',
            headers: authHeader
        });
        assert.strictEqual(trainsRes.status, 200);
        assert.ok(trainsRes.body.data.length >= 4);
        console.log(`    ✓ GET /api/demo/trains returned ${trainsRes.body.count} trains`);

        // Test Unauthenticated Access
        const unauthRes = await makeRequest(server, { path: '/api/demo/generate', method: 'POST' }, {});
        assert.strictEqual(unauthRes.status, 401);
        console.log('    ✓ Unauthenticated requests rejected with 401');

        // -------------------------------------------------------------
        // Step 7: Regeneration & Duplicate Prevention
        // -------------------------------------------------------------
        console.log('\n7. Regeneration & Duplicate Prevention');

        // 7.1 Re-generate without replaceExisting (Idempotency)
        const regenIdempotent = await makeRequest(server, {
            path: '/api/demo/generate',
            method: 'POST',
            headers: authHeader
        }, {
            corridorCode: 'NDLS-CNB',
            requestCount: 6,
            replaceExisting: false
        });
        assert.strictEqual(regenIdempotent.status, 201);

        const countAfterIdempotent = await makeRequest(server, {
            path: '/api/demo/maintenance-requests?corridor_code=NDLS-CNB',
            headers: authHeader
        });
        // Count should remain unchanged because records update on conflict rather than duplicating
        assert.strictEqual(countAfterIdempotent.body.data.length, reqsRes.body.data.length);
        console.log('  ✓ Idempotency verified: re-generating with replaceExisting=false creates zero duplicate tasks');

        // 7.2 Re-generate with replaceExisting: true
        const regenReplace = await makeRequest(server, {
            path: '/api/demo/generate',
            method: 'POST',
            headers: authHeader
        }, {
            corridorCode: 'NDLS-CNB',
            requestCount: 3,
            departmentDistribution: { ENGG: 1, SNT: 1, TRD: 1 },
            replaceExisting: true
        });
        assert.strictEqual(regenReplace.status, 201);

        const countAfterReplace = await makeRequest(server, {
            path: '/api/demo/maintenance-requests?corridor_code=NDLS-CNB',
            headers: authHeader
        });
        assert.strictEqual(countAfterReplace.body.data.length, 3);
        console.log('  ✓ Replacement verified: replaceExisting=true safely reset previous demo data to new count of 3');

        console.log('\n====================================================================');
        console.log('🎉 ALL 7 DEMO DATA GATEWAY TEST SECTIONS PASSED (0 ERRORS)');
        console.log('====================================================================\n');

    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

runDemoGatewayTests().catch(err => {
    console.error('❌ Demo Gateway Test Failed:', err);
    process.exit(1);
});
