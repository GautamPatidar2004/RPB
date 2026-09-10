from typing import Dict, List, Optional
from pydantic import BaseModel, Field, model_validator


class ScoringConfig(BaseModel):
    """
    Configuration parameters for multi-objective block plan scoring, ranking, and selection.
    Ensures transparent, configurable, and deterministic evaluation of candidate plans.
    """
    # 6 Objective Weights (default sum = 1.0)
    weight_asset_availability: float = Field(default=0.20, ge=0.0, description="Weight for asset availability improvement score")
    weight_risk_priority: float = Field(default=0.25, ge=0.0, description="Weight for high-risk / critical maintenance coverage score")
    weight_operational_efficiency: float = Field(default=0.25, ge=0.0, description="Weight for operational efficiency / minimal train disruption score")
    weight_block_efficiency: float = Field(default=0.10, ge=0.0, description="Weight for compact block utilization score")
    weight_grouping_efficiency: float = Field(default=0.10, ge=0.0, description="Weight for compatible shadow task grouping score")
    weight_overdue_maintenance: float = Field(default=0.10, ge=0.0, description="Weight for overdue maintenance clearing score")

    # Evaluation Thresholds
    min_acceptable_score: float = Field(default=40.0, ge=0.0, le=100.0, description="Minimum acceptable overall plan score (0-100)")
    tradeoff_significance_threshold: float = Field(default=3.0, ge=0.1, description="Minimum delta points to report as a notable trade-off")
    
    # Deterministic Tie-Breaking Order
    tie_breaker_priority: List[str] = Field(
        default_factory=lambda: [
            "risk_priority_score",
            "operational_efficiency_score",
            "asset_availability_score",
            "plan_reference"
        ],
        description="Hierarchy of metric keys used to deterministically break ties"
    )

    @model_validator(mode="after")
    def validate_weights(self) -> "ScoringConfig":
        total_weight = (
            self.weight_asset_availability +
            self.weight_risk_priority +
            self.weight_operational_efficiency +
            self.weight_block_efficiency +
            self.weight_grouping_efficiency +
            self.weight_overdue_maintenance
        )
        if total_weight <= 0.0:
            raise ValueError("Total sum of scoring weights must be strictly positive")
        return self

    def get_normalized_weights(self) -> Dict[str, float]:
        """Returns weights normalized so their sum is exactly 1.0."""
        total = (
            self.weight_asset_availability +
            self.weight_risk_priority +
            self.weight_operational_efficiency +
            self.weight_block_efficiency +
            self.weight_grouping_efficiency +
            self.weight_overdue_maintenance
        )
        return {
            "asset_availability": round(self.weight_asset_availability / total, 4),
            "risk_priority": round(self.weight_risk_priority / total, 4),
            "operational_efficiency": round(self.weight_operational_efficiency / total, 4),
            "block_efficiency": round(self.weight_block_efficiency / total, 4),
            "grouping_efficiency": round(self.weight_grouping_efficiency / total, 4),
            "overdue_maintenance": round(self.weight_overdue_maintenance / total, 4),
        }


def get_default_scoring_config() -> ScoringConfig:
    """Dependency provider for default ScoringConfig."""
    return ScoringConfig()
