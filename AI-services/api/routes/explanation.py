from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status

from llm.config import LLMConfig
from llm.models import ExplanationInput, PlanExplanationResponse
from llm.service import PlanExplanationService, get_plan_explanation_service
from scoring.models import PlanSelectionResponse
from utils.logger import get_logger

logger = get_logger("explanation_api")

router = APIRouter(prefix="/api/v1/explain-plan", tags=["LLM Plan Explanation"])


class ExplainPlanRequest(BaseModel):
    """Payload for plan explanation endpoint."""
    input_data: Optional[ExplanationInput] = Field(None, description="Direct structured explanation input data")
    selection_response: Optional[PlanSelectionResponse] = Field(None, description="Output response from Prompt 8 plan selection")
    user_query: Optional[str] = Field(None, description="Optional custom question from dispatcher")


@router.get(
    "/status",
    response_model=Dict[str, Any],
    summary="Check status and availability of LLM explanation providers",
    description="Reports whether Gemini, Groq, and Deterministic fallback engines are operational."
)
def get_explanation_status(
    service: PlanExplanationService = Depends(get_plan_explanation_service)
) -> Dict[str, Any]:
    """Returns readiness status for Gemini, Groq, and Fallback providers."""
    return service.get_provider_status()


@router.post(
    "",
    response_model=PlanExplanationResponse,
    summary="Generate natural-language explanation and trade-off analysis for a block plan",
    description="Invokes Gemini (or Groq on fallback, or deterministic engine) with strict JSON schema and anti-hallucination validation."
)
def explain_plan(
    payload: ExplainPlanRequest,
    service: PlanExplanationService = Depends(get_plan_explanation_service)
) -> PlanExplanationResponse:
    """Generates an executive explanation for the selected block plan."""
    try:
        if payload.selection_response:
            return service.explain_selection_response(
                selection_response=payload.selection_response,
                user_query=payload.user_query
            )
        elif payload.input_data:
            if payload.user_query:
                payload.input_data.user_query = payload.user_query
            return service.explain_plan(payload.input_data)
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Either 'input_data' or 'selection_response' must be provided."
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating plan explanation: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate plan explanation: {str(e)}"
        )
