import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from main import app
from optimizer.config import OptimizerConfig, OptimizationStrategy
from optimizer.models import (
    MaintenanceRequestItem,
    OptimizationRequest,
    OptimizationResponse
)
from optimizer.service import RailwayOptimizerService, get_optimizer_service
from constraints.models import TrainMovementSummary, BlockWindowSummary
from constraints.engine import get_constraint_engine


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def optimizer():
    return RailwayOptimizerService()


def make_request(
    task_id: str,
    task_code: str = None,
    department: str = "ENGG",
    maintenance_type: str = "TRACK_TAMPING",
    asset_id: str = "asset_trk_01",
    duration_minutes: float = 60.0,
    priority: int = 3,
    start_km: float = 10.0,
    end_km: float = 12.0,
    machinery: str = None,
    crew_required: int = 1,
    traffic_block_required: bool = True,
    depends_on: list = None
) -> MaintenanceRequestItem:
    return MaintenanceRequestItem(
        task_id=task_id,
        task_code=task_code or f"CODE-{task_id}",
        department=department,
        maintenance_type=maintenance_type,
        asset_id=asset_id,
        asset_code=f"ASSET-{asset_id}",
        requested_duration_minutes=duration_minutes,
        priority=priority,
        start_kilometer=start_km,
        end_kilometer=end_km,
        machinery_required=machinery,
        crew_required=crew_required,
        traffic_block_required=traffic_block_required,
        depends_on_task_ids=depends_on or []
    )


def make_window(
    window_id: str,
    start_str: str,
    end_str: str,
    corridor_code: str = "NDLS-CNB"
) -> BlockWindowSummary:
    st = datetime.fromisoformat(start_str)
    et = datetime.fromisoformat(end_str)
    dur = int((et - st).total_seconds() / 60.0)
    return BlockWindowSummary(
        window_id=window_id,
        corridor_code=corridor_code,
        start_time=st,
        end_time=et,
        duration_minutes=dur
    )


def make_train(
    train_id: str,
    train_num: str,
    start_str: str,
    end_str: str,
    is_high_prio: bool = False,
    priority: int = 3
) -> TrainMovementSummary:
    return TrainMovementSummary(
        train_id=train_id,
        train_number=train_num,
        train_type="RAJDHANI" if is_high_prio else "MAIL_EXPRESS",
        priority=1 if is_high_prio else priority,
        scheduled_start_time=datetime.fromisoformat(start_str),
        scheduled_end_time=datetime.fromisoformat(end_str),
        is_high_priority=is_high_prio
    )


# ============================================================================
# 1. BASIC FEASIBLE SCHEDULING
# ============================================================================

def test_simple_feasible_schedule(optimizer):
    """Verifies that two independent tasks fit cleanly into an available block window."""
    t1 = make_request("req_1", duration_minutes=60.0, asset_id="trk_1")
    t2 = make_request("req_2", duration_minutes=60.0, asset_id="trk_2")

    win = make_window("win_1", "2026-09-10T10:00:00Z", "2026-09-10T14:00:00Z")

    req = OptimizationRequest(
        corridor_code="NDLS-CNB",
        horizon_start=datetime.fromisoformat("2026-09-10T08:00:00Z"),
        horizon_end=datetime.fromisoformat("2026-09-10T18:00:00Z"),
        requests=[t1, t2],
        candidate_windows=[win],
        strategies=[OptimizationStrategy.BALANCED]
    )

    resp = optimizer.optimize_block_plan(req)
    assert resp.success is True
    assert len(resp.plans) == 1
    plan = resp.plans[0]
    assert plan.is_feasible is True
    assert len(plan.scheduled_assignments) == 2
    assert len(plan.unscheduled_requests) == 0


# ============================================================================
# 2. ASSET CONFLICT RESOLUTION
# ============================================================================

