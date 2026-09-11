from fastapi import APIRouter
from schemas.health import HealthResponse

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="AI Service Health Check",
    description="Returns service health status to indicate the process is alive and responsive."
)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="healthy",
        service="railway-ai-service",
        version="1.0.0"
    )
