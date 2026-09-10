from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, field_validator
import pandas as pd

# Valid category sets matching Prompt 2 and Prompt 3 definitions
VALID_DEPARTMENTS = {"ENGG", "SNT", "TRD"}
VALID_CRITICALITIES = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
VALID_HEALTH_STATUSES = {"OPERATIONAL", "MAINTENANCE_REQUIRED", "DEGRADED", "FAILED", "UNDER_MAINTENANCE"}
VALID_URGENCIES = {"LOW", "MEDIUM", "HIGH", "IMMEDIATE"}

CRITICALITY_SCORES = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
HEALTH_SCORES = {"OPERATIONAL": 1, "UNDER_MAINTENANCE": 2, "MAINTENANCE_REQUIRED": 3, "DEGRADED": 4, "FAILED": 5}
URGENCY_SCORES = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "IMMEDIATE": 4}


class BaseBlockFeatures(BaseModel):
    """
    Standardized Railway maintenance block features for ML prediction.
    Enforces strict range validation and provides exact feature transformation.
    """
    corridor_code: str = Field(
        default="NDLS-CNB",
        min_length=2,
        max_length=50,
        description="Railway corridor code (e.g., NDLS-CNB, CSMT-KYN)"
    )
    department: str = Field(
        default="ENGG",
        description="Department responsible for the block: ENGG, SNT, or TRD"
    )
    maintenance_type: str = Field(
        default="TRACK_TAMPING",
        min_length=2,
        max_length=60,
        description="Type of maintenance task (e.g. TRACK_TAMPING, OHE_INSPECTION, POINTS_TESTING)"
    )
    asset_type: str = Field(
        default="TRACK",
        min_length=2,
        max_length=60,
        description="Railway asset type under maintenance"
    )
    asset_criticality: str = Field(
        default="MEDIUM",
        description="Asset criticality tier: LOW, MEDIUM, HIGH, CRITICAL"
    )
    asset_health_status: str = Field(
        default="OPERATIONAL",
        description="Asset health condition: OPERATIONAL, MAINTENANCE_REQUIRED, DEGRADED, FAILED, UNDER_MAINTENANCE"
    )
    task_urgency: str = Field(
        default="MEDIUM",
        description="Urgency of maintenance task: LOW, MEDIUM, HIGH, IMMEDIATE"
    )
    priority: int = Field(
        default=3,
        ge=1,
        le=5,
        description="Railway block priority (1=highest emergency, 5=routine)"
    )
    power_block_required: bool = Field(
        default=False,
        description="Whether OHE power shutdown is required"
    )
    traffic_block_required: bool = Field(
        default=True,
        description="Whether train traffic block is required"
    )
    speed_restriction_kmph: float = Field(
        default=0.0,
        ge=0.0,
        le=200.0,
        description="Imposed speed restriction in km/h"
    )
    work_complexity_score: float = Field(
        default=2.5,
        ge=0.5,
        le=10.0,
        description="Composite work complexity score (0.5 to 10.0)"
    )
    corridor_length_km: float = Field(
        default=440.0,
        gt=0.0,
        le=3000.0,
        description="Total length of the corridor in km"
    )
    corridor_electrified: bool = Field(
        default=True,
        description="Whether corridor is electrified"
    )
    corridor_double_line: bool = Field(
        default=True,
        description="Whether corridor has multiple tracks/double line"
    )
    section_span_km: float = Field(
        default=1.0,
        ge=0.0,
        le=200.0,
        description="Maintenance span length in kilometers"
    )
    dependency_count: int = Field(
        default=0,
        ge=0,
        le=20,
        description="Number of inter-task dependencies"
    )
    days_until_required: float = Field(
        default=3.0,
        description="Days remaining before block is required (negative indicates overdue)"
    )
    is_overdue: bool = Field(
        default=False,
        description="Whether task is overdue"
    )
    train_traffic_count: int = Field(
        default=24,
        ge=0,
        le=300,
        description="Number of scheduled trains in the section"
    )
    high_priority_train_count: int = Field(
        default=6,
        ge=0,
        le=150,
        description="Number of high-priority trains (Rajdhani/Vande Bharat/Shatabdi)"
    )
    available_window_count: int = Field(
        default=2,
        ge=0,
        le=50,
        description="Number of available candidate block windows"
    )
    total_available_window_minutes: float = Field(
        default=180.0,
        ge=0.0,
        le=1440.0,
        description="Total window duration available in minutes"
    )
    potential_train_conflicts: Optional[int] = Field(
        default=None,
        ge=0,
        le=300,
        description="Estimated train conflict count (calculated automatically if not provided)"
    )
    requested_duration_minutes: float = Field(
        default=120.0,
        gt=0.0,
        le=1440.0,
        description="Original requested duration in minutes"
    )

    @field_validator("department")
    @classmethod
    def validate_department(cls, v: str) -> str:
        v_upper = v.strip().upper()
        if v_upper not in VALID_DEPARTMENTS:
            raise ValueError(f"Invalid department '{v}'. Must be one of {sorted(VALID_DEPARTMENTS)}")
        return v_upper

    @field_validator("asset_criticality")
    @classmethod
    def validate_criticality(cls, v: str) -> str:
        v_upper = v.strip().upper()
        if v_upper not in VALID_CRITICALITIES:
            raise ValueError(f"Invalid asset_criticality '{v}'. Must be one of {sorted(VALID_CRITICALITIES)}")
        return v_upper

    @field_validator("asset_health_status")
    @classmethod
    def validate_health(cls, v: str) -> str:
        v_upper = v.strip().upper()
        if v_upper not in VALID_HEALTH_STATUSES:
            raise ValueError(f"Invalid asset_health_status '{v}'. Must be one of {sorted(VALID_HEALTH_STATUSES)}")
        return v_upper

    @field_validator("task_urgency")
    @classmethod
    def validate_urgency(cls, v: str) -> str:
        v_upper = v.strip().upper()
        if v_upper not in VALID_URGENCIES:
            raise ValueError(f"Invalid task_urgency '{v}'. Must be one of {sorted(VALID_URGENCIES)}")
        return v_upper

    @field_validator("high_priority_train_count")
    @classmethod
    def validate_high_priority_trains(cls, v: int, info) -> int:
        traffic_count = info.data.get("train_traffic_count", 0)
        if traffic_count > 0 and v > traffic_count:
            raise ValueError(f"high_priority_train_count ({v}) cannot exceed total train_traffic_count ({traffic_count})")
        return v

    def to_feature_row(self) -> Dict[str, Any]:
        """Converts validated schema into raw feature dictionary exactly matching training format."""
        crit_score = CRITICALITY_SCORES.get(self.asset_criticality, 2)
        health_score = HEALTH_SCORES.get(self.asset_health_status, 1)
        urg_score = URGENCY_SCORES.get(self.task_urgency, 2)
        prio_score = 6 - self.priority

        total_trains = self.train_traffic_count
        high_prio_trains = self.high_priority_train_count
        high_prio_ratio = (high_prio_trains / total_trains) if total_trains > 0 else 0.0

        task_dur = max(15.0, float(self.requested_duration_minutes))
        window_ratio = (self.total_available_window_minutes / task_dur) if task_dur > 0 else 1.0

        if self.potential_train_conflicts is not None:
            conflicts = self.potential_train_conflicts
        else:
            traffic_req_int = 1 if self.traffic_block_required else 0
            conflicts = min(total_trains, int(traffic_req_int * (high_prio_trains + 1)))

        is_od = 1 if (self.is_overdue or self.days_until_required < 0) else 0

        return {
            "corridor_code": self.corridor_code,
            "feat_maint_type": self.maintenance_type,
            "feat_department": self.department,
            "feat_asset_type": self.asset_type,
            "feat_asset_criticality": self.asset_criticality,
            "feat_asset_health_status": self.asset_health_status,
            "feat_task_urgency": self.task_urgency,
            "feat_priority": self.priority,
            "feat_power_block_req": 1 if self.power_block_required else 0,
            "feat_traffic_block_req": 1 if self.traffic_block_required else 0,
            "feat_speed_restriction_kmph": float(self.speed_restriction_kmph),
            "feat_work_complexity_score": round(float(self.work_complexity_score), 3),
            "feat_corridor_length_km": float(self.corridor_length_km),
            "feat_corridor_electrified": 1 if self.corridor_electrified else 0,
            "feat_corridor_double_line": 1 if self.corridor_double_line else 0,
            "feat_section_span_km": round(float(self.section_span_km), 3),
            "feat_dependency_count": int(self.dependency_count),
            "feat_asset_criticality_score": crit_score,
            "feat_asset_health_score": health_score,
            "feat_task_urgency_score": urg_score,
            "feat_days_until_required": round(float(self.days_until_required), 2),
            "feat_is_overdue": is_od,
            "feat_task_priority_score": prio_score,
            "feat_train_traffic_count": total_trains,
            "feat_high_priority_train_count": high_prio_trains,
            "feat_high_priority_train_ratio": round(high_prio_ratio, 3),
            "feat_available_window_count": self.available_window_count,
            "feat_total_available_window_minutes": float(self.total_available_window_minutes),
            "feat_window_to_task_duration_ratio": round(window_ratio, 3),
            "feat_potential_train_conflicts": conflicts
        }


