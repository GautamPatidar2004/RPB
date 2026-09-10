"""Railway Constraint & Conflict Engine package."""
from .config import ConstraintConfig, get_default_constraint_config
from .models import (
    ConflictType,
    Severity,
    ConflictViolation,
    TrainMovementSummary,
    BlockWindowSummary,
    BlockCandidate,
    CompatibilityResult,
    FeasibilityReport,
    SoftMetricsSummary,
    BlockPlanCandidate
)
from .compatibility import TaskCompatibilityEngine
from .conflicts import ConflictDetector
from .engine import ConstraintEngine, get_constraint_engine

__all__ = [
    "ConstraintConfig",
    "get_default_constraint_config",
    "ConflictType",
    "Severity",
    "ConflictViolation",
    "TrainMovementSummary",
    "BlockWindowSummary",
    "BlockCandidate",
    "CompatibilityResult",
    "FeasibilityReport",
    "SoftMetricsSummary",
    "BlockPlanCandidate",
    "TaskCompatibilityEngine",
    "ConflictDetector",
    "ConstraintEngine",
    "get_constraint_engine"
]
