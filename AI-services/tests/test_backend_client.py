import pytest
import httpx
from services.backend_client import BackendClient
from data.data_access import DataAccessLayer
from config.settings import Settings


@pytest.mark.anyio
async def test_backend_client_connection_failure():
    """Verify backend client gracefully handles unreachable host without crashing."""
    # Use non-routable port to guarantee connection refused/failure
    test_settings = Settings(
        backend_api_url="http://127.0.0.1:59999",
        backend_timeout_seconds=0.5
    )
    client = BackendClient(settings=test_settings)
    try:
        is_healthy, msg = await client.check_health()
        assert is_healthy is False
        assert "refused" in msg.lower() or "offline" in msg.lower() or "timed out" in msg.lower()

        auth_ok, token, auth_msg = await client.authenticate()
        assert auth_ok is False
        assert token is None
    finally:
        await client.close()


@pytest.mark.anyio
async def test_supabase_direct_connectivity_failure_handled_cleanly():
    """Verify DataAccessLayer handles invalid/unreachable DB host cleanly."""
    test_settings = Settings(
        pghost="invalid.database.nonexistent.domain",
        pgport=5432
    )
    data_access = DataAccessLayer(settings=test_settings)
    reachable, status, details = await data_access.check_supabase_direct()
    assert reachable is False
    assert status == "UNREACHABLE"
    assert "DNS" in details or "unreachable" in details.lower()