# =====================================================================
# 1. DURATION PREDICTION SCHEMAS
# =====================================================================

class DurationPredictionRequest(BaseBlockFeatures):
    """Input payload for predicting maintenance block duration."""
    pass


class DurationPredictionResponse(BaseModel):
    """Output prediction for maintenance block duration."""
    predicted_duration_minutes: float = Field(
        ...,
        description="Predicted maintenance duration in minutes"
    )
    model_version: str = Field(..., description="Version of the trained model artifact")
    success: bool = Field(default=True, description="Whether prediction succeeded")


# =====================================================================
# 2. RISK & PRIORITY PREDICTION SCHEMAS
# =====================================================================

class RiskPredictionRequest(BaseBlockFeatures):
    """Input payload for predicting asset risk and urgency priority tier."""
    pass


class RiskPredictionResponse(BaseModel):
    """Output prediction for asset risk and priority classification."""
    predicted_risk_tier: str = Field(
        ...,
        description="Predicted risk tier: LOW, MEDIUM, or HIGH"
    )
    risk_class_index: int = Field(
        ...,
        description="Ordinal class index (0: LOW, 1: MEDIUM, 2: HIGH)"
    )
    confidence: float = Field(
        ...,
        description="Model confidence / winning class probability (0.0 - 1.0)"
    )
    probabilities: Dict[str, float] = Field(
        ...,
        description="Predicted probability distribution across all risk tiers"
    )
    model_version: str = Field(..., description="Version of the trained model artifact")
    success: bool = Field(default=True, description="Whether prediction succeeded")


