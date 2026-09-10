-- ============================================================================
-- Migration: 002_seed_static_reference_data.sql
-- Description: Static reference data ONLY (Roles, Permissions, Departments, Integration Sources)
-- Constraint: Zero fake operational data (NO fake maintenance/trains/blocks/plans)
-- ============================================================================

-- ============================================================================
-- 1. INTEGRATION SOURCES (TMS, SMMS, TDMS, COA, BDMS)
-- ============================================================================

INSERT INTO integration_sources (code, name, description, system_type, sync_interval_minutes, is_active)
VALUES
    ('TMS', 'Track Management System', 'Indian Railways Track & Permanent Way maintenance requirements database', 'MAINTENANCE_TRACK', 15, TRUE),
    ('SMMS', 'Signal Maintenance Management System', 'Signal, point machine, and interlocking maintenance system', 'MAINTENANCE_SNT', 15, TRUE),
    ('TDMS', 'Traction Distribution Management System', 'OHE, substation, and power supply maintenance management', 'MAINTENANCE_TRD', 15, TRUE),
    ('COA', 'Control Office Application', 'Real-time train scheduling, active train movements, and path availability', 'OPERATIONS_COA', 5, TRUE),
    ('BDMS', 'Breakdown Management System', 'Breakdown crane, accident relief, and rolling stock maintenance block windows', 'OPERATIONS_BDMS', 30, TRUE)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_type = EXCLUDED.system_type,
    sync_interval_minutes = EXCLUDED.sync_interval_minutes,
    updated_at = NOW();

-- ============================================================================
-- 2. RAILWAY DEPARTMENTS
-- ============================================================================

INSERT INTO departments (code, name, description, is_active)
VALUES
    ('ENGG', 'Civil Engineering', 'Permanent Way, Track, Bridges, and Structural maintenance', TRUE),
    ('SNT', 'Signal and Telecommunication', 'Signaling systems, points, track circuits, and communications', TRUE),
    ('TRD', 'Traction Distribution', 'Overhead Equipment (OHE), power distribution, and substations', TRUE),
    ('OPTG', 'Operating', 'Train dispatching, section control, and traffic management', TRUE),
    ('MECH', 'Mechanical', 'Coaching, freight stock, and breakdown crane management', TRUE),
    ('COMM', 'Commercial', 'Passenger amenities and commercial operations coordination', TRUE)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = NOW();

-- ============================================================================
-- 3. SYSTEM ROLES
-- ============================================================================

INSERT INTO roles (code, name, description, is_active)
VALUES
    ('ADMIN', 'Admin', 'Full administrative access to the Block Planning System configuration', TRUE),
    ('PLANNER', 'Planner', 'Maintenance and automatic block planning officer', TRUE),
    ('OPERATIONS', 'Operations', 'Traffic operations, section controller, and train dispatcher', TRUE),
    ('CHIEF_CONTROLLER', 'Chief Controller Operating', 'Sr. DOM / Chief Controller with final plan approval and override authority', TRUE),
    ('SECTION_CONTROLLER', 'Section Controller', 'Responsible for active section corridor blocks and train dispatching', TRUE),
    ('DEPARTMENT_COORDINATOR', 'Department Coordinator', 'Departmental officer (Engg, S&T, TRD) reviewing and proposing maintenance tasks', TRUE),
    ('AI_OPTIMIZER', 'AI Optimization Engine', 'Service identity for the automated scheduling and conflict resolution agent', TRUE),
    ('VIEWER', 'Auditor / Read-only Viewer', 'Read-only access for division/zonal inspection and reporting', TRUE)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = NOW();

-- ============================================================================
-- 4. SYSTEM PERMISSIONS
-- ============================================================================

