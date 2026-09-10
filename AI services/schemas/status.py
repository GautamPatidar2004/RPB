from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class BackendConnectionStatus(BaseModel):
    """Status details for backend API connection without credentials."""
    status: str = Field(description="Connection state: CONNECTED, DEGRADED, or UNREACHABLE")
    url: str = Field(description="Configured backend URL")
    authenticated: bool = Field(default=False, description="Whether authentication was successful")
    details: Optional[str] = Field(default=None, description="Diagnostic details")


class SupabaseConnectionStatus(BaseModel):
    """Status details for Supabase / PostgreSQL data layer without credentials."""
    status: str = Field(description="Connection state: CONNECTED, UNREACHABLE, or NOT_CONFIGURED")
    host_configured: bool = Field(default=False, description="Whether DB host is configured")
    details: Optional[str] = Field(default=None, description="Diagnostic message without secrets")


class StatusResponse(BaseModel):
    """Service status report response model."""
    status: str = Field(description="Overall operational status: operational, degraded, or offline")
    service: str = Field(default="railway-ai-service", description="Service name")
    version: str = Field(default="1.0.0", description="Service version")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="UTC timestamp")
    environment: str = Field(default="development", description="Runtime environment")
    backend_connection: BackendConnectionStatus = Field(description="Backend API connectivity status")
    supabase_connection: SupabaseConnectionStatus = Field(description="Supabase data layer connectivity status")


class ConnectionTestResponse(BaseModel):
    """Safe internal data connection test response."""
    success: bool = Field(description="True if primary data source is reachable")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Test timestamp")
    backend: Dict[str, Any] = Field(description="Backend connectivity test results")
    supabase: Dict[str, Any] = Field(description="Supabase direct connectivity test results")