# =====================================================================
# 3. OPERATIONAL IMPACT PREDICTION SCHEMAS
# =====================================================================

class OperationalImpactRequest(BaseBlockFeatures):
    """Input payload for predicting corridor operational impact / friction score."""
    pass


class OperationalImpactResponse(BaseModel):
    """Output prediction for operational impact score."""
    predicted_operational_impact: float = Field(
        ...,
        description="Predicted operational friction score (0.0 to 100.0)"
    )
    impact_tier: str = Field(
        ...,
        description="Impact severity tier: LOW (<30), MODERATE (30-59), HIGH (60-79), SEVERE (>=80)"
    )
    model_version: str = Field(..., description="Version of the trained model artifact")
    success: bool = Field(default=True, description="Whether prediction succeeded")


# =====================================================================
# 4. BATCH PREDICTION SCHEMAS
# =====================================================================

class BatchBlockCandidateItem(BaseBlockFeatures):
    """Single candidate block within a batch prediction request."""
    candidate_id: str = Field(
        ...,
        description="Unique identifier for the block candidate"
    )


class BatchPredictionRequest(BaseModel):
    """Request payload containing multiple candidate blocks to predict in one vectorized call."""
    candidates: List[BatchBlockCandidateItem] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="List of candidate blocks to evaluate (1 to 500 items)"
    )


class BatchBlockPredictionResult(BaseModel):
    """Prediction outputs for a single block candidate in batch processing."""
    candidate_id: str = Field(..., description="Unique candidate identifier")
    predicted_duration_minutes: float = Field(..., description="Predicted duration in minutes")
    predicted_risk_tier: str = Field(..., description="Predicted risk tier: LOW, MEDIUM, or HIGH")
    risk_confidence: float = Field(..., description="Confidence of risk tier prediction")
    risk_probabilities: Dict[str, float] = Field(..., description="Full probability distribution")
    predicted_operational_impact: float = Field(..., description="Predicted impact score (0-100)")
    impact_tier: str = Field(..., description="Operational impact tier")


class BatchPredictionResponse(BaseModel):
    """Batch prediction response containing results for all candidate blocks."""
    total_candidates: int = Field(..., description="Number of candidates processed")
    predictions: List[BatchBlockPredictionResult] = Field(..., description="List of prediction results")
    model_version: str = Field(..., description="Version of the models used")
    processing_time_ms: float = Field(..., description="Total execution time in milliseconds")
    success: bool = Field(default=True, description="Whether batch prediction succeeded")


# =====================================================================
# 5. MODEL STATUS SCHEMA
# =====================================================================

class ModelInfo(BaseModel):
    """Status details for an individual loaded model."""
    loaded: bool = Field(..., description="Whether model is loaded and ready in memory")
    model_type: str = Field(..., description="XGBoost model architecture")
    target: str = Field(..., description="Target variable name")
    file: str = Field(..., description="Artifact file name")


class ModelStatusResponse(BaseModel):
    """Comprehensive health and readiness status of ML models."""
    ready: bool = Field(..., description="Overall readiness for serving predictions")
    model_version: str = Field(..., description="Active model version")
    loaded_models: Dict[str, ModelInfo] = Field(..., description="Map of loaded model details")
    preprocessor_ready: bool = Field(..., description="Whether feature preprocessor is loaded")
    feature_count: int = Field(..., description="Number of features accepted by preprocessor")
    data_source_mode: str = Field(..., description="Data provenance (combined/synthetic)")
    dataset_rows: int = Field(..., description="Number of historical records model was trained on")
    created_at: str = Field(..., description="Artifact creation timestamp (ISO 8601)")
    metrics_summary: Dict[str, Any] = Field(..., description="Key evaluation performance metrics")
