from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status

from optimizer.config import OptimizationStrategy, OptimizerConfig
from optimizer.models import OptimizationRequest, OptimizationResponse
from optimizer.service import RailwayOptimizerService, get_optimizer_service
from utils.logger import get_logger

logger = get_logger("optimizer_api")

router = APIRouter(prefix="/api/v1/optimize", tags=["OR-Tools Block Optimization"])


@router.get(
    "/strategies",
    response_model=Dict[str, Any],
    summary="Get available block optimization strategies and objective weight profiles",
    description="Returns configuration profiles for Balanced, Minimal Disruption, and Asset-Priority strategies."
)
def get_optimization_strategies(
    service: RailwayOptimizerService = Depends(get_optimizer_service)
) -> Dict[str, Any]:
    """Returns supported strategies and their objective weights."""
    profiles = {}
    for strat, weights in service.config.strategy_profiles.items():
        profiles[strat.value] = weights.model_dump()

    return {
        "available_strategies": [s.value for s in OptimizationStrategy],
        "default_time_limit_seconds": service.config.solver_time_limit_seconds,
        "strategy_profiles": profiles
    }


@router.post(
    "/plan",
    response_model=OptimizationResponse,
    summary="Generate optimized block plans using Google OR-Tools CP-SAT",
    description="Executes mathematical optimization enforcing hard constraints and returning Pareto candidate plans."
)
def optimize_plan(
    request: OptimizationRequest,
    service: RailwayOptimizerService = Depends(get_optimizer_service)
) -> OptimizationResponse:
    """Executes multi-objective CP-SAT block optimization and returns feasible plans."""
    try:
        return service.optimize_block_plan(request)
    except ValueError as e:
        logger.warning("Invalid optimization request: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        logger.error("Block optimization failure: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to execute block plan optimization."
        )
