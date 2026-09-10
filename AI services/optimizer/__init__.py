"""OR-Tools CP-SAT Block Planning Optimization package."""
from .config import OptimizationStrategy, StrategyWeights, OptimizerConfig, get_default_optimizer_config
from .models import (
    MaintenanceRequestItem,
    OptimizationRequest,
    ScheduledBlockAssignment,
    UnscheduledRequestReport,
    PlanMetrics,
    OptimizationPlanResult,
    OptimizationResponse
)
from .cp_sat_model import RailwayCPSATOptimizer
from .service import RailwayOptimizerService, get_optimizer_service

__all__ = [
    "OptimizationStrategy",
    "StrategyWeights",
    "OptimizerConfig",
    "get_default_optimizer_config",
    "MaintenanceRequestItem",
    "OptimizationRequest",
    "ScheduledBlockAssignment",
    "UnscheduledRequestReport",
    "PlanMetrics",
    "OptimizationPlanResult",
    "OptimizationResponse",
    "RailwayCPSATOptimizer",
    "RailwayOptimizerService",
    "get_optimizer_service"
]
