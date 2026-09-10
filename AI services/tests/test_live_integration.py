import pytest
import httpx
from services.backend_client import BackendClient
from data.data_access import DataAccessLayer
from config.settings import get_settings


@pytest.mark.anyio
async def test_live_backend_connection():
    """Verifies live backend connectivity when backend service is up, skips gracefully otherwise."""
    settings = get_settings()
    client = BackendClient(settings)
    try:
        is_healthy, msg = await client.check_health()
        if not is_healthy:
            pytest.skip(f"Backend is not running at {settings.backend_api_url} ({msg})")

        assert is_healthy is True

        # Test authentication
        auth_ok, token, auth_msg = await client.authenticate()
        assert auth_ok is True
        assert token is not None

        # Test planning data extraction
        da = DataAccessLayer(settings, client)
        data = await da.get_planning_data("NDLS-CNB")
        assert data.get("success") is True
        assert "maintenanceTasks" in data
        assert "blockWindows" in data
    finally:
        await client.close()
