import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from main import app
from constraints.config import ConstraintConfig
from constraints.models import (
    BlockCandidate,
    TrainMovementSummary,
    BlockWindowSummary,
    ConflictType,
    Severity,
    BlockPlanCandidate
)
from constraints.compatibility import TaskCompatibilityEngine
from constraints.conflicts import ConflictDetector
from constraints.engine import ConstraintEngine, get_constraint_engine


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def engine():
    return ConstraintEngine()


def make_candidate(
    candidate_id: str,
    start_str: str,
    end_str: str,
    corridor_code: str = "NDLS-CNB",
    department: str = "ENGG",
    maintenance_type: str = "TRACK_TAMPING",
    asset_id: str = "asset_track_1",
    asset_code: str = "TRK-NDLS-01",
    start_km: float = 10.0,
    end_km: float = 12.0,
    traffic_block_required: bool = True,
    power_block_required: bool = False,
    machinery_required: str = None,
    crew_required: int = 1,
    depends_on_task_ids: list = None,
    task_id: str = None,
    is_shadow_block: bool = False,
    priority: int = 3
) -> BlockCandidate:
    st = datetime.fromisoformat(start_str)
    et = datetime.fromisoformat(end_str)
    dur = (et - st).total_seconds() / 60.0
    return BlockCandidate(
        candidate_id=candidate_id,
        task_id=task_id or f"task_{candidate_id}",
        task_code=f"CODE-{candidate_id}",
        corridor_code=corridor_code,
        department=department,
        maintenance_type=maintenance_type,
        asset_id=asset_id,
        asset_code=asset_code,
        start_kilometer=start_km,
        end_kilometer=end_km,
        start_time=st,
        end_time=et,
        duration_minutes=dur,
        priority=priority,
        traffic_block_required=traffic_block_required,
        power_block_required=power_block_required,
        machinery_required=machinery_required,
        crew_required=crew_required,
        depends_on_task_ids=depends_on_task_ids or [],
        is_shadow_block=is_shadow_block
    )


# ============================================================================
# 1. TIMING & DURATION CONSTRAINTS
# ============================================================================

def test_timing_inverted_start_end(engine):
    """Verifies that start_time >= end_time produces CRITICAL INVALID_TIMING violation."""
    c = make_candidate("bad_time", "2026-09-10T14:00:00Z", "2026-09-10T12:00:00Z")
    violations = engine.validate_candidate(c)
    assert len(violations) >= 1
    assert violations[0].conflict_type == ConflictType.INVALID_TIMING
    assert violations[0].severity == Severity.CRITICAL


def test_duration_under_minimum_safety_limit(engine):
    """Verifies that block under min duration (<15 min) is marked invalid."""
    c = make_candidate("short_dur", "2026-09-10T12:00:00Z", "2026-09-10T12:10:00Z")
    violations = engine.validate_candidate(c)
    assert len(violations) == 1
    assert violations[0].conflict_type == ConflictType.INVALID_DURATION
    assert violations[0].severity == Severity.HIGH


def test_duration_exceeds_maximum_continuous_limit(engine):
    """Verifies that block exceeding 720 min (12 hr) is marked invalid."""
    c = make_candidate("long_dur", "2026-09-10T00:00:00Z", "2026-09-10T14:00:00Z")  # 14 hours
    violations = engine.validate_candidate(c)
    assert len(violations) == 1
    assert violations[0].conflict_type == ConflictType.INVALID_DURATION


# ============================================================================
# 2. SAME ASSET & CORRIDOR CONFLICTS
# ============================================================================

