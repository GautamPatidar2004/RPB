-- ============================================================================
-- Migration: 001_create_railway_block_planning_schema.sql
-- Description: Core Schema for Indian Railways AI-Powered Automatic Block Planning
-- Architecture: Integration + Coordination + Optimization Layer
-- ============================================================================

-- Ensure pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. AUTHENTICATION & ORGANIZATIONAL ENTITIES
-- ============================================================================

-- Roles
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permissions
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Role Permissions Mapping
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

-- Departments (e.g., Engineering/Track, S&T, TRD/Electrical, Operating, Mechanical)
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users (Railway controllers, department coordinators, system operators)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    employee_id VARCHAR(50) NOT NULL UNIQUE,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    designation VARCHAR(100),
    phone VARCHAR(25),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. INTEGRATION SOURCES & SYNC TRACKING (TMS, SMMS, TDMS, COA, BDMS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS integration_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) NOT NULL UNIQUE CHECK (code IN ('TMS', 'SMMS', 'TDMS', 'COA', 'BDMS')),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    system_type VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    api_endpoint VARCHAR(255),
    sync_interval_minutes INT DEFAULT 15 CHECK (sync_interval_minutes > 0),
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES integration_sources(id) ON DELETE RESTRICT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'PARTIAL_SUCCESS')),
    records_received INT NOT NULL DEFAULT 0 CHECK (records_received >= 0),
    records_created INT NOT NULL DEFAULT 0 CHECK (records_created >= 0),
    records_updated INT NOT NULL DEFAULT 0 CHECK (records_updated >= 0),
    records_failed INT NOT NULL DEFAULT 0 CHECK (records_failed >= 0),
    error_summary TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT chk_sync_run_times CHECK (completed_at IS NULL OR completed_at >= started_at)
);

-- ============================================================================
-- 3. SPATIAL & INFRASTRUCTURE ENTITIES (Corridors & Assets)
-- ============================================================================

-- Corridors / Railway Sections
CREATE TABLE IF NOT EXISTS corridors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    zone VARCHAR(20) NOT NULL,
    division VARCHAR(50) NOT NULL,
    start_station VARCHAR(20) NOT NULL,
    end_station VARCHAR(20) NOT NULL,
    start_kilometer NUMERIC(8, 3) NOT NULL CHECK (start_kilometer >= 0),
    end_kilometer NUMERIC(8, 3) NOT NULL CHECK (end_kilometer > start_kilometer),
    total_length_km NUMERIC(8, 3) GENERATED ALWAYS AS (end_kilometer - start_kilometer) STORED,
    line_type VARCHAR(30) NOT NULL DEFAULT 'DOUBLE_LINE' CHECK (line_type IN ('SINGLE_LINE', 'DOUBLE_LINE', 'TRIPLE_LINE', 'QUADRUPLE_LINE')),
    electrified BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Assets (Track sections, point machines, signals, OHE spans, bridges, interlocking)
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_code VARCHAR(100) NOT NULL,
    asset_type VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    corridor_id UUID NOT NULL REFERENCES corridors(id) ON DELETE RESTRICT,
    location VARCHAR(150) NOT NULL,
    start_kilometer NUMERIC(8, 3) CHECK (start_kilometer IS NULL OR start_kilometer >= 0),
    end_kilometer NUMERIC(8, 3) CHECK (end_kilometer IS NULL OR end_kilometer >= start_kilometer),
    criticality VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (criticality IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    health_status VARCHAR(30) NOT NULL DEFAULT 'OPERATIONAL' CHECK (health_status IN ('OPERATIONAL', 'DEGRADED', 'MAINTENANCE_REQUIRED', 'UNDER_MAINTENANCE', 'FAILED', 'DECOMMISSIONED')),
    source_system_id UUID NOT NULL REFERENCES integration_sources(id) ON DELETE RESTRICT,
    external_record_id VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_asset_source_external UNIQUE (source_system_id, external_record_id),
    CONSTRAINT uq_corridor_asset_code UNIQUE (corridor_id, asset_code)
);

