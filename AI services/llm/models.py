from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class ExplanationInput(BaseModel):
    """
    Structured planning context supplied to the LLM explanation layer.
    Directly consumes the Prompt 8 output without asking the LLM to recalculate schedules.
    """
    selected_plan: str = Field(..., description="Plan reference identifier of winning plan")
    strategy: str = Field(..., description="Strategy profile used (e.g. BALANCED, ASSET_PRIORITY_FIRST)")
    score: float = Field(..., description="Overall composite score (0-100)")
    corridor_code: str = Field(default="NDLS-CNB", description="Corridor code")
    metrics: Dict[str, Any] = Field(default_factory=dict, description="Raw and normalized operational metrics")
    key_decisions: List[str] = Field(default_factory=list, description="List of key algorithmic decisions")
    tradeoffs: List[Dict[str, Any]] = Field(default_factory=list, description="Pairwise trade-offs vs alternatives")
    scheduled_priority_tasks: List[str] = Field(default_factory=list, description="Codes of scheduled high-priority tasks")
    unscheduled_priority_tasks: List[str] = Field(default_factory=list, description="Codes of unscheduled high-priority tasks")
    major_constraints: List[str] = Field(default_factory=list, description="Constraints satisfied (headway, isolation, resources)")
    alternatives: List[Dict[str, Any]] = Field(default_factory=list, description="Summaries of alternative candidate plans")
    user_query: Optional[str] = Field(None, description="Optional custom query from dispatcher")


class StructuredPlanExplanation(BaseModel):
    """
    Standardized, strictly validated structured explanation payload emitted by LLMs.
    Required fields capture all 10 essential dispatch perspectives.
    """
    summary: str = Field(..., description="Concise 2-3 sentence executive summary for rail controllers")
    selected_plan_reason: str = Field(..., description="Clear explanation of why this specific plan was selected")
    key_decisions: List[str] = Field(..., description="List of significant scheduling choices and alignments made")
    operational_impact: str = Field(..., description="Analysis of timetable impact, delays, and corridor disruption")
    asset_availability_impact: str = Field(..., description="Impact on asset health, reliability, and backlog clearing")
    priority_maintenance: List[str] = Field(..., description="Summary of high-risk and critical tasks addressed")
    unscheduled_tasks: List[str] = Field(..., description="Detailed reasons and next steps for unscheduled requests")
    tradeoffs: List[Dict[str, Any]] = Field(..., description="Quantified trade-offs against alternative plans")
    alternatives: List[Dict[str, Any]] = Field(..., description="Evaluation of runner-up plans and why they scored lower")
    warnings: List[str] = Field(default_factory=list, description="Safety alerts, speed restrictions, and cautionary notes")


class PlanExplanationResponse(BaseModel):
    """
    API response model for the plan explanation endpoint.
    Includes metadata on which provider/model succeeded and fallback diagnostics.
    """
    success: bool = Field(default=True, description="Whether explanation generation succeeded")
    explanation: StructuredPlanExplanation = Field(..., description="Validated structured explanation")
    provider_used: str = Field(..., description="Provider that generated explanation: 'gemini', 'groq', or 'deterministic'")
    model_used: Optional[str] = Field(None, description="Specific model name used")
    fallback_status: str = Field(
        ...,
        description="Status: 'PRIMARY_SUCCESS', 'SECONDARY_FALLBACK_SUCCESS', or 'DETERMINISTIC_FALLBACK'"
    )
    latency_ms: float = Field(default=0.0, description="End-to-end explanation latency in milliseconds")
    message: str = Field(default="Explanation generated successfully.", description="Status message")
