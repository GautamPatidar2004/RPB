import httpx
from typing import Tuple, Optional, Dict, Any
from config.settings import Settings, get_settings
from utils.logger import get_logger

logger = get_logger("backend_client")


class BackendClient:
    """
    Client for interacting with the existing Express backend API.
    Handles health checks, authentication, planning data extraction, and plan submission.
    """

    def __init__(self, settings: Optional[Settings] = None, client: Optional[httpx.AsyncClient] = None):
        self.settings = settings or get_settings()
        self._client = client
        self._auth_token: Optional[str] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.settings.backend_api_url.rstrip("/"),
                timeout=self.settings.backend_timeout_seconds
            )
        return self._client

    async def close(self):
        """Close underlying HTTP client session."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def check_health(self) -> Tuple[bool, str]:
        """
        Queries backend /api/health endpoint to verify connectivity.
        Returns: (is_healthy, status_message)
        """
        try:
            client = await self._get_client()
            resp = await client.get("/api/health")
            if resp.status_code == 200:
                data = resp.json()
                service_status = data.get("status", "UP")
                return True, f"Backend online ({service_status})"
            return False, f"Backend returned HTTP {resp.status_code}"
        except httpx.ConnectError:
            logger.warning("Failed to connect to backend at %s: connection refused", self.settings.backend_api_url)
            return False, "Backend connection refused / offline"
        except httpx.TimeoutException:
            logger.warning("Timeout connecting to backend at %s", self.settings.backend_api_url)
            return False, "Backend connection timed out"
        except Exception as e:
            logger.warning("Backend health check failed: %s", str(e))
            return False, f"Backend error: {type(e).__name__}"

    async def authenticate(self, force_refresh: bool = False) -> Tuple[bool, Optional[str], str]:
        """
        Authenticates with backend /api/auth/login using configured credentials.
        Returns: (success, token, message)
        """
        if self._auth_token and not force_refresh:
            return True, self._auth_token, "Cached session token active"

        if not self.settings.backend_auth_username or not self.settings.backend_auth_password:
            return False, None, "Backend credentials not configured"

        try:
            client = await self._get_client()
            resp = await client.post("/api/auth/login", json={
                "username": self.settings.backend_auth_username,
                "password": self.settings.backend_auth_password
            })

            if resp.status_code == 200:
                body = resp.json()
                token = body.get("token")
                if token:
                    self._auth_token = token
                    return True, token, "Authenticated successfully"
                return False, None, "Token missing in login response"
            return False, None, f"Login failed with HTTP {resp.status_code}"
        except httpx.ConnectError:
            return False, None, "Backend connection refused during auth"
        except httpx.TimeoutException:
            return False, None, "Backend timeout during auth"
        except Exception as e:
            return False, None, f"Auth exception: {type(e).__name__}"

    async def get_planning_data(self, corridor_code: str, horizon_start: Optional[str] = None, horizon_end: Optional[str] = None) -> Dict[str, Any]:
        """
        Retrieves complete planning data package from backend /api/v1/ai/planning-data.
        """
        auth_ok, token, auth_msg = await self.authenticate()
        if not auth_ok or not token:
            raise RuntimeError(f"Cannot retrieve planning data: Backend authentication failed ({auth_msg})")

        params = {"corridor_code": corridor_code}
        if horizon_start:
            params["horizon_start"] = horizon_start
        if horizon_end:
            params["horizon_end"] = horizon_end

        client = await self._get_client()
        headers = {"Authorization": f"Bearer {token}"}
        resp = await client.get("/api/v1/ai/planning-data", params=params, headers=headers)

        if resp.status_code == 401:
            # Re-authenticate once if token expired
            auth_ok, token, _ = await self.authenticate(force_refresh=True)
            if auth_ok and token:
                headers = {"Authorization": f"Bearer {token}"}
                resp = await client.get("/api/v1/ai/planning-data", params=params, headers=headers)

        if resp.status_code != 200:
            err_msg = resp.text
            try:
                err_msg = resp.json().get("error", err_msg)
            except Exception:
                pass
            raise RuntimeError(f"Backend planning data extraction failed (HTTP {resp.status_code}): {err_msg}")

        return resp.json()

    async def submit_plan(self, plan_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Submits generated block plan to backend /api/v1/ai/plans for registration & conflict checks.
        """
        auth_ok, token, auth_msg = await self.authenticate()
        if not auth_ok or not token:
            raise RuntimeError(f"Cannot submit plan: Backend authentication failed ({auth_msg})")

        client = await self._get_client()
        headers = {"Authorization": f"Bearer {token}"}
        resp = await client.post("/api/v1/ai/plans", json=plan_payload, headers=headers)

        if resp.status_code not in (200, 201):
            err_msg = resp.text
            try:
                err_msg = resp.json().get("error", err_msg)
            except Exception:
                pass
            raise RuntimeError(f"Backend plan submission failed (HTTP {resp.status_code}): {err_msg}")

        return resp.json()
