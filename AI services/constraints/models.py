from enum import Enum
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


class ConflictType(str, Enum):
    """Enumeration of all recognized Railway hard & operational constraint violations."""
    INVALID_TIMING = "INVALID_TIMING"
    INVALID_DURATION = "INVALID_DURATION"
    SAME_ASSET_SIMULTANEOUS_MAINTENANCE = "SAME_ASSET_SIMULTANEOUS_MAINTENANCE"
    CORRIDOR_CONCURRENCY_EXCEEDED = "CORRIDOR_CONCURRENCY_EXCEEDED"
    TRAIN_PATH_OVERLAP = "TRAIN_PATH_OVERLAP"
    HEADWAY_BUFFER_VIOLATION = "HEADWAY_BUFFER_VIOLATION"
    WINDOW_BOUNDARY_EXCEEDED = "WINDOW_BOUNDARY_EXCEEDED"
    DEPENDENCY_ORDER_VIOLATION = "DEPENDENCY_ORDER_VIOLATION"
    RESOURCE_CAPACITY_EXCEEDED = "RESOURCE_CAPACITY_EXCEEDED"
    POWER_ISOLATION_BUFFER_VIOLATION = "POWER_ISOLATION_BUFFER_VIOLATION"
    INCOMPATIBLE_TASK_COMBINATION = "INCOMPATIBLE_TASK_COMBINATION"


