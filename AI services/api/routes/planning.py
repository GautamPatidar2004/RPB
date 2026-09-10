from fastapi import APIRouter, Depends, HTTPException, status

from pipeline.models import PlanningPipelineRequest, PlanningPipelineResponse
from pipeline.orchestrator import BlockPlanningOrchestrator, get_block_planning_orchestrator
from utils.logger import get_logger

logger = get_logger("planning_api")

router = APIRouter(prefix="/api/v1/planning", tags=["End-to-End Block Planning"])


@router.post(
    "/generate",
    response_model=PlanningPipelineResponse,
    summary="Generate optimized, constraint-validated, and explained railway block plan",
    description="End-to-End Orchestrator: Fetches data -> Runs ML -> Validates constraints -> Optimizes via OR-Tools -> Scores Pareto plans -> Generates Gemini/Groq explanation -> Validates safety gate."
)
async def generate_block_plan(
    request: PlanningPipelineRequest,
    orchestrator: BlockPlanningOrchestrator = Depends(get_block_planning_orchestrator)
) -> PlanningPipelineResponse:
    """Executes the full 13-stage Automatic Block Planning Pipeline."""
    try:
        return await orchestrator.generate_block_plan(request)
    except ValueError as e:
        logger.warning("Invalid planning request: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        logger.error("Block planning pipeline failure: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Block planning pipeline failed: {str(e)}"
        )


@router.get(
    "/runs/{planning_run_id}",
    response_model=PlanningPipelineResponse,
    summary="Retrieve details and explanation of a previous planning run by ID",
    description="Fetches cached execution result and metrics for a specific planning run ID."
)
def get_planning_run(
    planning_run_id: str,
    orchestrator: BlockPlanningOrchestrator = Depends(get_block_planning_orchestrator)
) -> PlanningPipelineResponse:
    """Retrieves cached planning run by ID."""
    cached = orchestrator.get_cached_run(planning_run_id)
    if not cached:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Planning run with ID '{planning_run_id}' not found in active session cache."
        )
    return cached
