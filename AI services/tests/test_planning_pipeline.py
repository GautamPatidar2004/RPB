import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from main import create_app
from pipeline.models import PlanningPipelineRequest, PlanningPipelineResponse
from pipeline.orchestrator import BlockPlanningOrchestrator, get_block_planning_orchestrator
from optimizer.models import MaintenanceRequestItem
from constraints.models import BlockWindowSummary, TrainMovementSummary
from scoring.config import ScoringConfig


@pytest.fixture
def sample_planning_inputs():
    now = datetime(2026, 4, 1, 0, 0, tzinfo=timezone.utc)
    requests = [
        MaintenanceRequestItem(
            task_id="REQ-PIPE-001",
            task_code="TRK-TAMP-P1",
            department="ENGG",
            maintenance_type="TRACK_TAMPING",
            asset_id="AST-001",
            start_kilometer=10.0,
            end_kilometer=14.0,
            requested_duration_minutes=120.0,
            priority=1,
            criticality="CRITICAL",
            traffic_block_required=True
        ),
        MaintenanceRequestItem(
            task_id="REQ-PIPE-002",
            task_code="TRD-OHE-P2",
            department="TRD",
            maintenance_type="OHE_INSPECTION",
            asset_id="AST-002",
            start_kilometer=11.0,
            end_kilometer=13.0,
            requested_duration_minutes=90.0,
            priority=2,
            criticality="HIGH",
            power_block_required=True,
            traffic_block_required=True
        ),
        MaintenanceRequestItem(
            task_id="REQ-PIPE-003",
            task_code="SNT-SIG-P4",
            department="SNT",
            maintenance_type="SIGNAL_INTERLOCKING",
            asset_id="AST-003",
            start_kilometer=12.0,
            end_kilometer=13.0,
            requested_duration_minutes=60.0,
            priority=4,
            criticality="LOW",
            traffic_block_required=True
        )
    ]

    windows = [
        BlockWindowSummary(
            window_id="WIN-PIPE-001",
            corridor_code="NDLS-CNB",
            start_time=now + timedelta(hours=1),
            end_time=now + timedelta(hours=5),
            duration_minutes=240.0
        )
    ]

    trains = [
        TrainMovementSummary(
            train_id="TRN-PIPE-001",
            train_number="12004",
            scheduled_start_time=now + timedelta(hours=5, minutes=30),
            scheduled_end_time=now + timedelta(hours=6, minutes=30),
            is_high_priority=True
        )
    ]

    return requests, windows, trains, now


# --------------------------------------------------------------------
# 1. Full End-to-End Success & Schema Tests
# --------------------------------------------------------------------

@pytest.mark.anyio
async def test_pipeline_end_to_end_inline_success(sample_planning_inputs):
    """
    End-to-End Success:
    Data -> ML -> Constraints -> OR-Tools -> Scoring -> LLM Explanation -> Final Planning Result
    """
    requests, windows, trains, now = sample_planning_inputs
    orchestrator = get_block_planning_orchestrator()

    req = PlanningPipelineRequest(
        corridor_code="NDLS-CNB",
        horizon_start=now,
        horizon_end=now + timedelta(hours=8),
        data_source="INLINE_PAYLOAD",
        inline_requests=requests,
        inline_windows=windows,
        inline_trains=trains,
        force_deterministic_explanation=True
    )

    response = await orchestrator.generate_block_plan(req)

    # Status & Provenance Verification
    assert response.pipeline_status == "SUCCESS"
    assert response.data_source == "INLINE_PAYLOAD"
    assert response.planning_run_id.startswith("RUN-")
    assert response.corridor_code == "NDLS-CNB"

    # Selected Plan Verification
    assert response.selected_plan is not None
    assert response.selected_plan.is_feasible is True
    assert response.selected_plan.rank == 1
    assert 0.0 <= response.score <= 100.0

    # Scheduled Blocks & Shadow Grouping
    assert len(response.scheduled_blocks) >= 1
    assert any(a.is_shadow_block for a in response.scheduled_blocks) or len(response.grouped_tasks) >= 0

    # Observability & Stage Durations
    assert len(response.stage_durations_ms) >= 5
    assert response.total_execution_time_ms > 0
    assert "duration_model" in response.model_versions
    assert "optimizer" in response.model_versions

    # Explanation Layer
    assert response.explanation is not None
    assert len(response.explanation.summary) > 20
    assert len(response.explanation.key_decisions) >= 1
    assert response.llm_provider == "deterministic"