-- ============================================================================
-- 4. MAINTENANCE TASKS & DEPENDENCIES (from TMS, SMMS, TDMS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS maintenance_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system_id UUID NOT NULL REFERENCES integration_sources(id) ON DELETE RESTRICT,
    external_record_id VARCHAR(100) NOT NULL,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
    corridor_id UUID NOT NULL REFERENCES corridors(id) ON DELETE RESTRICT,
    task_code VARCHAR(100),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    maintenance_type VARCHAR(50) NOT NULL,
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
    priority INT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    criticality VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (criticality IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    urgency VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (urgency IN ('IMMEDIATE', 'HIGH', 'MEDIUM', 'LOW')),
    required_by_date TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DEFERRED')),
    power_block_required BOOLEAN NOT NULL DEFAULT FALSE,
    traffic_block_required BOOLEAN NOT NULL DEFAULT TRUE,
    speed_restriction_kmph INT CHECK (speed_restriction_kmph IS NULL OR speed_restriction_kmph >= 0),
    operational_constraints JSONB DEFAULT '{}'::jsonb,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_maintenance_task_source_external UNIQUE (source_system_id, external_record_id)
);

CREATE TABLE IF NOT EXISTS maintenance_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES maintenance_tasks(id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES maintenance_tasks(id) ON DELETE RESTRICT,
    dependency_type VARCHAR(30) NOT NULL DEFAULT 'FINISH_TO_START' CHECK (dependency_type IN ('FINISH_TO_START', 'START_TO_START', 'CO_OCCURRING', 'MUTUALLY_EXCLUSIVE')),
    lag_minutes INT NOT NULL DEFAULT 0 CHECK (lag_minutes >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_no_self_dependency CHECK (task_id <> depends_on_task_id),
    CONSTRAINT uq_task_dependency UNIQUE (task_id, depends_on_task_id)
);

-- ============================================================================
-- 5. OPERATIONAL WINDOWS & TRAIN MOVEMENTS (from COA, BDMS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS block_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    corridor_id UUID NOT NULL REFERENCES corridors(id) ON DELETE RESTRICT,
    source_system_id UUID NOT NULL REFERENCES integration_sources(id) ON DELETE RESTRICT,
    external_record_id VARCHAR(100) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
    availability_status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE' CHECK (availability_status IN ('AVAILABLE', 'RESERVED', 'CONFIRMED', 'UTILIZED', 'CANCELLED', 'RESCHEDULED')),
    block_type VARCHAR(50) NOT NULL CHECK (block_type IN ('TRAFFIC_BLOCK', 'POWER_BLOCK', 'INTEGRATED_BLOCK', 'SHADOW_BLOCK', 'EMERGENCY_BLOCK')),
    line_designation VARCHAR(50),
    start_kilometer NUMERIC(8, 3) CHECK (start_kilometer IS NULL OR start_kilometer >= 0),
    end_kilometer NUMERIC(8, 3) CHECK (end_kilometer IS NULL OR end_kilometer >= start_kilometer),
    operational_constraints JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_block_window_time_order CHECK (end_time > start_time),
    CONSTRAINT uq_block_window_source_external UNIQUE (source_system_id, external_record_id)
);

CREATE TABLE IF NOT EXISTS train_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    train_number VARCHAR(20) NOT NULL,
    service_identifier VARCHAR(100) NOT NULL,
    corridor_id UUID NOT NULL REFERENCES corridors(id) ON DELETE RESTRICT,
    scheduled_start_time TIMESTAMPTZ NOT NULL,
    scheduled_end_time TIMESTAMPTZ NOT NULL,
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('UP', 'DOWN', 'BIDIRECTIONAL')),
    train_type VARCHAR(50) NOT NULL CHECK (train_type IN ('VANDE_BHARAT', 'RAJDHANI', 'SHATABDI', 'SUPERFAST', 'MAIL_EXPRESS', 'PASSENGER', 'FREIGHT', 'PARCEL', 'SPECIAL')),
    priority INT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'RUNNING', 'DIVERTED', 'REGULATED', 'CANCELLED', 'TERMINATED')),
    source_system_id UUID NOT NULL REFERENCES integration_sources(id) ON DELETE RESTRICT,
    external_record_id VARCHAR(100) NOT NULL,
    operational_details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_train_movement_time_order CHECK (scheduled_end_time > scheduled_start_time),
    CONSTRAINT uq_train_source_external UNIQUE (source_system_id, external_record_id)
);

