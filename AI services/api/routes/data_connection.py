from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from schemas.status import ConnectionTestResponse
from data.data_access import DataAccessLayer, get_data_access

router = APIRouter(prefix="/api/v1/data", tags=["Data Connection"])


@router.get(
    "/test-connection",
    response_model=ConnectionTestResponse,
    summary="Safe Data Connection Test",
    description="Tests communication with existing backend API and Supabase data sources without exposing sensitive records."
)
async def test_data_connection(
    data_access: DataAccessLayer = Depends(get_data_access)
) -> ConnectionTestResponse:
    summary = await data_access.check_connectivity_summary()

    backend_ok = summary["backend"]["status"] == "CONNECTED"
    supabase_ok = summary["supabase"]["status"] == "CONNECTED"

    return ConnectionTestResponse(
        success=(backend_ok or supabase_ok),
        timestamp=datetime.now(timezone.utc),
        backend=summary["backend"],
        supabase=summary["supabase"]
    )
