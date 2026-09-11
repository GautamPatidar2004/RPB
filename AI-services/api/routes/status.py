from fastapi import APIRouter, Depends
from schemas.status import StatusResponse, BackendConnectionStatus, SupabaseConnectionStatus
from data.data_access import DataAccessLayer, get_data_access
from config.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1", tags=["Status"])


@router.get(
    "/status",
    response_model=StatusResponse,
    summary="AI Service Operational & Connectivity Status",
    description="Reports the service status and connectivity to backend and Supabase data layers without credentials."
)
async def get_system_status(
    data_access: DataAccessLayer = Depends(get_data_access),
    settings: Settings = Depends(get_settings)
) -> StatusResponse:
    summary = await data_access.check_connectivity_summary()

    backend_info = summary["backend"]
    supabase_info = summary["supabase"]

    return StatusResponse(
        status=summary["overall_status"],
        service="railway-ai-service",
        version="1.0.0",
        environment=settings.environment,
        backend_connection=BackendConnectionStatus(
            status=backend_info["status"],
            url=backend_info["url"],
            authenticated=backend_info["authenticated"],
            details=backend_info.get("details")
        ),
        supabase_connection=SupabaseConnectionStatus(
            status=supabase_info["status"],
            host_configured=supabase_info["host_configured"],
            details=supabase_info.get("details")
        )
    )