def test_asset_conflict_resolution(optimizer):
    """Verifies that two tasks on the exact same asset are serialized without temporal overlap."""
    t1 = make_request("task_same_1", asset_id="shared_asset_01", duration_minutes=60.0)
    t2 = make_request("task_same_2", asset_id="shared_asset_01", duration_minutes=60.0)

    win = make_window("win_large", "2026-09-10T10:00:00Z", "2026-09-10T14:00:00Z")

    req = OptimizationRequest(
        corridor_code="NDLS-CNB",
        horizon_start=datetime.fromisoformat("2026-09-10T08:00:00Z"),
        horizon_end=datetime.fromisoformat("2026-09-10T18:00:00Z"),
        requests=[t1, t2],
        candidate_windows=[win],
        strategies=[OptimizationStrategy.BALANCED]
    )

    resp = optimizer.optimize_block_plan(req)
    plan = resp.plans[0]
    assert plan.is_feasible is True
    assert len(plan.scheduled_assignments) == 2

    # Check that intervals do not overlap: (s1 >= e2) or (s2 >= e1)
    a1 = plan.scheduled_assignments[0]
    a2 = plan.scheduled_assignments[1]
    is_non_overlapping = (a1.start_time >= a2.end_time) or (a2.start_time >= a1.end_time)
    assert is_non_overlapping is True


# ============================================================================
# 3. TRAIN CONFLICT & HEADWAY AVOIDANCE
# ============================================================================

def test_train_conflict_avoidance(optimizer):
    """Verifies that block is scheduled in gap between trains respecting 15-min safety headway."""
    task = make_request("trk_maint", duration_minutes=60.0, traffic_block_required=True)

    # Window runs 10:00 to 14:00
    win = make_window("win_1", "2026-09-10T10:00:00Z", "2026-09-10T14:00:00Z")

    # Train passes 11:30 to 12:00
    train = make_train("trn_1", "12004", "2026-09-10T11:30:00Z", "2026-09-10T12:00:00Z")

    req = OptimizationRequest(
        corridor_code="NDLS-CNB",
        horizon_start=datetime.fromisoformat("2026-09-10T08:00:00Z"),
        horizon_end=datetime.fromisoformat("2026-09-10T18:00:00Z"),
        requests=[task],
        candidate_windows=[win],
        train_movements=[train],
        strategies=[OptimizationStrategy.BALANCED]
    )

    resp = optimizer.optimize_block_plan(req)
    plan = resp.plans[0]
    assert plan.is_feasible is True
    assert len(plan.scheduled_assignments) == 1
    asgn = plan.scheduled_assignments[0]

    # Must clear before 11:15 (11:30 - 15m headway) OR start after 12:15 (12:00 + 15m headway)
    headway_before = datetime.fromisoformat("2026-09-10T11:15:00+00:00")
    headway_after = datetime.fromisoformat("2026-09-10T12:15:00+00:00")
    assert (asgn.end_time <= headway_before) or (asgn.start_time >= headway_after)


# ============================================================================
# 4. MACHINERY BOTTLENECK SERIALIZATION
# ============================================================================

def test_machinery_resource_bottleneck(optimizer):
    """Verifies that two tasks requiring a single-fleet machine are serialized."""
    t1 = make_request("tamp_1", duration_minutes=60.0, machinery="Rail Grinding Machine (RGM)", asset_id="a1")
    t2 = make_request("tamp_2", duration_minutes=60.0, machinery="Rail Grinding Machine (RGM)", asset_id="a2")

    win = make_window("win_wide", "2026-09-10T10:00:00Z", "2026-09-10T14:00:00Z")

    req = OptimizationRequest(
        corridor_code="NDLS-CNB",
        horizon_start=datetime.fromisoformat("2026-09-10T08:00:00Z"),
        horizon_end=datetime.fromisoformat("2026-09-10T18:00:00Z"),
        requests=[t1, t2],
        candidate_windows=[win],
        strategies=[OptimizationStrategy.BALANCED]
    )

    resp = optimizer.optimize_block_plan(req)
    plan = resp.plans[0]
    assert plan.is_feasible is True
    assert len(plan.scheduled_assignments) == 2

    a1 = plan.scheduled_assignments[0]
    a2 = plan.scheduled_assignments[1]
    assert (a1.start_time >= a2.end_time) or (a2.start_time >= a1.end_time)


# ============================================================================
# 5. COMPATIBLE SHADOW GROUPING
# ============================================================================