INSERT INTO permissions (code, name, category, description)
VALUES
    -- Corridor Permissions
    ('corridors:read', 'View Corridors', 'CORRIDORS', 'View railway corridors and section parameters'),
    ('corridors:manage', 'Manage Corridors', 'CORRIDORS', 'Create and modify corridor infrastructure configurations'),

    -- Asset Permissions
    ('assets:read', 'View Assets', 'ASSETS', 'View track, signal, and OHE assets'),
    ('assets:manage', 'Manage Assets', 'ASSETS', 'Update asset registry and health statuses'),

    -- Maintenance Task Permissions
    ('tasks:read', 'View Maintenance Tasks', 'MAINTENANCE', 'View imported maintenance requirements'),
    ('tasks:manage', 'Manage Maintenance Tasks', 'MAINTENANCE', 'Prioritize, tag, or adjust maintenance task attributes'),

    -- Block Window Permissions
    ('windows:read', 'View Block Windows', 'WINDOWS', 'View traffic and power block availability windows'),
    ('windows:manage', 'Manage Block Windows', 'WINDOWS', 'Declare or modify available block windows'),

    -- Train Movement Permissions
    ('trains:read', 'View Train Movements', 'TRAINS', 'View scheduled and real-time train movement paths'),
    ('trains:manage', 'Manage Train Movements', 'TRAINS', 'Adjust train schedule paths and priorities'),

    -- Block Plan Permissions
    ('plans:read', 'View Block Plans', 'PLANS', 'View generated and draft block schedules'),
    ('plans:generate', 'Generate Block Plans', 'PLANS', 'Trigger AI-powered optimization runs to generate block plans'),
    ('plans:modify', 'Modify Block Plans', 'PLANS', 'Manually adjust task assignments within a block plan'),
    ('plans:approve', 'Approve Block Plans', 'PLANS', 'Officially approve, sign off, or reject block plans'),

    -- Conflict Resolution Permissions
    ('conflicts:read', 'View Conflicts', 'CONFLICTS', 'Inspect detected train-block and resource conflicts'),
    ('conflicts:resolve', 'Resolve Conflicts', 'CONFLICTS', 'Authorize conflict overrides or resolutions'),

    -- Integration & Sync Permissions
    ('sync:read', 'View Sync Status', 'INTEGRATION', 'View integration runs with TMS, SMMS, TDMS, COA, BDMS'),
    ('sync:trigger', 'Trigger Sync Run', 'INTEGRATION', 'Initiate manual sync pull from upstream railway systems'),

    -- Audit & Security Permissions
    ('audit:read', 'View Audit Logs', 'AUDIT', 'Inspect append-only system audit trails'),
    ('users:manage', 'Manage Users & Roles', 'USERS', 'Manage user accounts, credentials, and role assignments')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

-- ============================================================================
-- 5. ROLE-PERMISSION MAPPINGS
-- ============================================================================

-- Helper: Map permissions to roles
DO $$
DECLARE
    r_admin UUID;
    r_planner UUID;
    r_ops UUID;
    r_chief UUID;
    r_sec UUID;
    r_dept UUID;
    r_ai UUID;
    r_viewer UUID;
BEGIN
    SELECT id INTO r_admin FROM roles WHERE code = 'ADMIN';
    SELECT id INTO r_planner FROM roles WHERE code = 'PLANNER';
    SELECT id INTO r_ops FROM roles WHERE code = 'OPERATIONS';
    SELECT id INTO r_chief FROM roles WHERE code = 'CHIEF_CONTROLLER';
    SELECT id INTO r_sec FROM roles WHERE code = 'SECTION_CONTROLLER';
    SELECT id INTO r_dept FROM roles WHERE code = 'DEPARTMENT_COORDINATOR';
    SELECT id INTO r_ai FROM roles WHERE code = 'AI_OPTIMIZER';
    SELECT id INTO r_viewer FROM roles WHERE code = 'VIEWER';

    -- ADMIN: ALL permissions
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_admin, id FROM permissions
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- PLANNER: Maintenance tasks, planning, generation, review
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_planner, id FROM permissions WHERE code IN (
        'corridors:read', 'assets:read', 'tasks:read', 'tasks:manage',
        'windows:read', 'trains:read',
        'plans:read', 'plans:generate', 'plans:modify',
        'conflicts:read', 'sync:read'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- OPERATIONS: Operational oversight, windows, trains, conflicts, approvals
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_ops, id FROM permissions WHERE code IN (
        'corridors:read', 'assets:read', 'tasks:read',
        'windows:read', 'windows:manage', 'trains:read', 'trains:manage',
        'plans:read', 'plans:approve',
        'conflicts:read', 'conflicts:resolve',
        'sync:read', 'audit:read'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- CHIEF_CONTROLLER: Operational authority & approval
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_chief, id FROM permissions WHERE code IN (
        'corridors:read', 'assets:read', 'tasks:read', 'tasks:manage',
        'windows:read', 'windows:manage', 'trains:read',
        'plans:read', 'plans:generate', 'plans:modify', 'plans:approve',
        'conflicts:read', 'conflicts:resolve',
        'sync:read', 'sync:trigger', 'audit:read'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- SECTION_CONTROLLER: Section monitoring, adjustments, window management
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_sec, id FROM permissions WHERE code IN (
        'corridors:read', 'assets:read', 'tasks:read',
        'windows:read', 'windows:manage', 'trains:read',
        'plans:read', 'plans:modify',
        'conflicts:read', 'conflicts:resolve',
        'sync:read', 'audit:read'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- DEPARTMENT_COORDINATOR: Department tasks and plan review
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_dept, id FROM permissions WHERE code IN (
        'corridors:read', 'assets:read', 'tasks:read', 'tasks:manage',
        'windows:read', 'trains:read', 'plans:read', 'conflicts:read', 'sync:read'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- AI_OPTIMIZER: Read data, generate plans, flag conflicts
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_ai, id FROM permissions WHERE code IN (
        'corridors:read', 'assets:read', 'tasks:read', 'windows:read',
        'trains:read', 'plans:read', 'plans:generate', 'conflicts:read'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- VIEWER: Read-only access
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_viewer, id FROM permissions WHERE code LIKE '%:read'
    ON CONFLICT (role_id, permission_id) DO NOTHING;
END $$;
