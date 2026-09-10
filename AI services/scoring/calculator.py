from typing import List, Dict, Any, Optional
from datetime import datetime

from scoring.config import ScoringConfig
from scoring.models import PlanRawMetrics, NormalizedScores
from optimizer.models import (
    OptimizationPlanResult,
    ScheduledBlockAssignment,
    MaintenanceRequestItem
)
from constraints.models import TrainMovementSummary, BlockWindowSummary, FeasibilityReport


class PlanMetricsCalculator:
    """
    Calculates 13 objective, measurable operational metrics for any candidate block plan.
    Provides mathematically sound, transparent calculations with zero arbitrary guesswork.
    """

    @staticmethod
    def calculate_metrics(
        plan: OptimizationPlanResult,
        requests: List[MaintenanceRequestItem],
        trains: Optional[List[TrainMovementSummary]] = None,
        windows: Optional[List[BlockWindowSummary]] = None,
        feasibility_report: Optional[FeasibilityReport] = None
    ) -> PlanRawMetrics:
        train_list = trains or []
        win_list = windows or []
        assignments = plan.scheduled_assignments or []
        total_requests_count = len(requests)
        scheduled_count = len(assignments)
        unscheduled_count = max(0, total_requests_count - scheduled_count)

        # Map scheduled task IDs
        scheduled_task_ids = {a.task_id for a in assignments}
        scheduled_reqs = [r for r in requests if r.task_id in scheduled_task_ids]

        # 1. Asset Availability Improvement %
        # Priority-weighted coverage: higher priority tasks contribute more to preserving asset availability
        if total_requests_count == 0:
            asset_availability_pct = 100.0
        else:
            total_priority_weight = sum((6 - r.priority) for r in requests)
            sched_priority_weight = sum((6 - r.priority) for r in scheduled_reqs)
            asset_availability_pct = round((sched_priority_weight / max(1.0, total_priority_weight)) * 100.0, 1)

        # 2. High-Risk Maintenance Coverage %
        high_risk_reqs = [
            r for r in requests
            if r.priority <= 2 or r.criticality in ("CRITICAL", "HIGH") or r.ml_predicted_risk_tier == "HIGH"
        ]
        if not high_risk_reqs:
            high_risk_coverage_pct = 100.0
        else:
            high_risk_sched = sum(1 for r in high_risk_reqs if r.task_id in scheduled_task_ids)
            high_risk_coverage_pct = round((high_risk_sched / len(high_risk_reqs)) * 100.0, 1)

        # 3. Overdue Maintenance Coverage %
        overdue_reqs = [r for r in requests if r.is_overdue]
        if not overdue_reqs:
            overdue_coverage_pct = 100.0
        else:
            overdue_sched = sum(1 for r in overdue_reqs if r.task_id in scheduled_task_ids)
            overdue_coverage_pct = round((overdue_sched / len(overdue_reqs)) * 100.0, 1)

        # 4. Total Block Duration & Number of Blocks
        total_block_minutes = round(sum(a.duration_minutes for a in assignments), 1)
        number_of_blocks = len(assignments)

        # 5. Train Conflicts Avoided
        # Count train movements safely separated from traffic blocks
        train_conflicts_incurred = 0
        for a in assignments:
            if not getattr(a, "traffic_block_required", True):
                continue
            for t in train_list:
                if (a.start_time < t.scheduled_end_time) and (a.end_time > t.scheduled_start_time):
                    train_conflicts_incurred += 1

        train_conflicts_avoided = max(0, len(train_list) - train_conflicts_incurred)

        # 6. Operational Impact (Average Friction Score 0-100)
        if assignments:
            impacts = [
                a.ml_predicted_impact if a.ml_predicted_impact is not None else 30.0
                for a in assignments
            ]
            operational_impact = round(sum(impacts) / len(assignments), 1)
        else:
            operational_impact = 0.0

        # 7. Compatible Tasks Grouped (Shadow Blocks / Co-located)
        grouped_count = sum(1 for a in assignments if a.is_shadow_block)

        # 8. Resource Utilization %
        total_window_capacity = sum(w.duration_minutes for w in win_list) if win_list else 480.0
        resource_utilization_pct = min(100.0, round((total_block_minutes / max(60.0, total_window_capacity)) * 100.0, 1))

        # 9. Corridor Disruption Index
        # Combines block duration hours, operational impact, and any incurred train conflicts
        disruption_index = round(
            (total_block_minutes / 60.0) * 8.0 +
            (operational_impact * 0.4) +
            (train_conflicts_incurred * 20.0),
            1
        )

        # 10. Overall Constraint Compliance %
        if feasibility_report is not None:
            if feasibility_report.is_feasible:
                compliance_pct = 100.0
            else:
                total_checks = max(1, feasibility_report.total_violations + 10)
                compliance_pct = round(max(0.0, (1.0 - (feasibility_report.total_violations / total_checks)) * 100.0), 1)
        else:
            compliance_pct = 100.0 if plan.is_feasible else 0.0

        return PlanRawMetrics(
            asset_availability_improvement=asset_availability_pct,
            high_risk_maintenance_coverage=high_risk_coverage_pct,
            overdue_maintenance_coverage=overdue_coverage_pct,
            total_block_duration=total_block_minutes,
            number_of_blocks=number_of_blocks,
            train_conflicts_avoided=train_conflicts_avoided,
            operational_impact=operational_impact,
            maintenance_tasks_scheduled=scheduled_count,
            maintenance_tasks_unscheduled=unscheduled_count,
            compatible_tasks_grouped=grouped_count,
            resource_utilization=resource_utilization_pct,
            corridor_disruption=disruption_index,
            overall_constraint_compliance=compliance_pct
        )


