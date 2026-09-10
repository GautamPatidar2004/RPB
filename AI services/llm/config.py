import os
from typing import List, Optional
from pydantic import BaseModel, Field


class LLMConfig(BaseModel):
    """
    Configuration for Gemini and Groq LLM intelligence/explanation providers.
    Reads securely from environment variables; never exposes keys in logs or payloads.
    """
    gemini_api_key: Optional[str] = Field(
        default_factory=lambda: os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"),
        description="Google Gemini API key"
    )
    gemini_model: str = Field(
        default_factory=lambda: os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
        description="Default Gemini model"
    )

    groq_api_key: Optional[str] = Field(
        default_factory=lambda: os.environ.get("GROQ_API_KEY"),
        description="Groq API key"
    )
    groq_model: str = Field(
        default_factory=lambda: os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
        description="Default Groq model"
    )

    provider_order: List[str] = Field(
        default_factory=lambda: ["gemini", "groq"],
        description="Priority order of LLM providers before deterministic fallback"
    )
    timeout_seconds: float = Field(
        default_factory=lambda: float(os.environ.get("LLM_TIMEOUT_SECONDS", "12.0")),
        ge=1.0,
        le=60.0,
        description="Timeout per provider request in seconds"
    )
    max_retries: int = Field(default=1, ge=0, le=3, description="Maximum retries per provider on transient failures")
    enable_deterministic_fallback: bool = Field(default=True, description="Whether to fall back to rule-based explanation on failure")

    def has_gemini_key(self) -> bool:
        return bool(self.gemini_api_key and self.gemini_api_key.strip())

    def has_groq_key(self) -> bool:
        return bool(self.groq_api_key and self.groq_api_key.strip())


def get_default_llm_config() -> LLMConfig:
    """Dependency provider for default LLM configuration."""
    return LLMConfig()