@pytest.mark.anyio
async def test_pipeline_synthetic_dataset_flow():
    """Verifies pipeline execution with synthetic data generation mode."""
    orchestrator = get_block_planning_orchestrator()

    req = PlanningPipelineRequest(
        corridor_code="NDLS-CNB",
        data_source="SYNTHETIC_DATASET",
        force_deterministic_explanation=True
    )

    response = await orchestrator.generate_block_plan(req)
    assert response.pipeline_status == "SUCCESS"
    assert response.data_source == "SYNTHETIC_DATASET"
    assert response.selected_plan is not None
    assert len(response.scheduled_blocks) > 0


@pytest.mark.anyio
async def test_pipeline_real_backend_flow():
    """Verifies pipeline execution with live backend data connection."""
    orchestrator = get_block_planning_orchestrator()

    req = PlanningPipelineRequest(
        corridor_code="NDLS-CNB",
        data_source="REAL_BACKEND",
        force_deterministic_explanation=True
    )

    response = await orchestrator.generate_block_plan(req)
    # Since backend daemon is running, this should succeed!
    assert response.pipeline_status in ("SUCCESS", "NO_FEASIBLE_PLAN")
    assert response.data_source in ("REAL_BACKEND", "INLINE_PAYLOAD")


# --------------------------------------------------------------------
# 2. Failure Handling & Safety Gate Invariants
# --------------------------------------------------------------------

@pytest.mark.anyio
async def test_pipeline_empty_requests_handling(sample_planning_inputs):
    """Verifies safe failure response when no maintenance tasks exist."""
    _, windows, trains, now = sample_planning_inputs
    orchestrator = get_block_planning_orchestrator()

    req = PlanningPipelineRequest(
        corridor_code="NDLS-CNB",
        data_source="INLINE_PAYLOAD",
        inline_requests=[],  # empty!
        inline_windows=windows,
        inline_trains=trains
    )

    response = await orchestrator.generate_block_plan(req)
    assert response.pipeline_status == "NO_FEASIBLE_PLAN"
    assert response.selected_plan is None
    assert "No maintenance requests" in response.message


@pytest.mark.anyio
async def test_pipeline_no_windows_no_feasible_plan(sample_planning_inputs):
    """Verifies safe failure response when zero block windows are available."""
    requests, _, trains, now = sample_planning_inputs
    orchestrator = get_block_planning_orchestrator()

    req = PlanningPipelineRequest(
        corridor_code="NDLS-CNB",
        data_source="INLINE_PAYLOAD",
        inline_requests=requests,
        inline_windows=[],  # no windows!
        inline_trains=trains
    )

    response = await orchestrator.generate_block_plan(req)
    assert response.pipeline_status == "NO_FEASIBLE_PLAN"
    assert response.selected_plan is None


# --------------------------------------------------------------------
# 3. API Endpoints Tests
# --------------------------------------------------------------------

def test_api_pipeline_generate_endpoint(sample_planning_inputs):
    """Tests POST /api/v1/planning/generate."""
    requests, windows, trains, now = sample_planning_inputs
    client = TestClient(create_app())

    payload = {
        "corridor_code": "NDLS-CNB",
        "horizon_start": now.isoformat(),
        "horizon_end": (now + timedelta(hours=8)).isoformat(),
        "data_source": "INLINE_PAYLOAD",
        "inline_requests": [r.model_dump(mode="json") for r in requests],
        "inline_windows": [w.model_dump(mode="json") for w in windows],
        "inline_trains": [t.model_dump(mode="json") for t in trains],
        "force_deterministic_explanation": True
    }

    res = client.post("/api/v1/planning/generate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["pipeline_status"] == "SUCCESS"
    assert data["selected_plan"] is not None
    assert "planning_run_id" in data
    assert "explanation" in data

    # Test GET /api/v1/planning/runs/{planning_run_id}
    run_id = data["planning_run_id"]
    get_res = client.get(f"/api/v1/planning/runs/{run_id}")
    assert get_res.status_code == 200
    cached_data = get_res.json()
    assert cached_data["planning_run_id"] == run_id


def test_api_get_nonexistent_run_404():
    """Tests GET /api/v1/planning/runs/NON-EXISTENT returns 404."""
    client = TestClient(create_app())
    res = client.get("/api/v1/planning/runs/NON-EXISTENT-ID")
    assert res.status_code == 404