def test_same_asset_simultaneous_conflict(engine):
    """Verifies that two overlapping blocks on the same physical asset trigger SAME_ASSET conflict."""
    b1 = make_candidate("b1", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z", asset_id="asset_trk_01")
    b2 = make_candidate("b2", "2026-09-10T11:00:00Z", "2026-09-10T13:00:00Z", asset_id="asset_trk_01")

    conflicts = engine.find_conflicts(candidate=b2, existing_blocks=[b1])
    asset_conflicts = [c for c in conflicts if c.conflict_type == ConflictType.SAME_ASSET_SIMULTANEOUS_MAINTENANCE]
    assert len(asset_conflicts) == 1
    assert asset_conflicts[0].severity == Severity.CRITICAL
    assert "asset_trk_01" in asset_conflicts[0].involved_ids


def test_corridor_concurrency_conflict(engine):
    """Verifies that two incompatible blocks overlapping in time and within 2km section exceed concurrency."""
    b1 = make_candidate("b1", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z", asset_id="trk_A", start_km=10.0)
    b2 = make_candidate("b2", "2026-09-10T11:00:00Z", "2026-09-10T13:00:00Z", asset_id="trk_B", start_km=10.5)

    conflicts = engine.find_conflicts(candidate=b2, existing_blocks=[b1])
    concurrency_conflicts = [c for c in conflicts if c.conflict_type == ConflictType.CORRIDOR_CONCURRENCY_EXCEEDED]
    assert len(concurrency_conflicts) == 1
    assert concurrency_conflicts[0].severity == Severity.HIGH


# ============================================================================
# 3. TRAIN PATH & SAFETY HEADWAY CONFLICTS
# ============================================================================

def test_train_direct_path_overlap(engine):
    """Verifies that block overlapping with a scheduled train triggers TRAIN_PATH_OVERLAP."""
    block = make_candidate("block_1", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z", traffic_block_required=True)
    train = TrainMovementSummary(
        train_id="trn_12301",
        train_number="12301",
        train_type="RAJDHANI",
        priority=1,
        direction="DOWN",
        scheduled_start_time=datetime.fromisoformat("2026-09-10T11:00:00Z"),
        scheduled_end_time=datetime.fromisoformat("2026-09-10T11:45:00Z")
    )

    conflicts = engine.find_conflicts(candidate=block, trains=[train])
    train_conflicts = [c for c in conflicts if c.conflict_type == ConflictType.TRAIN_PATH_OVERLAP]
    assert len(train_conflicts) == 1
    # Rajdhani priority 1 must be CRITICAL
    assert train_conflicts[0].severity == Severity.CRITICAL
    assert "12301" in train_conflicts[0].involved_ids


def test_train_headway_buffer_violation(engine):
    """Verifies headway safety buffer violation when train passes 5 minutes after block (buffer is 15 min)."""
    block = make_candidate("block_1", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z", traffic_block_required=True)
    # Train starts at 12:05 (gap = 5 mins < 15 min buffer)
    train = TrainMovementSummary(
        train_id="trn_exp_01",
        train_number="14055",
        train_type="MAIL_EXPRESS",
        priority=3,
        scheduled_start_time=datetime.fromisoformat("2026-09-10T12:05:00Z"),
        scheduled_end_time=datetime.fromisoformat("2026-09-10T12:45:00Z")
    )

    conflicts = engine.find_conflicts(candidate=block, trains=[train])
    headway_conflicts = [c for c in conflicts if c.conflict_type == ConflictType.HEADWAY_BUFFER_VIOLATION]
    assert len(headway_conflicts) == 1
    assert headway_conflicts[0].severity == Severity.MEDIUM


def test_no_train_conflict_if_power_block_only(engine):
    """Verifies that non-traffic maintenance (e.g. routine side work) does not conflict with trains."""
    block = make_candidate("block_snt", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z", traffic_block_required=False)
    train = TrainMovementSummary(
        train_id="trn_12301",
        train_number="12301",
        train_type="MAIL_EXPRESS",
        priority=3,
        scheduled_start_time=datetime.fromisoformat("2026-09-10T11:00:00Z"),
        scheduled_end_time=datetime.fromisoformat("2026-09-10T11:45:00Z")
    )
    conflicts = engine.find_conflicts(candidate=block, trains=[train])
    assert len(conflicts) == 0


# ============================================================================
# 4. MAINTENANCE WINDOW BOUNDS & DEPENDENCY CONSTRAINTS
# ============================================================================

def test_window_boundary_overflow(engine):
    """Verifies that block extending past window end time triggers WINDOW_BOUNDARY_EXCEEDED."""
    block = make_candidate("block_w", "2026-09-10T10:00:00Z", "2026-09-10T13:00:00Z")
    block.assigned_window_id = "win_001"

    # Window only runs until 12:00
    win = BlockWindowSummary(
        window_id="win_001",
        corridor_code="NDLS-CNB",
        start_time=datetime.fromisoformat("2026-09-10T10:00:00Z"),
        end_time=datetime.fromisoformat("2026-09-10T12:00:00Z"),
        duration_minutes=120
    )

    conflicts = engine.find_conflicts(candidate=block, windows=[win])
    win_conflicts = [c for c in conflicts if c.conflict_type == ConflictType.WINDOW_BOUNDARY_EXCEEDED]
    assert len(win_conflicts) == 1
    assert win_conflicts[0].severity == Severity.HIGH


def test_dependency_precedence_violation(engine):
    """Verifies that dependent task starting before prerequisite finishes is caught."""
    task_a = make_candidate("prereq", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z", task_id="task_prereq_01")
    # Dependent task starts at 11:30 (before prerequisite ends at 12:00)
    task_b = make_candidate(
        "dependent", "2026-09-10T11:30:00Z", "2026-09-10T13:30:00Z",
        depends_on_task_ids=["task_prereq_01"]
    )

    conflicts = engine.find_conflicts(candidate=task_b, existing_blocks=[task_a])
    dep_conflicts = [c for c in conflicts if c.conflict_type == ConflictType.DEPENDENCY_ORDER_VIOLATION]
    assert len(dep_conflicts) == 1
    assert dep_conflicts[0].severity == Severity.CRITICAL


# ============================================================================
# 5. RESOURCE LIMITS & MACHINE OVER-ALLOCATION
# ============================================================================

def test_machinery_exclusive_collision(engine):
    """Verifies that two simultaneous blocks requesting the same machine trigger RESOURCE_CAPACITY_EXCEEDED."""
    b1 = make_candidate(
        "b1", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z",
        machinery_required="CSU-09-3X Tamping Express"
    )
    b2 = make_candidate(
        "b2", "2026-09-10T10:30:00Z", "2026-09-10T12:30:00Z",
        machinery_required="CSU-09-3X Tamping Express"
    )

    conflicts = engine.find_conflicts(candidate=b2, existing_blocks=[b1])
    machine_conflicts = [c for c in conflicts if c.conflict_type == ConflictType.RESOURCE_CAPACITY_EXCEEDED]
    assert len(machine_conflicts) >= 1
    assert machine_conflicts[0].severity == Severity.CRITICAL


def test_department_crew_capacity_exceeded(engine):
    """Verifies that concurrent crews exceeding department limit (max 5 for ENGG) triggers violation."""
    blocks = []
    for i in range(6):  # 6 crews requested concurrently
        blocks.append(
            make_candidate(
                f"engg_{i}", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z",
                department="ENGG", crew_required=1, asset_id=f"asset_{i}", start_km=float(i * 10)
            )
        )

    plan = BlockPlanCandidate(
        plan_reference="crew_test_plan",
        horizon_start=datetime.fromisoformat("2026-09-10T08:00:00Z"),
        horizon_end=datetime.fromisoformat("2026-09-10T18:00:00Z"),
        candidates=blocks
    )

    report = engine.validate_plan(plan)
    assert report.is_feasible is False
    crew_violations = [v for v in report.violations if "crews" in v.violated_constraint]
    assert len(crew_violations) >= 1


# ============================================================================
# 6. TASK COMPATIBILITY & SHADOW BLOCKS
# ============================================================================

def test_compatible_tasks_integrated_block(engine):
    """Verifies that ENGG Track Tamping and TRD OHE Inspection within 2km can share a block."""
    engg_task = make_candidate(
        "engg_tamp", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z",
        department="ENGG", maintenance_type="TRACK_TAMPING", start_km=10.0, power_block_required=True
    )
    trd_task = make_candidate(
        "trd_ohe", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z",
        department="TRD", maintenance_type="OHE_INSPECTION", start_km=11.5, power_block_required=True
    )

    compat = engine.check_compatibility(engg_task, trd_task)
    assert compat.is_compatible is True
    assert compat.can_shadow is True
    assert compat.distance_km == 1.5


def test_incompatible_tasks_exclusive_possession(engine):
    """Verifies that emergency RAIL_FRACTURE_REPAIR forbids shadow or co-scheduled work."""
    frac_task = make_candidate(
        "fracture", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z",
        department="ENGG", maintenance_type="RAIL_FRACTURE_REPAIR", start_km=10.0
    )
    snt_task = make_candidate(
        "snt_check", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z",
        department="SNT", maintenance_type="TRACK_CIRCUIT_CHECK", start_km=10.2
    )

    compat = engine.check_compatibility(frac_task, snt_task)
    assert compat.is_compatible is False
    assert "exclusive track possession" in compat.reason.lower()


def test_incompatible_tasks_distance_too_far(engine):
    """Verifies that tasks > 5.0 km apart cannot be combined into a shared block."""
    t1 = make_candidate("t1", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z", start_km=10.0)
    t2 = make_candidate("t2", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z", start_km=18.0)  # 8 km apart

    compat = engine.check_compatibility(t1, t2)
    assert compat.is_compatible is False
    assert "exceed maximum spatial grouping distance" in compat.reason.lower()


# ============================================================================
# 7. FULL PLAN VALIDATION & FEASIBILITY CHECKER
# ============================================================================

def test_feasible_plan(engine):
    """Verifies that a well-separated, non-overlapping plan with safe headway is feasible."""
    b1 = make_candidate(
        "cand_1", "2026-09-10T02:00:00Z", "2026-09-10T04:00:00Z",
        asset_id="trk_1", start_km=10.0
    )
    b2 = make_candidate(
        "cand_2", "2026-09-10T12:00:00Z", "2026-09-10T14:00:00Z",
        asset_id="trk_2", start_km=25.0
    )

    # Train running safely between 06:00 and 07:00
    train = TrainMovementSummary(
        train_id="trn_pass",
        train_number="12423",
        train_type="RAJDHANI",
        priority=1,
        scheduled_start_time=datetime.fromisoformat("2026-09-10T06:00:00Z"),
        scheduled_end_time=datetime.fromisoformat("2026-09-10T07:00:00Z")
    )

    plan = BlockPlanCandidate(
        plan_reference="PLAN-FEASIBLE-001",
        corridor_code="NDLS-CNB",
        horizon_start=datetime.fromisoformat("2026-09-10T00:00:00Z"),
        horizon_end=datetime.fromisoformat("2026-09-10T23:59:59Z"),
        candidates=[b1, b2]
    )

    report = engine.validate_plan(plan, trains=[train])
    assert report.is_feasible is True
    assert report.total_violations == 0
    assert report.critical_violations == 0
    assert engine.is_feasible(plan, trains=[train]) is True


def test_infeasible_plan_multiple_violations(engine):
    """Verifies that multiple concurrent violations across assets and trains are all reported."""
    b1 = make_candidate("b1", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z", asset_id="same_asset")
    b2 = make_candidate("b2", "2026-09-10T11:00:00Z", "2026-09-10T13:00:00Z", asset_id="same_asset")

    train = TrainMovementSummary(
        train_id="trn_coll",
        train_number="12004",
        train_type="SHATABDI",
        priority=1,
        scheduled_start_time=datetime.fromisoformat("2026-09-10T10:30:00Z"),
        scheduled_end_time=datetime.fromisoformat("2026-09-10T11:30:00Z")
    )

    plan = BlockPlanCandidate(
        plan_reference="PLAN-INFEASIBLE-002",
        horizon_start=datetime.fromisoformat("2026-09-10T08:00:00Z"),
        horizon_end=datetime.fromisoformat("2026-09-10T18:00:00Z"),
        candidates=[b1, b2]
    )

    report = engine.validate_plan(plan, trains=[train])
    assert report.is_feasible is False
    assert report.total_violations >= 2  # Asset overlap + train overlaps
    assert report.critical_violations >= 1


# ============================================================================
# 8. SOFT METRICS CALCULATION
# ============================================================================

def test_soft_metrics_calculation(engine):
    """Verifies soft metric calculations (delay mins, shadow grouping, objective cost)."""
    b1 = make_candidate("b1", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z", priority=1)
    b2 = make_candidate(
        "b2", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z",
        is_shadow_block=True, priority=2
    )

    train = TrainMovementSummary(
        train_id="trn_reg",
        train_number="12420",
        train_type="MAIL_EXPRESS",
        priority=3,
        scheduled_start_time=datetime.fromisoformat("2026-09-10T11:00:00Z"),
        scheduled_end_time=datetime.fromisoformat("2026-09-10T11:30:00Z")
    )

    plan = BlockPlanCandidate(
        plan_reference="PLAN-SOFT-001",
        horizon_start=datetime.fromisoformat("2026-09-10T08:00:00Z"),
        horizon_end=datetime.fromisoformat("2026-09-10T18:00:00Z"),
        candidates=[b1, b2]
    )

    metrics = engine.calculate_soft_metrics(plan, trains=[train])
    assert metrics.total_block_minutes == 240.0
    assert metrics.shadow_grouping_count == 1
    assert metrics.shadow_grouping_efficiency_pct == 50.0
    assert metrics.total_train_conflicts >= 1
    assert metrics.composite_objective_cost > 0.0


# ============================================================================
# 9. ML PREDICTION INTEGRATION
# ============================================================================

def test_ml_prediction_enrichment(engine):
    """Verifies that block candidate is enriched with ML predictions from Prompt 5."""
    candidate = make_candidate(
        "ml_test_cand", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z",
        department="ENGG", maintenance_type="TRACK_TAMPING", priority=4
    )
    enriched = engine.enrich_with_ml(candidate)
    assert enriched.ml_predicted_duration_minutes is not None
    assert enriched.ml_predicted_duration_minutes >= 15.0
    assert enriched.ml_predicted_risk_tier in ["LOW", "MEDIUM", "HIGH"]
    assert enriched.ml_predicted_impact is not None
    assert 0.0 <= enriched.ml_predicted_impact <= 100.0


# ============================================================================
# 10. FASTAPI CONSTRAINT ENDPOINTS
# ============================================================================

def test_api_get_constraint_rules(client):
    """Verifies GET /api/v1/constraints/rules returns full configuration."""
    res = client.get("/api/v1/constraints/rules")
    assert res.status_code == 200
    data = res.json()
    assert "min_headway_buffer_minutes" in data
    assert data["min_headway_buffer_minutes"] == 15
    assert "compatible_maintenance_pairs" in data
    assert "TRACK_TAMPING" in data["compatible_maintenance_pairs"]


def test_api_check_compatibility(client):
    """Verifies POST /api/v1/constraints/check-compatibility."""
    t1 = make_candidate("t1", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z", department="ENGG", maintenance_type="TRACK_TAMPING", start_km=10.0)
    t2 = make_candidate("t2", "2026-09-10T10:00:00Z", "2026-09-10T12:00:00Z", department="TRD", maintenance_type="OHE_INSPECTION", start_km=11.0)

    payload = {"task_a": t1.model_dump(mode="json"), "task_b": t2.model_dump(mode="json")}
    res = client.post("/api/v1/constraints/check-compatibility", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["is_compatible"] is True
    assert data["can_shadow"] is True


def test_api_validate_plan(client):
    """Verifies POST /api/v1/constraints/validate-plan returns feasibility and soft metrics."""
    b1 = make_candidate("b1", "2026-09-10T02:00:00Z", "2026-09-10T04:00:00Z")
    plan = BlockPlanCandidate(
        plan_reference="API-PLAN-001",
        horizon_start=datetime.fromisoformat("2026-09-10T00:00:00Z"),
        horizon_end=datetime.fromisoformat("2026-09-10T12:00:00Z"),
        candidates=[b1]
    )

    payload = {
        "plan": plan.model_dump(mode="json"),
        "trains": [],
        "windows": []
    }
    res = client.post("/api/v1/constraints/validate-plan", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "feasibility" in data
    assert "soft_metrics" in data
    assert data["feasibility"]["is_feasible"] is True
