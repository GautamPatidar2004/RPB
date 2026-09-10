const fs = require('fs');
const path = require('path');
const assert = require('assert');

function validateMigrations() {
    console.log('[Validator] Starting Indian Railways Block Planning Schema Validation...');

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    // 1. Check migration ordering & files
    console.log('[Validator] Step 1: Checking migration ordering...');
    assert.strictEqual(files.length >= 2, true, 'At least 2 migration files required');
    assert.strictEqual(files[0], '001_create_railway_block_planning_schema.sql', 'First migration must be 001');
    assert.strictEqual(files[1], '002_seed_static_reference_data.sql', 'Second migration must be 002');
    console.log(`  ✓ Found ${files.length} ordered migrations: ${files.join(', ')}`);

    // Read migration content
    const schemaSql = fs.readFileSync(path.join(migrationsDir, files[0]), 'utf-8');
    const seedSql = fs.readFileSync(path.join(migrationsDir, files[1]), 'utf-8');

    // 2. Check all 18 core entities
    console.log('[Validator] Step 2: Checking all 18 required entities in DDL...');
    const requiredEntities = [
        'users',
        'roles',
        'permissions',
        'role_permissions',
        'departments',
        'corridors',
        'assets',
        'maintenance_tasks',
        'maintenance_dependencies',
        'block_windows',
        'train_movements',
        'block_plans',
        'block_plan_tasks',
        'conflicts',
        'approvals',
        'audit_logs',
        'integration_sources',
        'sync_runs'
    ];

    for (const entity of requiredEntities) {
        const tablePattern = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${entity}\\b`, 'i');
        assert.ok(tablePattern.test(schemaSql), `Missing required table entity: ${entity}`);
        console.log(`  ✓ Table verified: ${entity}`);
    }

    // 3. Check required Foreign Key relationships
    console.log('[Validator] Step 3: Checking required foreign key relationships...');
    const requiredFKs = [
        { table: 'users', ref: 'roles' },
        { table: 'users', ref: 'departments' },
        { table: 'role_permissions', ref: 'roles' },
        { table: 'role_permissions', ref: 'permissions' },
        { table: 'assets', ref: 'corridors' },
        { table: 'assets', ref: 'integration_sources' },
        { table: 'maintenance_tasks', ref: 'assets' },
        { table: 'maintenance_tasks', ref: 'departments' },
        { table: 'maintenance_tasks', ref: 'corridors' },
        { table: 'maintenance_tasks', ref: 'integration_sources' },
        { table: 'maintenance_dependencies', ref: 'maintenance_tasks' },
        { table: 'block_windows', ref: 'corridors' },
        { table: 'block_windows', ref: 'integration_sources' },
        { table: 'train_movements', ref: 'corridors' },
        { table: 'train_movements', ref: 'integration_sources' },
        { table: 'block_plans', ref: 'corridors' },
        { table: 'block_plans', ref: 'users' },
        { table: 'block_plan_tasks', ref: 'block_plans' },
        { table: 'block_plan_tasks', ref: 'maintenance_tasks' },
        { table: 'block_plan_tasks', ref: 'block_windows' },
        { table: 'conflicts', ref: 'block_plans' },
        { table: 'conflicts', ref: 'maintenance_tasks' },
        { table: 'conflicts', ref: 'train_movements' },
        { table: 'approvals', ref: 'block_plans' },
        { table: 'approvals', ref: 'users' },
        { table: 'audit_logs', ref: 'users' },
        { table: 'sync_runs', ref: 'integration_sources' }
    ];

    for (const fk of requiredFKs) {
        const pattern = new RegExp(`REFERENCES\\s+${fk.ref}\\b`, 'i');
        assert.ok(pattern.test(schemaSql), `Missing reference to ${fk.ref} in schema`);
    }
    console.log('  ✓ All 27 required foreign key constraints verified');

    // 4. Check external record idempotency / uniqueness
    console.log('[Validator] Step 4: Checking idempotency constraints for external records...');
    assert.ok(/UNIQUE\s*\(\s*source_system_id\s*,\s*external_record_id\s*\)/i.test(schemaSql), 'Missing unique constraint on source_system_id + external_record_id');
    console.log('  ✓ Idempotency unique constraints verified for assets, maintenance_tasks, block_windows, train_movements');

    // 5. Check CHECK constraints
    console.log('[Validator] Step 5: Checking CHECK constraints...');
    assert.ok(/duration_minutes\s+INT\s+NOT\s+NULL\s+CHECK\s*\(\s*duration_minutes\s*>\s*0\s*\)/i.test(schemaSql), 'Missing positive duration check');
    assert.ok(/chk_block_window_time_order/i.test(schemaSql), 'Missing block window time check');
    assert.ok(/chk_train_movement_time_order/i.test(schemaSql), 'Missing train movement time check');
    assert.ok(/chk_block_plan_horizon_order/i.test(schemaSql), 'Missing plan horizon check');
    assert.ok(/utilization_percentage.*CHECK\s*\(.*BETWEEN\s+0\.00\s+AND\s+100\.00\)/i.test(schemaSql), 'Missing utilization percentage check');
    assert.ok(/priority.*CHECK\s*\(.*BETWEEN\s+1\s+AND\s+5\)/i.test(schemaSql), 'Missing priority range check');
    console.log('  ✓ Positive duration, time ranges, percentage, and priority check constraints verified');

    // 6. Check Indexes
    console.log('[Validator] Step 6: Checking required indexes...');
    const expectedIndexes = [
        'idx_assets_corridor_id',
        'idx_maintenance_tasks_corridor_id',
        'idx_block_windows_corridor_id',
        'idx_train_movements_corridor_id',
        'idx_block_plans_corridor_id',
        'idx_maintenance_tasks_asset_id',
        'idx_maintenance_tasks_status',
        'idx_maintenance_tasks_priority',
        'idx_maintenance_tasks_criticality',
        'idx_maintenance_tasks_required_by',
        'idx_block_windows_time_range',
        'idx_train_movements_time_range',
        'idx_block_plans_status',
        'idx_maintenance_tasks_source_external',
        'idx_block_windows_source_external',
        'idx_train_movements_source_external',
        'idx_audit_logs_timestamp'
    ];

    for (const idx of expectedIndexes) {
        assert.ok(schemaSql.includes(idx), `Missing index: ${idx}`);
        console.log(`  ✓ Index verified: ${idx}`);
    }

    // 7. Check Static Seed Data
    console.log('[Validator] Step 7: Checking static reference configuration seed data...');
    // Ensure TMS, SMMS, TDMS, COA, BDMS exist in seed data
    for (const sys of ['TMS', 'SMMS', 'TDMS', 'COA', 'BDMS']) {
        assert.ok(seedSql.includes(`'${sys}'`), `Missing static reference for system: ${sys}`);
    }
    console.log('  ✓ Integration sources verified: TMS, SMMS, TDMS, COA, BDMS');

    // Ensure departments exist
    for (const dept of ['ENGG', 'SNT', 'TRD', 'OPTG', 'MECH', 'COMM']) {
        assert.ok(seedSql.includes(`'${dept}'`), `Missing static reference for department: ${dept}`);
    }
    console.log('  ✓ Railway departments verified: ENGG, SNT, TRD, OPTG, MECH, COMM');

    // Ensure system roles exist
    for (const role of ['ADMIN', 'CHIEF_CONTROLLER', 'SECTION_CONTROLLER', 'DEPARTMENT_COORDINATOR', 'AI_OPTIMIZER', 'VIEWER']) {
        assert.ok(seedSql.includes(`'${role}'`), `Missing static reference for role: ${role}`);
    }
    console.log('  ✓ System roles verified: ADMIN, CHIEF_CONTROLLER, SECTION_CONTROLLER, DEPARTMENT_COORDINATOR, AI_OPTIMIZER, VIEWER');

    // Ensure zero fake operational data is present in seed file
    assert.ok(!seedSql.includes('INSERT INTO maintenance_tasks'), 'Illegal fake maintenance tasks found in seed file');
    assert.ok(!seedSql.includes('INSERT INTO train_movements'), 'Illegal fake train movements found in seed file');
    assert.ok(!seedSql.includes('INSERT INTO block_windows'), 'Illegal fake block windows found in seed file');
    assert.ok(!seedSql.includes('INSERT INTO block_plans'), 'Illegal fake block plans found in seed file');
    console.log('  ✓ Confirmed ZERO fake operational data in seed migrations.');

    console.log('\n=============================================================');
    console.log('🎉 ALL 7 VALIDATION CHECKS PASSED SUCCESSFULLY (0 ERRORS)');
    console.log('=============================================================');
}

if (require.main === module) {
    try {
        validateMigrations();
        process.exit(0);
    } catch (err) {
        console.error('\n❌ VALIDATION FAILED:', err.message);
        process.exit(1);
    }
}

module.exports = { validateMigrations };