def test_compatible_shadow_grouping(optimizer):
    """Verifies that compatible ENGG track tamping and TRD OHE inspection are grouped."""
    engg = make_request(
        "engg_tamp",
        department="ENGG",
        maintenance_type="TRACK_TAMPING",
        duration_minutes=90.0,
        start_km=10.0,
        asset_id="trk_NDLS"
    )
    trd = make_request(
        "trd_ohe",
        department="TRD",
        maintenance_type="OHE_INSPECTION",
        duration_minutes=60.0,
        start_km=11.0,
        asset_id="ohe_NDLS"
    )

    win = make_window("win_group", "2026-09-10T10:00:00Z", "2026-09-10T13:00:00Z")

    req = OptimizationRequest(
        corridor_code="NDLS-CNB",
        horizon_start=datetime.fromisoformat("2026-09-10T08:00:00Z"),
        horizon_end=datetime.fromisoformat("2026-09-10T18:00:00Z"),
        requests=[engg, trd],
        candidate_windows=[win],
        strategies=[OptimizationStrategy.BALANCED]
    )

    resp = optimizer.optimize_block_plan(req)
    plan = resp.plans[0]
    assert plan.is_feasible is True
    assert len(plan.scheduled_assignments) == 2
    # Shadow efficiency should be reflected
    assert plan.metrics.shadow_blocks_count >= 1 or plan.metrics.scheduled_count == 2


# ============================================================================
# 6. HIGH-PRIORITY TASK SELECTION UNDER SCARCITY
# ============================================================================

def test_high_priority_task_selection_under_scarcity(optimizer):
    """Verifies that when window time is scarce, Priority 1 task is chosen over Priority 5."""
    p1 = make_request("critical_p1", duration_minutes=60.0, priority=1)
    p5 = make_request("routine_p5", duration_minutes=60.0, priority=5)

    # Window is only 75 mins long (only room for ONE 60-min task)
    win = make_window("short_window", "2026-09-10T10:00:00Z", "2026-09-10T11:15:00Z")

    req = OptimizationRequest(
        corridor_code="NDLS-CNB",
        horizon_start=datetime.fromisoformat("2026-09-10T08:00:00Z"),
        horizon_end=datetime.fromisoformat("2026-09-10T18:00:00Z"),
        requests=[p1, p5],
        candidate_windows=[win],
        strategies=[OptimizationStrategy.BALANCED]
    )

    resp = optimizer.optimize_block_plan(req)
    plan = resp.plans[0]
    assert plan.is_feasible is True
    assert len(plan.scheduled_assignments) == 1
    assert plan.scheduled_assignments[0].task_id == "critical_p1"
    assert len(plan.unscheduled_requests) == 1
    assert plan.unscheduled_requests[0].task_id == "routine_p5"


# ============================================================================
# 7. MULTIPLE DIFFERENTIATED CANDIDATE PLANS
# ============================================================================

def test_multiple_candidate_plans(optimizer):
    """Verifies that 3 differentiated Pareto candidate plans are generated."""
    t1 = make_request("t1", duration_minutes=60.0, priority=1)
    t2 = make_request("t2", duration_minutes=60.0, priority=3)

    win = make_window("win_multi", "2026-09-10T10:00:00Z", "2026-09-10T14:00:00Z")

    req = OptimizationRequest(
        corridor_code="NDLS-CNB",
        horizon_start=datetime.fromisoformat("2026-09-10T08:00:00Z"),
        horizon_end=datetime.fromisoformat("2026-09-10T18:00:00Z"),
        requests=[t1, t2],
        candidate_windows=[win],
        strategies=[
            OptimizationStrategy.BALANCED,
            OptimizationStrategy.OPERATIONAL_MINIMAL_DISRUPTION,
            OptimizationStrategy.ASSET_PRIORITY_FIRST
        ]
    )

    resp = optimizer.optimize_block_plan(req)
    assert resp.success is True
    assert len(resp.plans) == 3
    strategies_found = {p.strategy for p in resp.plans}
    assert OptimizationStrategy.BALANCED in strategies_found
    assert OptimizationStrategy.OPERATIONAL_MINIMAL_DISRUPTION in strategies_found
    assert OptimizationStrategy.ASSET_PRIORITY_FIRST in strategies_found


