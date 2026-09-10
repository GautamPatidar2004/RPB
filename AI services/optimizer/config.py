from enum import Enum
from typing import Dict, Any, List
from pydantic import BaseModel, Field


class OptimizationStrategy(str, Enum):
    """Available optimization objective strategies for generating Pareto-differentiated plans."""
    BALANCED = "BALANCED"
    OPERATIONAL_MINIMAL_DISRUPTION = "OPERATIONAL_MINIMAL_DISRUPTION"
    ASSET_PRIORITY_FIRST = "ASSET_PRIORITY_FIRST"


class StrategyWeights(BaseModel):
    """Configurable scalarization weights for the CP-SAT objective function."""
    weight_scheduled_task: float = Field(default=100.0, description="Reward per scheduled maintenance task")
    weight_priority: float = Field(default=50.0, description="Multiplier for task priority (1=highest, 5=lowest: score = 6-P)")
    weight_risk: float = Field(default=40.0, description="Multiplier for asset risk tier (HIGH=3, MED=2, LOW=1)")
    weight_overdue: float = Field(default=80.0, description="Additional reward for clearing overdue tasks")
    weight_shadow_grouping: float = Field(default=60.0, description="Bonus reward for co-scheduling compatible tasks in a shadow block")
    weight_train_conflict_penalty: float = Field(default=200.0, description="Penalty for regular train disruptions")
    weight_high_priority_train_penalty: float = Field(default=600.0, description="Penalty for high-priority train disruptions")
    weight_duration_penalty: float = Field(default=0.1, description="Small penalty per minute of possession to discourage bloated slots")
    weight_operational_friction: float = Field(default=1.5, description="Penalty scaled by predicted operational friction score")


class OptimizerConfig(BaseModel):
    """
    Centralized configuration for the OR-Tools CP-SAT block planning optimizer.
    Governs solver behavior, time limits, candidate strategies, and multi-objective weights.
    """
    # 1. Solver Controls
    solver_time_limit_seconds: float = Field(
        default=15.0,
        ge=1.0,
        le=120.0,
        description="Maximum solver execution time per strategy run"
    )
    solver_num_workers: int = Field(
        default=1,
        ge=1,
        le=8,
        description="Number of search workers for CP-SAT solver (set to 1 for deterministic reproducibility)"
    )
    time_discretization_minutes: int = Field(
        default=5,
        ge=1,
        le=15,
        description="Temporal granularity in minutes for discrete CP-SAT interval variables"
    )

    # 2. Strategy Weight Profiles
    strategy_profiles: Dict[OptimizationStrategy, StrategyWeights] = Field(
        default_factory=lambda: {
            OptimizationStrategy.BALANCED: StrategyWeights(
                weight_scheduled_task=100.0,
                weight_priority=50.0,
                weight_risk=40.0,
                weight_overdue=80.0,
                weight_shadow_grouping=60.0,
                weight_train_conflict_penalty=200.0,
                weight_high_priority_train_penalty=600.0,
                weight_duration_penalty=0.1,
                weight_operational_friction=1.5
            ),
            OptimizationStrategy.OPERATIONAL_MINIMAL_DISRUPTION: StrategyWeights(
                weight_scheduled_task=70.0,
                weight_priority=30.0,
                weight_risk=30.0,
                weight_overdue=50.0,
                weight_shadow_grouping=80.0,
                weight_train_conflict_penalty=500.0,        # 2.5x penalty on traffic conflicts
                weight_high_priority_train_penalty=1500.0,   # 2.5x penalty on premium trains
                weight_duration_penalty=0.25,
                weight_operational_friction=3.0
            ),
            OptimizationStrategy.ASSET_PRIORITY_FIRST: StrategyWeights(
                weight_scheduled_task=120.0,
                weight_priority=120.0,                      # 2.4x reward for P1/P2 safety work
                weight_risk=100.0,                          # 2.5x reward for HIGH risk assets
                weight_overdue=160.0,                       # 2.0x reward for overdue work
                weight_shadow_grouping=50.0,
                weight_train_conflict_penalty=150.0,
                weight_high_priority_train_penalty=400.0,
                weight_duration_penalty=0.05,
                weight_operational_friction=1.0
            )
        }
    )


def get_default_optimizer_config() -> OptimizerConfig:
    """Returns default OptimizerConfig instance."""
    return OptimizerConfig()
