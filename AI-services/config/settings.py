import os
from functools import lru_cache
from pathlib import Path
from typing import List
from pydantic import Field, AliasChoices
from pydantic_settings import BaseSettings, SettingsConfigDict

# Base directory for AI Service to reliably locate .env file
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables with .env fallback.
    Never exposes credentials through safe inspection methods.
    """
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE) if ENV_FILE.exists() else None,
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False
    )

    # Server Settings
    ai_service_host: str = Field(
        default="0.0.0.0",
        validation_alias=AliasChoices("HOST", "AI_SERVICE_HOST"),
        description="Host address to bind the AI service"
    )
    ai_service_port: int = Field(
        default=8000,
        validation_alias=AliasChoices("PORT", "AI_SERVICE_PORT"),
        description="Port for the AI service"
    )
    environment: str = Field(default="development", description="Service runtime environment")
    log_level: str = Field(default="INFO", description="Logging level")

    # Backend API Settings
    backend_api_url: str = Field(default="http://localhost:5000", description="Base URL of existing Express backend")
    backend_auth_username: str = Field(default="planner", description="Username for authenticating with backend")
    backend_auth_password: str = Field(default="Planner@123", description="Password for authenticating with backend")
    backend_timeout_seconds: float = Field(default=5.0, description="HTTP timeout for backend requests in seconds")

    # Supabase / PostgreSQL Direct Settings
    pghost: str = Field(default="", description="PostgreSQL / Supabase DB host")
    pgport: int = Field(default=5432, description="PostgreSQL / Supabase DB port")
    pguser: str = Field(default="", description="PostgreSQL / Supabase DB user")
    pgpassword: str = Field(default="", description="PostgreSQL / Supabase DB password")
    pgdatabase: str = Field(default="", description="PostgreSQL / Supabase DB database name")
    supabase_url: str = Field(default="", description="Supabase project URL if direct REST is configured")
    supabase_key: str = Field(default="", description="Supabase API key if direct REST is configured")

    # CORS Settings
    cors_origins: List[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://localhost:5173", "http://localhost:5000"],
        description="Allowed CORS origins"
    )

    def get_safe_summary(self) -> dict:
        """Returns non-sensitive configuration summary without exposing credentials."""
        return {
            "environment": self.environment,
            "ai_service_host": self.ai_service_host,
            "ai_service_port": self.ai_service_port,
            "log_level": self.log_level,
            "backend_api_url": self.backend_api_url,
            "backend_auth_username": self.backend_auth_username,
            "backend_configured": bool(self.backend_api_url),
            "supabase_configured": bool(self.pghost or self.supabase_url),
            "pghost_configured": bool(self.pghost),
            "cors_origins": self.cors_origins
        }


@lru_cache()
def get_settings() -> Settings:
    """Returns cached Settings instance."""
    return Settings()
