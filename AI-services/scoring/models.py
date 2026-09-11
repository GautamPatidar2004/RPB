from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class PlanRawMetrics(BaseModel):
    """
    Measurable, objective metrics computed for a block plan candidate.
    Captures all 13 operational dimensions required by Indian Railways dispatchers.
    """
    asset_availability_improvement: float = Field(..., description="Estimated asset availability improvement percentage (0-100%)")
    high_risk_maintenance_coverage: float = Field(..., description="Coverage percentage of Priority 1-2 and high-risk tasks (0-100%)")
    overdue_maintenance_coverage: float = Field(..., description="Coverage percentage of overdue maintenance tasks (0-100%)")
    total_block_duration: float = Field(..., description="Total duration of all scheduled blocks in minutes")
    number_of_blocks: int = Field(..., description="Total count of scheduled maintenance blocks")
    train_conflicts_avoided: int = Field(..., description="Count of train conflicts successfully averted by scheduling buffer")
    operational_impact: float = Field(..., description="Mean operational disruption score across scheduled tasks (0-100, lower is better)")
    maintenance_tasks_scheduled: int = Field(..., description="Count of successfully scheduled maintenance tasks")
    maintenance_tasks_unscheduled: int = Field(..., description="Count of unscheduled maintenance tasks")
    compatible_tasks_grouped: int = Field(..., description="Count of compatible tasks co-located or executed as shadow blocks")
    resource_utilization: float = Field(..., description="Effective resource (crew/machinery) utilization percentage (0-100%)")
    corridor_disruption: float = Field(..., description="Corridor traffic disruption index combining delay and block footprint")
    overall_constraint_compliance: float = Field(..., description="Constraint compliance percentage (100.0% for feasible plans)")


class NormalizedScores(BaseModel):
    """
    Normalized 0.0 to 100.0 objective sub-scores for consistent cross-plan ranking.
    Higher score is strictly better for all dimensions.
    """
    asset_availability_score: float = Field(..., ge=0.0, le=100.0, description="Asset availability improvement score (0-100)")
    risk_priority_score: float = Field(..., ge=0.0, le=100.0, description="Risk and critical task coverage score (0-100)")
    operational_efficiency_score: float = Field(..., ge=0.0, le=100.0, description="Operational efficiency / minimal disruption score (0-100)")
    block_efficiency_score: float = Field(..., ge=0.0, le=100.0, description="Block compactness and window utilization score (0-100)")
    grouping_efficiency_score: float = Field(..., ge=0.0, le=100.0, description="Compatible task shadow grouping score (0-100)")
    overdue_maintenance_score: float = Field(..., ge=0.0, le=100.0, description="Overdue backlog clearance score (0-100)")


class TradeOffItem(BaseModel):
    """
    Quantified pairwise trade-off between the winning plan and an alternative plan.
    Provides clear, numeric deltas without vague AI generalities.
    """
    dimension: str = Field(..., description="Performance dimension (e.g. Asset Coverage, Operational Disruption)")
    winner_value: float = Field(..., description="Value achieved by the winning plan")
    alternative_value: float = Field(..., description="Value achieved by the alternative plan")
    delta: float = Field(..., description="Difference (winner_value - alternative_value)")
    unit: str = Field(default="points", description="Measurement unit (e.g. %, mins, count, points)")
    advantage_for: str = Field(..., description="Who wins this dimension: 'WINNING_PLAN' or 'ALTERNATIVE_PLAN'")
    explanation: str = Field(..., description="Precise quantitative trade-off explanation")


class ScoredPlan(BaseModel):
    """
    A block plan candidate evaluated, scored, and ranked.
    Preserves all original assignments, raw metrics, normalized sub-scores, and feasibility diagnostics.
    """
    plan_reference: str = Field(..., description="Unique plan reference identifier")
    strategy: str = Field(..., description="Strategy profile used (e.g. BALANCED, ASSET_PRIORITY_FIRST)")
    is_feasible: bool = Field(..., description="Whether plan passed all Prompt 6 hard constraints")
    rejection_reason: Optional[str] = Field(None, description="Detailed reason if plan was marked infeasible")
    raw_metrics: Optional[PlanRawMetrics] = Field(None, description="13 objective raw metrics")
    normalized_scores: Optional[NormalizedScores] = Field(None, description="6 normalized 0-100 sub-scores")
    overall_score: float = Field(default=0.0, ge=0.0, le=100.0, description="Weighted composite score (0-100)")
    rank: Optional[int] = Field(None, ge=1, description="Rank among feasible plans (1 = best)")
    scheduled_tasks_count: int = Field(default=0, description="Count of scheduled tasks")
    unscheduled_tasks_count: int = Field(default=0, description="Count of unscheduled tasks")
    scheduled_task_ids: List[str] = Field(default_factory=list, description="IDs of scheduled tasks")
    unscheduled_task_ids: List[str] = Field(default_factory=list, description="IDs of unscheduled tasks")


class StructuredExplanationData(BaseModel):
    """
    Clean, structured explanation payload designed for consumption by Prompt 9 (Gemini/Groq).
    No natural language AI hallucinations; purely verified quantitative planning data.
    """
    selected_plan: str = Field(..., description="Plan reference of the winning plan")
    strategy: str = Field(..., description="Optimization strategy of the selected plan")
    score: float = Field(..., description="Composite overall score (0-100)")
    metrics: Dict[str, Any] = Field(..., description="Complete dictionary of raw metrics and normalized sub-scores")
    key_decisions: List[str] = Field(default_factory=list, description="Key deterministic decisions made in this plan")
    tradeoffs: List[Dict[str, Any]] = Field(default_factory=list, description="Pairwise trade-offs versus each alternative plan")
    scheduled_priority_tasks: List[str] = Field(default_factory=list, description="Codes of high-priority (P1-P2) tasks scheduled")
    unscheduled_priority_tasks: List[str] = Field(default_factory=list, description="Codes of high-priority (P1-P2) tasks left unscheduled")
    major_constraints: List[str] = Field(default_factory=list, description="Key constraints respected (headway, isolation, machinery, crews)")
    alternatives: List[Dict[str, Any]] = Field(default_factory=list, description="Summary of evaluated alternative plans")


class PlanSelectionResponse(BaseModel):
    """
    Comprehensive output response for block plan evaluation, scoring, and selection.
    """
    success: bool = Field(default=True, description="Whether plan selection succeeded")
    corridor_code: str = Field(default="NDLS-CNB", description="Corridor code")
    selected_plan: Optional[ScoredPlan] = Field(None, description="The highest-scoring feasible plan")
    score: float = Field(default=0.0, description="Winning plan overall score")
    ranked_alternatives: List[ScoredPlan] = Field(default_factory=list, description="Other feasible plans in ranked order")
    infeasible_plans: List[ScoredPlan] = Field(default_factory=list, description="Plans rejected due to hard constraint violations")
    score_breakdown: Dict[str, Any] = Field(default_factory=dict, description="Detailed score component breakdown for winning plan")
    why_winner_won: List[str] = Field(default_factory=list, description="Quantitative reasons why winning plan scored higher")
    tradeoffs: List[TradeOffItem] = Field(default_factory=list, description="Measurable trade-offs against alternatives")
    explanation_data: Optional[StructuredExplanationData] = Field(None, description="Structured explanation payload for Prompt 9")
    message: str = Field(default="Plan evaluation and selection completed successfully.", description="Status message")
