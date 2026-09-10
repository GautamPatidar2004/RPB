from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Health check endpoint response model."""
    status: str = Field(default="healthy", description="Current health status of AI service")
    service: str = Field(default="railway-ai-service", description="Service identifier")
    version: str = Field(default="1.0.0", description="Service semantic version")
