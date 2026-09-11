-- ============================================================================
-- Migration: 005_update_maintenance_task_lifecycle.sql
-- Description: Updates maintenance task lifecycle statuses & creates planning_runs
-- Lifecycle: INCOMING -> PENDING -> PLANNING -> SCHEDULED / POSTPONED / REJECTED
-- ============================================================================

-- 1. Update maintenance_tasks status check constraint
DO $$
BEGIN
    -- Drop old check constraint if exists
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'maintenance_tasks' AND constraint_name = 'maintenance_tasks_status_check'
    ) THEN
        ALTER TABLE maintenance_tasks DROP CONSTRAINT maintenance_tasks_status_check;
    END IF;

    -- Add updated constraint with full lifecycle support
    ALTER TABLE maintenance_tasks
    ADD CONSTRAINT maintenance_tasks_status_check
    CHECK (status IN (
        'INCOMING',
        'PENDING',
        'PLANNING',
        'SCHEDULED',
        'POSTPONED',
        'REJECTED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
        'DEFERRED'
    ));
END $$;

-- 2. Create planning_runs table for tracking AI optimization pipeline runs
CREATE TABLE IF NOT EXISTS planning_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_run_id VARCHAR(100) NOT NULL UNIQUE,
    corridor_id UUID NOT NULL REFERENCES corridors(id) ON DELETE RESTRICT,
    horizon_start TIMESTAMPTZ NOT NULL,
    horizon_end TIMESTAMPTZ NOT NULL,
    input_request_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_systems JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
    plan_id UUID REFERENCES block_plans(id) ON DELETE SET NULL,
    failure_reason TEXT,
    execution_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_planning_run_horizon CHECK (horizon_end > horizon_start)
);

-- Indexes for planning runs
CREATE INDEX IF NOT EXISTS idx_planning_runs_corridor ON planning_runs (corridor_id);
CREATE INDEX IF NOT EXISTS idx_planning_runs_status ON planning_runs (status);
CREATE INDEX IF NOT EXISTS idx_planning_runs_created_at ON planning_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_planning_runs_run_id ON planning_runs (planning_run_id);