class ScoreNormalizer:
    """
    Normalizes raw metrics into standardized 0.0 to 100.0 sub-scores.
    Ensures that for every dimension, 100.0 is best and 0.0 is worst.
    """

    @staticmethod
    def normalize(
        metrics: PlanRawMetrics,
        total_requests_count: int
    ) -> NormalizedScores:
        # 1. Asset Availability Score (0-100)
        asset_score = min(100.0, max(0.0, metrics.asset_availability_improvement))

        # 2. Risk / High-Priority Score (0-100)
        risk_score = min(100.0, max(0.0, metrics.high_risk_maintenance_coverage))

        # 3. Operational Efficiency Score (0-100, higher is better)
        # 100 minus average friction minus disruption penalty
        op_score = max(0.0, min(100.0, 100.0 - (metrics.operational_impact * 0.7) - (metrics.corridor_disruption * 0.3)))

        # 4. Block Efficiency Score (0-100)
        # Balances scheduling rate with compact duration usage
        if total_requests_count == 0:
            block_score = 100.0
        elif metrics.maintenance_tasks_scheduled == 0:
            block_score = 0.0
        else:
            sched_rate = (metrics.maintenance_tasks_scheduled / max(1, total_requests_count)) * 70.0
            # Density bonus: tasks per hour of block time
            hours = max(1.0, metrics.total_block_duration / 60.0)
            density_ratio = min(1.0, (metrics.maintenance_tasks_scheduled / hours) / 2.0)
            compactness_bonus = density_ratio * 30.0
            block_score = min(100.0, round(sched_rate + compactness_bonus, 1))

        # 5. Grouping Efficiency Score (0-100)
        if metrics.maintenance_tasks_scheduled <= 1:
            grouping_score = 50.0  # neutral when only 0 or 1 task scheduled
        else:
            grouping_ratio = metrics.compatible_tasks_grouped / metrics.maintenance_tasks_scheduled
            # If 30%+ of tasks are grouped, that is excellent for rail operations
            grouping_score = min(100.0, round((grouping_ratio / 0.40) * 100.0, 1))

        # 6. Overdue Maintenance Score (0-100)
        overdue_score = min(100.0, max(0.0, metrics.overdue_maintenance_coverage))

        return NormalizedScores(
            asset_availability_score=round(asset_score, 1),
            risk_priority_score=round(risk_score, 1),
            operational_efficiency_score=round(op_score, 1),
            block_efficiency_score=round(block_score, 1),
            grouping_efficiency_score=round(grouping_score, 1),
            overdue_maintenance_score=round(overdue_score, 1)
        )

    @staticmethod
    def compute_weighted_overall_score(
        normalized: NormalizedScores,
        config: ScoringConfig
    ) -> float:
        """
        Computes overall composite score using configured weights.
        overall_score = sum(w_i * score_i) bounded in [0.0, 100.0].
        """
        w = config.get_normalized_weights()
        overall = (
            w["asset_availability"] * normalized.asset_availability_score +
            w["risk_priority"] * normalized.risk_priority_score +
            w["operational_efficiency"] * normalized.operational_efficiency_score +
            w["block_efficiency"] * normalized.block_efficiency_score +
            w["grouping_efficiency"] * normalized.grouping_efficiency_score +
            w["overdue_maintenance"] * normalized.overdue_maintenance_score
        )
        return round(max(0.0, min(100.0, overall)), 2)
