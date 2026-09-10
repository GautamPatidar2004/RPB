import sys
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Ensure current service directory is on sys.path for robust resolution
CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from config.settings import get_settings
from utils.logger import get_logger
from services.backend_client import BackendClient
from data.data_access import get_data_access
from models.loader import ModelLoaderService
from api.routes import (
    health_router,
    status_router,
    data_connection_router,
    data_pipeline_router,
    synthetic_router,
    prediction_router
)

logger = get_logger("ai_service_main")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager: initializes resources on startup and cleans up on shutdown."""
    safe_config = settings.get_safe_summary()
    logger.info("Starting Railway AI Service [env=%s, host=%s, port=%s]",
                safe_config["environment"], safe_config["ai_service_host"], safe_config["ai_service_port"])
    logger.info("Backend API configured at: %s", safe_config["backend_api_url"])

    # Eagerly load and validate ML models on startup
    try:
        model_loader = ModelLoaderService.get_instance()
        loaded = model_loader.load_artifacts()
        if loaded:
            logger.info("ML Models successfully loaded on startup (version: %s)", model_loader.version)
        else:
            logger.warning("ML Models were not loaded on startup. Predictions will return 503 until models are trained.")
    except Exception as e:
        logger.error("Error during startup ML model loading: %s", str(e), exc_info=True)

    yield
    # Shutdown
    logger.info("Shutting down Railway AI Service...")
    data_access = get_data_access()
    await data_access.backend_client.close()
    logger.info("AI Service shutdown complete.")


def create_app() -> FastAPI:
    """Factory creating and configuring the FastAPI application."""
    app = FastAPI(
        title="Indian Railways Automatic Block Planning - AI Service",
        description="Python AI Service Foundation providing optimization and planning data services.",
        version="1.0.0",
        lifespan=lifespan
    )

    # Configure CORS restricted to configured origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # Global Exception Handler
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error("Unhandled server exception during %s %s: %s", request.method, request.url.path, str(exc))
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": "Internal AI service error", "type": type(exc).__name__}
        )

    # Mount API Routes
    app.include_router(health_router)
    app.include_router(status_router)
    app.include_router(data_connection_router)
    app.include_router(data_pipeline_router)
    app.include_router(synthetic_router)
    app.include_router(prediction_router)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.ai_service_host,
        port=settings.ai_service_port,
        reload=(settings.environment == "development")
    )