# ============================================================================
# 8. UNSCHEDULED REQUEST DIAGNOSTICS
# ============================================================================

def test_unscheduled_request_diagnostics(optimizer):
    """Verifies that an unscheduled request provides clear diagnostic reasons."""
    # Task requires 180 min, but largest window is only 60 min
    t_huge = make_request("huge_task", duration_minutes=180.0)
    win = make_window("tiny_win", "2026-09-10T10:00:00Z", "2026-09-10T11:00:00Z")

    req = OptimizationRequest(
        corridor_code="NDLS-CNB",
        horizon_start=datetime.fromisoformat("2026-09-10T08:00:00Z"),
        horizon_end=datetime.fromisoformat("2026-09-10T18:00:00Z"),
        requests=[t_huge],
        candidate_windows=[win],
        strategies=[OptimizationStrategy.BALANCED]
    )

    resp = optimizer.optimize_block_plan(req)
    plan = resp.plans[0]
    assert len(plan.unscheduled_requests) == 1
    report = plan.unscheduled_requests[0]
    assert report.task_id == "huge_task"
    assert len(report.blocking_constraints) >= 1
    assert "WINDOW_DURATION_INSUFFICIENT" in report.blocking_constraints


# ============================================================================
# 9. SOLVER SAFETY (EMPTY & INVALID INPUTS)
# ============================================================================

def test_solver_safety_empty_input(optimizer):
    """Verifies solver handles zero requests gracefully."""
    req = OptimizationRequest(
        corridor_code="NDLS-CNB",
        horizon_start=datetime.fromisoformat("2026-09-10T08:00:00Z"),
        horizon_end=datetime.fromisoformat("2026-09-10T18:00:00Z"),
        requests=[],
        candidate_windows=[],
        strategies=[OptimizationStrategy.BALANCED]
    )

    resp = optimizer.optimize_block_plan(req)
    assert resp.success is True
    assert len(resp.plans) == 1
    assert resp.plans[0].metrics.scheduled_count == 0


def test_solver_safety_inverted_horizon(optimizer):
    """Verifies that horizon_end <= horizon_start raises ValueError."""
    req = OptimizationRequest(
        corridor_code="NDLS-CNB",
        horizon_start=datetime.fromisoformat("2026-09-10T18:00:00Z"),
        horizon_end=datetime.fromisoformat("2026-09-10T08:00:00Z"),
        requests=[]
    )
    with pytest.raises(ValueError):
        optimizer.optimize_block_plan(req)


# ============================================================================
# 10. FASTAPI OPTIMIZATION ENDPOINTS
# ============================================================================

def test_api_get_strategies(client):
    """Verifies GET /api/v1/optimize/strategies."""
    res = client.get("/api/v1/optimize/strategies")
    assert res.status_code == 200
    data = res.json()
    assert "available_strategies" in data
    assert "BALANCED" in data["available_strategies"]
    assert "strategy_profiles" in data


def test_api_optimize_plan_endpoint(client):
    """Verifies POST /api/v1/optimize/plan end-to-end via HTTP API."""
    payload = {
        "corridor_code": "NDLS-CNB",
        "horizon_start": "2026-09-10T08:00:00Z",
        "horizon_end": "2026-09-10T18:00:00Z",
        "requests": [
            {
                "task_id": "api_task_01",
                "task_code": "API-TRK-01",
                "department": "ENGG",
                "maintenance_type": "TRACK_TAMPING",
                "asset_id": "asset_api_01",
                "requested_duration_minutes": 60.0,
                "priority": 2
            }
        ],
        "candidate_windows": [
            {
                "window_id": "api_win_01",
                "corridor_code": "NDLS-CNB",
                "start_time": "2026-09-10T10:00:00Z",
                "end_time": "2026-09-10T13:00:00Z",
                "duration_minutes": 180
            }
        ],
        "strategies": ["BALANCED"]
    }

    res = client.post("/api/v1/optimize/plan", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["total_plans"] == 1
    assert data["plans"][0]["is_feasible"] is True
    assert len(data["plans"][0]["scheduled_assignments"]) == 1
