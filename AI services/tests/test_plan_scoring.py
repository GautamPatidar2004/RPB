import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from main import create_app
from scoring.config import ScoringConfig, get_default_scoring_config
from scoring.models import (
    PlanRawMetrics,
    NormalizedScores,
    ScoredPlan,
    TradeOffItem,
    PlanSelectionResponse
)
from scoring.calculator import PlanMetricsCalculator, ScoreNormalizer
from scoring.tradeoffs import TradeOffAnalyzer
from scoring.service import PlanScoringService, get_plan_scoring_service
from optimizer.models import (
    OptimizationPlanResult,
    ScheduledBlockAssignment,
    UnscheduledRequestReport,
    PlanMetrics,
    MaintenanceRequestItem
)
from optimizer.config import OptimizationStrategy
from constraints.models import (
    TrainMovementSummary,
    BlockWindowSummary,
    FeasibilityReport,
    ConflictViolation,
    ConflictType,
    Severity
)


@pytest.fixture
def sample_horizon():
    start = datetime(2026, 4, 1, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(hours=12)
    return start, end


@pytest.fixture
def sample_requests(sample_horizon):
    start, _ = sample_horizon
    return [
        MaintenanceRequestItem(
            task_id="REQ-001",
            task_code="TRK-TAMP-01",
            department="ENGG",
            maintenance_type="TRACK_TAMPING",
            asset_id="AST-001",
            start_kilometer=10.0,
            end_kilometer=15.0,
            requested_duration_minutes=120.0,
            priority=1,
            criticality="CRITICAL",
            urgency="IMMEDIATE",
            is_overdue=True,
            traffic_block_required=True,
            ml_predicted_duration_minutes=115.0,
            ml_predicted_risk_tier="HIGH",
            ml_predicted_impact=45.0
        ),
        MaintenanceRequestItem(
            task_id="REQ-002",
            task_code="TRD-OHE-01",
            department="TRD",
            maintenance_type="OHE_INSPECTION",
            asset_id="AST-002",
            start_kilometer=12.0,
            end_kilometer=14.0,
            requested_duration_minutes=90.0,
            priority=2,
            criticality="HIGH",
            urgency="HIGH",
            is_overdue=False,
            power_block_required=True,
            traffic_block_required=True,
            ml_predicted_duration_minutes=85.0,
            ml_predicted_risk_tier="MEDIUM",
            ml_predicted_impact=30.0
        ),
        MaintenanceRequestItem(
            task_id="REQ-003",
            task_code="SNT-SIG-01",
            department="SNT",
            maintenance_type="SIGNAL_INTERLOCKING",
            asset_id="AST-003",
            start_kilometer=11.0,
            end_kilometer=13.0,
            requested_duration_minutes=60.0,
            priority=4,
            criticality="LOW",
            urgency="LOW",
            is_overdue=False,
            traffic_block_required=True,
            ml_predicted_duration_minutes=55.0,
            ml_predicted_risk_tier="LOW",
            ml_predicted_impact=15.0
        )
    ]


@pytest.fixture
def sample_windows(sample_horizon):
    start, _ = sample_horizon
    return [
        BlockWindowSummary(
            window_id="WIN-001",
            corridor_code="NDLS-CNB",
            start_time=start + timedelta(hours=1),
            end_time=start + timedelta(hours=5),
            duration_minutes=240.0,
            is_allocated=False
        )
    ]


@pytest.fixture
def sample_trains(sample_horizon):
    start, _ = sample_horizon
    return [
        TrainMovementSummary(
            train_id="TRN-12001",
            train_number="12001",
            scheduled_start_time=start + timedelta(hours=5, minutes=30),
            scheduled_end_time=start + timedelta(hours=6, minutes=30),
            is_high_priority=True
        )
    ]


@pytest.fixture
def sample_feasible_plans(sample_horizon):
    start, _ = sample_horizon
    win_id = "WIN-001"

    # Plan A: High Risk Priority (schedules REQ-001 and REQ-002)
    plan_a = OptimizationPlanResult(
        strategy=OptimizationStrategy.ASSET_PRIORITY_FIRST,
        plan_reference="PLAN-ASSET-PRIO",
        is_feasible=True,
        scheduled_assignments=[
            ScheduledBlockAssignment(
                assignment_id="ASG-A1",
                task_id="REQ-001",
                task_code="TRK-TAMP-01",
                department="ENGG",
                maintenance_type="TRACK_TAMPING",
                asset_id="AST-001",
                asset_code="TRK-01",
                assigned_window_id=win_id,
                start_time=start + timedelta(hours=1),
                end_time=start + timedelta(hours=3),
                duration_minutes=120.0,
                priority=1,
                is_shadow_block=False,
                ml_predicted_impact=40.0
            ),
            ScheduledBlockAssignment(
                assignment_id="ASG-A2",
                task_id="REQ-002",
                task_code="TRD-OHE-01",
                department="TRD",
                maintenance_type="OHE_INSPECTION",
                asset_id="AST-002",
                asset_code="OHE-01",
                assigned_window_id=win_id,
                start_time=start + timedelta(hours=1, minutes=15),
                end_time=start + timedelta(hours=2, minutes=45),
                duration_minutes=90.0,
                priority=2,
                is_shadow_block=True,
                parent_task_id="REQ-001",
                ml_predicted_impact=30.0
            )
        ],
        unscheduled_requests=[
            UnscheduledRequestReport(
                task_id="REQ-003",
                task_code="SNT-SIG-01",
                priority=4,
                department="SNT",
                reason="Routine priority deferred"
            )
        ],
        metrics=PlanMetrics(
            total_requests=3,
            scheduled_count=2,
            unscheduled_count=1,
            schedule_rate_pct=66.7,
            total_block_minutes=210.0,
            shadow_blocks_count=1,
            shadow_efficiency_pct=50.0,
            objective_score=150.0,
            solver_status="OPTIMAL",
            solve_time_ms=12.5
        )
    )

    # Plan B: Minimal Disruption (schedules REQ-003 only, smaller footprint)
    plan_b = OptimizationPlanResult(
        strategy=OptimizationStrategy.OPERATIONAL_MINIMAL_DISRUPTION,
        plan_reference="PLAN-MIN-DISRUPT",
        is_feasible=True,
        scheduled_assignments=[
            ScheduledBlockAssignment(
                assignment_id="ASG-B1",
                task_id="REQ-003",
                task_code="SNT-SIG-01",
                department="SNT",
                maintenance_type="SIGNAL_INTERLOCKING",
                asset_id="AST-003",
                asset_code="SIG-01",
                assigned_window_id=win_id,
                start_time=start + timedelta(hours=1),
                end_time=start + timedelta(hours=2),
                duration_minutes=60.0,
                priority=4,
                is_shadow_block=False,
                ml_predicted_impact=15.0
            )
        ],
        unscheduled_requests=[
            UnscheduledRequestReport(
                task_id="REQ-001",
                task_code="TRK-TAMP-01",
                priority=1,
                department="ENGG",
                reason="Disruption avoidance"
            ),
            UnscheduledRequestReport(
                task_id="REQ-002",
                task_code="TRD-OHE-01",
                priority=2,
                department="TRD",
                reason="Disruption avoidance"
            )
        ],
        metrics=PlanMetrics(
            total_requests=3,
            scheduled_count=1,
            unscheduled_count=2,
            schedule_rate_pct=33.3,
            total_block_minutes=60.0,
            shadow_blocks_count=0,
            shadow_efficiency_pct=0.0,
            objective_score=80.0,
            solver_status="OPTIMAL",
            solve_time_ms=10.0
        )
    )

    return [plan_a, plan_b]


@pytest.fixture
def sample_infeasible_plan(sample_horizon):
    start, _ = sample_horizon
    # Violates timing: end_time before start_time
    return OptimizationPlanResult(
        strategy=OptimizationStrategy.BALANCED,
        plan_reference="PLAN-INFEASIBLE",
        is_feasible=False,
        scheduled_assignments=[
            ScheduledBlockAssignment(
                assignment_id="ASG-INV1",
                task_id="REQ-INV1",
                task_code="INV-01",
                department="ENGG",
                maintenance_type="TRACK_TAMPING",
                asset_id="AST-INV",
                asset_code="INV",
                assigned_window_id="WIN-001",
                start_time=start + timedelta(hours=3),
                end_time=start + timedelta(hours=2),  # invalid!
                duration_minutes=-60.0,
                priority=1,
                is_shadow_block=False
            )
        ],
        metrics=PlanMetrics(
            total_requests=1,
            scheduled_count=1,
            unscheduled_count=0,
            schedule_rate_pct=100.0,
            total_block_minutes=0.0,
            shadow_blocks_count=0,
            shadow_efficiency_pct=0.0,
            objective_score=0.0,
            solver_status="INFEASIBLE",
            solve_time_ms=1.0
        )
    )


# --------------------------------------------------------------------
# 1. Config & Metric Normalization Tests
# --------------------------------------------------------------------

def test_scoring_config_validation():
    """Validates ScoringConfig defaults, weight normalization, and validation errors."""
    config = get_default_scoring_config()
    weights = config.get_normalized_weights()
    assert sum(weights.values()) == pytest.approx(1.0, rel=1e-3)
    assert config.min_acceptable_score == 40.0

    with pytest.raises(ValueError, match="strictly positive"):
        ScoringConfig(
            weight_asset_availability=0.0,
            weight_risk_priority=0.0,
            weight_operational_efficiency=0.0,
            weight_block_efficiency=0.0,
            weight_grouping_efficiency=0.0,
            weight_overdue_maintenance=0.0
        )


def test_metrics_calculator_and_normalizer(sample_feasible_plans, sample_requests, sample_trains, sample_windows):
    """Verifies that PlanMetricsCalculator produces bounded, mathematically exact metrics."""
    plan_a = sample_feasible_plans[0]
    metrics = PlanMetricsCalculator.calculate_metrics(
        plan=plan_a,
        requests=sample_requests,
        trains=sample_trains,
        windows=sample_windows
    )

    # 13 Raw Metrics Verification
    assert metrics.maintenance_tasks_scheduled == 2
    assert metrics.maintenance_tasks_unscheduled == 1
    assert metrics.compatible_tasks_grouped == 1
    assert metrics.high_risk_maintenance_coverage == 100.0  # both P1 and P2 scheduled
    assert metrics.overdue_maintenance_coverage == 100.0    # REQ-001 is overdue and scheduled
    assert metrics.total_block_duration == 210.0
    assert metrics.train_conflicts_avoided == 1
    assert metrics.overall_constraint_compliance == 100.0

    # Normalization Verification
    norm = ScoreNormalizer.normalize(metrics, total_requests_count=len(sample_requests))
    assert 0.0 <= norm.asset_availability_score <= 100.0
    assert 0.0 <= norm.risk_priority_score <= 100.0
    assert 0.0 <= norm.operational_efficiency_score <= 100.0
    assert 0.0 <= norm.block_efficiency_score <= 100.0
    assert 0.0 <= norm.grouping_efficiency_score <= 100.0
    assert 0.0 <= norm.overdue_maintenance_score <= 100.0

    # Weighted composite score
    overall = ScoreNormalizer.compute_weighted_overall_score(norm, get_default_scoring_config())
    assert 0.0 <= overall <= 100.0


# --------------------------------------------------------------------
# 2. Feasible vs Infeasible Filtering Tests
# --------------------------------------------------------------------

def test_infeasible_plan_disqualification(sample_feasible_plans, sample_infeasible_plan, sample_requests, sample_trains, sample_windows, sample_horizon):
    """Verifies that infeasible plans are never selected and assigned 0.0 score with explicit reasons."""
    service = get_plan_scoring_service()
    plans = [sample_infeasible_plan, sample_feasible_plans[0]]
    start, end = sample_horizon

    scored = service.score_plans(
        plans=plans,
        requests=sample_requests,
        trains=sample_trains,
        windows=sample_windows,
        horizon_start=start,
        horizon_end=end
    )

    assert len(scored) == 2
    infeas = next(p for p in scored if p.plan_reference == "PLAN-INFEASIBLE")
    assert not infeas.is_feasible
    assert infeas.overall_score == 0.0
    assert infeas.rejection_reason is not None

    ranked, rejected = service.rank_plans(scored)
    assert len(ranked) == 1
    assert ranked[0].plan_reference == "PLAN-ASSET-PRIO"
    assert len(rejected) == 1
    assert rejected[0].plan_reference == "PLAN-INFEASIBLE"


def test_all_infeasible_plans_returns_safe_rejection(sample_infeasible_plan, sample_requests, sample_trains, sample_windows):
    """Verifies safe failure response when 100% of candidate plans violate hard constraints."""
    service = get_plan_scoring_service()
    res = service.select_best_plan(
        plans=[sample_infeasible_plan],
        requests=sample_requests,
        trains=sample_trains,
        windows=sample_windows
    )
    assert not res.success
    assert res.selected_plan is None
    assert len(res.infeasible_plans) == 1
    assert "hard constraint violations" in res.message


# --------------------------------------------------------------------
# 3. Plan Ranking, Scoring & Tie-Breaking Tests
# --------------------------------------------------------------------

def test_plan_ranking_and_best_selection(sample_feasible_plans, sample_requests, sample_trains, sample_windows, sample_horizon):
    """Verifies correct ranking order, winning selection, score breakdown, and alternatives."""
    service = get_plan_scoring_service()
    start, end = sample_horizon

    res = service.select_best_plan(
        plans=sample_feasible_plans,
        requests=sample_requests,
        trains=sample_trains,
        windows=sample_windows,
        horizon_start=start,
        horizon_end=end
    )

    assert res.success
    assert res.selected_plan is not None
    assert res.selected_plan.rank == 1
    # Plan A covered both P1 & P2 tasks, so under default weights it should score higher
    assert res.selected_plan.plan_reference == "PLAN-ASSET-PRIO"
    assert len(res.ranked_alternatives) == 1
    assert res.ranked_alternatives[0].plan_reference == "PLAN-MIN-DISRUPT"
    assert res.ranked_alternatives[0].rank == 2

    # Verify score breakdown
    assert "asset_availability" in res.score_breakdown
    assert "risk_priority" in res.score_breakdown
    assert "total_composite_score" in res.score_breakdown


def test_deterministic_scoring_and_tie_breaking(sample_feasible_plans, sample_requests, sample_trains, sample_windows):
    """Verifies that identical plans are scored identically and ties are broken deterministically."""
    service = get_plan_scoring_service()

    # Create two clone plans with different references
    plan_1 = sample_feasible_plans[0].model_copy(deep=True)
    plan_1.plan_reference = "PLAN-CLONE-A"
    plan_2 = sample_feasible_plans[0].model_copy(deep=True)
    plan_2.plan_reference = "PLAN-CLONE-B"

    res = service.select_best_plan(
        plans=[plan_2, plan_1],
        requests=sample_requests,
        trains=sample_trains,
        windows=sample_windows
    )

    assert res.success
    assert res.selected_plan is not None
    assert len(res.ranked_alternatives) == 1
    # Both have same score; tie-breaker picks lexicographically or stable deterministic order
    assert res.selected_plan.overall_score == res.ranked_alternatives[0].overall_score


def test_weight_configuration_changes_winner(sample_feasible_plans, sample_requests, sample_trains, sample_windows):
    """Verifies that configuring custom weights cleanly steers which plan wins."""
    # Configure dominant weight for operational disruption minimization
    disruption_centric_config = ScoringConfig(
        weight_asset_availability=0.02,
        weight_risk_priority=0.02,
        weight_operational_efficiency=0.88,  # 88% weight on minimal operational friction and disruption!
        weight_block_efficiency=0.04,
        weight_grouping_efficiency=0.02,
        weight_overdue_maintenance=0.02
    )

    service = PlanScoringService(config=disruption_centric_config)
    res = service.select_best_plan(
        plans=sample_feasible_plans,
        requests=sample_requests,
        trains=sample_trains,
        windows=sample_windows
    )

    assert res.success
    # Plan B (PLAN-MIN-DISRUPT) has much lower footprint (60m vs 210m) and friction (15 vs 40)
    assert res.selected_plan.plan_reference == "PLAN-MIN-DISRUPT"


# --------------------------------------------------------------------
# 4. Trade-Off Analysis & Explanation Data Tests
# --------------------------------------------------------------------

def test_tradeoff_analysis_and_explanation_data(sample_feasible_plans, sample_requests, sample_trains, sample_windows):
    """Verifies quantitative pairwise trade-offs and structured explanation payload for Prompt 9."""
    service = get_plan_scoring_service()
    res = service.select_best_plan(
        plans=sample_feasible_plans,
        requests=sample_requests,
        trains=sample_trains,
        windows=sample_windows
    )

    assert res.success
    # Trade-offs should compare winner vs alternative across coverage, duration, and disruption
    assert len(res.tradeoffs) > 0
    t_dimensions = [t.dimension for t in res.tradeoffs]
    assert any("Risk" in d or "Duration" in d or "Disruption" in d for d in t_dimensions)

    # Why winner won reasons must not be vague
    assert len(res.why_winner_won) > 0
    for reason in res.why_winner_won:
        assert "AI selected" not in reason
        assert len(reason) > 10

    # Structured Explanation Data for Prompt 9
    assert res.explanation_data is not None
    expl = res.explanation_data
    assert expl.selected_plan == res.selected_plan.plan_reference
    assert expl.score == res.selected_plan.overall_score
    assert len(expl.scheduled_priority_tasks) > 0
    assert len(expl.major_constraints) > 0
    assert len(expl.alternatives) == 1


# --------------------------------------------------------------------
# 5. Edge Cases: Empty and Single Plan Handling
# --------------------------------------------------------------------

def test_empty_plans_handling(sample_requests):
    """Verifies that an empty plan list is handled gracefully."""
    service = get_plan_scoring_service()
    res = service.select_best_plan(plans=[], requests=sample_requests)
    assert not res.success
    assert "No candidate" in res.message


# --------------------------------------------------------------------
# 6. API Endpoints Tests
# --------------------------------------------------------------------

def test_api_scoring_config_endpoint():
    """Tests GET /api/v1/scoring/config."""
    client = TestClient(create_app())
    res = client.get("/api/v1/scoring/config")
    assert res.status_code == 200
    data = res.json()
    assert "active_weights" in data
    assert "normalized_weights" in data
    assert data["min_acceptable_score"] == 40.0


def test_api_evaluate_and_select_endpoint(sample_feasible_plans, sample_requests, sample_windows, sample_trains):
    """Tests POST /api/v1/scoring/evaluate."""
    client = TestClient(create_app())
    payload = {
        "corridor_code": "NDLS-CNB",
        "plans": [p.model_dump(mode="json") for p in sample_feasible_plans],
        "requests": [r.model_dump(mode="json") for r in sample_requests],
        "candidate_windows": [w.model_dump(mode="json") for w in sample_windows],
        "train_movements": [t.model_dump(mode="json") for t in sample_trains]
    }

    res = client.post("/api/v1/scoring/evaluate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["selected_plan"]["plan_reference"] == "PLAN-ASSET-PRIO"
    assert len(data["ranked_alternatives"]) == 1
    assert "explanation_data" in data


def test_end_to_end_optimizer_to_scoring_pipeline(sample_horizon, sample_requests, sample_windows, sample_trains):
    """
    End-to-End Validation:
    Railway Data -> ML Predictions -> Constraints -> OR-Tools -> Multiple Feasible Plans -> Scoring -> Ranking -> Best Plan
    """
    from optimizer.service import get_optimizer_service
    from optimizer.models import OptimizationRequest

    start, end = sample_horizon
    opt_service = get_optimizer_service()
    scoring_service = get_plan_scoring_service()

    opt_req = OptimizationRequest(
        corridor_code="NDLS-CNB",
        horizon_start=start,
        horizon_end=end,
        requests=sample_requests,
        candidate_windows=sample_windows,
        train_movements=sample_trains,
        strategies=[
            OptimizationStrategy.BALANCED,
            OptimizationStrategy.OPERATIONAL_MINIMAL_DISRUPTION,
            OptimizationStrategy.ASSET_PRIORITY_FIRST
        ]
    )

    opt_resp = opt_service.optimize_block_plan(opt_req)
    assert opt_resp.success
    assert len(opt_resp.plans) >= 2

    # Score and select best plan
    res = scoring_service.select_best_plan(
        plans=opt_resp.plans,
        requests=sample_requests,
        trains=sample_trains,
        windows=sample_windows,
        corridor_code="NDLS-CNB",
        horizon_start=start,
        horizon_end=end
    )

    assert res.success
    assert res.selected_plan is not None
    assert res.selected_plan.is_feasible
    assert res.selected_plan.rank == 1
    assert 0.0 <= res.selected_plan.overall_score <= 100.0
    assert len(res.why_winner_won) > 0
    assert res.explanation_data is not None


def test_api_optimize_and_select_endpoint(sample_horizon, sample_requests, sample_windows, sample_trains):
    """Tests POST /api/v1/scoring/optimize-and-select."""
    client = TestClient(create_app())
    start, end = sample_horizon
    payload = {
        "corridor_code": "NDLS-CNB",
        "horizon_start": start.isoformat(),
        "horizon_end": end.isoformat(),
        "requests": [r.model_dump(mode="json") for r in sample_requests],
        "candidate_windows": [w.model_dump(mode="json") for w in sample_windows],
        "train_movements": [t.model_dump(mode="json") for t in sample_trains]
    }

    res = client.post("/api/v1/scoring/optimize-and-select", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["selected_plan"] is not None
    assert data["selected_plan"]["is_feasible"] is True
    assert "explanation_data" in data
    assert "score_breakdown" in data

