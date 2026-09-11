from pathlib import Path
from typing import Dict, Any
from pydantic import BaseModel, Field

import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

MODELS_DIR = Path(__file__).resolve().parent
SAVED_MODELS_DIR = MODELS_DIR / "saved_models"
DATA_DIR = MODELS_DIR.parent / "data"


class TrainingConfig(BaseModel):
    """Configuration for ML model training, preprocessing, and evaluation."""
    dataset_path: str = Field(
        default=str(DATA_DIR / "processed" / "combined_dataset.csv"),
        description="Path to ML-ready dataset (combined or synthetic)"
    )
    combined_dataset_path: str = Field(
        default=str(DATA_DIR / "processed" / "combined_dataset.csv"),
        description="Path to combined dataset if available"
    )
    model_version: str = Field(default="v1", description="Model version tag")
    random_seed: int = Field(default=42, description="Random seed for reproducibility")
    test_size: float = Field(default=0.15, description="Fraction for test set")
    val_size: float = Field(default=0.15, description="Fraction for validation set")

    # XGBoost Hyperparameters for Duration Model (Regression)
    xgb_params_duration: Dict[str, Any] = Field(
        default_factory=lambda: {
            "n_estimators": 120,
            "max_depth": 5,
            "learning_rate": 0.08,
            "subsample": 0.85,
            "colsample_bytree": 0.85,
            "n_jobs": 1,
            "random_state": 42
        }
    )

    # XGBoost Hyperparameters for Risk/Priority Model (Multi-Class Classification)
    xgb_params_risk: Dict[str, Any] = Field(
        default_factory=lambda: {
            "n_estimators": 100,
            "max_depth": 4,
            "learning_rate": 0.08,
            "subsample": 0.85,
            "colsample_bytree": 0.85,
            "objective": "multi:softprob",
            "num_class": 3,
            "n_jobs": 1,
            "random_state": 42
        }
    )

    # XGBoost Hyperparameters for Operational Impact Model (Regression)
    xgb_params_impact: Dict[str, Any] = Field(
        default_factory=lambda: {
            "n_estimators": 120,
            "max_depth": 5,
            "learning_rate": 0.08,
            "subsample": 0.85,
            "colsample_bytree": 0.85,
            "n_jobs": 1,
            "random_state": 42
        }
    )

    def get_version_dir(self) -> Path:
        """Returns versioned output directory path."""
        out_dir = SAVED_MODELS_DIR / self.model_version
        out_dir.mkdir(parents=True, exist_ok=True)
        return out_dir