class Severity(str, Enum):
    """Severity classification for constraint violations."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ConflictViolation(BaseModel):
    """Structured report of a single constraint violation."""
    conflict_type: ConflictType = Field(..., description="Type of constraint violated")
    involved_ids: List[str] = Field(..., description="List of block IDs, train IDs, or asset codes involved")
    severity: Severity = Field(..., description="Violation severity tier")
    violated_constraint: str = Field(..., description="Formal name of the violated constraint rule")
    explanation: str = Field(..., description="Human-readable explanation of why this violates safety/policy")
    details: Dict[str, Any] = Field(default_factory=dict, description="Diagnostic data (slots, buffer gap, etc.)")


class TrainMovementSummary(BaseModel):
    """Normalized train movement schedule for conflict detection."""
    train_id: str
    train_number: str
    train_type: str = "MAIL_EXPRESS"
    priority: int = 3
    direction: str = "UP"
    scheduled_start_time: datetime
    scheduled_end_time: datetime
    is_high_priority: bool = False

    @model_validator(mode="after")
    def check_priority(self) -> "TrainMovementSummary":
        if not self.is_high_priority:
            prio = self.priority
            t_type = str(self.train_type).upper()
            if prio <= 2 or t_type in {"VANDE_BHARAT", "RAJDHANI", "SHATABDI"}:
                self.is_high_priority = True
        return self


class BlockWindowSummary(BaseModel):
    """Normalized operational maintenance window from corridor schedule."""
    window_id: str
    corridor_code: str
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    block_type: str = "TRAFFIC_BLOCK"
    start_kilometer: Optional[float] = None
    end_kilometer: Optional[float] = None


class BlockCandidate(BaseModel):
    """
    Internal normalized representation of a proposed maintenance block candidate.
    Captures temporal, spatial, departmental, and resource requirements.
    """
    candidate_id: str = Field(..., description="Unique identifier for candidate block")
    task_id: Optional[str] = Field(None, description="Linked maintenance task ID")
    task_code: Optional[str] = Field(None, description="Human-readable task code (e.g. TRK-2026-001)")
    corridor_code: str = Field(default="NDLS-CNB", description="Railway corridor code")
    department: str = Field(default="ENGG", description="Responsible department: ENGG, SNT, or TRD")
    maintenance_type: str = Field(default="TRACK_TAMPING", description="Specific maintenance activity")
    asset_id: str = Field(..., description="Target asset ID")
    asset_code: str = Field(default="ASSET-GENERIC", description="Human-readable asset code")
    asset_type: str = Field(default="TRACK", description="Target asset classification")
    start_kilometer: float = Field(default=0.0, ge=0.0, description="Start kilometer point on corridor")
    end_kilometer: float = Field(default=1.0, ge=0.0, description="End kilometer point on corridor")
    start_time: datetime = Field(..., description="Assigned block start timestamp")
    end_time: datetime = Field(..., description="Assigned block end timestamp")
    duration_minutes: float = Field(default=0.0, description="Calculated duration in minutes")
    priority: int = Field(default=3, ge=1, le=5, description="Priority rating (1=highest, 5=routine)")
    power_block_required: bool = Field(default=False, description="Whether OHE power shutoff is mandatory")
    traffic_block_required: bool = Field(default=True, description="Whether train traffic halt is mandatory")
    speed_restriction_kmph: float = Field(default=0.0, ge=0.0, description="Post-work speed restriction")
    assigned_window_id: Optional[str] = Field(None, description="Linked block window ID")
    machinery_required: Optional[str] = Field(None, description="Specialized track machine required")
    crew_required: int = Field(default=1, ge=1, description="Number of crews required")
    depends_on_task_ids: List[str] = Field(default_factory=list, description="Prerequisite task IDs")
    is_overdue: bool = Field(default=False, description="Whether maintenance task is overdue")
    days_until_required: float = Field(default=3.0, description="Days remaining before task deadline")

    # ML Enrichments from Prompt 5
    ml_predicted_duration_minutes: Optional[float] = Field(None, description="ML predicted duration")
    ml_predicted_risk_tier: Optional[str] = Field(None, description="ML predicted risk tier (LOW/MED/HIGH)")
    ml_predicted_risk_confidence: Optional[float] = Field(None, description="ML risk prediction confidence")
    ml_predicted_impact: Optional[float] = Field(None, description="ML predicted operational impact score")

    # Shadow & Grouping Properties
    is_shadow_block: bool = Field(default=False, description="Whether co-scheduled behind a primary block")
    parent_block_id: Optional[str] = Field(None, description="ID of primary master block if shadow")

    @field_validator("duration_minutes", mode="before")
    @classmethod
    def calculate_duration(cls, v: Any, info) -> float:
        st = info.data.get("start_time")
        et = info.data.get("end_time")
        if isinstance(st, datetime) and isinstance(et, datetime):
            return round((et - st).total_seconds() / 60.0, 1)
        if v is not None:
            return float(v)
        return 120.0


class CompatibilityResult(BaseModel):
    """Result of checking mutual co-scheduling compatibility between two tasks."""
    is_compatible: bool = Field(..., description="Whether tasks can be scheduled in the same master block")
    can_shadow: bool = Field(..., description="Whether one task can run as a shadow of the other")
    distance_km: float = Field(..., description="Spatial distance between task assets in kilometers")
    shared_corridor: bool = Field(..., description="Whether both tasks belong to the same corridor")
    reason: str = Field(..., description="Explanation of compatibility or incompatibility determination")


class FeasibilityReport(BaseModel):
    """Overall feasibility evaluation of a proposed candidate or complete block plan."""
    is_feasible: bool = Field(..., description="True if ZERO hard constraints are violated")
    total_violations: int = Field(..., description="Total count of detected constraint violations")
    critical_violations: int = Field(..., description="Count of CRITICAL severity violations")
    violations: List[ConflictViolation] = Field(default_factory=list, description="All detected violations")
    evaluated_block_count: int = Field(default=0, description="Number of block candidates evaluated")
    evaluated_train_count: int = Field(default=0, description="Number of train movements checked")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SoftMetricsSummary(BaseModel):
    """
    Measurable soft constraint preference metrics for Prompt 7 OR-Tools objective guidance.
    Does not perform optimization; exposes objective components.
    """
    total_block_minutes: float = Field(0.0, description="Total planned maintenance block minutes")
    total_train_conflicts: int = Field(0, description="Count of regular train overlaps")
    high_priority_train_conflicts: int = Field(0, description="Count of premium/high-priority train overlaps")
    estimated_train_delay_minutes: float = Field(0.0, description="Estimated aggregate train delay impact")
    shadow_grouping_count: int = Field(0, description="Number of tasks co-scheduled as shadow blocks")
    shadow_grouping_efficiency_pct: float = Field(0.0, description="Percentage of tasks sharing blocks")
    overdue_tasks_scheduled: int = Field(0, description="Count of overdue tasks addressed in plan")
    high_priority_task_coverage_pct: float = Field(0.0, description="Percentage of Priority 1-2 tasks covered")
    average_operational_impact: float = Field(0.0, description="Mean operational friction score across blocks")
    composite_objective_cost: float = Field(0.0, description="Weighted penalty cost for OR-Tools objective formulation")


class BlockPlanCandidate(BaseModel):
    """Complete candidate block plan containing multiple scheduled block candidates."""
    plan_reference: str = Field(..., description="Unique plan reference identifier")
    corridor_code: str = Field(default="NDLS-CNB", description="Corridor code")
    horizon_start: datetime = Field(..., description="Planning horizon start timestamp")
    horizon_end: datetime = Field(..., description="Planning horizon end timestamp")
    candidates: List[BlockCandidate] = Field(default_factory=list, description="List of scheduled block candidates")
