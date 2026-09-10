import socket
import httpx
from functools import lru_cache
from typing import Tuple, Dict, Any, Optional
from config.settings import Settings, get_settings
from services.backend_client import BackendClient
from utils.logger import get_logger

logger = get_logger("data_access")


class DataAccessLayer:
    """
    Unified Data Access Layer for the AI Service.
    Connects to the Railway data layer via:
    1. Primary: Existing Backend API Gateway (which manages DB transactions & fallback memory store).
    2. Secondary: Direct Supabase / PostgreSQL connectivity check.
    """

    def __init__(self, settings: Optional[Settings] = None, backend_client: Optional[BackendClient] = None):
        self.settings = settings or get_settings()
        self.backend_client = backend_client or BackendClient(self.settings)

    async def check_supabase_direct(self) -> Tuple[bool, str, str]:
        """
        Tests direct Supabase / PostgreSQL connectivity safely without exposing secrets.
        Returns: (is_reachable, status_code, details)
        """
        host = self.settings.pghost.strip()
        port = self.settings.pgport or 5432
        supabase_url = self.settings.supabase_url.strip()

        # Check PostgreSQL host if specified
        if host:
            try:
                # Fast TCP socket check with 2-second timeout
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(2.0)
                s.connect((host, int(port)))
                s.close()
                return True, "CONNECTED", f"PostgreSQL port {port} reachable"
            except socket.gaierror:
                logger.info("Supabase DB host DNS resolution failed: host unreachable")
                return False, "UNREACHABLE", "Host DNS resolution failed"
            except (socket.timeout, ConnectionRefusedError, OSError) as e:
                logger.info("Supabase DB port %s unreachable: %s", port, type(e).__name__)
                return False, "UNREACHABLE", f"Port unreachable ({type(e).__name__})"

        # Check Supabase REST URL if specified
        if supabase_url:
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    resp = await client.get(f"{supabase_url.rstrip('/')}/rest/v1/")
                    if resp.status_code < 500:
                        return True, "CONNECTED", f"Supabase REST endpoint online (HTTP {resp.status_code})"
                    return False, "DEGRADED", f"Supabase REST returned HTTP {resp.status_code}"
            except Exception as e:
                return False, "UNREACHABLE", f"REST request failed ({type(e).__name__})"

        return False, "NOT_CONFIGURED", "Supabase direct host or URL not configured"

    async def check_connectivity_summary(self) -> Dict[str, Any]:
        """
        Runs health and connectivity checks across both Backend and Supabase sources.
        Guarantees zero leakage of credentials or sensitive database records.
        """
        backend_ok, backend_msg = await self.backend_client.check_health()
        auth_ok, _, auth_msg = await self.backend_client.authenticate() if backend_ok else (False, None, "Backend unavailable")
        supabase_ok, supabase_status, supabase_msg = await self.check_supabase_direct()

        overall_status = "operational" if backend_ok else ("degraded" if supabase_ok else "offline")

        return {
            "overall_status": overall_status,
            "backend": {
                "status": "CONNECTED" if backend_ok else "UNREACHABLE",
                "url": self.settings.backend_api_url,
                "authenticated": auth_ok,
                "details": f"{backend_msg} | Auth: {auth_msg}"
            },
            "supabase": {
                "status": supabase_status,
                "host_configured": bool(self.settings.pghost or self.settings.supabase_url),
                "details": supabase_msg
            }
        }

    async def get_planning_data(self, corridor_code: str, horizon_start: Optional[str] = None, horizon_end: Optional[str] = None) -> Dict[str, Any]:
        """
        Extracts AI planning data via the backend gateway.
        """
        return await self.backend_client.get_planning_data(corridor_code, horizon_start, horizon_end)


@lru_cache()
def get_data_access() -> DataAccessLayer:
    """Returns singleton DataAccessLayer."""
    return DataAccessLayer()
