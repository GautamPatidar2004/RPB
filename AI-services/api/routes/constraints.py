from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from constraints.config import ConstraintConfig
from constraints.models import (
    BlockCandidate,
    TrainMovementSummary,
    BlockWindowSummary,
    ConflictViolation,
    CompatibilityResult,
    FeasibilityReport,
    SoftMetricsSummary,
    BlockPlanCandidate
)
from constraints.engine import ConstraintEngine, get_constraint_engine
from utils.logger import get_logger

logger = get_logger("constraints_api")

router = APIRouter(prefix="/api/v1/constraints", tags=["Constraint & Conflict Engine"])


# Request Schemas for API
class CheckCompatibilityRequest(BaseModel):
    task_a: BlockCandidate
    task_b: BlockCandidate


class FindConflictsRequest(BaseModel):
    candidate: BlockCandidate
    existing_blocks: List[BlockCandidate] = Field(default_factory=list)
    trains: List[TrainMovementSummary] = Field(default_factory=list)
    windows: List[BlockWindowSummary] = Field(default_factory=list)


class ValidatePlanRequest(BaseModel):
    plan: BlockPlanCandidate
    trains: List[TrainMovementSummary] = Field(default_factory=list)
    windows: List[BlockWindowSummary] = Field(default_factory=list)


class ValidatePlanResponse(BaseModel):
    feasibility: FeasibilityReport
    soft_metrics: SoftMetricsSummary


@router.get(
    "/rules",
    response_model=Dict[str, Any],
    summary="Get active Railway constraint and compatibility rules",
    description="Returns safety headway buffers, duration bounds, resource limits, and compatibility matrix."
)
def get_constraint_rules(
    engine: ConstraintEngine = Depends(get_constraint_engine)
) -> Dict[str, Any]:
    """Returns safe, transparent constraint configuration."""
    cfg = engine.config
    return {
        "min_headway_buffer_minutes": cfg.min_headway_buffer_minutes,
        "ohe_power_isolation_buffer_minutes": cfg.ohe_power_isolation_buffer_minutes,
        "speed_restriction_recovery_minutes": cfg.speed_restriction_recovery_minutes,
        "min_block_duration_minutes": cfg.min_block_duration_minutes,
        "max_block_duration_minutes": cfg.max_block_duration_minutes,
        "max_concurrent_blocks_per_section": cfg.max_concurrent_blocks_per_section,
        "max_grouping_distance_km": cfg.max_grouping_distance_km,
        "max_concurrent_crews": cfg.max_concurrent_crews,
        "max_concurrent_machines": cfg.max_concurrent_machines,
        "exclusive_maintenance_types": sorted(list(cfg.exclusive_maintenance_types)),
        "compatible_maintenance_pairs": {k: sorted(list(v)) for k, v in cfg.compatible_maintenance_pairs.items()}
    }


@router.post(
    "/validate-candidate",
    response_model=List[ConflictViolation],
    summary="Validate individual block candidate internal consistency",
    description="Checks timing ordering and duration limits for a proposed candidate block."
)
def validate_candidate(
    candidate: BlockCandidate,
    engine: ConstraintEngine = Depends(get_constraint_engine)
) -> List[ConflictViolation]:
    try:
        return engine.validate_candidate(candidate)
    except Exception as e:
        logger.error("Error validating candidate %s: %s", candidate.candidate_id, str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Candidate validation failed.")


@router.post(
    "/check-compatibility",
    response_model=CompatibilityResult,
    summary="Check pairwise task compatibility for integrated/shadow blocks",
    description="Evaluates whether two maintenance tasks can share a block window."
)
def check_compatibility(
    req: CheckCompatibilityRequest,
    engine: ConstraintEngine = Depends(get_constraint_engine)
) -> CompatibilityResult:
    try:
        return engine.check_compatibility(req.task_a, req.task_b)
    except Exception as e:
        logger.error("Error checking compatibility: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Compatibility check failed.")


@router.post(
    "/find-conflicts",
    response_model=List[ConflictViolation],
    summary="Find all conflicts between candidate and existing schedule",
    description="Detects block-block collisions, train path overlaps, and resource over-allocations."
)
def find_conflicts(
    req: FindConflictsRequest,
    engine: ConstraintEngine = Depends(get_constraint_engine)
) -> List[ConflictViolation]:
    try:
        return engine.find_conflicts(
            candidate=req.candidate,
            existing_blocks=req.existing_blocks,
            trains=req.trains,
            windows=req.windows
        )
    except Exception as e:
        logger.error("Error detecting conflicts: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Conflict detection failed.")


@router.post(
    "/validate-plan",
    response_model=ValidatePlanResponse,
    summary="Validate full block plan feasibility and compute soft metrics",
    description="Evaluates complete candidate plan against all hard constraints and computes objective metrics."
)
def validate_plan(
    req: ValidatePlanRequest,
    engine: ConstraintEngine = Depends(get_constraint_engine)
) -> ValidatePlanResponse:
    try:
        feasibility = engine.validate_plan(
            plan=req.plan,
            trains=req.trains,
            windows=req.windows
        )
        soft_metrics = engine.calculate_soft_metrics(
            plan=req.plan,
            trains=req.trains
        )
        return ValidatePlanResponse(
            feasibility=feasibility,
            soft_metrics=soft_metrics
        )
    except Exception as e:
        logger.error("Error validating plan %s: %s", req.plan.plan_reference, str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Plan validation failed.")
