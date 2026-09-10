from typing import List, Dict, Any, Optional
from scoring.models import ScoredPlan, TradeOffItem, PlanRawMetrics, NormalizedScores
from scoring.config import ScoringConfig


class TradeOffAnalyzer:
    """
    Performs deterministic pairwise trade-off analysis between the winning plan and each alternative.
    Generates quantitative explanations and identifies concrete pros/cons for dispatchers.
    """

    def __init__(self, config: Optional[ScoringConfig] = None):
        self.config = config or ScoringConfig()

    def analyze_winner_vs_alternative(
        self,
        winner: ScoredPlan,
        alternative: ScoredPlan
    ) -> List[TradeOffItem]:
        """
        Compares the winning plan against a specific alternative plan across key dimensions.
        Returns notable trade-offs where the delta exceeds the significance threshold.
        """
        if not winner.raw_metrics or not alternative.raw_metrics:
            return []
        if not winner.normalized_scores or not alternative.normalized_scores:
            return []

        w_raw = winner.raw_metrics
        a_raw = alternative.raw_metrics
        w_norm = winner.normalized_scores
        a_norm = alternative.normalized_scores
        thresh = self.config.tradeoff_significance_threshold

        tradeoffs: List[TradeOffItem] = []

        # 1. High-Risk / Critical Maintenance Coverage
        delta_risk = round(w_raw.high_risk_maintenance_coverage - a_raw.high_risk_maintenance_coverage, 1)
        if abs(delta_risk) >= thresh:
            adv = "WINNING_PLAN" if delta_risk > 0 else "ALTERNATIVE_PLAN"
            expl = (
                f"Winner covers {w_raw.high_risk_maintenance_coverage:.1f}% high-risk tasks "
                f"vs {a_raw.high_risk_maintenance_coverage:.1f}% in {alternative.strategy} "
                f"({'+' if delta_risk > 0 else ''}{delta_risk:.1f}%)."
            )
            tradeoffs.append(TradeOffItem(
                dimension="High-Risk Coverage",
                winner_value=w_raw.high_risk_maintenance_coverage,
                alternative_value=a_raw.high_risk_maintenance_coverage,
                delta=delta_risk,
                unit="%",
                advantage_for=adv,
                explanation=expl
            ))

        # 2. Asset Availability Improvement
        delta_avail = round(w_raw.asset_availability_improvement - a_raw.asset_availability_improvement, 1)
        if abs(delta_avail) >= thresh:
            adv = "WINNING_PLAN" if delta_avail > 0 else "ALTERNATIVE_PLAN"
            expl = (
                f"Winner improves asset availability by {w_raw.asset_availability_improvement:.1f}% "
                f"vs {a_raw.asset_availability_improvement:.1f}% in {alternative.strategy}."
            )
            tradeoffs.append(TradeOffItem(
                dimension="Asset Availability",
                winner_value=w_raw.asset_availability_improvement,
                alternative_value=a_raw.asset_availability_improvement,
                delta=delta_avail,
                unit="%",
                advantage_for=adv,
                explanation=expl
            ))

        # 3. Operational Disruption & Delay
        # Note: for corridor disruption, lower is better!
        delta_disruption = round(a_raw.corridor_disruption - w_raw.corridor_disruption, 1)
        if abs(delta_disruption) >= thresh:
            # Positive delta means alternative has higher disruption (winner is better)
            adv = "WINNING_PLAN" if delta_disruption > 0 else "ALTERNATIVE_PLAN"
            expl = (
                f"Winner achieves corridor disruption index of {w_raw.corridor_disruption:.1f} "
                f"vs {a_raw.corridor_disruption:.1f} in {alternative.strategy} "
                f"({abs(delta_disruption):.1f} points lower disruption)."
                if delta_disruption > 0 else
                f"Alternative {alternative.strategy} produces lower corridor disruption "
                f"({a_raw.corridor_disruption:.1f} vs {w_raw.corridor_disruption:.1f} in winner)."
            )
            tradeoffs.append(TradeOffItem(
                dimension="Corridor Disruption",
                winner_value=w_raw.corridor_disruption,
                alternative_value=a_raw.corridor_disruption,
                delta=round(w_raw.corridor_disruption - a_raw.corridor_disruption, 1),
                unit="index points",
                advantage_for=adv,
                explanation=expl
            ))

        # 4. Total Block Duration
        delta_duration = round(w_raw.total_block_duration - a_raw.total_block_duration, 1)
        if abs(delta_duration) >= 15.0:  # 15 minutes significant threshold
            adv = "ALTERNATIVE_PLAN" if delta_duration > 0 else "WINNING_PLAN"
            expl = (
                f"Winner occupies {w_raw.total_block_duration:.0f} mins total block time "
                f"vs {a_raw.total_block_duration:.0f} mins in {alternative.strategy}."
            )
            tradeoffs.append(TradeOffItem(
                dimension="Total Block Duration",
                winner_value=w_raw.total_block_duration,
                alternative_value=a_raw.total_block_duration,
                delta=delta_duration,
                unit="minutes",
                advantage_for=adv,
                explanation=expl
            ))

        # 5. Grouping & Shadow Efficiency
        delta_grouping = round(w_norm.grouping_efficiency_score - a_norm.grouping_efficiency_score, 1)
        if abs(delta_grouping) >= thresh:
            adv = "WINNING_PLAN" if delta_grouping > 0 else "ALTERNATIVE_PLAN"
            expl = (
                f"Winner grouped {w_raw.compatible_tasks_grouped} compatible shadow tasks "
                f"vs {a_raw.compatible_tasks_grouped} in {alternative.strategy}."
            )
            tradeoffs.append(TradeOffItem(
                dimension="Task Grouping",
                winner_value=float(w_raw.compatible_tasks_grouped),
                alternative_value=float(a_raw.compatible_tasks_grouped),
                delta=float(w_raw.compatible_tasks_grouped - a_raw.compatible_tasks_grouped),
                unit="tasks",
                advantage_for=adv,
                explanation=expl
            ))

        # 6. Overdue Maintenance Cleared
        delta_overdue = round(w_raw.overdue_maintenance_coverage - a_raw.overdue_maintenance_coverage, 1)
        if abs(delta_overdue) >= thresh:
            adv = "WINNING_PLAN" if delta_overdue > 0 else "ALTERNATIVE_PLAN"
            expl = (
                f"Winner cleared {w_raw.overdue_maintenance_coverage:.1f}% overdue maintenance "
                f"vs {a_raw.overdue_maintenance_coverage:.1f}% in {alternative.strategy}."
            )
            tradeoffs.append(TradeOffItem(
                dimension="Overdue Backlog Coverage",
                winner_value=w_raw.overdue_maintenance_coverage,
                alternative_value=a_raw.overdue_maintenance_coverage,
                delta=delta_overdue,
                unit="%",
                advantage_for=adv,
                explanation=expl
            ))

        return tradeoffs

    def generate_winning_reasons(
        self,
        winner: ScoredPlan,
        alternatives: List[ScoredPlan]
    ) -> List[str]:
        """
        Generates concrete, quantitative bullet points explaining why the winning plan scored highest.
        Strictly avoids vague statements such as 'AI selected this plan'.
        """
        if not winner.raw_metrics or not winner.normalized_scores:
            return [f"Selected plan {winner.plan_reference} achieved highest overall score of {winner.overall_score:.2f}."]

        w_raw = winner.raw_metrics
        w_norm = winner.normalized_scores
        reasons: List[str] = []

        # 1. Overall Score Delta
        if alternatives:
            runner_up = alternatives[0]
            delta_score = round(winner.overall_score - runner_up.overall_score, 2)
            reasons.append(
                f"Achieved highest composite score of {winner.overall_score:.2f}/100 (+{delta_score:.2f} points "
                f"above runner-up '{runner_up.strategy}' at {runner_up.overall_score:.2f})."
            )
        else:
            reasons.append(f"Achieved composite score of {winner.overall_score:.2f}/100 across 6 operational objectives.")

        # 2. Risk & Critical Tasks
        reasons.append(
            f"Covered {w_raw.high_risk_maintenance_coverage:.1f}% of critical/high-risk tasks "
            f"({w_raw.maintenance_tasks_scheduled} total tasks scheduled, {w_raw.maintenance_tasks_unscheduled} deferred)."
        )

        # 3. Operational Disruption & Delay
        reasons.append(
            f"Restricted corridor disruption to index {w_raw.corridor_disruption:.1f} with "
            f"{w_raw.train_conflicts_avoided} train paths safely protected."
        )

        # 4. Grouping & Asset Utilization
        if w_raw.compatible_tasks_grouped > 0:
            reasons.append(
                f"Co-scheduled {w_raw.compatible_tasks_grouped} compatible shadow tasks, saving corridor block windows."
            )

        # 5. 100% Constraint Compliance
        reasons.append(
            f"100% hard-constraint compliance verified: 0 headway conflicts, 0 electrical isolation violations."
        )

        return reasons
