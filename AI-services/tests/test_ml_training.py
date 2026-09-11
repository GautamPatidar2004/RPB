import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

import pytest
import numpy as np
import pandas as pd
from pathlib import Path

from models.config import TrainingConfig
from models.preprocessor import RailwayFeaturePreprocessor, discretize_risk, RISK_TIERS
from models.evaluator import ModelEvaluator
from models.artifacts import ModelArtifactManager
from models.loader import ModelLoaderService


def test_discretize_risk():
    """Verifies risk discretization into 3 tiers."""
    assert discretize_risk(20.0) == 0  # LOW
    assert discretize_risk(49.9) == 0  # LOW
    assert discretize_risk(50.0) == 1  # MEDIUM
    assert discretize_risk(74.9) == 1  # MEDIUM
    assert discretize_risk(75.0) == 2  # HIGH
    assert discretize_risk(99.0) == 2  # HIGH


def test_preprocessor_fit_transform():
    """Verifies leak-free preprocessing transformation."""
    df_sample = pd.DataFrame([
        {
            "feat_maint_type": "TRACK_TAMPING",
            "feat_department": "ENGG",
            "feat_asset_type": "TRACK",
            "feat_asset_criticality": "HIGH",
            "feat_asset_health_status": "DEGRADED",
            "feat_task_urgency": "HIGH",
            "corridor_code": "NDLS-CNB",
            "feat_priority": 4,
            "feat_power_block_req": 0,
            "feat_traffic_block_req": 1,
            "feat_speed_restriction_kmph": 30.0,
            "feat_work_complexity_score": 3.0,
            "feat_corridor_length_km": 440.0,
            "feat_corridor_electrified": 1,
            "feat_corridor_double_line": 1,
            "feat_section_span_km": 2.0,
            "feat_dependency_count": 1,
            "feat_asset_criticality_score": 3,
            "feat_asset_health_score": 4,
            "feat_task_urgency_score": 3,
            "feat_days_until_required": 2.0,
            "feat_is_overdue": 0,
            "feat_task_priority_score": 2,
            "feat_train_traffic_count": 25,
            "feat_high_priority_train_count": 6,
            "feat_high_priority_train_ratio": 0.24,
            "feat_available_window_count": 2,
            "feat_total_available_window_minutes": 200.0,
            "feat_window_to_task_duration_ratio": 1.6,
            "feat_potential_train_conflicts": 7
        },
        {
            "feat_maint_type": "OHE_INSPECTION",
            "feat_department": "TRD",
            "feat_asset_type": "OHE_LINE",
            "feat_asset_criticality": "CRITICAL",
            "feat_asset_health_status": "OPERATIONAL",
            "feat_task_urgency": "LOW",
            "corridor_code": "NDLS-CNB",
            "feat_priority": 2,
            "feat_power_block_req": 1,
            "feat_traffic_block_req": 0,
            "feat_speed_restriction_kmph": 0.0,
            "feat_work_complexity_score": 1.5,
            "feat_corridor_length_km": 440.0,
            "feat_corridor_electrified": 1,
            "feat_corridor_double_line": 1,
            "feat_section_span_km": 5.0,
            "feat_dependency_count": 0,
            "feat_asset_criticality_score": 4,
            "feat_asset_health_score": 1,
            "feat_task_urgency_score": 1,
            "feat_days_until_required": 10.0,
            "feat_is_overdue": 0,
            "feat_task_priority_score": 4,
            "feat_train_traffic_count": 30,
            "feat_high_priority_train_count": 10,
            "feat_high_priority_train_ratio": 0.33,
            "feat_available_window_count": 3,
            "feat_total_available_window_minutes": 240.0,
            "feat_window_to_task_duration_ratio": 2.0,
            "feat_potential_train_conflicts": 0
        }
    ])

    prep = RailwayFeaturePreprocessor()
    X = prep.fit_transform(df_sample)
    assert prep.is_fitted
    assert X.shape[0] == 2
    assert X.shape[1] == len(prep.feature_names_out)
    assert not np.isnan(X).any()


def test_evaluator_regression_metrics():
    """Verifies regression metrics calculation against baseline."""
    y_true = np.array([100.0, 150.0, 200.0, 250.0])
    y_pred = np.array([102.0, 148.0, 198.0, 252.0])
    y_train = np.array([120.0, 180.0, 220.0])

    metrics = ModelEvaluator.evaluate_regression(y_true, y_pred, y_train, "test_task")
    assert "mae" in metrics
    assert "rmse" in metrics
    assert "r2" in metrics
    assert metrics["mae"] < metrics["baseline_mean_mae"]
    assert metrics["beats_baseline"] is True


def test_evaluator_classification_metrics():
    """Verifies multi-class evaluation against baseline."""
    y_true = np.array([0, 1, 2, 1, 0, 2])
    y_pred = np.array([0, 1, 2, 1, 0, 2])
    y_train = np.array([0, 0, 1, 2])

    metrics = ModelEvaluator.evaluate_classification(y_true, y_pred, y_train, "test_risk")
    assert metrics["accuracy"] == 1.0
    assert metrics["beats_baseline"] is True


def test_saved_artifacts_exist_and_loadable():
    """Verifies that the trained Prompt 4 artifacts exist on disk and can be loaded."""
    v1_dir = Path(__file__).resolve().parent.parent / "models" / "saved_models" / "v1"
    if not v1_dir.exists():
        v1_dir = Path("AI services/models/saved_models/v1")
    assert (v1_dir / "duration_model.json").exists()
    assert (v1_dir / "risk_model.json").exists()
    assert (v1_dir / "impact_model.json").exists()
    assert (v1_dir / "preprocessor.joblib").exists()
    assert (v1_dir / "metadata.json").exists()
    assert (v1_dir / "training_report.md").exists()

    loader = ModelLoaderService(version="v1")
    success = loader.load_artifacts()
    assert success is True
    assert loader.is_ready is True
    assert loader.duration_model is not None
    assert loader.risk_model is not None
    assert loader.impact_model is not None
    assert loader.preprocessor is not None
