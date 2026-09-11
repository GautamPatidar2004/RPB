"""API Routes package."""
from .health import router as health_router
from .status import router as status_router
from .data_connection import router as data_connection_router
from .data_pipeline import router as data_pipeline_router
from .synthetic import router as synthetic_router
from .prediction import router as prediction_router
from .constraints import router as constraints_router
from .optimizer import router as optimizer_router
from .scoring import router as scoring_router
from .explanation import router as explanation_router
from .planning import router as planning_router

__all__ = [
    "health_router",
    "status_router",
    "data_connection_router",
    "data_pipeline_router",
    "synthetic_router",
    "prediction_router",
    "constraints_router",
    "optimizer_router",
    "scoring_router",
    "explanation_router",
    "planning_router"
]
