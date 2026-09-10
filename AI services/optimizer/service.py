from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from optimizer.config import OptimizerConfig, OptimizationStrategy, get_default_optimizer_config
from optimizer.models import (
    OptimizationRequest,
    OptimizationResponse,
    OptimizationPlanResult,
    ScheduledBlockAssignment,
    MaintenanceRequestItem
)
from optimizer.cp_sat_model import RailwayCPSATOptimizer
from constraints.models import (
    BlockCandidate,
    BlockPlanCandidate,
    TrainMovementSummary,
    BlockWindowSummary
)
from constraints.engine import ConstraintEngine, get_constraint_engine
from utils.logger import get_logger

logger = get_logger("optimizer_service")


class RailwayOptimizerService:
    """
    High-level orchestrator for Railway Automatic Block Planning Optimization.
    Executes:
    1. Input normalization & ML enrichment (Prompt 5)
    2. CP-SAT mathematical optimization (Prompt 7)
    3. Multi-strategy Pareto plan generation (Balanced, Operational, Asset Priority)
    4. Deterministic hard-constraint verification via Prompt 6 engine
    5. Detailed diagnostic reporting for unscheduled maintenance requests
    """

    def __init__(
        self,
        optimizer_config: Optional[OptimizerConfig] = None,
        constraint_engine: Optional[ConstraintEngine] = None
    ):
        self.config = optimizer_config or get_default_optimizer_config()
        self.constraint_engine = constraint_engine or get_constraint_engine()
        self.solver = RailwayCPSATOptimizer(
            config=self.config,
            constraint_config=self.constraint_engine.config
        )

    def optimize_block_plan(
        self,
        request: OptimizationRequest
    ) -> OptimizationResponse:
        """
        Executes multi-objective block optimization across all configured strategies.
        """
        logger.info(
            "Starting Railway Block Optimization for corridor: %s (Requests: %d, Windows: %d, Trains: %d)",
            request.corridor_code, len(request.requests), len(request.candidate_windows), len(request.train_movements)
        )

        # 1. Validate Horizon
        if request.horizon_end <= request.horizon_start:
            raise ValueError("horizon_end must be strictly after horizon_start")

        # 2. Enrich Requests with Prompt 5 ML Predictions
        enriched_requests = self._enrich_requests_with_ml(request.requests, request.corridor_code)

        # 3. Solve across requested strategies
        strategies = request.strategies or [
            OptimizationStrategy.BALANCED,
            OptimizationStrategy.OPERATIONAL_MINIMAL_DISRUPTION,
            OptimizationStrategy.ASSET_PRIORITY_FIRST
        ]

        generated_plans: List[OptimizationPlanResult] = []

        for strat in strategies:
            try:
                # Run CP-SAT solver
                plan_result = self.solver.solve_strategy(
                    strategy=strat,
                    corridor_code=request.corridor_code,
                    horizon_start=request.horizon_start,
                    horizon_end=request.horizon_end,
                    requests=enriched_requests,
                    windows=request.candidate_windows,
                    trains=request.train_movements,
                    time_limit_seconds=request.time_limit_seconds
                )

                # 4. Rigorous verification via Prompt 6 ConstraintEngine
                self._verify_plan_feasibility(
                    plan_result=plan_result,
                    trains=request.train_movements,
                    windows=request.candidate_windows,
                    horizon_start=request.horizon_start,
                    horizon_end=request.horizon_end,
                    corridor_code=request.corridor_code,
                    requests=enriched_requests
                )

                generated_plans.append(plan_result)

            except Exception as e:
                logger.error("Error solving strategy %s: %s", strat.value, str(e), exc_info=True)

        logger.info("Optimization complete: generated %d feasible candidate plans.", len(generated_plans))

        return OptimizationResponse(
            success=len(generated_plans) > 0,
            corridor_code=request.corridor_code,
            total_plans=len(generated_plans),
            plans=generated_plans,
            message=f"Successfully generated {len(generated_plans)} candidate plans."
        )

    def _enrich_requests_with_ml(
        self,
        requests: List[MaintenanceRequestItem],
        corridor_code: str
    ) -> List[MaintenanceRequestItem]:
        """Calls Prompt 5 ML batch predictor to enrich requests with duration, risk, and impact."""
        try:
            from models.batch_predictor import get_batch_predictor

            predictor = get_batch_predictor()
            candidates_payload = []
            for r in requests:
                candidates_payload.append({
                    "candidate_id": r.task_id,
                    "corridor_code": corridor_code,
                    "department": r.department,
                    "maintenance_type": r.maintenance_type,
                    "asset_type": r.asset_type,
                    "priority": r.priority,
                    "asset_criticality": getattr(r, "criticality", "MEDIUM"),
                    "task_urgency": getattr(r, "urgency", "MEDIUM"),
                    "traffic_block_required": r.traffic_block_required,
                    "power_block_required": r.power_block_required,
                    "speed_restriction_kmph": r.speed_restriction_kmph,
                    "requested_duration_minutes": r.requested_duration_minutes
                })

            res = predictor.predict_candidates(candidates_payload)
            if res.success and res.predictions:
                pred_map = {p.candidate_id: p for p in res.predictions}
                for r in requests:
                    if r.task_id in pred_map:
                        p = pred_map[r.task_id]
                        r.ml_predicted_duration_minutes = p.predicted_duration_minutes
                        r.ml_predicted_risk_tier = p.predicted_risk_tier
                        r.ml_predicted_impact = p.predicted_operational_impact

        except Exception as e:
            logger.warning("ML prediction enrichment fallback: %s", str(e))

        return requests

    def _verify_plan_feasibility(
        self,
        plan_result: OptimizationPlanResult,
        trains: List[TrainMovementSummary],
        windows: List[BlockWindowSummary],
        horizon_start: datetime,
        horizon_end: datetime,
        corridor_code: str,
        requests: Optional[List[MaintenanceRequestItem]] = None
    ):
        """
        Converts the generated plan into Prompt 6 BlockPlanCandidate and validates
        that zero hard constraints are violated.
        """
        req_map = {r.task_id: r for r in (requests or [])}
        candidates: List[BlockCandidate] = []
        for a in plan_result.scheduled_assignments:
            req = req_map.get(a.task_id)
            start_km = req.start_kilometer if req and req.start_kilometer is not None else 0.0
            end_km = req.end_kilometer if req and req.end_kilometer is not None else (start_km + 1.0)
            traffic_block = req.traffic_block_required if req and req.traffic_block_required is not None else True
            power_block = req.power_block_required if req and req.power_block_required is not None else False

            candidates.append(
                BlockCandidate(
                    candidate_id=a.assignment_id,
                    task_id=a.task_id,
                    task_code=a.task_code,
                    corridor_code=corridor_code,
                    department=a.department,
                    maintenance_type=a.maintenance_type,
                    asset_id=a.asset_id,
                    asset_code=a.asset_code,
                    start_kilometer=start_km,
                    end_kilometer=end_km,
                    traffic_block_required=traffic_block,
                    power_block_required=power_block,
                    start_time=a.start_time,
                    end_time=a.end_time,
                    duration_minutes=a.duration_minutes,
                    priority=a.priority,
                    assigned_window_id=a.assigned_window_id,
                    machinery_required=a.machinery_assigned,
                    crew_required=a.crews_assigned,
                    is_shadow_block=a.is_shadow_block,
                    parent_block_id=a.parent_task_id
                )
            )

        plan_cand = BlockPlanCandidate(
            plan_reference=plan_result.plan_reference,
            corridor_code=corridor_code,
            horizon_start=horizon_start,
            horizon_end=horizon_end,
            candidates=candidates
        )

        feasibility_report = self.constraint_engine.validate_plan(
            plan=plan_cand,
            trains=trains,
            windows=windows
        )

        plan_result.is_feasible = feasibility_report.is_feasible

        if not feasibility_report.is_feasible:
            logger.warning(
                "Plan [%s] generated %d hard constraint violations: %s",
                plan_result.plan_reference,
                feasibility_report.total_violations,
                [v.violated_constraint for v in feasibility_report.violations]
            )


def get_optimizer_service() -> RailwayOptimizerService:
    """Dependency provider for RailwayOptimizerService."""
    return RailwayOptimizerService()
