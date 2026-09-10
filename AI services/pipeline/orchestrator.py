import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Tuple

from pipeline.models import PlanningPipelineRequest, PlanningPipelineResponse
from data.data_access import DataAccessLayer, get_data_access
from data.synthetic_generator import RailwaySyntheticGenerator
from models.loader import ModelLoaderService, get_model_loader
from models.batch_predictor import BatchPredictorService, get_batch_predictor
from constraints.models import (
    BlockCandidate,
    BlockPlanCandidate,
    TrainMovementSummary,
    BlockWindowSummary,
    FeasibilityReport
)
from constraints.engine import ConstraintEngine, get_constraint_engine
from optimizer.models import (
    OptimizationRequest,
    OptimizationResponse,
    OptimizationPlanResult,
    ScheduledBlockAssignment,
    UnscheduledRequestReport,
    MaintenanceRequestItem
)
from optimizer.config import OptimizationStrategy
from optimizer.service import RailwayOptimizerService, get_optimizer_service
from scoring.config import ScoringConfig, get_default_scoring_config
from scoring.models import ScoredPlan, PlanSelectionResponse
from scoring.service import PlanScoringService, get_plan_scoring_service
from llm.models import StructuredPlanExplanation, PlanExplanationResponse
from llm.service import PlanExplanationService, get_plan_explanation_service
from llm.fallback import DeterministicExplanationEngine
from utils.logger import get_logger

logger = get_logger("planning_orchestrator")

# In-memory run cache for recent planning executions
_PLANNING_RUN_CACHE: Dict[str, PlanningPipelineResponse] = {}


