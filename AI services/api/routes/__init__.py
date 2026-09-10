"""API Routes package."""
from .health import router as health_router
from .status import router as status_router
from .data_connection import router as data_connection_router
from .data_pipeline import router as data_pipeline_router
from .synthetic import router as synthetic_router
from .prediction import router as prediction_router

__all__ = [
    "health_router",
    "status_router",
    "data_connection_router",
    "data_pipeline_router",
    "synthetic_router",
    "prediction_router"
]
