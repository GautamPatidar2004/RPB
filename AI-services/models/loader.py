import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

import json
import threading
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
import numpy as np
import pandas as pd
import xgboost as xgb

from models.preprocessor import RailwayFeaturePreprocessor, RISK_TIERS
from utils.logger import get_logger

logger = get_logger("model_loader")

MODELS_BASE_DIR = Path(__file__).resolve().parent / "saved_models"


class ModelNotReadyError(Exception):
    """Raised when a prediction is attempted but models are not loaded or validated."""
    pass


class ModelLoaderService:
    """
    Thread-safe model loading and lifecycle management service for Railway XGBoost models.
    Loads and caches duration, risk, and operational impact models once in memory.
    """
    _instance: Optional["ModelLoaderService"] = None
    _lock = threading.Lock()

    def __init__(self, version: str = "v1"):
        self.version = version
        self.version_dir = MODELS_BASE_DIR / version
        self.duration_model: Optional[xgb.XGBRegressor] = None
        self.risk_model: Optional[xgb.XGBClassifier] = None
        self.impact_model: Optional[xgb.XGBRegressor] = None
        self.preprocessor: Optional[RailwayFeaturePreprocessor] = None
        self.metadata: Dict[str, Any] = {}
        self.is_ready: bool = False
        self._load_error: Optional[str] = None

    @classmethod
    def get_instance(cls, version: str = "v1") -> "ModelLoaderService":
        """Singleton accessor for thread-safe shared model instance."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls(version=version)
        return cls._instance

    def load_artifacts(self) -> bool:
        """
        Loads all three models and the preprocessor from disk.
        Safely validates files without crashing server if missing/corrupted.
        """
        with self._lock:
            try:
                logger.info("Loading Railway AI model artifacts from: %s", self.version_dir)
                dur_file = self.version_dir / "duration_model.json"
                risk_file = self.version_dir / "risk_model.json"
                imp_file = self.version_dir / "impact_model.json"
                prep_file = self.version_dir / "preprocessor.joblib"
                meta_file = self.version_dir / "metadata.json"

                missing = [p.name for p in [dur_file, risk_file, imp_file, prep_file, meta_file] if not p.exists()]
                if missing:
                    err_msg = f"Missing required model artifact files in {self.version_dir}: {missing}"
                    logger.warning(err_msg)
                    self._load_error = err_msg
                    self.is_ready = False
                    return False

                # 1. Load Preprocessor
                self.preprocessor = RailwayFeaturePreprocessor.load(prep_file)
                if not self.preprocessor.is_fitted:
                    raise ValueError("Loaded preprocessor is not fitted.")

                # 2. Load Metadata
                with open(meta_file, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)

                # 3. Load Models with single-thread config for Python 3.14 safety
                dur_m = xgb.XGBRegressor(n_jobs=1)
                dur_m.load_model(str(dur_file))
                self.duration_model = dur_m

                risk_m = xgb.XGBClassifier(n_jobs=1)
                risk_m.load_model(str(risk_file))
                self.risk_model = risk_m

                imp_m = xgb.XGBRegressor(n_jobs=1)
                imp_m.load_model(str(imp_file))
                self.impact_model = imp_m

                # 4. Smoke test validation
                self._validate_models_on_startup()

                self.is_ready = True
                self._load_error = None
                logger.info("Successfully loaded and validated all 3 XGBoost models (version: %s, features: %d)",
                            self.version, len(self.preprocessor.feature_names_out))
                return True

            except Exception as e:
                logger.error("Failed to load or validate model artifacts: %s", str(e), exc_info=True)
                self._load_error = str(e)
                self.is_ready = False
                return False

    def _validate_models_on_startup(self):
        """Runs a minimal non-intrusive inference check on synthetic dummy input."""
        if not self.preprocessor or not self.duration_model or not self.risk_model or not self.impact_model:
            raise ValueError("Incomplete model components during startup validation.")

        dummy_df = pd.DataFrame([{
            "corridor_code": "NDLS-CNB",
            "feat_maint_type": "TRACK_TAMPING",
            "feat_department": "ENGG",
            "feat_asset_type": "TRACK",
            "feat_asset_criticality": "MEDIUM",
            "feat_asset_health_status": "OPERATIONAL",
            "feat_task_urgency": "MEDIUM",
            "feat_priority": 3,
            "feat_power_block_req": 0,
            "feat_traffic_block_req": 1,
            "feat_speed_restriction_kmph": 0.0,
            "feat_work_complexity_score": 2.0,
            "feat_corridor_length_km": 440.0,
            "feat_corridor_electrified": 1,
            "feat_corridor_double_line": 1,
            "feat_section_span_km": 1.0,
            "feat_dependency_count": 0,
            "feat_asset_criticality_score": 2,
            "feat_asset_health_score": 1,
            "feat_task_urgency_score": 2,
            "feat_days_until_required": 3.0,
            "feat_is_overdue": 0,
            "feat_task_priority_score": 3,
            "feat_train_traffic_count": 20,
            "feat_high_priority_train_count": 5,
            "feat_high_priority_train_ratio": 0.25,
            "feat_available_window_count": 2,
            "feat_total_available_window_minutes": 180.0,
            "feat_window_to_task_duration_ratio": 1.5,
            "feat_potential_train_conflicts": 5
        }])

        X_val = self.preprocessor.transform(dummy_df)
        _ = self.duration_model.predict(X_val)
        _ = self.risk_model.predict(X_val)
        _ = self.risk_model.predict_proba(X_val)
        _ = self.impact_model.predict(X_val)

    def predict_duration(self, features_df: pd.DataFrame) -> np.ndarray:
        """Predicts maintenance duration in minutes."""
        if not self.is_ready or self.duration_model is None or self.preprocessor is None:
            raise ModelNotReadyError(self._load_error or "Duration model is not loaded or ready.")
        X = self.preprocessor.transform(features_df)
        preds = self.duration_model.predict(X)
        # Ensure non-negative duration
        return np.maximum(15.0, preds)

    def predict_risk(self, features_df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        Predicts asset risk/priority tier.
        Returns:
            - winning class indices (0=LOW, 1=MEDIUM, 2=HIGH)
            - full probability distribution matrix (N, 3)
        """
        if not self.is_ready or self.risk_model is None or self.preprocessor is None:
            raise ModelNotReadyError(self._load_error or "Risk model is not loaded or ready.")
        X = self.preprocessor.transform(features_df)
        class_preds = self.risk_model.predict(X).astype(int)
        prob_preds = self.risk_model.predict_proba(X)
        return class_preds, prob_preds

    def predict_impact(self, features_df: pd.DataFrame) -> np.ndarray:
        """Predicts corridor operational impact score (0 to 100)."""
        if not self.is_ready or self.impact_model is None or self.preprocessor is None:
            raise ModelNotReadyError(self._load_error or "Operational impact model is not loaded or ready.")
        X = self.preprocessor.transform(features_df)
        preds = self.impact_model.predict(X)
        # Clip to valid 0-100 friction score range
        return np.clip(preds, 0.0, 100.0)

    def get_model_status(self) -> Dict[str, Any]:
        """Returns safe, comprehensive model readiness and version status without exposing secrets."""
        models_meta = self.metadata.get("models", {})
        metrics = self.metadata.get("metrics", {})

        return {
            "ready": self.is_ready,
            "model_version": self.version,
            "loaded_models": {
                "duration_model": {
                    "loaded": self.duration_model is not None,
                    "model_type": models_meta.get("duration_model", {}).get("type", "XGBRegressor"),
                    "target": models_meta.get("duration_model", {}).get("target", "target_maintenance_duration"),
                    "file": models_meta.get("duration_model", {}).get("file", "duration_model.json")
                },
                "risk_model": {
                    "loaded": self.risk_model is not None,
                    "model_type": models_meta.get("risk_model", {}).get("type", "XGBClassifier"),
                    "target": models_meta.get("risk_model", {}).get("target", "target_asset_risk_priority"),
                    "file": models_meta.get("risk_model", {}).get("file", "risk_model.json")
                },
                "impact_model": {
                    "loaded": self.impact_model is not None,
                    "model_type": models_meta.get("impact_model", {}).get("type", "XGBRegressor"),
                    "target": models_meta.get("impact_model", {}).get("target", "target_operational_impact"),
                    "file": models_meta.get("impact_model", {}).get("file", "impact_model.json")
                }
            },
            "preprocessor_ready": self.preprocessor is not None and self.preprocessor.is_fitted,
            "feature_count": len(self.preprocessor.feature_names_out) if self.preprocessor else 0,
            "data_source_mode": self.metadata.get("data_source_mode", "unknown"),
            "dataset_rows": self.metadata.get("dataset_rows", 0),
            "created_at": self.metadata.get("created_at", ""),
            "metrics_summary": {
                "duration_mae_minutes": metrics.get("duration", {}).get("mae"),
                "duration_r2": metrics.get("duration", {}).get("r2"),
                "risk_accuracy": metrics.get("risk", {}).get("accuracy"),
                "risk_f1_weighted": metrics.get("risk", {}).get("f1_weighted"),
                "impact_mae_points": metrics.get("impact", {}).get("mae"),
                "impact_r2": metrics.get("impact", {}).get("r2")
            }
        }


def get_model_loader(version: str = "v1") -> ModelLoaderService:
    """Dependency provider for ModelLoaderService."""
    loader = ModelLoaderService.get_instance(version=version)
    if not loader.is_ready:
        loader.load_artifacts()
    return loader
