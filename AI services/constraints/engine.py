from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import pandas as pd

from constraints.config import ConstraintConfig, get_default_constraint_config
from constraints.models import (
    BlockCandidate,
    TrainMovementSummary,
    BlockWindowSummary,
    ConflictViolation,
    ConflictType,
    Severity,
    CompatibilityResult,
    FeasibilityReport,
    SoftMetricsSummary,
    BlockPlanCandidate
)
from constraints.compatibility import TaskCompatibilityEngine
from constraints.conflicts import ConflictDetector
from utils.logger import get_logger

logger = get_logger("constraint_engine")


class ConstraintEngine:
    """
    Unified Railway Hard-Constraint, Task Compatibility, and Conflict-Validation Engine.
    Operates as the deterministic validation bridge between ML predictions (Prompt 5)
    and OR-Tools constraint optimization (Prompt 7).
    """

    def __init__(
        self,
        config: Optional[ConstraintConfig] = None,
        compatibility_engine: Optional[TaskCompatibilityEngine] = None,
        conflict_detector: Optional[ConflictDetector] = None
    ):
        self.config = config or get_default_constraint_config()
        self.compatibility_engine = compatibility_engine or TaskCompatibilityEngine(self.config)
        self.conflict_detector = conflict_detector or ConflictDetector(self.config, self.compatibility_engine)

    def validate_candidate(self, candidate: BlockCandidate) -> List[ConflictViolation]:
        """
        Validates internal consistency of an individual block candidate (timing, duration).
        """
        violations = self.conflict_detector.check_timing_and_duration(candidate)
        return violations

    def check_compatibility(
        self,
        task_a: BlockCandidate,
        task_b: BlockCandidate
    ) -> CompatibilityResult:
        """
        Evaluates whether two maintenance tasks can share a block or run as a shadow pair.
        """
        return self.compatibility_engine.check_compatibility(task_a, task_b)

    def find_conflicts(
        self,
        candidate: BlockCandidate,
        existing_blocks: Optional[List[BlockCandidate]] = None,
        trains: Optional[List[TrainMovementSummary]] = None,
        windows: Optional[List[BlockWindowSummary]] = None
    ) -> List[ConflictViolation]:
        """
        Finds all constraint violations if the given candidate is added to existing schedule.
        Checks timing, block-vs-block, block-vs-train, block-vs-window, dependencies, and resources.
        """
        existing = existing_blocks or []
        train_list = trains or []
        win_list = windows or []

        violations: List[ConflictViolation] = []

        # 1. Candidate internal validation
        violations.extend(self.validate_candidate(candidate))

        # 2. Candidate vs Existing Blocks
        for ex in existing:
            violations.extend(self.conflict_detector.check_block_vs_block(candidate, ex))

        # 3. Candidate vs Trains
        for trn in train_list:
            violations.extend(self.conflict_detector.check_block_vs_train(candidate, trn))

        # 4. Candidate vs Assigned Block Window
        if candidate.assigned_window_id:
            matched_win = next((w for w in win_list if w.window_id == candidate.assigned_window_id), None)
            if matched_win:
                violations.extend(self.conflict_detector.check_block_vs_window(candidate, matched_win))

        # 5. Dependencies
        all_blocks = existing + [candidate]
        violations.extend(self.conflict_detector.check_dependencies(candidate, all_blocks))

        # 6. Aggregate Resource Capacities
        violations.extend(self.conflict_detector.check_aggregate_resource_capacities(all_blocks))

        return violations

    def validate_plan(
        self,
        plan: BlockPlanCandidate,
        trains: Optional[List[TrainMovementSummary]] = None,
        windows: Optional[List[BlockWindowSummary]] = None
    ) -> FeasibilityReport:
        """
        Exhaustively validates an entire block plan against all Railway hard constraints.
        Distinguishes feasible vs infeasible, returning all detected violations without hiding any.
        """
        all_violations: List[ConflictViolation] = []
        train_list = trains or []
        win_map = {w.window_id: w for w in (windows or [])}
        candidates = plan.candidates

        # 1. Individual timing & duration validation
        for c in candidates:
            all_violations.extend(self.validate_candidate(c))

        # 2. Pairwise Block vs Block Conflicts
        n = len(candidates)
        for i in range(n):
            for j in range(i + 1, n):
                all_violations.extend(self.conflict_detector.check_block_vs_block(candidates[i], candidates[j]))

        # 3. Blocks vs Trains
        for c in candidates:
            for trn in train_list:
                all_violations.extend(self.conflict_detector.check_block_vs_train(c, trn))

        # 4. Blocks vs Windows
        for c in candidates:
            if c.assigned_window_id and c.assigned_window_id in win_map:
                all_violations.extend(self.conflict_detector.check_block_vs_window(c, win_map[c.assigned_window_id]))

        # 5. Inter-task Dependencies
        for c in candidates:
            all_violations.extend(self.conflict_detector.check_dependencies(c, candidates))

        # 6. Aggregate Resources (Crews & Machinery)
        all_violations.extend(self.conflict_detector.check_aggregate_resource_capacities(candidates))

        # Deduplicate violations with identical conflict_type and involved_ids
        unique_violations: List[ConflictViolation] = []
        seen = set()
        for v in all_violations:
            key = (v.conflict_type, tuple(sorted(v.involved_ids)))
            if key not in seen:
                seen.add(key)
                unique_violations.append(v)

        crit_count = sum(1 for v in unique_violations if v.severity == Severity.CRITICAL)
        is_feas = len(unique_violations) == 0

        return FeasibilityReport(
            is_feasible=is_feas,
            total_violations=len(unique_violations),
            critical_violations=crit_count,
            violations=unique_violations,
            evaluated_block_count=len(candidates),
            evaluated_train_count=len(train_list)
        )

    def is_feasible(
        self,
        plan: BlockPlanCandidate,
        trains: Optional[List[TrainMovementSummary]] = None,
        windows: Optional[List[BlockWindowSummary]] = None
    ) -> bool:
        """Fast boolean check for overall plan feasibility."""
        report = self.validate_plan(plan, trains=trains, windows=windows)
        return report.is_feasible

    def calculate_soft_metrics(
        self,
        plan: BlockPlanCandidate,
        trains: Optional[List[TrainMovementSummary]] = None
    ) -> SoftMetricsSummary:
        """
        Calculates measurable preference metrics for Prompt 7 OR-Tools objective guidance.
        Computes composite objective cost based on operational disruption, grouping, and priorities.
        """
        candidates = plan.candidates
        total_blocks = len(candidates)
        if total_blocks == 0:
            return SoftMetricsSummary()

        train_list = trains or []
        w = self.config.soft_weights

        # 1. Total Planned Block Minutes
        total_minutes = sum(c.duration_minutes for c in candidates)

        # 2. Train Conflicts & High-Priority Train Overlaps
        reg_conflicts = 0
        high_prio_conflicts = 0

        for c in candidates:
            if not c.traffic_block_required:
                continue
            for t in train_list:
                # Direct overlap check
                if (c.start_time < t.scheduled_end_time) and (c.end_time > t.scheduled_start_time):
                    if t.is_high_priority:
                        high_prio_conflicts += 1
                    else:
                        reg_conflicts += 1

        est_delay_mins = (reg_conflicts * 20.0) + (high_prio_conflicts * 45.0)

        # 3. Shadow / Grouping Efficiency
        shadow_count = sum(1 for c in candidates if c.is_shadow_block)
        shadow_eff_pct = round((shadow_count / total_blocks) * 100.0, 1)

        # 4. Priority & Urgency Coverage
        overdue_scheduled = sum(1 for c in candidates if c.is_overdue or c.days_until_required < 0)
        high_prio_tasks = sum(1 for c in candidates if c.priority <= 2)
        high_prio_coverage_pct = round((high_prio_tasks / total_blocks) * 100.0, 1)

        # 5. Average Operational Friction (from ML or calculated)
        impact_scores = [
            c.ml_predicted_impact if c.ml_predicted_impact is not None else 35.0
            for c in candidates
        ]
        avg_impact = round(sum(impact_scores) / total_blocks, 2)

        # 6. Composite Objective Cost (Weighted Formulation for OR-Tools)
        # Cost = train_disruption + overdue_penalty - shadow_bonus + duration_cost + friction_cost
        cost = (
            (reg_conflicts * w.get("weight_train_conflict_regular", 50.0)) +
            (high_prio_conflicts * w.get("weight_train_conflict_high_priority", 250.0)) +
            (overdue_scheduled * w.get("weight_overdue_penalty", 100.0)) +
            (shadow_count * w.get("weight_shadow_grouping_bonus", -40.0)) +
            (total_minutes * w.get("weight_duration_utilization", 1.0) * 0.05) +
            (avg_impact * w.get("weight_operational_friction", 2.0))
        )

        return SoftMetricsSummary(
            total_block_minutes=round(total_minutes, 1),
            total_train_conflicts=reg_conflicts,
            high_priority_train_conflicts=high_prio_conflicts,
            estimated_train_delay_minutes=round(est_delay_mins, 1),
            shadow_grouping_count=shadow_count,
            shadow_grouping_efficiency_pct=shadow_eff_pct,
            overdue_tasks_scheduled=overdue_scheduled,
            high_priority_task_coverage_pct=high_prio_coverage_pct,
            average_operational_impact=avg_impact,
            composite_objective_cost=round(cost, 2)
        )

    def enrich_with_ml(self, candidate: BlockCandidate) -> BlockCandidate:
        """
        Enriches candidate block with ML predictions (Duration, Risk tier, Operational impact)
        using Prompt 5 serving infrastructure. ML predictions enrich candidates without
        overriding safety constraints.
        """
        try:
            import importlib
            batch_predictor_module = importlib.import_module("models.batch_predictor")
            predictor = batch_predictor_module.get_batch_predictor()
            item_payload = {
                "candidate_id": candidate.candidate_id,
                "corridor_code": candidate.corridor_code,
                "department": candidate.department,
                "maintenance_type": candidate.maintenance_type,
                "asset_type": candidate.asset_type,
                "priority": candidate.priority,
                "traffic_block_required": candidate.traffic_block_required,
                "power_block_required": candidate.power_block_required,
                "speed_restriction_kmph": candidate.speed_restriction_kmph,
                "days_until_required": candidate.days_until_required,
                "is_overdue": candidate.is_overdue
            }

            res = predictor.predict_candidates([item_payload])
            if res.success and res.predictions:
                p = res.predictions[0]
                candidate.ml_predicted_duration_minutes = p.predicted_duration_minutes
                candidate.ml_predicted_risk_tier = p.predicted_risk_tier
                candidate.ml_predicted_risk_confidence = p.risk_confidence
                candidate.ml_predicted_impact = p.predicted_operational_impact

        except Exception as e:
            logger.warning("ML prediction enrichment skipped for candidate %s: %s", candidate.candidate_id, str(e))

        return candidate


def get_constraint_engine() -> ConstraintEngine:
    """Dependency provider for ConstraintEngine."""
    return ConstraintEngine()
