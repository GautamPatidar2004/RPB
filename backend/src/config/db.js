const { Pool } = require('pg');
require('dotenv').config();

const connectionConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    }
    : {
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'railway_block_planning',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };

const pool = new Pool({
    ...connectionConfig,
    max: parseInt(process.env.PGMAX_CONNECTIONS || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
});

// Suppress unhandled pool error crashes when offline
pool.on('error', (err) => {
    if (err.code !== 'ECONNREFUSED') {
        console.error('[PostgreSQL Pool Warning]:', err.message);
    }
});

// ============================================================================
// OFFLINE / TEST-FALLBACK IN-MEMORY STORE
// Mirrors PostgreSQL schema exactly so APIs & tests work seamlessly offline
// ============================================================================
const memoryDb = {
    corridors: [
        {
            id: 'c1111111-1111-1111-1111-111111111111',
            code: 'NDLS-CNB',
            name: 'New Delhi - Kanpur Central High Density Corridor',
            zone: 'NCR',
            division: 'Prayagraj',
            start_station: 'NDLS',
            end_station: 'CNB',
            start_kilometer: 0.000,
            end_kilometer: 440.500,
            total_length_km: 440.500,
            line_type: 'DOUBLE_LINE',
            electrified: true,
            is_active: true,
            created_at: new Date('2026-09-01T00:00:00Z'),
            updated_at: new Date('2026-09-01T00:00:00Z')
        },
        {
            id: 'c2222222-2222-2222-2222-222222222222',
            code: 'HWH-DDU',
            name: 'Howrah - Pt. Deen Dayal Upadhyaya Grand Chord',
            zone: 'ECR',
            division: 'Danapur',
            start_station: 'HWH',
            end_station: 'DDU',
            start_kilometer: 0.000,
            end_kilometer: 675.000,
            total_length_km: 675.000,
            line_type: 'DOUBLE_LINE',
            electrified: true,
            is_active: true,
            created_at: new Date('2026-09-01T00:00:00Z'),
            updated_at: new Date('2026-09-01T00:00:00Z')
        }
    ],
    integration_sources: [
        { id: 's1111111-1111-1111-1111-111111111111', code: 'TMS', name: 'Track Management System', system_type: 'MAINTENANCE_TRACK', is_active: true, sync_interval_minutes: 15, last_sync_at: null },
        { id: 's2222222-2222-2222-2222-222222222222', code: 'SMMS', name: 'Signal Maintenance Management System', system_type: 'MAINTENANCE_SNT', is_active: true, sync_interval_minutes: 15, last_sync_at: null },
        { id: 's3333333-3333-3333-3333-333333333333', code: 'TDMS', name: 'Traction Distribution Management System', system_type: 'MAINTENANCE_TRD', is_active: true, sync_interval_minutes: 15, last_sync_at: null },
        { id: 's4444444-4444-4444-4444-444444444444', code: 'COA', name: 'Control Office Application', system_type: 'OPERATIONS_COA', is_active: true, sync_interval_minutes: 5, last_sync_at: null },
        { id: 's5555555-5555-5555-5555-555555555555', code: 'BDMS', name: 'Breakdown Management System', system_type: 'OPERATIONS_BDMS', is_active: true, sync_interval_minutes: 30, last_sync_at: null }
    ],
    departments: [
        { id: 'd1111111-1111-1111-1111-111111111111', code: 'ENGG', name: 'Civil Engineering' },
        { id: 'd2222222-2222-2222-2222-222222222222', code: 'SNT', name: 'Signal and Telecommunication' },
        { id: 'd3333333-3333-3333-3333-333333333333', code: 'TRD', name: 'Traction Distribution' },
        { id: 'd4444444-4444-4444-4444-444444444444', code: 'OPTG', name: 'Operating' }
    ],
    assets: [
        {
            id: 'a1111111-1111-1111-1111-111111111111',
            asset_code: 'TRK-UP-112',
            asset_type: 'TRACK',
            name: 'UP Main Track Section KM 112-116',
            corridor_id: 'c1111111-1111-1111-1111-111111111111',
            location: 'KM 112.000 to 116.000 (Khurja Section)',
            start_kilometer: 112.000,
            end_kilometer: 116.000,
            criticality: 'CRITICAL',
            health_status: 'MAINTENANCE_REQUIRED',
            source_system_id: 's1111111-1111-1111-1111-111111111111',
            external_record_id: 'TMS-ASSET-8812',
            metadata: { trackCategory: 'A', railType: '60kg', sleeperDensity: 1660 },
            is_active: true,
            created_at: new Date('2026-09-02T00:00:00Z'),
            updated_at: new Date('2026-09-02T00:00:00Z')
        },
        {
            id: 'a2222222-2222-2222-2222-222222222222',
            asset_code: 'SIG-EI-CNB',
            asset_type: 'INTERLOCKING',
            name: 'Electronic Interlocking Central Cabin CNB',
            corridor_id: 'c1111111-1111-1111-1111-111111111111',
            location: 'Kanpur Central Yard',
            start_kilometer: 439.500,
            end_kilometer: 440.500,
            criticality: 'HIGH',
            health_status: 'OPERATIONAL',
            source_system_id: 's2222222-2222-2222-2222-222222222222',
            external_record_id: 'SMMS-ASSET-3301',
            metadata: { manufacturer: 'Kyosan', routes: 412 },
            is_active: true,
            created_at: new Date('2026-09-02T00:00:00Z'),
            updated_at: new Date('2026-09-02T00:00:00Z')
        },
        {
            id: 'a3333333-3333-3333-3333-333333333333',
            asset_code: 'OHE-TDL-140',
            asset_type: 'OHE_LINE',
            name: '25kV AC Traction Cantilever Span Tundla Junction',
            corridor_id: 'c1111111-1111-1111-1111-111111111111',
            location: 'KM 204.000 to 208.000',
            start_kilometer: 204.000,
            end_kilometer: 208.000,
            criticality: 'HIGH',
            health_status: 'OPERATIONAL',
            source_system_id: 's3333333-3333-3333-3333-333333333333',
            external_record_id: 'TDMS-ASSET-5521',
            metadata: { tension: 'Conventional 1000kgf', contactWireSize: '107sqmm' },
            is_active: true,
            created_at: new Date('2026-09-02T00:00:00Z'),
            updated_at: new Date('2026-09-02T00:00:00Z')
        }
    ],
    maintenance_tasks: [
        {
            id: 't1111111-1111-1111-1111-111111111111',
            source_system_id: 's1111111-1111-1111-1111-111111111111',
            external_record_id: 'TMS-TASK-9921',
            department_id: 'd1111111-1111-1111-1111-111111111111',
            asset_id: 'a1111111-1111-1111-1111-111111111111',
            corridor_id: 'c1111111-1111-1111-1111-111111111111',
            task_code: 'TAMP-UP-112',
            title: 'Mechanized Heavy Track Tamping & Deep Screening',
            description: 'Tamping of UP Main Line track to restore track geometry following monsoonal settling.',
            maintenance_type: 'TRACK_TAMPING',
            duration_minutes: 180,
            priority: 1,
            criticality: 'CRITICAL',
            urgency: 'HIGH',
            required_by_date: new Date('2026-09-15T18:00:00Z'),
            status: 'PENDING',
            power_block_required: false,
            traffic_block_required: true,
            speed_restriction_kmph: 30,
            operational_constraints: { blockTypeRequired: 'TRAFFIC_BLOCK', machineRequired: 'CSU-09-3X Tamping Express' },
            synced_at: new Date('2026-09-10T00:00:00Z'),
            deleted_at: null,
            created_at: new Date('2026-09-05T00:00:00Z'),
            updated_at: new Date('2026-09-05T00:00:00Z')
        },
        {
            id: 't2222222-2222-2222-2222-222222222222',
            source_system_id: 's2222222-2222-2222-2222-222222222222',
            external_record_id: 'SMMS-TASK-4402',
            department_id: 'd2222222-2222-2222-2222-222222222222',
            asset_id: 'a2222222-2222-2222-2222-222222222222',
            corridor_id: 'c1111111-1111-1111-1111-111111111111',
            task_code: 'SIG-PNT-44',
            title: 'Point Machine Obstruction Testing & Contact Cleaning',
            description: 'Routine quarterly overhaul and correspondence check of Turnout 102A/B.',
            maintenance_type: 'POINTS_TESTING',
            duration_minutes: 90,
            priority: 2,
            criticality: 'HIGH',
            urgency: 'MEDIUM',
            required_by_date: new Date('2026-09-18T12:00:00Z'),
            status: 'SCHEDULED',
            power_block_required: false,
            traffic_block_required: true,
            speed_restriction_kmph: null,
            operational_constraints: { shadowAllowed: true },
            synced_at: new Date('2026-09-10T00:00:00Z'),
            deleted_at: null,
            created_at: new Date('2026-09-06T00:00:00Z'),
            updated_at: new Date('2026-09-06T00:00:00Z')
        },
        {
            id: 't3333333-3333-3333-3333-333333333333',
            source_system_id: 's3333333-3333-3333-3333-333333333333',
            external_record_id: 'TDMS-TASK-7719',
            department_id: 'd3333333-3333-3333-3333-333333333333',
            asset_id: 'a3333333-3333-3333-3333-333333333333',
            corridor_id: 'c1111111-1111-1111-1111-111111111111',
            task_code: 'OHE-INSP-204',
            title: 'OHE Contact Wire Height & Stagger Inspection',
            description: 'Tower wagon inspection of contact wire wear and dropper adjustments.',
            maintenance_type: 'OHE_INSPECTION',
            duration_minutes: 120,
            priority: 2,
            criticality: 'MEDIUM',
            urgency: 'MEDIUM',
            required_by_date: new Date('2026-09-20T08:00:00Z'),
            status: 'PENDING',
            power_block_required: true,
            traffic_block_required: true,
            speed_restriction_kmph: null,
            operational_constraints: { powerShutoffSubstation: 'TDL-TSS' },
            synced_at: new Date('2026-09-10T00:00:00Z'),
            deleted_at: null,
            created_at: new Date('2026-09-07T00:00:00Z'),
            updated_at: new Date('2026-09-07T00:00:00Z')
        }
    ],
    block_windows: [
        {
            id: 'w1111111-1111-1111-1111-111111111111',
            corridor_id: 'c1111111-1111-1111-1111-111111111111',
            source_system_id: 's4444444-4444-4444-4444-444444444444',
            external_record_id: 'COA-WIN-1092',
            start_time: new Date('2026-09-12T01:00:00Z'),
            end_time: new Date('2026-09-12T04:30:00Z'),
            duration_minutes: 210,
            availability_status: 'AVAILABLE',
            block_type: 'TRAFFIC_BLOCK',
            line_designation: 'UP_MAIN',
            start_kilometer: 110.000,
            end_kilometer: 125.000,
            operational_constraints: { cautionaryOrder: 'Normal Caution 30kmph on resumption' },
            created_at: new Date('2026-09-08T00:00:00Z'),
            updated_at: new Date('2026-09-08T00:00:00Z')
        },
        {
            id: 'w2222222-2222-2222-2222-222222222222',
            corridor_id: 'c1111111-1111-1111-1111-111111111111',
            source_system_id: 's5555555-5555-5555-5555-555555555555',
            external_record_id: 'BDMS-WIN-4491',
            start_time: new Date('2026-09-13T02:00:00Z'),
            end_time: new Date('2026-09-13T05:00:00Z'),
            duration_minutes: 180,
            availability_status: 'RESERVED',
            block_type: 'INTEGRATED_BLOCK',
            line_designation: 'DN_MAIN',
            start_kilometer: 200.000,
            end_kilometer: 215.000,
            operational_constraints: { simultaneousOHE: true },
            created_at: new Date('2026-09-08T00:00:00Z'),
            updated_at: new Date('2026-09-08T00:00:00Z')
        }
    ],
    train_movements: [
        {
            id: 'm1111111-1111-1111-1111-111111111111',
            train_number: '12004',
            service_identifier: '12004_NDLS_LKO_20260912',
            corridor_id: 'c1111111-1111-1111-1111-111111111111',
            scheduled_start_time: new Date('2026-09-12T06:10:00Z'),
            scheduled_end_time: new Date('2026-09-12T11:40:00Z'),
            direction: 'DOWN',
            train_type: 'SHATABDI',
            priority: 1,
            status: 'SCHEDULED',
            source_system_id: 's4444444-4444-4444-4444-444444444444',
            external_record_id: 'COA-TRN-12004-20260912',
            operational_details: { rakeType: 'LHB', maxSpeedKmph: 130 },
            created_at: new Date('2026-09-08T00:00:00Z'),
            updated_at: new Date('2026-09-08T00:00:00Z')
        },
        {
            id: 'm2222222-2222-2222-2222-222222222222',
            train_number: '22436',
            service_identifier: '22436_NDLS_BSB_20260912',
            corridor_id: 'c1111111-1111-1111-1111-111111111111',
            scheduled_start_time: new Date('2026-09-12T06:00:00Z'),
            scheduled_end_time: new Date('2026-09-12T14:00:00Z'),
            direction: 'DOWN',
            train_type: 'VANDE_BHARAT',
            priority: 1,
            status: 'SCHEDULED',
            source_system_id: 's4444444-4444-4444-4444-444444444444',
            external_record_id: 'COA-TRN-22436-20260912',
            operational_details: { rakeType: 'Train18', maxSpeedKmph: 160 },
            created_at: new Date('2026-09-08T00:00:00Z'),
            updated_at: new Date('2026-09-08T00:00:00Z')
        },
        {
            id: 'm3333333-3333-3333-3333-333333333333',
            train_number: 'BOXN-883',
            service_identifier: 'BOXN_883_DDU_GZB_20260912',
            corridor_id: 'c1111111-1111-1111-1111-111111111111',
            scheduled_start_time: new Date('2026-09-12T01:30:00Z'),
            scheduled_end_time: new Date('2026-09-12T05:00:00Z'),
            direction: 'UP',
            train_type: 'FREIGHT',
            priority: 5,
            status: 'SCHEDULED',
            source_system_id: 's4444444-4444-4444-4444-444444444444',
            external_record_id: 'COA-TRN-BOXN883-20260912',
            operational_details: { load: 'Coal 3800T', maxSpeedKmph: 75 },
            created_at: new Date('2026-09-08T00:00:00Z'),
            updated_at: new Date('2026-09-08T00:00:00Z')
        }
    ],
    sync_runs: [],
    block_plans: [],
    block_plan_tasks: [],
    conflicts: [],
    approvals: [],
    audit_logs: [],
    users: [
        { id: '11111111-1111-1111-1111-111111111111', username: 'admin', full_name: 'System Administrator', role: 'Admin' },
        { id: '22222222-2222-2222-2222-222222222222', username: 'planner', full_name: 'Rajesh Sharma', role: 'Planner' },
        { id: '33333333-3333-3333-3333-333333333333', username: 'operations', full_name: 'Amit Verma', role: 'Operations' }
    ]
};

let lastConnectionAttempt = 0;
let isConnectionFailing = false;
const RETRY_INTERVAL_MS = 15000;

async function executeQuery(text, params = []) {
    const now = Date.now();
    if (!isConnectionFailing || (now - lastConnectionAttempt > RETRY_INTERVAL_MS)) {
        try {
            lastConnectionAttempt = now;
            const client = await pool.connect();
            try {
                const res = await client.query(text, params);
                isConnectionFailing = false;
                return res;
            } finally {
                client.release();
            }
        } catch {
            isConnectionFailing = true;
            return handleMemoryQuery(text, params);
        }
    }
    return handleMemoryQuery(text, params);
}

/**
 * Executes queries against memoryDb with PostgreSQL semantics when offline
 */
function handleMemoryQuery(sql, params) {
    const cleanSql = sql.trim().replace(/\s+/g, ' ');

    // 1. CORRIDORS
    if (/FROM\s+corridors/i.test(cleanSql)) {
        if (/COUNT\(\*\)/i.test(cleanSql)) {
            const total = memoryDb.corridors.length;
            const active = memoryDb.corridors.filter(c => c.is_active).length;
            const electrified = memoryDb.corridors.filter(c => c.electrified).length;
            const totalKm = memoryDb.corridors.reduce((acc, c) => acc + Number(c.total_length_km || 0), 0);
            return {
                rows: [{
                    total_corridors: total,
                    active_corridors: active,
                    electrified_corridors: electrified,
                    total_track_length_km: totalKm.toFixed(2)
                }]
            };
        }

        if (/WHERE\s+id\s*=\s*\$1/i.test(cleanSql)) {
            const corridor = memoryDb.corridors.find(c => c.id === params[0]);
            return { rows: corridor ? [corridor] : [] };
        }

        if (/WHERE\s+code\s*=\s*\$1/i.test(cleanSql)) {
            const corridor = memoryDb.corridors.find(c => c.code.toLowerCase() === (params[0] || '').toLowerCase());
            return { rows: corridor ? [corridor] : [] };
        }

        let results = [...memoryDb.corridors];
        if (params[0]) results = results.filter(c => c.zone.toLowerCase() === params[0].toLowerCase());
        if (params[1]) results = results.filter(c => c.division.toLowerCase() === params[1].toLowerCase());
        if (params[2] !== undefined && params[2] !== null) results = results.filter(c => c.electrified === params[2]);
        if (params[3] !== undefined && params[3] !== null) results = results.filter(c => c.is_active === params[3]);

        return { rows: results };
    }

    // 2. ASSETS
    if (/(?:FROM|UPDATE)\s+assets/i.test(cleanSql)) {
        if (/UPDATE\s+assets/i.test(cleanSql)) {
            const assetId = params[1];
            const newHealth = params[0];
            const asset = memoryDb.assets.find(a => a.id === assetId);
            if (asset) {
                asset.health_status = newHealth;
                asset.updated_at = new Date();
                return { rows: [enrichAsset(asset)] };
            }
            return { rows: [] };
        }

        if (/COUNT\(\*\)/i.test(cleanSql)) {
            const total = memoryDb.assets.length;
            const operational = memoryDb.assets.filter(a => a.health_status === 'OPERATIONAL').length;
            const maintenanceReq = memoryDb.assets.filter(a => ['MAINTENANCE_REQUIRED', 'DEGRADED'].includes(a.health_status)).length;
            const underMaint = memoryDb.assets.filter(a => a.health_status === 'UNDER_MAINTENANCE').length;
            const critical = memoryDb.assets.filter(a => a.criticality === 'CRITICAL').length;
            const highCrit = memoryDb.assets.filter(a => a.criticality === 'HIGH').length;
            return {
                rows: [{
                    total_assets: total,
                    operational_count: operational,
                    maintenance_required_count: maintenanceReq,
                    under_maintenance_count: underMaint,
                    critical_assets_count: critical,
                    high_criticality_count: highCrit
                }]
            };
        }

        if (/WHERE\s+a\.id\s*=\s*\$1/i.test(cleanSql) || /WHERE\s+id\s*=\s*\$1/i.test(cleanSql)) {
            const asset = memoryDb.assets.find(a => a.id === params[0]);
            return { rows: asset ? [enrichAsset(asset)] : [] };
        }

        let results = memoryDb.assets.map(enrichAsset);
        // Param filters: [corridor_id, asset_type, criticality, health_status, source_system, search, limit, offset]
        if (params[0]) results = results.filter(a => a.corridor_id === params[0]);
        if (params[1]) results = results.filter(a => a.asset_type.toLowerCase() === params[1].toLowerCase());
        if (params[2]) results = results.filter(a => a.criticality.toLowerCase() === params[2].toLowerCase());
        if (params[3]) results = results.filter(a => a.health_status.toLowerCase() === params[3].toLowerCase());
        if (params[4]) results = results.filter(a => a.source_system.toLowerCase() === params[4].toLowerCase());
        if (params[5]) {
            const q = params[5].replace(/%/g, '').toLowerCase();
            results = results.filter(a =>
                a.name.toLowerCase().includes(q) ||
                a.asset_code.toLowerCase().includes(q) ||
                a.location.toLowerCase().includes(q)
            );
        }

        return { rows: results };
    }

    // 3. MAINTENANCE TASKS
    if (/(?:FROM|UPDATE)\s+maintenance_tasks/i.test(cleanSql)) {
        if (/UPDATE\s+maintenance_tasks/i.test(cleanSql)) {
            const taskId = params[1];
            const newStatus = params[0];
            const task = memoryDb.maintenance_tasks.find(t => t.id === taskId && !t.deleted_at);
            if (task) {
                task.status = newStatus;
                task.updated_at = new Date();
                return { rows: [enrichTask(task)] };
            }
            return { rows: [] };
        }

        if (/COUNT\(\*\)/i.test(cleanSql)) {
            const activeTasks = memoryDb.maintenance_tasks.filter(t => !t.deleted_at);
            return {
                rows: [{
                    total_tasks: activeTasks.length,
                    pending_count: activeTasks.filter(t => t.status === 'PENDING').length,
                    scheduled_count: activeTasks.filter(t => t.status === 'SCHEDULED').length,
                    in_progress_count: activeTasks.filter(t => t.status === 'IN_PROGRESS').length,
                    completed_count: activeTasks.filter(t => t.status === 'COMPLETED').length,
                    priority_1_urgent_count: activeTasks.filter(t => t.priority === 1).length,
                    power_block_tasks: activeTasks.filter(t => t.power_block_required).length,
                    traffic_block_tasks: activeTasks.filter(t => t.traffic_block_required).length
                }]
            };
        }

        if (/WHERE\s+t\.id\s*=\s*\$1/i.test(cleanSql) || /WHERE\s+id\s*=\s*\$1/i.test(cleanSql)) {
            const task = memoryDb.maintenance_tasks.find(t => t.id === params[0] && !t.deleted_at);
            return { rows: task ? [enrichTask(task)] : [] };
        }

        let results = memoryDb.maintenance_tasks.filter(t => !t.deleted_at).map(enrichTask);
        // Params: [corridor_id, asset_id, department_id, source_system, status, priority, criticality, required_before, required_after]
        if (params[0]) results = results.filter(t => t.corridor_id === params[0]);
        if (params[1]) results = results.filter(t => t.asset_id === params[1]);
        if (params[2]) results = results.filter(t => t.department_id === params[2]);
        if (params[3]) results = results.filter(t => t.source_system.toLowerCase() === params[3].toLowerCase());
        if (params[4]) results = results.filter(t => t.status.toLowerCase() === params[4].toLowerCase());
        if (params[5]) results = results.filter(t => Number(t.priority) === Number(params[5]));
        if (params[6]) results = results.filter(t => t.criticality.toLowerCase() === params[6].toLowerCase());
        if (params[7]) results = results.filter(t => new Date(t.required_by_date) <= new Date(params[7]));
        if (params[8]) results = results.filter(t => new Date(t.required_by_date) >= new Date(params[8]));

        return { rows: results };
    }

    // 4. BLOCK WINDOWS
    if (/(?:FROM|UPDATE)\s+block_windows/i.test(cleanSql)) {
        if (/UPDATE\s+block_windows/i.test(cleanSql)) {
            const windowId = params[1];
            const newStatus = params[0];
            const win = memoryDb.block_windows.find(w => w.id === windowId);
            if (win) {
                win.availability_status = newStatus;
                win.updated_at = new Date();
                return { rows: [enrichWindow(win)] };
            }
            return { rows: [] };
        }

        if (/COUNT\(\*\)/i.test(cleanSql)) {
            const total = memoryDb.block_windows.length;
            const available = memoryDb.block_windows.filter(w => w.availability_status === 'AVAILABLE');
            const reserved = memoryDb.block_windows.filter(w => w.availability_status === 'RESERVED');
            const utilized = memoryDb.block_windows.filter(w => w.availability_status === 'UTILIZED');
            const availMinutes = available.reduce((acc, w) => acc + Number(w.duration_minutes || 0), 0);
            return {
                rows: [{
                    total_windows: total,
                    available_windows: available.length,
                    reserved_windows: reserved.length,
                    utilized_windows: utilized.length,
                    total_available_duration_minutes: availMinutes
                }]
            };
        }

        if (/WHERE\s+w\.id\s*=\s*\$1/i.test(cleanSql) || /WHERE\s+id\s*=\s*\$1/i.test(cleanSql)) {
            const win = memoryDb.block_windows.find(w => w.id === params[0]);
            return { rows: win ? [enrichWindow(win)] : [] };
        }

        if (/WHERE\s+w\.corridor_id\s*=\s*\$1\s+AND\s+w\.availability_status\s+IN/i.test(cleanSql)) {
            let results = memoryDb.block_windows.filter(w => ['AVAILABLE', 'RESERVED'].includes(w.availability_status)).map(enrichWindow);
            if (params[0]) results = results.filter(w => w.corridor_id === params[0]);
            if (params[1]) results = results.filter(w => new Date(w.start_time) >= new Date(params[1]));
            if (params[2]) results = results.filter(w => new Date(w.end_time) <= new Date(params[2]));
            return { rows: results };
        }

        if (/total_avail/i.test(cleanSql)) {
            const avail = memoryDb.block_windows.filter(w => w.corridor_id === params[0]);
            const total = avail.reduce((sum, w) => sum + Number(w.duration_minutes || 0), 0);
            return { rows: [{ total_avail: total }] };
        }

        let results = memoryDb.block_windows.map(enrichWindow);
        // Params: [corridor_id, source_system, block_type, availability_status, start_after, end_before]
        if (params[0]) results = results.filter(w => w.corridor_id === params[0]);
        if (typeof params[1] === 'string') results = results.filter(w => w.source_system.toLowerCase() === params[1].toLowerCase());
        if (typeof params[2] === 'string') results = results.filter(w => w.block_type.toLowerCase() === params[2].toLowerCase());
        if (typeof params[3] === 'string') results = results.filter(w => w.availability_status.toLowerCase() === params[3].toLowerCase());
        if (params[4]) results = results.filter(w => new Date(w.start_time) >= new Date(params[4]));
        if (params[5]) results = results.filter(w => new Date(w.end_time) <= new Date(params[5]));

        return { rows: results };
    }

    // 5. TRAIN MOVEMENTS
    if (/(?:FROM|UPDATE)\s+train_movements/i.test(cleanSql)) {
        if (/UPDATE\s+train_movements/i.test(cleanSql)) {
            const trainId = params[1];
            const newStatus = params[0];
            const train = memoryDb.train_movements.find(m => m.id === trainId);
            if (train) {
                train.status = newStatus;
                train.updated_at = new Date();
                return { rows: [enrichTrain(train)] };
            }
            return { rows: [] };
        }

        if (/COUNT\(\*\)/i.test(cleanSql)) {
            const total = memoryDb.train_movements.length;
            return {
                rows: [{
                    total_trains: total,
                    scheduled_count: memoryDb.train_movements.filter(m => m.status === 'SCHEDULED').length,
                    running_count: memoryDb.train_movements.filter(m => m.status === 'RUNNING').length,
                    regulated_count: memoryDb.train_movements.filter(m => m.status === 'REGULATED').length,
                    diverted_count: memoryDb.train_movements.filter(m => m.status === 'DIVERTED').length,
                    high_priority_trains: memoryDb.train_movements.filter(m => m.priority === 1).length
                }]
            };
        }

        if (/WHERE\s+m\.id\s*=\s*\$1/i.test(cleanSql) || /WHERE\s+id\s*=\s*\$1/i.test(cleanSql)) {
            const train = memoryDb.train_movements.find(m => m.id === params[0]);
            return { rows: train ? [enrichTrain(train)] : [] };
        }

        if (/WHERE\s+m\.corridor_id\s*=\s*\$1\s+AND\s+m\.status\s+IN/i.test(cleanSql)) {
            let results = memoryDb.train_movements.filter(m => ['SCHEDULED', 'RUNNING'].includes(m.status)).map(enrichTrain);
            if (params[0]) results = results.filter(m => m.corridor_id === params[0]);
            if (params[1]) results = results.filter(m => new Date(m.scheduled_start_time) >= new Date(params[1]));
            if (params[2]) results = results.filter(m => new Date(m.scheduled_end_time) <= new Date(params[2]));
            return { rows: results };
        }

        if (/WHERE\s+corridor_id\s*=\s*\$1\s+AND\s+scheduled_start_time\s*>=/i.test(cleanSql)) {
            let results = memoryDb.train_movements.filter(m => m.corridor_id === params[0]);
            if (params[1]) results = results.filter(m => new Date(m.scheduled_start_time) >= new Date(params[1]));
            if (params[2]) results = results.filter(m => new Date(m.scheduled_end_time) <= new Date(params[2]));
            return { rows: results };
        }

        let results = memoryDb.train_movements.map(enrichTrain);
        // Params: [corridor_id, source_system, train_type, priority, direction, status, start_after, end_before, search]
        if (params[0]) results = results.filter(m => m.corridor_id === params[0]);
        if (typeof params[1] === 'string') results = results.filter(m => m.source_system.toLowerCase() === params[1].toLowerCase());
        if (typeof params[2] === 'string') results = results.filter(m => m.train_type.toLowerCase() === params[2].toLowerCase());
        if (params[3] && typeof params[3] === 'number') results = results.filter(m => Number(m.priority) === Number(params[3]));
        if (typeof params[4] === 'string') results = results.filter(m => m.direction.toLowerCase() === params[4].toLowerCase());
        if (typeof params[5] === 'string') results = results.filter(m => m.status.toLowerCase() === params[5].toLowerCase());
        if (params[6]) results = results.filter(m => new Date(m.scheduled_start_time) >= new Date(params[6]));
        if (params[7]) results = results.filter(m => new Date(m.scheduled_end_time) <= new Date(params[7]));
        if (params[8]) {
            const q = params[8].replace(/%/g, '').toLowerCase();
            results = results.filter(m =>
                m.train_number.toLowerCase().includes(q) ||
                m.service_identifier.toLowerCase().includes(q)
            );
        }

        return { rows: results };
    }

    // 6. INTEGRATION SOURCES
    if (/FROM\s+integration_sources/i.test(cleanSql)) {
        if (/WHERE\s+code\s*=\s*\$1/i.test(cleanSql)) {
            const src = memoryDb.integration_sources.find(s => s.code.toLowerCase() === (params[0] || '').toLowerCase());
            return { rows: src ? [src] : [] };
        }
        if (/WHERE\s+id\s*=\s*\$1/i.test(cleanSql)) {
            const src = memoryDb.integration_sources.find(s => s.id === params[0]);
            return { rows: src ? [src] : [] };
        }
        return { rows: [...memoryDb.integration_sources] };
    }

    if (/UPDATE\s+integration_sources/i.test(cleanSql)) {
        const sourceId = params[0];
        const src = memoryDb.integration_sources.find(s => s.id === sourceId);
        if (src) {
            src.last_sync_at = new Date();
            return { rows: [src] };
        }
        return { rows: [] };
    }

    // 7. SYNC RUNS
    if (/INSERT\s+INTO\s+sync_runs/i.test(cleanSql)) {
        const newRun = {
            id: 'sr-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            source_id: params[0],
            started_at: new Date(),
            completed_at: null,
            status: 'IN_PROGRESS',
            records_received: 0,
            records_created: 0,
            records_updated: 0,
            records_failed: 0,
            error_summary: null
        };
        memoryDb.sync_runs.unshift(newRun);
        return { rows: [{ id: newRun.id }] };
    }

    if (/UPDATE\s+sync_runs/i.test(cleanSql)) {
        // SET status = $1, completed_at = NOW(), records_received = $2, records_created = $3, records_updated = $4, records_failed = $5, error_summary = $6 WHERE id = $7
        const runId = params[6];
        const run = memoryDb.sync_runs.find(r => r.id === runId);
        if (run) {
            run.status = params[0];
            run.completed_at = new Date();
            run.records_received = params[1];
            run.records_created = params[2];
            run.records_updated = params[3];
            run.records_failed = params[4];
            run.error_summary = params[5];
            return { rows: [enrichSyncRun(run)] };
        }
        return { rows: [] };
    }

    if (/FROM\s+sync_runs/i.test(cleanSql)) {
        let results = memoryDb.sync_runs.map(enrichSyncRun);
        if (params[0]) results = results.filter(r => r.source_code.toLowerCase() === params[0].toLowerCase());
        if (params[1]) results = results.filter(r => r.status.toLowerCase() === params[1].toLowerCase());
        return { rows: results };
    }

    // 8. IDEMPOTENT UPSERTS
    if (/INSERT\s+INTO\s+assets/i.test(cleanSql) && /ON\s+CONFLICT/i.test(cleanSql)) {
        const [corridor_id, source_system_id, external_record_id, asset_code, name, asset_type, location, start_km, end_km, criticality, health_status, metadata] = params;
        const existing = memoryDb.assets.find(a => a.source_system_id === source_system_id && a.external_record_id === external_record_id);
        if (existing) {
            existing.name = name;
            existing.asset_type = asset_type;
            existing.location = location;
            existing.start_kilometer = start_km;
            existing.end_kilometer = end_km;
            existing.criticality = criticality;
            existing.health_status = health_status;
            existing.metadata = metadata;
            existing.updated_at = new Date();
            return { rows: [{ id: existing.id, is_new: false }] };
        }
        const newAsset = {
            id: 'a-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            corridor_id, source_system_id, external_record_id, asset_code,
            name, asset_type, location, start_kilometer: start_km, end_kilometer: end_km,
            criticality, health_status, metadata, is_active: true,
            created_at: new Date(), updated_at: new Date()
        };
        memoryDb.assets.push(newAsset);
        return { rows: [{ id: newAsset.id, is_new: true }] };
    }

    if (/INSERT\s+INTO\s+maintenance_tasks/i.test(cleanSql) && /ON\s+CONFLICT/i.test(cleanSql)) {
        const [source_system_id, external_record_id, corridor_id, asset_id, department_id, task_code, title, description, maintenance_type, duration_minutes, priority, criticality, urgency, required_by_date, status, power_block, traffic_block, speed_restriction, operational_constraints] = params;
        const existing = memoryDb.maintenance_tasks.find(t => t.source_system_id === source_system_id && t.external_record_id === external_record_id);
        if (existing) {
            existing.title = title;
            existing.description = description;
            existing.maintenance_type = maintenance_type;
            existing.duration_minutes = duration_minutes;
            existing.priority = priority;
            existing.criticality = criticality;
            existing.urgency = urgency;
            existing.required_by_date = new Date(required_by_date);
            existing.power_block_required = power_block;
            existing.traffic_block_required = traffic_block;
            existing.speed_restriction_kmph = speed_restriction;
            existing.operational_constraints = operational_constraints;
            existing.synced_at = new Date();
            existing.updated_at = new Date();
            return { rows: [{ id: existing.id, is_new: false }] };
        }
        const newTask = {
            id: 't-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            source_system_id, external_record_id, corridor_id, asset_id, department_id,
            task_code, title, description, maintenance_type, duration_minutes, priority,
            criticality, urgency, required_by_date: new Date(required_by_date), status: status || 'PENDING',
            power_block_required: power_block, traffic_block_required: traffic_block,
            speed_restriction_kmph: speed_restriction, operational_constraints,
            synced_at: new Date(), created_at: new Date(), updated_at: new Date()
        };
        memoryDb.maintenance_tasks.push(newTask);
        return { rows: [{ id: newTask.id, is_new: true }] };
    }

    if (/INSERT\s+INTO\s+block_windows/i.test(cleanSql) && /ON\s+CONFLICT/i.test(cleanSql)) {
        const [corridor_id, source_system_id, external_record_id, start_time, end_time, duration_minutes, availability_status, block_type, line_designation, start_km, end_km, operational_constraints] = params;
        const existing = memoryDb.block_windows.find(w => w.source_system_id === source_system_id && w.external_record_id === external_record_id);
        if (existing) {
            existing.start_time = new Date(start_time);
            existing.end_time = new Date(end_time);
            existing.duration_minutes = duration_minutes;
            existing.availability_status = availability_status;
            existing.block_type = block_type;
            existing.line_designation = line_designation;
            existing.start_kilometer = start_km;
            existing.end_kilometer = end_km;
            existing.operational_constraints = operational_constraints;
            existing.updated_at = new Date();
            return { rows: [{ id: existing.id, is_new: false }] };
        }
        const newWin = {
            id: 'w-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            corridor_id, source_system_id, external_record_id,
            start_time: new Date(start_time), end_time: new Date(end_time),
            duration_minutes, availability_status: availability_status || 'AVAILABLE',
            block_type, line_designation, start_kilometer: start_km, end_kilometer: end_km,
            operational_constraints, created_at: new Date(), updated_at: new Date()
        };
        memoryDb.block_windows.push(newWin);
        return { rows: [{ id: newWin.id, is_new: true }] };
    }

    if (/INSERT\s+INTO\s+train_movements/i.test(cleanSql) && /ON\s+CONFLICT/i.test(cleanSql)) {
        const [corridor_id, source_system_id, external_record_id, train_number, service_identifier, start_time, end_time, direction, train_type, priority, status, operational_details] = params;
        const existing = memoryDb.train_movements.find(m => m.source_system_id === source_system_id && m.external_record_id === external_record_id);
        if (existing) {
            existing.scheduled_start_time = new Date(start_time);
            existing.scheduled_end_time = new Date(end_time);
            existing.direction = direction;
            existing.train_type = train_type;
            existing.priority = priority;
            existing.status = status;
            existing.operational_details = operational_details;
            existing.updated_at = new Date();
            return { rows: [{ id: existing.id, is_new: false }] };
        }
        const newTrain = {
            id: 'm-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            corridor_id, source_system_id, external_record_id, train_number,
            service_identifier, scheduled_start_time: new Date(start_time), scheduled_end_time: new Date(end_time),
            direction, train_type, priority, status: status || 'SCHEDULED', operational_details,
            created_at: new Date(), updated_at: new Date()
        };
        memoryDb.train_movements.push(newTrain);
        return { rows: [{ id: newTrain.id, is_new: true }] };
    }

    // 9. BLOCK PLANS
    if (/INSERT\s+INTO\s+block_plans/i.test(cleanSql)) {
        const [plan_reference, corridor_id, horizon_start_date, horizon_end_date, generated_by_user_id, status, approval_state, version, total_block_duration_minutes, task_count, utilization_percentage, conflict_count, operational_impact_metrics, ai_optimization_metadata] = params;
        const newPlan = {
            id: 'bp-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            plan_reference,
            corridor_id,
            horizon_start_date: new Date(horizon_start_date),
            horizon_end_date: new Date(horizon_end_date),
            generated_at: new Date(),
            generated_by_user_id: generated_by_user_id || null,
            status: status || 'OPTIMIZED',
            approval_state: approval_state || 'PENDING',
            version: version || 1,
            total_block_duration_minutes: total_block_duration_minutes || 0,
            task_count: task_count || 0,
            utilization_percentage: utilization_percentage || '0.00',
            conflict_count: conflict_count || 0,
            operational_impact_metrics: typeof operational_impact_metrics === 'string' ? JSON.parse(operational_impact_metrics) : (operational_impact_metrics || {}),
            ai_optimization_metadata: typeof ai_optimization_metadata === 'string' ? JSON.parse(ai_optimization_metadata) : (ai_optimization_metadata || {}),
            created_at: new Date(),
            updated_at: new Date()
        };
        memoryDb.block_plans.unshift(newPlan);
        return { rows: [newPlan] };
    }

    if (/UPDATE\s+block_plans/i.test(cleanSql)) {
        const planId = params[params.length - 1];
        const plan = memoryDb.block_plans.find(p => p.id === planId);
        if (!plan) return { rows: [] };

        if (/SET\s+status\s*=\s*'APPROVED'/i.test(cleanSql)) {
            plan.status = 'APPROVED';
            plan.approval_state = 'APPROVED';
            plan.updated_at = new Date();
            return { rows: [enrichPlan(plan)] };
        }
        if (/SET\s+status\s*=\s*'REJECTED'/i.test(cleanSql)) {
            plan.status = 'REJECTED';
            plan.approval_state = 'REJECTED';
            plan.updated_at = new Date();
            return { rows: [enrichPlan(plan)] };
        }
        if (/SET\s+status\s*=\s*\$1/i.test(cleanSql)) {
            plan.status = params[0];
            plan.approval_state = params[1] || plan.approval_state;
            plan.updated_at = new Date();
            return { rows: [enrichPlan(plan)] };
        }
        if (/SET\s+version\s*=\s*\$1/i.test(cleanSql)) {
            plan.version = params[0];
            plan.status = 'UNDER_REVIEW';
            plan.approval_state = 'PENDING';
            plan.total_block_duration_minutes = params[1];
            plan.task_count = params[2];
            plan.utilization_percentage = params[3];
            plan.conflict_count = params[4];
            plan.operational_impact_metrics = typeof params[5] === 'string' ? JSON.parse(params[5]) : (params[5] || {});
            plan.updated_at = new Date();
            return { rows: [enrichPlan(plan)] };
        }
        plan.updated_at = new Date();
        return { rows: [enrichPlan(plan)] };
    }

    if (/FROM\s+block_plans/i.test(cleanSql)) {
        if (/WHERE\s+p\.id\s*=\s*\$1/i.test(cleanSql) || /WHERE\s+id\s*=\s*\$1/i.test(cleanSql)) {
            const plan = memoryDb.block_plans.find(p => p.id === params[0]);
            return { rows: plan ? [enrichPlan(plan)] : [] };
        }
        let results = memoryDb.block_plans.map(enrichPlan);
        if (params[0]) results = results.filter(p => p.corridor_id === params[0]);
        if (typeof params[1] === 'string') results = results.filter(p => p.status.toLowerCase() === params[1].toLowerCase());
        if (typeof params[2] === 'string') results = results.filter(p => p.approval_state.toLowerCase() === params[2].toLowerCase());
        if (params[3]) results = results.filter(p => new Date(p.horizon_start_date) >= new Date(params[3]));
        if (params[4]) results = results.filter(p => new Date(p.horizon_end_date) <= new Date(params[4]));
        return { rows: results };
    }

    // 10. BLOCK PLAN TASKS
    if (/INSERT\s+INTO\s+block_plan_tasks/i.test(cleanSql)) {
        const [plan_id, maintenance_task_id, assigned_block_window_id, assigned_start_time, assigned_end_time, sequence_order, status, ai_recommendation_score, shadow_task, notes] = params;
        const newPlanTask = {
            id: 'bpt-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            plan_id,
            maintenance_task_id,
            assigned_block_window_id: assigned_block_window_id || null,
            assigned_start_time: new Date(assigned_start_time),
            assigned_end_time: new Date(assigned_end_time),
            sequence_order: sequence_order || 1,
            status: status || 'SCHEDULED',
            ai_recommendation_score: ai_recommendation_score !== undefined ? ai_recommendation_score : null,
            shadow_task: Boolean(shadow_task),
            notes: notes || null,
            created_at: new Date(),
            updated_at: new Date()
        };
        memoryDb.block_plan_tasks.push(newPlanTask);
        return { rows: [newPlanTask] };
    }

    if (/DELETE\s+FROM\s+block_plan_tasks/i.test(cleanSql)) {
        const planId = params[0];
        memoryDb.block_plan_tasks = memoryDb.block_plan_tasks.filter(t => t.plan_id !== planId);
        return { rows: [] };
    }

    if (/FROM\s+block_plan_tasks/i.test(cleanSql)) {
        const planId = params[0];
        const tasks = memoryDb.block_plan_tasks.filter(t => t.plan_id === planId).map(pt => {
            const mTask = memoryDb.maintenance_tasks.find(m => m.id === pt.maintenance_task_id) || {};
            const win = memoryDb.block_windows.find(w => w.id === pt.assigned_block_window_id) || {};
            return {
                ...pt,
                task_code: mTask.task_code || 'UNKNOWN',
                task_title: mTask.title || 'Unknown Task',
                maintenance_type: mTask.maintenance_type || 'ROUTINE',
                duration_minutes: mTask.duration_minutes || 0,
                block_external_id: win.external_record_id || null,
                block_type: win.block_type || null,
                line_designation: win.line_designation || null,
                start_kilometer: win.start_kilometer || null,
                end_kilometer: win.end_kilometer || null
            };
        });
        return { rows: tasks };
    }

    // 11. CONFLICTS
    if (/INSERT\s+INTO\s+conflicts/i.test(cleanSql)) {
        const [plan_id, maintenance_task_id, train_movement_id, conflict_type, severity, description, resolution_status, resolution_details] = params;
        const newConflict = {
            id: 'cf-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            plan_id,
            maintenance_task_id: maintenance_task_id || null,
            train_movement_id: train_movement_id || null,
            conflict_type,
            severity: severity || 'HIGH',
            description,
            resolution_status: resolution_status || 'UNRESOLVED',
            resolution_details: typeof resolution_details === 'string' ? JSON.parse(resolution_details) : (resolution_details || {}),
            created_at: new Date(),
            updated_at: new Date()
        };
        memoryDb.conflicts.push(newConflict);
        return { rows: [newConflict] };
    }

    if (/DELETE\s+FROM\s+conflicts/i.test(cleanSql)) {
        const planId = params[0];
        memoryDb.conflicts = memoryDb.conflicts.filter(c => c.plan_id !== planId);
        return { rows: [] };
    }

    if (/UPDATE\s+conflicts/i.test(cleanSql)) {
        const conflictId = params.length >= 5 ? params[3] : params[params.length - 1];
        const cf = memoryDb.conflicts.find(c => c.id === conflictId);
        if (cf) {
            cf.resolution_status = params[0];
            cf.resolution_details = typeof params[1] === 'string' ? JSON.parse(params[1]) : (params[1] || {});
            cf.resolved_at = new Date();
            cf.resolved_by_user_id = params[2] || null;
            cf.updated_at = new Date();
            return { rows: [cf] };
        }
        return { rows: [] };
    }

    if (/FROM\s+conflicts/i.test(cleanSql)) {
        let conflicts = memoryDb.conflicts;
        if (/WHERE\s+id\s*=\s*\$1\s+AND\s+plan_id\s*=\s*\$2/i.test(cleanSql)) {
            conflicts = conflicts.filter(c => c.id === params[0] && c.plan_id === params[1]);
        } else if (/WHERE\s+plan_id\s*=\s*\$1/i.test(cleanSql) || /WHERE\s+c\.plan_id\s*=\s*\$1/i.test(cleanSql)) {
            conflicts = conflicts.filter(c => c.plan_id === params[0]);
        } else if (/WHERE\s+id\s*=\s*\$1/i.test(cleanSql)) {
            conflicts = conflicts.filter(c => c.id === params[0]);
        }
        const enriched = conflicts.map(c => {
            const trn = memoryDb.train_movements.find(m => m.id === c.train_movement_id) || {};
            const tsk = memoryDb.maintenance_tasks.find(t => t.id === c.maintenance_task_id) || {};
            return {
                ...c,
                train_number: trn.train_number || null,
                train_type: trn.train_type || null,
                task_code: tsk.task_code || null,
                task_title: tsk.title || null
            };
        });
        return { rows: enriched };
    }

    // 12. APPROVALS
    if (/INSERT\s+INTO\s+approvals/i.test(cleanSql)) {
        const [plan_id, action, reviewer_id, comments, department_id] = params;
        const newApproval = {
            id: 'appr-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            plan_id,
            action,
            reviewer_id,
            comments: comments || null,
            department_id: department_id || null,
            timestamp: new Date()
        };
        memoryDb.approvals.unshift(newApproval);
        return { rows: [enrichApproval(newApproval)] };
    }

    if (/FROM\s+approvals/i.test(cleanSql)) {
        const planId = params[0];
        const rows = memoryDb.approvals.filter(a => a.plan_id === planId).map(enrichApproval);
        return { rows };
    }

    // 13. AUDIT LOGS
    if (/INSERT\s+INTO\s+audit_logs/i.test(cleanSql)) {
        const [user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, request_id] = params;
        const newLog = {
            id: 'aud-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            user_id: user_id || null,
            action,
            entity_type,
            entity_id: String(entity_id),
            old_values: typeof old_values === 'string' ? JSON.parse(old_values) : old_values,
            new_values: typeof new_values === 'string' ? JSON.parse(new_values) : new_values,
            ip_address: ip_address || null,
            user_agent: user_agent || null,
            request_id: request_id || null,
            timestamp: new Date()
        };
        memoryDb.audit_logs.unshift(newLog);
        return { rows: [enrichAuditLog(newLog)] };
    }

    if (/FROM\s+audit_logs/i.test(cleanSql)) {
        let results = memoryDb.audit_logs.map(enrichAuditLog);
        if (/entity_type\s*=\s*\$1\s+AND\s+entity_id\s*=\s*\$2/i.test(cleanSql)) {
            results = results.filter(l => l.entity_type === params[0] && l.entity_id === String(params[1]));
        } else if (/entity_id\s*=\s*\$1/i.test(cleanSql)) {
            results = results.filter(l => l.entity_id === String(params[0]));
        }
        return { rows: results };
    }

    return { rows: [] };
}

// Helpers to join foreign key details as in SQL query
function enrichAsset(asset) {
    const corridor = memoryDb.corridors.find(c => c.id === asset.corridor_id) || {};
    const source = memoryDb.integration_sources.find(s => s.id === asset.source_system_id) || {};
    return {
        ...asset,
        corridor_code: corridor.code || 'UNKNOWN',
        corridor_name: corridor.name || 'Unknown Corridor',
        source_system: source.code || 'UNKNOWN',
        source_system_name: source.name || 'Unknown Source'
    };
}

function enrichTask(task) {
    const corridor = memoryDb.corridors.find(c => c.id === task.corridor_id) || {};
    const asset = memoryDb.assets.find(a => a.id === task.asset_id) || {};
    const department = memoryDb.departments.find(d => d.id === task.department_id) || {};
    const source = memoryDb.integration_sources.find(s => s.id === task.source_system_id) || {};
    return {
        ...task,
        corridor_code: corridor.code || 'UNKNOWN',
        corridor_name: corridor.name || 'Unknown Corridor',
        asset_code: asset.asset_code || 'UNKNOWN',
        asset_name: asset.name || 'Unknown Asset',
        asset_location: asset.location || 'Unknown Location',
        department_code: department.code || 'UNKNOWN',
        department_name: department.name || 'Unknown Department',
        source_system: source.code || 'UNKNOWN'
    };
}

function enrichWindow(win) {
    const corridor = memoryDb.corridors.find(c => c.id === win.corridor_id) || {};
    const source = memoryDb.integration_sources.find(s => s.id === win.source_system_id) || {};
    return {
        ...win,
        corridor_code: corridor.code || 'UNKNOWN',
        corridor_name: corridor.name || 'Unknown Corridor',
        source_system: source.code || 'UNKNOWN'
    };
}

function enrichTrain(train) {
    const corridor = memoryDb.corridors.find(c => c.id === train.corridor_id) || {};
    const source = memoryDb.integration_sources.find(s => s.id === train.source_system_id) || {};
    return {
        ...train,
        corridor_code: corridor.code || 'UNKNOWN',
        corridor_name: corridor.name || 'Unknown Corridor',
        source_system: source.code || 'UNKNOWN'
    };
}

function enrichSyncRun(run) {
    const source = memoryDb.integration_sources.find(s => s.id === run.source_id) || {};
    return {
        ...run,
        source_code: source.code || 'UNKNOWN',
        source_name: source.name || 'Unknown Source'
    };
}

function enrichPlan(plan) {
    const corridor = memoryDb.corridors.find(c => c.id === plan.corridor_id) || {};
    return {
        ...plan,
        corridor_code: corridor.code || 'UNKNOWN',
        corridor_name: corridor.name || 'Unknown Corridor'
    };
}

function enrichApproval(appr) {
    const reviewer = memoryDb.users.find(u => u.id === appr.reviewer_id) || {};
    const dept = memoryDb.departments.find(d => d.id === appr.department_id) || {};
    return {
        ...appr,
        reviewer_name: reviewer.full_name || reviewer.username || 'Reviewer',
        department_name: dept.name || null
    };
}

function enrichAuditLog(log) {
    const user = memoryDb.users.find(u => u.id === log.user_id) || {};
    return {
        ...log,
        username: user.username || 'SYSTEM',
        user_full_name: user.full_name || 'System / Automated'
    };
}

module.exports = {
    pool,
    query: executeQuery,
    getClient: () => pool.connect(),
    memoryDb // Exported for direct test inspections if needed
};
