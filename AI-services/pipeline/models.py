from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from optimizer.models import (
    MaintenanceRequestItem,
    ScheduledBlockAssignment,
    UnscheduledRequestReport
)
from constraints.models import (
    TrainMovementSummary,
    BlockWindowSummary
)
from scoring.config import ScoringConfig
from scoring.models import ScoredPlan
from llm.models import StructuredPlanExplanation


class PlanningPipelineRequest(BaseModel):
    """
    Unified input payload for the Railway Automatic Block Planning Pipeline.
    Supports real backend fetching, synthetic simulation, or inline overrides.
    """
    corridor_code: str = Field(default="NDLS-CNB", description="Target railway corridor code (e.g. NDLS-CNB)")
    horizon_start: Optional[datetime] = Field(None, description="Planning window start timestamp")
    horizon_end: Optional[datetime] = Field(None, description="Planning window end timestamp")
    data_source: str = Field(
        default="REAL_BACKEND",
        description="Source of input planning records: 'REAL_BACKEND', 'SYNTHETIC_DATASET', or 'INLINE_PAYLOAD'"
    )
    inline_requests: Optional[List[MaintenanceRequestItem]] = Field(
        None, description="Optional explicit maintenance requests overriding data fetch"
    )
    inline_windows: Optional[List[BlockWindowSummary]] = Field(
        None, description="Optional explicit block windows overriding data fetch"
    )
    inline_trains: Optional[List[TrainMovementSummary]] = Field(
        None, description="Optional explicit scheduled trains overriding data fetch"
    )
    scoring_config: Optional[ScoringConfig] = Field(
        None, description="Optional custom multi-objective scoring weights and thresholds"
    )
    user_query: Optional[str] = Field(
        None, description="Optional specific planning question or focus for the AI explanation layer"
    )
    time_limit_seconds: Optional[float] = Field(
        None, description="Optional solver time budget in seconds"
    )
    force_deterministic_explanation: bool = Field(
        default=False, description="Forces rule-based explanation without calling external LLM APIs"
    )


class PlanningPipelineResponse(BaseModel):
    """
    Unified production output schema for the Indian Railways Block Planning System.
    Integrates Prompts 1 through 9 into a complete, transparent, and explainable block plan.
    """
    planning_run_id: str = Field(..., description="Unique UUID identifier for this planning execution")
    corridor_code: str = Field(..., description="Corridor code")
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Generation timestamp")
    pipeline_status: str = Field(..., description="Overall pipeline status: 'SUCCESS', 'NO_FEASIBLE_PLAN', 'DEGRADED', or 'FAILED'")
    data_source: str = Field(..., description="Data source used: 'REAL_BACKEND', 'SYNTHETIC_DATASET', or 'INLINE_PAYLOAD'")

    # Winning Plan & Alternatives
    selected_plan: Optional[ScoredPlan] = Field(None, description="Highest-scoring feasible block plan")
    alternative_plans: List[ScoredPlan] = Field(default_factory=list, description="Ranked alternative feasible plans")

    # Detailed Schedule Assignments
    scheduled_blocks: List[ScheduledBlockAssignment] = Field(default_factory=list, description="All scheduled maintenance block assignments")
    grouped_tasks: List[ScheduledBlockAssignment] = Field(default_factory=list, description="Co-scheduled compatible shadow blocks")
    unscheduled_requests: List[UnscheduledRequestReport] = Field(default_factory=list, description="Diagnostics for unscheduled maintenance")

    # Performance & Scoring Metrics
    predicted_metrics: Dict[str, Any] = Field(default_factory=dict, description="Aggregate ML inference summary")
    optimization_metrics: Dict[str, Any] = Field(default_factory=dict, description="OR-Tools solver diagnostics")
    score: float = Field(default=0.0, description="Winning plan composite score (0-100)")
    score_breakdown: Dict[str, Any] = Field(default_factory=dict, description="Weighted points across all 6 objectives")

    # Conflicts & Safety Warnings
    conflicts: List[Dict[str, Any]] = Field(default_factory=list, description="Detected conflicts safely averted or handled")
    warnings: List[str] = Field(default_factory=list, description="Operational cautions, speed restrictions, OHE isolations")

    # AI Intelligence Layer
    explanation: Optional[StructuredPlanExplanation] = Field(None, description="Natural-language reasoning and trade-off analysis")
    llm_provider: str = Field(default="deterministic", description="Provider used for explanation: 'gemini', 'groq', or 'deterministic'")

    # Metadata, Provenance & Observability
    model_versions: Dict[str, str] = Field(default_factory=dict, description="Versions of all ML models, preprocessor, solver, and LLM")
    optimizer_status: str = Field(default="OPTIMAL", description="OR-Tools solver terminal status")
    stage_durations_ms: Dict[str, float] = Field(default_factory=dict, description="Latency breakdown by pipeline stage in milliseconds")
    total_execution_time_ms: float = Field(default=0.0, description="Total end-to-end pipeline execution time in milliseconds")
    message: str = Field(default="Block planning pipeline completed successfully.", description="Status message")