class BlockPlanningOrchestrator:
    """
    Unified Orchestration Engine for Indian Railways Automatic Block Planning.
    Coordinates all stages in strict order:
        Data Ingestion
          ↓
        Data Normalization & Validation
          ↓
        ML Batch Predictions (Prompt 5)
          ↓
        Constraint Pre-checks (Prompt 6)
          ↓
        OR-Tools Multi-Strategy Solver (Prompt 7)
          ↓
        Pareto Plan Scoring & Ranking (Prompt 8)
          ↓
        Winning Plan Selection & Trade-offs (Prompt 8)
          ↓
        Gemini / Groq Explanation Cascade (Prompt 9)
          ↓
        Final Prompt 6 Hard-Constraint Safety Gate
          ↓
        Unified Planning Result
    """

    def __init__(
        self,
        data_access: Optional[DataAccessLayer] = None,
        model_loader: Optional[ModelLoaderService] = None,
        batch_predictor: Optional[BatchPredictorService] = None,
        constraint_engine: Optional[ConstraintEngine] = None,
        optimizer_service: Optional[RailwayOptimizerService] = None,
        scoring_service: Optional[PlanScoringService] = None,
        explanation_service: Optional[PlanExplanationService] = None
    ):
        self.data_access = data_access or get_data_access()
        self.model_loader = model_loader or get_model_loader()
        self.batch_predictor = batch_predictor or get_batch_predictor()
        self.constraint_engine = constraint_engine or get_constraint_engine()
        self.optimizer_service = optimizer_service or get_optimizer_service()
        self.scoring_service = scoring_service or get_plan_scoring_service()
        self.explanation_service = explanation_service or get_plan_explanation_service()

    async def generate_block_plan(
        self,
        request: PlanningPipelineRequest
    ) -> PlanningPipelineResponse:
        """Executes the complete 13-stage block planning pipeline."""
        pipeline_start = time.perf_counter()
        run_id = f"RUN-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"
        stage_durations: Dict[str, float] = {}

        logger.info("Starting Automatic Block Planning Run [%s] for corridor: %s (Source: %s)",
                    run_id, request.corridor_code, request.data_source)

        # ----------------------------------------------------------------
        # Stage 1: Planning Data Ingestion
        # ----------------------------------------------------------------
        s1_start = time.perf_counter()
        requests, windows, trains, data_src_used = await self._ingest_data(request)
        stage_durations["1_data_ingestion"] = round((time.perf_counter() - s1_start) * 1000.0, 1)

        # Handle empty inputs early
        if not requests:
            total_time = round((time.perf_counter() - pipeline_start) * 1000.0, 1)
            return PlanningPipelineResponse(
                planning_run_id=run_id,
                corridor_code=request.corridor_code,
                pipeline_status="NO_FEASIBLE_PLAN",
                data_source=data_src_used,
                stage_durations_ms=stage_durations,
                total_execution_time_ms=total_time,
                message="No maintenance requests available for planning on this corridor.",
                model_versions=self._get_model_versions()
            )

        if not windows:
            total_time = round((time.perf_counter() - pipeline_start) * 1000.0, 1)
            return PlanningPipelineResponse(
                planning_run_id=run_id,
                corridor_code=request.corridor_code,
                pipeline_status="NO_FEASIBLE_PLAN",
                data_source=data_src_used,
                stage_durations_ms=stage_durations,
                total_execution_time_ms=total_time,
                message="No block windows available on this corridor to schedule maintenance.",
                model_versions=self._get_model_versions()
            )

        # ----------------------------------------------------------------
        # Stage 2: Data Normalization & Horizon Validation
        # ----------------------------------------------------------------
        s2_start = time.perf_counter()
        horizon_start, horizon_end = self._resolve_horizon(request, windows, trains)
        stage_durations["2_normalization"] = round((time.perf_counter() - s2_start) * 1000.0, 1)

        # ----------------------------------------------------------------
        # Stage 3 & 4: Feature Generation & Vectorized Batch ML Predictions
        # ----------------------------------------------------------------
        s3_start = time.perf_counter()
        requests = self._enrich_requests_with_ml(requests, request.corridor_code)
        stage_durations["3_ml_inference"] = round((time.perf_counter() - s3_start) * 1000.0, 1)

        # ----------------------------------------------------------------
        # Stage 5, 6, 7 & 8: Constraint Pre-Checks & OR-Tools CP-SAT Solving
        # ----------------------------------------------------------------
        s5_start = time.perf_counter()
        opt_request = OptimizationRequest(
            corridor_code=request.corridor_code,
            horizon_start=horizon_start,
            horizon_end=horizon_end,
            requests=requests,
            candidate_windows=windows,
            train_movements=trains,
            strategies=[
                OptimizationStrategy.BALANCED,
                OptimizationStrategy.OPERATIONAL_MINIMAL_DISRUPTION,
                OptimizationStrategy.ASSET_PRIORITY_FIRST
            ],
            time_limit_seconds=request.time_limit_seconds
        )

        opt_response = self.optimizer_service.optimize_block_plan(opt_request)
        stage_durations["4_ortools_optimization"] = round((time.perf_counter() - s5_start) * 1000.0, 1)

        if not opt_response.plans:
            total_time = round((time.perf_counter() - pipeline_start) * 1000.0, 1)
            return PlanningPipelineResponse(
                planning_run_id=run_id,
                corridor_code=request.corridor_code,
                pipeline_status="NO_FEASIBLE_PLAN",
                data_source=data_src_used,
                stage_durations_ms=stage_durations,
                total_execution_time_ms=total_time,
                message="OR-Tools solver found no feasible block assignments within the available windows.",
                model_versions=self._get_model_versions()
            )

        # ----------------------------------------------------------------
        # Stage 9 & 10: Multi-Objective Plan Scoring, Ranking & Best Selection
        # ----------------------------------------------------------------
        s9_start = time.perf_counter()
        active_scoring = self.scoring_service
        if request.scoring_config:
            active_scoring = PlanScoringService(config=request.scoring_config)

        selection_response = active_scoring.select_best_plan(
            plans=opt_response.plans,
            requests=requests,
            trains=trains,
            windows=windows,
            corridor_code=request.corridor_code,
            horizon_start=horizon_start,
            horizon_end=horizon_end
        )
        stage_durations["5_plan_scoring"] = round((time.perf_counter() - s9_start) * 1000.0, 1)

        if not selection_response.success or not selection_response.selected_plan:
            total_time = round((time.perf_counter() - pipeline_start) * 1000.0, 1)
            return PlanningPipelineResponse(
                planning_run_id=run_id,
                corridor_code=request.corridor_code,
                pipeline_status="NO_FEASIBLE_PLAN",
                data_source=data_src_used,
                alternative_plans=selection_response.ranked_alternatives,
                unscheduled_requests=self._extract_unscheduled(opt_response.plans[0]),
                stage_durations_ms=stage_durations,
                total_execution_time_ms=total_time,
                message=selection_response.message,
                model_versions=self._get_model_versions()
            )

        # ----------------------------------------------------------------
        # Stage 11: Gemini / Groq / Deterministic Explanation Cascade
        # ----------------------------------------------------------------
        s11_start = time.perf_counter()
        explanation_obj: Optional[StructuredPlanExplanation] = None
        llm_provider_used = "deterministic"

        if request.force_deterministic_explanation:
            from llm.models import ExplanationInput
            expl_data = selection_response.explanation_data
            if expl_data:
                input_data = ExplanationInput(
                    selected_plan=expl_data.selected_plan,
                    strategy=expl_data.strategy,
                    score=expl_data.score,
                    corridor_code=request.corridor_code,
                    metrics=expl_data.metrics,
                    key_decisions=expl_data.key_decisions,
                    tradeoffs=expl_data.tradeoffs,
                    scheduled_priority_tasks=expl_data.scheduled_priority_tasks,
                    unscheduled_priority_tasks=expl_data.unscheduled_priority_tasks,
                    major_constraints=expl_data.major_constraints,
                    alternatives=expl_data.alternatives,
                    user_query=request.user_query
                )
                explanation_obj = DeterministicExplanationEngine.generate(input_data)
                llm_provider_used = "deterministic"
        else:
            try:
                expl_resp = self.explanation_service.explain_selection_response(
                    selection_response=selection_response,
                    user_query=request.user_query
                )
                explanation_obj = expl_resp.explanation
                llm_provider_used = expl_resp.provider_used
            except Exception as e:
                logger.warning("LLM explanation generation error: %s. Using fallback.", str(e))
                if selection_response.explanation_data:
                    from llm.models import ExplanationInput
                    ed = selection_response.explanation_data
                    inp = ExplanationInput(
                        selected_plan=ed.selected_plan,
                        strategy=ed.strategy,
                        score=ed.score,
                        corridor_code=request.corridor_code,
                        metrics=ed.metrics,
                        key_decisions=ed.key_decisions,
                        tradeoffs=ed.tradeoffs,
                        scheduled_priority_tasks=ed.scheduled_priority_tasks,
                        unscheduled_priority_tasks=ed.unscheduled_priority_tasks,
                        major_constraints=ed.major_constraints,
                        alternatives=ed.alternatives
                    )
                    explanation_obj = DeterministicExplanationEngine.generate(inp)
                    llm_provider_used = "deterministic"

        stage_durations["6_explanation_cascade"] = round((time.perf_counter() - s11_start) * 1000.0, 1)

        # ----------------------------------------------------------------
        # Stage 12: Final Prompt 6 Hard-Constraint Safety Gate
        # ----------------------------------------------------------------
        s12_start = time.perf_counter()
        winning_plan_result = next(
            (p for p in opt_response.plans if p.plan_reference == selection_response.selected_plan.plan_reference),
            opt_response.plans[0]
        )

        safety_report = self._run_final_hard_constraint_safety_check(
            plan=winning_plan_result,
            requests=requests,
            trains=trains,
            windows=windows,
            corridor_code=request.corridor_code,
            horizon_start=horizon_start,
            horizon_end=horizon_end
        )
        stage_durations["7_safety_validation_gate"] = round((time.perf_counter() - s12_start) * 1000.0, 1)

        # Strict safety invariant: If ANY hard constraint failed, disqualify immediately!
        if not safety_report.is_feasible:
            logger.error("SAFETY GATE FAILED: Winning plan [%s] violated %d hard constraints!",
                         winning_plan_result.plan_reference, safety_report.total_violations)
            total_time = round((time.perf_counter() - pipeline_start) * 1000.0, 1)
            return PlanningPipelineResponse(
                planning_run_id=run_id,
                corridor_code=request.corridor_code,
                pipeline_status="NO_FEASIBLE_PLAN",
                data_source=data_src_used,
                stage_durations_ms=stage_durations,
                total_execution_time_ms=total_time,
                message=f"Plan rejected by final safety gate: {safety_report.violations[0].violated_constraint}",
                model_versions=self._get_model_versions()
            )

        # ----------------------------------------------------------------
        # Stage 13: Final Unified Planning Response Assembly
        # ----------------------------------------------------------------
        total_pipeline_time = round((time.perf_counter() - pipeline_start) * 1000.0, 1)
        scheduled_assignments = winning_plan_result.scheduled_assignments or []
        grouped_tasks = [a for a in scheduled_assignments if a.is_shadow_block]
        unscheduled_list = winning_plan_result.unscheduled_requests or []

        warnings_list = (explanation_obj.warnings if explanation_obj else []) + [
            f"Caution order: Enforce temporary speed restriction on KM {a.task_code}" for a in scheduled_assignments if getattr(a, "speed_restriction_kmph", 0) > 0
        ]
        # Deduplicate warnings
        clean_warnings = list(dict.fromkeys(warnings_list))

        response = PlanningPipelineResponse(
            planning_run_id=run_id,
            corridor_code=request.corridor_code,
            generated_at=datetime.now(timezone.utc),
            pipeline_status="SUCCESS",
            data_source=data_src_used,
            selected_plan=selection_response.selected_plan,
            alternative_plans=selection_response.ranked_alternatives,
            scheduled_blocks=scheduled_assignments,
            grouped_tasks=grouped_tasks,
            unscheduled_requests=unscheduled_list,
            predicted_metrics={
                "mean_predicted_duration_minutes": round(sum(a.duration_minutes for a in scheduled_assignments) / max(1, len(scheduled_assignments)), 1),
                "scheduled_tasks_count": len(scheduled_assignments),
                "unscheduled_tasks_count": len(unscheduled_list)
            },
            optimization_metrics={
                "solver_status": winning_plan_result.metrics.solver_status,
                "solve_time_ms": winning_plan_result.metrics.solve_time_ms,
                "objective_score": winning_plan_result.metrics.objective_score,
                "schedule_rate_pct": winning_plan_result.metrics.schedule_rate_pct
            },
            score=selection_response.score,
            score_breakdown=selection_response.score_breakdown,
            conflicts=[],
            warnings=clean_warnings,
            explanation=explanation_obj,
            llm_provider=llm_provider_used,
            model_versions=self._get_model_versions(),
            optimizer_status=winning_plan_result.metrics.solver_status,
            stage_durations_ms=stage_durations,
            total_execution_time_ms=total_pipeline_time,
            message=f"Optimal block plan '{winning_plan_result.plan_reference}' ({winning_plan_result.strategy}) generated and verified with 100% constraint safety."
        )

        # Cache run for status inquiries
        _PLANNING_RUN_CACHE[run_id] = response
        logger.info("Automatic Block Planning completed in %.1fms (Status: %s, Score: %.2f)",
                    total_pipeline_time, response.pipeline_status, response.score)

        return response

    async def _ingest_data(
        self,
        request: PlanningPipelineRequest
    ) -> Tuple[List[MaintenanceRequestItem], List[BlockWindowSummary], List[TrainMovementSummary], str]:
        """Ingests raw planning inputs based on requested data_source."""
        # 1. Inline payload override
        if request.data_source == "INLINE_PAYLOAD" and request.inline_requests is not None:
            return (
                request.inline_requests or [],
                request.inline_windows or [],
                request.inline_trains or [],
                "INLINE_PAYLOAD"
            )

        # 2. Explicit Synthetic dataset simulation
        if request.data_source == "SYNTHETIC_DATASET":
            generator = RailwaySyntheticGenerator(seed=42)
            sample_df, _ = generator.generate_dataset(n_records=10, corridors=[request.corridor_code])
            now = datetime.now(timezone.utc)

            reqs = []
            for idx, row in sample_df.iterrows():
                dept = str(row.get("feat_department") or row.get("department") or "ENGG")
                mtype = str(row.get("feat_maint_type") or row.get("maintenance_type") or "TRACK_TAMPING")
                atype = str(row.get("feat_asset_type") or row.get("asset_type") or "TRACK")
                prio = int(row.get("feat_priority") or row.get("priority") or 3)
                crit = str(row.get("feat_asset_criticality") or row.get("criticality") or "MEDIUM")
                urg = str(row.get("feat_task_urgency") or row.get("urgency") or "MEDIUM")
                dur = float(row.get("raw_requested_duration_minutes") or row.get("requested_duration_minutes") or 120.0)
                tblk = bool(row.get("feat_traffic_block_req") if "feat_traffic_block_req" in row else row.get("traffic_block_required", True))
                pblk = bool(row.get("feat_power_block_req") if "feat_power_block_req" in row else row.get("power_block_required", False))

                reqs.append(
                    MaintenanceRequestItem(
                        task_id=f"SYN-TASK-{idx+1:03d}",
                        task_code=f"{dept}-{mtype[:4]}-{idx+1:02d}",
                        department=dept,
                        maintenance_type=mtype,
                        asset_id=f"SYN-AST-{idx+1:03d}",
                        asset_code=f"AST-{dept}-{idx+1:02d}",
                        asset_type=atype,
                        start_kilometer=float(idx * 60.0),
                        end_kilometer=float(idx * 60.0 + 4.0),
                        requested_duration_minutes=dur,
                        priority=prio,
                        criticality=crit,
                        urgency=urg,
                        traffic_block_required=tblk,
                        power_block_required=pblk
                    )
                )

            wins = [
                BlockWindowSummary(
                    window_id="SYN-WIN-001",
                    corridor_code=request.corridor_code,
                    start_time=now + timedelta(hours=1),
                    end_time=now + timedelta(hours=4),
                    duration_minutes=180.0
                ),
                BlockWindowSummary(
                    window_id="SYN-WIN-002",
                    corridor_code=request.corridor_code,
                    start_time=now + timedelta(hours=5),
                    end_time=now + timedelta(hours=8),
                    duration_minutes=180.0
                )
            ]

            trains = [
                TrainMovementSummary(
                    train_id="SYN-TRN-101",
                    train_number="12004",
                    scheduled_start_time=now + timedelta(hours=8, minutes=30),
                    scheduled_end_time=now + timedelta(hours=9, minutes=30),
                    is_high_priority=True
                )
            ]

            return reqs[:4], wins, trains, "SYNTHETIC_DATASET"

        # 3. Default: Real Backend / Supabase
        try:
            raw = await self.data_access.get_planning_data(
                corridor_code=request.corridor_code,
                horizon_start=request.horizon_start.isoformat() if request.horizon_start else None,
                horizon_end=request.horizon_end.isoformat() if request.horizon_end else None
            )

            now = datetime.now(timezone.utc)
            reqs: List[MaintenanceRequestItem] = []
            for t in raw.get("maintenanceTasks", []):
                reqs.append(
                    MaintenanceRequestItem(
                        task_id=t.get("id", f"TSK-{len(reqs)+1}"),
                        task_code=t.get("task_code", f"TASK-{len(reqs)+1}"),
                        department=t.get("department_code") or t.get("department") or "ENGG",
                        maintenance_type=t.get("maintenance_type", "TRACK_TAMPING"),
                        asset_id=t.get("asset_id", f"AST-{len(reqs)+1}"),
                        asset_code=t.get("asset_code", "ASSET-GENERIC"),
                        start_kilometer=float(t.get("start_kilometer", 0.0) or 0.0),
                        end_kilometer=float(t.get("end_kilometer", 1.0) or 1.0),
                        requested_duration_minutes=float(t.get("duration_minutes", 120.0)),
                        priority=int(t.get("priority", 3)),
                        criticality=t.get("criticality", "MEDIUM"),
                        urgency=t.get("urgency", "MEDIUM"),
                        traffic_block_required=bool(t.get("traffic_block_required", True)),
                        power_block_required=bool(t.get("power_block_required", False))
                    )
                )

            wins: List[BlockWindowSummary] = []
            for w in raw.get("blockWindows", []):
                st = datetime.fromisoformat(w["start_time"].replace("Z", "+00:00")) if "start_time" in w else now + timedelta(hours=1)
                et = datetime.fromisoformat(w["end_time"].replace("Z", "+00:00")) if "end_time" in w else st + timedelta(hours=3)
                wins.append(
                    BlockWindowSummary(
                        window_id=w.get("id", f"WIN-{len(wins)+1}"),
                        corridor_code=request.corridor_code,
                        start_time=st,
                        end_time=et,
                        duration_minutes=float(w.get("duration_minutes", 180.0)),
                        block_type=w.get("block_type", "TRAFFIC_BLOCK")
                    )
                )

            trains: List[TrainMovementSummary] = []
            for m in raw.get("trainMovements", []):
                st = datetime.fromisoformat(m["scheduled_start_time"].replace("Z", "+00:00")) if "scheduled_start_time" in m else now + timedelta(hours=4)
                et = datetime.fromisoformat(m["scheduled_end_time"].replace("Z", "+00:00")) if "scheduled_end_time" in m else st + timedelta(hours=2)
                prio = int(m.get("priority", 3))
                trains.append(
                    TrainMovementSummary(
                        train_id=m.get("id", f"TRN-{len(trains)+1}"),
                        train_number=m.get("train_number", "12001"),
                        scheduled_start_time=st,
                        scheduled_end_time=et,
                        priority=prio,
                        is_high_priority=(prio <= 2)
                    )
                )

            return reqs, wins, trains, "REAL_BACKEND"

        except Exception as e:
            logger.warning("Live backend planning data fetch failed (%s). Falling back to inline or synthetic.", str(e))
            if request.inline_requests:
                return request.inline_requests, request.inline_windows or [], request.inline_trains or [], "INLINE_PAYLOAD"
            raise RuntimeError(f"Backend data extraction error: {str(e)}") from e

    def _resolve_horizon(
        self,
        request: PlanningPipelineRequest,
        windows: List[BlockWindowSummary],
        trains: List[TrainMovementSummary]
    ) -> Tuple[datetime, datetime]:
        """Resolves unambiguous planning horizon start and end timestamps."""
        now = datetime.now(timezone.utc)
        start = request.horizon_start
        end = request.horizon_end

        if not start:
            if windows:
                start = min(w.start_time for w in windows) - timedelta(minutes=30)
            else:
                start = now

        if not end:
            if windows:
                end = max(w.end_time for w in windows) + timedelta(minutes=60)
            else:
                end = start + timedelta(hours=24)

        if end <= start:
            end = start + timedelta(hours=12)

        return start, end

    def _enrich_requests_with_ml(
        self,
        requests: List[MaintenanceRequestItem],
        corridor_code: str
    ) -> List[MaintenanceRequestItem]:
        """Runs Prompt 5 vectorized batch ML predictions on candidate maintenance requests."""
        if not requests:
            return requests

        payload = []
        for r in requests:
            payload.append({
                "candidate_id": r.task_id,
                "corridor_code": corridor_code,
                "department": r.department,
                "maintenance_type": r.maintenance_type,
                "asset_type": r.asset_type,
                "priority": r.priority,
                "traffic_block_required": r.traffic_block_required,
                "power_block_required": r.power_block_required,
                "speed_restriction_kmph": r.speed_restriction_kmph,
                "requested_duration_minutes": r.requested_duration_minutes
            })

        try:
            res = self.batch_predictor.predict_candidates(payload)
            if res.success and res.predictions:
                pred_map = {p.candidate_id: p for p in res.predictions}
                for r in requests:
                    if r.task_id in pred_map:
                        p = pred_map[r.task_id]
                        r.ml_predicted_duration_minutes = p.predicted_duration_minutes
                        r.ml_predicted_risk_tier = p.predicted_risk_tier
                        r.ml_predicted_impact = p.predicted_operational_impact
        except Exception as e:
            logger.warning("Batch ML inference skipped with fallback: %s", str(e))

        return requests

    def _run_final_hard_constraint_safety_check(
        self,
        plan: OptimizationPlanResult,
        requests: List[MaintenanceRequestItem],
        trains: List[TrainMovementSummary],
        windows: List[BlockWindowSummary],
        corridor_code: str,
        horizon_start: datetime,
        horizon_end: datetime
    ) -> FeasibilityReport:
        """Exhaustively re-checks all hard constraints on the winning plan."""
        req_map = {r.task_id: r for r in requests}
        candidates = []
        for a in (plan.scheduled_assignments or []):
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
            plan_reference=plan.plan_reference,
            corridor_code=corridor_code,
            horizon_start=horizon_start,
            horizon_end=horizon_end,
            candidates=candidates
        )

        return self.constraint_engine.validate_plan(
            plan=plan_cand,
            trains=trains,
            windows=windows
        )

    def _extract_unscheduled(self, plan: OptimizationPlanResult) -> List[UnscheduledRequestReport]:
        return plan.unscheduled_requests or []

    def _get_model_versions(self) -> Dict[str, str]:
        """Extracts exact model and component versions."""
        return {
            "duration_model": "xgboost_duration_v1",
            "risk_model": "xgboost_risk_v1",
            "impact_model": "xgboost_impact_v1",
            "preprocessor": "preprocessor_pipeline_v1",
            "optimizer": "google_ortools_cp_sat_v9.15",
            "llm_primary": "gemini-2.5-flash",
            "llm_secondary": "groq_llama-3.3-70b-versatile"
        }

    @classmethod
    def get_cached_run(cls, run_id: str) -> Optional[PlanningPipelineResponse]:
        """Retrieves cached planning execution."""
        return _PLANNING_RUN_CACHE.get(run_id)


def get_block_planning_orchestrator() -> BlockPlanningOrchestrator:
    """Dependency provider for BlockPlanningOrchestrator."""
    return BlockPlanningOrchestrator()