-- ============================================================================
-- 6. AI OPTIMIZATION & BLOCK PLANNING ENGINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS block_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_reference VARCHAR(100) NOT NULL UNIQUE,
    corridor_id UUID NOT NULL REFERENCES corridors(id) ON DELETE RESTRICT,
    horizon_start_date TIMESTAMPTZ NOT NULL,
    horizon_end_date TIMESTAMPTZ NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPTIMIZING', 'OPTIMIZED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED')),
    approval_state VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (approval_state IN ('NOT_SUBMITTED', 'PENDING', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED')),
    version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
    total_block_duration_minutes INT NOT NULL DEFAULT 0 CHECK (total_block_duration_minutes >= 0),
    task_count INT NOT NULL DEFAULT 0 CHECK (task_count >= 0),
    utilization_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (utilization_percentage BETWEEN 0.00 AND 100.00),
    conflict_count INT NOT NULL DEFAULT 0 CHECK (conflict_count >= 0),
    operational_impact_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    ai_optimization_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_block_plan_horizon_order CHECK (horizon_end_date > horizon_start_date)
);

CREATE TABLE IF NOT EXISTS block_plan_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES block_plans(id) ON DELETE CASCADE,
    maintenance_task_id UUID NOT NULL REFERENCES maintenance_tasks(id) ON DELETE RESTRICT,
    assigned_block_window_id UUID REFERENCES block_windows(id) ON DELETE SET NULL,
    assigned_start_time TIMESTAMPTZ NOT NULL,
    assigned_end_time TIMESTAMPTZ NOT NULL,
    sequence_order INT NOT NULL DEFAULT 1 CHECK (sequence_order > 0),
    status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED')),
    ai_recommendation_score NUMERIC(5, 4) CHECK (ai_recommendation_score IS NULL OR (ai_recommendation_score BETWEEN 0.0000 AND 1.0000)),
    shadow_task BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_plan_task_time_order CHECK (assigned_end_time > assigned_start_time),
    CONSTRAINT uq_plan_task UNIQUE (plan_id, maintenance_task_id)
);

CREATE TABLE IF NOT EXISTS conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES block_plans(id) ON DELETE CASCADE,
    maintenance_task_id UUID REFERENCES maintenance_tasks(id) ON DELETE SET NULL,
    train_movement_id UUID REFERENCES train_movements(id) ON DELETE SET NULL,
    conflict_type VARCHAR(50) NOT NULL CHECK (conflict_type IN ('TRAIN_PATH_OVERLAP', 'CROSS_TRAFFIC_INTERFERENCE', 'CONCURRENT_BLOCK_RESTRICTION', 'RESOURCE_CONTENTION', 'DEPENDENCY_VIOLATION', 'TIME_WINDOW_EXCEEDED', 'SPEED_RESTRICTION_CASCADE')),
    severity VARCHAR(20) NOT NULL DEFAULT 'HIGH' CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    description TEXT NOT NULL,
    resolution_status VARCHAR(30) NOT NULL DEFAULT 'UNRESOLVED' CHECK (resolution_status IN ('UNRESOLVED', 'AUTO_RESOLVED', 'MANUALLY_OVERRIDDEN', 'ACCEPTED_DELAY', 'TRAIN_REGULATED', 'REJECTED')),
    resolution_details JSONB DEFAULT '{}'::jsonb,
    resolved_at TIMESTAMPTZ,
    resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 7. APPROVAL WORKFLOW & AUDIT TRAIL
