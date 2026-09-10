from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from optimizer.config import OptimizationStrategy
from constraints.models import TrainMovementSummary, BlockWindowSummary


class MaintenanceRequestItem(BaseModel):
    """Normalized incoming maintenance block request."""
    task_id: str = Field(..., description="Unique maintenance task identifier")
    task_code: str = Field(..., description="Human-readable task code (e.g. TRK-NDLS-001)")
    department: str = Field(default="ENGG", description="Department code: ENGG, SNT, or TRD")
    maintenance_type: str = Field(default="TRACK_TAMPING", description="Type of maintenance work")
    asset_id: str = Field(..., description="Target asset ID")
    asset_code: str = Field(default="ASSET-GENERIC", description="Human-readable asset code")
    asset_type: str = Field(default="TRACK", description="Target asset type")
    start_kilometer: float = Field(default=0.0, ge=0.0, description="Start kilometer point on corridor")
    end_kilometer: float = Field(default=1.0, ge=0.0, description="End kilometer point on corridor")
    requested_duration_minutes: float = Field(default=120.0, gt=0.0, description="Requested duration in minutes")
    priority: int = Field(default=3, ge=1, le=5, description="Priority rating (1=highest emergency, 5=routine)")
    criticality: str = Field(default="MEDIUM", description="Criticality rating: CRITICAL, HIGH, MEDIUM, LOW")
    urgency: str = Field(default="MEDIUM", description="Urgency rating: IMMEDIATE, HIGH, MEDIUM, LOW")
    required_by_date: Optional[datetime] = Field(None, description="Deadline by which task must be executed")
    is_overdue: bool = Field(default=False, description="Whether task is overdue")
    power_block_required: bool = Field(default=False, description="Whether OHE power shutoff is mandatory")
    traffic_block_required: bool = Field(default=True, description="Whether train traffic halt is mandatory")
    speed_restriction_kmph: float = Field(default=0.0, ge=0.0, description="Post-work speed restriction")
    machinery_required: Optional[str] = Field(None, description="Specialized machinery required")
    crew_required: int = Field(default=1, ge=1, description="Number of crews required")
    depends_on_task_ids: List[str] = Field(default_factory=list, description="List of prerequisite task IDs")

    # ML Enrichments from Prompt 5
    ml_predicted_duration_minutes: Optional[float] = Field(None, description="ML predicted duration")
    ml_predicted_risk_tier: Optional[str] = Field(None, description="ML predicted risk tier")
    ml_predicted_impact: Optional[float] = Field(None, description="ML predicted operational friction score")


class OptimizationRequest(BaseModel):
    """Input payload for OR-Tools block schedule optimization."""
    corridor_code: str = Field(default="NDLS-CNB", description="Corridor code")
    horizon_start: datetime = Field(..., description="Planning horizon start timestamp")
    horizon_end: datetime = Field(..., description="Planning horizon end timestamp")
    requests: List[MaintenanceRequestItem] = Field(default_factory=list, description="List of candidate maintenance requests")
    candidate_windows: List[BlockWindowSummary] = Field(default_factory=list, description="Available block windows")
    train_movements: List[TrainMovementSummary] = Field(default_factory=list, description="Scheduled train paths")
    strategies: List[OptimizationStrategy] = Field(
        default_factory=lambda: [
            OptimizationStrategy.BALANCED,
            OptimizationStrategy.OPERATIONAL_MINIMAL_DISRUPTION,
            OptimizationStrategy.ASSET_PRIORITY_FIRST
        ],
        description="List of optimization strategies to solve for Pareto-differentiated plans"
    )
    time_limit_seconds: Optional[float] = Field(default=None, description="Optional custom solver time limit in seconds")


