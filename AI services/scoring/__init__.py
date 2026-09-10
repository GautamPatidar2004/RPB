"""
Plan Scoring and Selection Package for Indian Railways Automatic Block Planning.
Provides deterministic metrics calculation, normalized scoring, weighted composite ranking,
Prompt 6 constraint validation gating, and structured trade-off analysis for Prompt 9.
"""

from scoring.config import ScoringConfig, get_default_scoring_config
from scoring.models import (
    PlanRawMetrics,
    NormalizedScores,
    TradeOffItem,
    ScoredPlan,
    StructuredExplanationData,
    PlanSelectionResponse
)
from scoring.calculator import PlanMetricsCalculator, ScoreNormalizer
from scoring.tradeoffs import TradeOffAnalyzer
from scoring.service import PlanScoringService, get_plan_scoring_service

__all__ = [
    "ScoringConfig",
    "get_default_scoring_config",
    "PlanRawMetrics",
    "NormalizedScores",
    "TradeOffItem",
    "ScoredPlan",
    "StructuredExplanationData",
    "PlanSelectionResponse",
    "PlanMetricsCalculator",
    "ScoreNormalizer",
    "TradeOffAnalyzer",
    "PlanScoringService",
    "get_plan_scoring_service"
]