-- ============================================================================

CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES block_plans(id) ON DELETE RESTRICT,
    action VARCHAR(30) NOT NULL CHECK (action IN ('SUBMIT', 'RECOMMEND', 'APPROVE', 'REJECT', 'REQUEST_CHANGES', 'REVOKE')),
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    comments TEXT,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only audit logs for security, traceability & compliance
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    request_id VARCHAR(100),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8. INDEXES (Optimized for Railway Scheduling & Operational Queries)
-- ============================================================================

-- Corridor Indexes
CREATE INDEX IF NOT EXISTS idx_assets_corridor_id ON assets (corridor_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_corridor_id ON maintenance_tasks (corridor_id);
CREATE INDEX IF NOT EXISTS idx_block_windows_corridor_id ON block_windows (corridor_id);
CREATE INDEX IF NOT EXISTS idx_train_movements_corridor_id ON train_movements (corridor_id);
CREATE INDEX IF NOT EXISTS idx_block_plans_corridor_id ON block_plans (corridor_id);

-- Asset Indexes
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_asset_id ON maintenance_tasks (asset_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets (asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_criticality ON assets (criticality);

-- Maintenance Task Query Indexes
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_status ON maintenance_tasks (status);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_priority ON maintenance_tasks (priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_criticality ON maintenance_tasks (criticality);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_required_by ON maintenance_tasks (required_by_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_department ON maintenance_tasks (department_id);

-- Block Windows & Train Movements Time Range Indexes
CREATE INDEX IF NOT EXISTS idx_block_windows_time_range ON block_windows (start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_block_windows_status ON block_windows (availability_status);
CREATE INDEX IF NOT EXISTS idx_train_movements_time_range ON train_movements (scheduled_start_time, scheduled_end_time);
CREATE INDEX IF NOT EXISTS idx_train_movements_priority ON train_movements (priority);
CREATE INDEX IF NOT EXISTS idx_train_movements_train_no ON train_movements (train_number);

-- Block Plans & Plan Tasks Indexes
CREATE INDEX IF NOT EXISTS idx_block_plans_status ON block_plans (status);
CREATE INDEX IF NOT EXISTS idx_block_plans_approval_state ON block_plans (approval_state);
CREATE INDEX IF NOT EXISTS idx_block_plans_horizon ON block_plans (horizon_start_date, horizon_end_date);
CREATE INDEX IF NOT EXISTS idx_block_plan_tasks_plan_id ON block_plan_tasks (plan_id);
CREATE INDEX IF NOT EXISTS idx_block_plan_tasks_time_range ON block_plan_tasks (assigned_start_time, assigned_end_time);
CREATE INDEX IF NOT EXISTS idx_block_plan_tasks_task_id ON block_plan_tasks (maintenance_task_id);

-- Conflict Resolution Indexes
CREATE INDEX IF NOT EXISTS idx_conflicts_plan_id ON conflicts (plan_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_resolution_status ON conflicts (resolution_status);
CREATE INDEX IF NOT EXISTS idx_conflicts_severity ON conflicts (severity);

-- Source System + External Record ID Indexes (Integration Idempotency Lookups)
CREATE INDEX IF NOT EXISTS idx_assets_source_external ON assets (source_system_id, external_record_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_source_external ON maintenance_tasks (source_system_id, external_record_id);
CREATE INDEX IF NOT EXISTS idx_block_windows_source_external ON block_windows (source_system_id, external_record_id);
CREATE INDEX IF NOT EXISTS idx_train_movements_source_external ON train_movements (source_system_id, external_record_id);

-- Approvals & Audit Trail Indexes
CREATE INDEX IF NOT EXISTS idx_approvals_plan_id ON approvals (plan_id);
CREATE INDEX IF NOT EXISTS idx_approvals_reviewer_id ON approvals (reviewer_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);

-- Sync Runs Indexes
CREATE INDEX IF NOT EXISTS idx_sync_runs_source_id ON sync_runs (source_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON sync_runs (status);