class ScheduledBlockAssignment(BaseModel):
    """Details of a scheduled maintenance block assignment in an optimized plan."""
    assignment_id: str = Field(..., description="Unique assignment identifier")
    task_id: str = Field(..., description="Scheduled maintenance task ID")
    task_code: str = Field(..., description="Human-readable task code")
    department: str = Field(..., description="Department code")
    maintenance_type: str = Field(..., description="Maintenance type")
    asset_id: str = Field(..., description="Target asset ID")
    asset_code: str = Field(..., description="Asset code")
    assigned_window_id: str = Field(..., description="ID of the block window hosting this assignment")
    start_time: datetime = Field(..., description="Assigned block start timestamp")
    end_time: datetime = Field(..., description="Assigned block end timestamp")
    duration_minutes: float = Field(..., description="Assigned block duration in minutes")
    priority: int = Field(..., description="Task priority (1-5)")
    is_shadow_block: bool = Field(default=False, description="Whether this assignment shares a master block")
    parent_task_id: Optional[str] = Field(None, description="Task ID of the primary master block if shadow")
    machinery_assigned: Optional[str] = Field(None, description="Assigned machine name")
    crews_assigned: int = Field(default=1, description="Number of crews assigned")

    # Prompt 5 ML Enrichments
    ml_predicted_duration_minutes: Optional[float] = Field(None, description="ML predicted duration")
    ml_predicted_risk_tier: Optional[str] = Field(None, description="ML predicted risk tier")
    ml_predicted_impact: Optional[float] = Field(None, description="ML predicted operational friction score")


class UnscheduledRequestReport(BaseModel):
    """Detailed diagnostic report for any maintenance request that could not be scheduled."""
    task_id: str = Field(..., description="Unscheduled task identifier")
    task_code: str = Field(..., description="Task code")
    priority: int = Field(..., description="Priority level")
    department: str = Field(..., description="Department code")
    reason: str = Field(..., description="Clear explanation of why task could not be scheduled")
    blocking_constraints: List[str] = Field(default_factory=list, description="Formal names of blocking constraints")
    suggested_window_id: Optional[str] = Field(None, description="Suggested next window ID where task could fit")
    suggested_time_slot: Optional[Dict[str, str]] = Field(None, description="Earliest feasible alternative slot")


class PlanMetrics(BaseModel):
    """Comprehensive performance and objective metrics for an optimized plan."""
    total_requests: int = Field(..., description="Total input maintenance requests")
    scheduled_count: int = Field(..., description="Count of requests successfully scheduled")
    unscheduled_count: int = Field(..., description="Count of unscheduled requests")
    schedule_rate_pct: float = Field(..., description="Percentage of requests scheduled")
    total_block_minutes: float = Field(..., description="Total duration of all scheduled blocks in minutes")
    shadow_blocks_count: int = Field(..., description="Count of tasks co-scheduled as shadow blocks")
    shadow_efficiency_pct: float = Field(..., description="Percentage of scheduled tasks sharing blocks")
    regular_train_conflicts: int = Field(0, description="Count of regular train conflicts")
    high_priority_train_conflicts: int = Field(0, description="Count of high-priority train conflicts")
    estimated_train_delay_minutes: float = Field(0.0, description="Estimated total timetable delay")
    overdue_tasks_cleared: int = Field(0, description="Number of overdue tasks scheduled")
    high_priority_task_coverage_pct: float = Field(0.0, description="Percentage of Priority 1-2 tasks covered")
    average_operational_impact: float = Field(0.0, description="Mean operational impact friction score")
    objective_score: float = Field(..., description="CP-SAT mathematical objective value")
    solver_status: str = Field(..., description="CP-SAT status: OPTIMAL, FEASIBLE, or INFEASIBLE")
    solve_time_ms: float = Field(..., description="Solver execution time in milliseconds")


class OptimizationPlanResult(BaseModel):
    """A complete candidate block plan generated under a specific optimization strategy."""
    strategy: OptimizationStrategy = Field(..., description="Strategy profile used for this plan")
    plan_reference: str = Field(..., description="Unique plan reference identifier")
    is_feasible: bool = Field(..., description="Whether plan passed 100% of Prompt 6 hard constraints")
    scheduled_assignments: List[ScheduledBlockAssignment] = Field(default_factory=list, description="Scheduled block assignments")
    unscheduled_requests: List[UnscheduledRequestReport] = Field(default_factory=list, description="Unscheduled request diagnostics")
    metrics: PlanMetrics = Field(..., description="Plan objective and performance metrics")


class OptimizationResponse(BaseModel):
    """API response containing all generated candidate plans."""
    success: bool = Field(default=True, description="Whether optimization process completed successfully")
    corridor_code: str = Field(..., description="Railway corridor code")
    total_plans: int = Field(..., description="Number of differentiated plans generated")
    plans: List[OptimizationPlanResult] = Field(default_factory=list, description="Generated candidate plans")
    message: str = Field(default="Optimization completed successfully.", description="Status message")
