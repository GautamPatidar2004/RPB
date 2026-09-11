const http = require('http');
const assert = require('assert');
const app = require('./src/app');

// Helper to send HTTP requests against the in-process Express app
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

async function runAuthTests() {
    console.log('[Test] Starting Indian Railways Demo Authentication Self-Check...\n');

    // Spin up ephemeral test server on random port
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    try {
        // -------------------------------------------------------------
        // 1. Check Demo Accounts endpoint
        // -------------------------------------------------------------
        console.log('Test 1: GET /api/auth/demo-accounts');
        const resDemo = await makeRequest(server, { path: '/api/auth/demo-accounts', method: 'GET' });
        assert.strictEqual(resDemo.status, 200);
        assert.ok(resDemo.body.demoAccounts.length >= 3, 'Expected at least 3 demo accounts');
        console.log(`  ✓ Returned ${resDemo.body.demoAccounts.length} demo accounts\n`);

        // -------------------------------------------------------------
        // 2. Test Login: Admin
        // -------------------------------------------------------------
        console.log('Test 2: Login as Admin');
        const resAdminLogin = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, {
            username: 'admin',
            password: 'Admin@123'
        });
        assert.strictEqual(resAdminLogin.status, 200);
        assert.ok(resAdminLogin.body.token, 'Must return session token');
        assert.strictEqual(resAdminLogin.body.user.role, 'Admin');
        const adminToken = resAdminLogin.body.token;
        console.log('  ✓ Admin logged in successfully with role "Admin"\n');

        // -------------------------------------------------------------
        // 3. Test Login: Planner
        // -------------------------------------------------------------
        console.log('Test 3: Login as Planner');
        const resPlannerLogin = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, {
            username: 'planner',
            password: 'Planner@123'
        });
        assert.strictEqual(resPlannerLogin.status, 200);
        assert.ok(resPlannerLogin.body.token);
        assert.strictEqual(resPlannerLogin.body.user.role, 'Planner');
        const plannerToken = resPlannerLogin.body.token;
        console.log('  ✓ Planner logged in successfully with role "Planner"\n');

        // -------------------------------------------------------------
        // 4. Test Login: Operations
        // -------------------------------------------------------------
        console.log('Test 4: Login as Operations');
        const resOpsLogin = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, {
            username: 'operations',
            password: 'Operations@123'
        });
        assert.strictEqual(resOpsLogin.status, 200);
        assert.ok(resOpsLogin.body.token);
        assert.strictEqual(resOpsLogin.body.user.role, 'Operations');
        const opsToken = resOpsLogin.body.token;
        console.log('  ✓ Operations logged in successfully with role "Operations"\n');

        // -------------------------------------------------------------
        // 5. Test Invalid Login Attempts
        // -------------------------------------------------------------
        console.log('Test 5: Bad password and unknown user rejection');
        const resBadPass = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, {
            username: 'planner',
            password: 'WrongPassword'
        });
        assert.strictEqual(resBadPass.status, 401);
        assert.strictEqual(resBadPass.body.success, false);

        const resBadUser = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, {
            username: 'unknown_official',
            password: 'AnyPassword'
        });
        assert.strictEqual(resBadUser.status, 401);
        console.log('  ✓ Invalid passwords and non-existent users rejected with 401\n');

        // -------------------------------------------------------------
        // 6. Test GET /api/auth/me
        // -------------------------------------------------------------
        console.log('Test 6: Current User (GET /api/auth/me)');
        const resMeValid = await makeRequest(server, {
            path: '/api/auth/me',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${plannerToken}` }
        });
        assert.strictEqual(resMeValid.status, 200);
        assert.strictEqual(resMeValid.body.user.username, 'planner');
        assert.strictEqual(resMeValid.body.user.role, 'Planner');

        const resMeNoToken = await makeRequest(server, { path: '/api/auth/me', method: 'GET' });
        assert.strictEqual(resMeNoToken.status, 401);
        console.log('  ✓ /api/auth/me verified for valid and missing tokens\n');

        // -------------------------------------------------------------
        // 7. Test Role-Based Route Protection: Planner Route
        // -------------------------------------------------------------
        console.log('Test 7: Role Protection on /api/demo/planner/dashboard');
        // Planner can access
        const resPlnAccess = await makeRequest(server, {
            path: '/api/demo/planner/dashboard',
            headers: { 'Authorization': `Bearer ${plannerToken}` }
        });
        assert.strictEqual(resPlnAccess.status, 200);
        assert.strictEqual(resPlnAccess.body.scope, 'MAINTENANCE_TASK_PLANNING');

        // Admin can access
        const resPlnAdmin = await makeRequest(server, {
            path: '/api/demo/planner/dashboard',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert.strictEqual(resPlnAdmin.status, 200);

        // Operations CANNOT access (Forbidden 403)
        const resPlnOps = await makeRequest(server, {
            path: '/api/demo/planner/dashboard',
            headers: { 'Authorization': `Bearer ${opsToken}` }
        });
        assert.strictEqual(resPlnOps.status, 403);
        console.log('  ✓ Planner dashboard: Planner=200, Admin=200, Operations=403 Forbidden\n');

        // -------------------------------------------------------------
        // 8. Test Role-Based Route Protection: Operations Route
        // -------------------------------------------------------------
        console.log('Test 8: Role Protection on /api/demo/operations/dispatch');
        // Operations can access
        const resOpsAccess = await makeRequest(server, {
            path: '/api/demo/operations/dispatch',
            headers: { 'Authorization': `Bearer ${opsToken}` }
        });
        assert.strictEqual(resOpsAccess.status, 200);
        assert.strictEqual(resOpsAccess.body.scope, 'SECTION_CONTROL_AND_TRAIN_DISPATCH');

        // Admin can access
        const resOpsAdmin = await makeRequest(server, {
            path: '/api/demo/operations/dispatch',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert.strictEqual(resOpsAdmin.status, 200);

        // Planner CANNOT access (Forbidden 403)
        const resOpsPln = await makeRequest(server, {
            path: '/api/demo/operations/dispatch',
            headers: { 'Authorization': `Bearer ${plannerToken}` }
        });
        assert.strictEqual(resOpsPln.status, 403);
        console.log('  ✓ Operations dispatch: Operations=200, Admin=200, Planner=403 Forbidden\n');

        // -------------------------------------------------------------
        // 9. Test Role-Based Route Protection: Admin Route
        // -------------------------------------------------------------
        console.log('Test 9: Role Protection on /api/demo/admin/settings');
        // Admin can access
        const resAdmAccess = await makeRequest(server, {
            path: '/api/demo/admin/settings',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert.strictEqual(resAdmAccess.status, 200);

        // Planner CANNOT access (403)
        const resAdmPln = await makeRequest(server, {
            path: '/api/demo/admin/settings',
            headers: { 'Authorization': `Bearer ${plannerToken}` }
        });
        assert.strictEqual(resAdmPln.status, 403);

        // Operations CANNOT access (403)
        const resAdmOps = await makeRequest(server, {
            path: '/api/demo/admin/settings',
            headers: { 'Authorization': `Bearer ${opsToken}` }
        });
        assert.strictEqual(resAdmOps.status, 403);
        console.log('  ✓ Admin settings: Admin=200, Planner=403, Operations=403\n');

        // -------------------------------------------------------------
        // 10. Test Shared Route
        // -------------------------------------------------------------
        console.log('Test 10: Shared status route');
        for (const token of [adminToken, plannerToken, opsToken]) {
            const resShared = await makeRequest(server, {
                path: '/api/demo/shared/status',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            assert.strictEqual(resShared.status, 200);
        }
        const resSharedUnauth = await makeRequest(server, { path: '/api/demo/shared/status' });
        assert.strictEqual(resSharedUnauth.status, 401);
        console.log('  ✓ Shared route accessible to all authenticated roles; unauth rejected with 401\n');

        // -------------------------------------------------------------
        // 11. Test Logout
        // -------------------------------------------------------------
        console.log('Test 11: Logout & Session Invalidation');
        const resLogout = await makeRequest(server, {
            path: '/api/auth/logout',
            method: 'POST',
            headers: { 'Authorization': `Bearer ${plannerToken}` }
        });
        assert.strictEqual(resLogout.status, 200);
        assert.strictEqual(resLogout.body.success, true);

        // Re-check /api/auth/me with invalidated token
        const resAfterLogout = await makeRequest(server, {
            path: '/api/auth/me',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${plannerToken}` }
        });
        assert.strictEqual(resAfterLogout.status, 401);
        console.log('  ✓ Session successfully destroyed; subsequent requests rejected with 401\n');

        console.log('=============================================================');
        console.log('🎉 ALL 11 AUTHENTICATION & ROLE-ACCESS TESTS PASSED (0 ERRORS)');
        console.log('=============================================================');

    } finally {
        server.close();
    }
}

if (require.main === module) {
    runAuthTests()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('❌ Test execution failed:', err);
            process.exit(1);
        });
}

module.exports = { runAuthTests };
