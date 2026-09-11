-- ============================================================================
-- Migration: 004_create_defects_table.sql
-- Description: Defect and infrastructure failure records driving maintenance demands
-- ============================================================================

CREATE TABLE IF NOT EXISTS defects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_record_id VARCHAR(100) NOT NULL UNIQUE,
    defect_code VARCHAR(100) NOT NULL,
    defect_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    description TEXT NOT NULL,
    component VARCHAR(150),
    failure_risk TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'REPORTED' CHECK (status IN ('REPORTED', 'VERIFIED', 'WORK_ORDERED', 'RESOLVED', 'DEFERRED')),
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    corridor_id UUID REFERENCES corridors(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    source_system_id UUID REFERENCES integration_sources(id) ON DELETE RESTRICT,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_defects_corridor_id ON defects (corridor_id);
CREATE INDEX IF NOT EXISTS idx_defects_severity ON defects (severity);
CREATE INDEX IF NOT EXISTS idx_defects_status ON defects (status);
