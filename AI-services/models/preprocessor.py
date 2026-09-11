from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
import numpy as np
import pandas as pd
from sklearn.preprocessing import OneHotEncoder, StandardScaler
import joblib
from utils.logger import get_logger

logger = get_logger("model_preprocessor")

CATEGORICAL_FEATURES = [
    "feat_maint_type",
    "feat_department",
    "feat_asset_type",
    "feat_asset_criticality",
    "feat_asset_health_status",
    "feat_task_urgency",
    "corridor_code"
]

NUMERIC_FEATURES = [
    "feat_priority",
    "feat_power_block_req",
    "feat_traffic_block_req",
    "feat_speed_restriction_kmph",
    "feat_work_complexity_score",
    "feat_corridor_length_km",
    "feat_corridor_electrified",
    "feat_corridor_double_line",
    "feat_section_span_km",
    "feat_dependency_count",
    "feat_asset_criticality_score",
    "feat_asset_health_score",
    "feat_task_urgency_score",
    "feat_days_until_required",
    "feat_is_overdue",
    "feat_task_priority_score",
    "feat_train_traffic_count",
    "feat_high_priority_train_count",
    "feat_high_priority_train_ratio",
    "feat_available_window_count",
    "feat_total_available_window_minutes",
    "feat_window_to_task_duration_ratio",
    "feat_potential_train_conflicts"
]

RISK_TIERS = {
    0: "LOW",       # Score < 50
    1: "MEDIUM",    # 50 <= Score < 75
    2: "HIGH"       # Score >= 75
}


def discretize_risk(score: float) -> int:
    """Discretizes continuous 0-100 risk score into 3-tier ordinal classification label."""
    if score < 50.0:
        return 0
    elif score < 75.0:
        return 1
    else:
        return 2


class RailwayFeaturePreprocessor:
    """
    Leak-free feature preprocessing transformer.
    Fits OneHotEncoder and StandardScaler strictly on training split.
    Provides transformation for single inference inputs and batch matrices.
    """

    def __init__(self):
        self.encoder = OneHotEncoder(sparse_output=False, handle_unknown="ignore")
        self.scaler = StandardScaler()
        self.is_fitted = False
        self.feature_names_out: List[str] = []

    def fit(self, df_train: pd.DataFrame) -> "RailwayFeaturePreprocessor":
        """Fits encoder and scaler on training split."""
        # Ensure all columns present
        cat_data = df_train[CATEGORICAL_FEATURES].astype(str)
        num_data = df_train[NUMERIC_FEATURES].astype(float)

        self.encoder.fit(cat_data)
        self.scaler.fit(num_data)

        cat_names = list(self.encoder.get_feature_names_out(CATEGORICAL_FEATURES))
        self.feature_names_out = cat_names + NUMERIC_FEATURES
        self.is_fitted = True
        logger.info("Preprocessor fitted: %d transformed features produced.", len(self.feature_names_out))
        return self

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        """Transforms input DataFrame into model-ready numerical feature matrix."""
        if not self.is_fitted:
            raise RuntimeError("Preprocessor must be fitted before transforming data.")

        # Impute missing if any
        cat_df = df.copy()
        for c in CATEGORICAL_FEATURES:
            if c not in cat_df:
                cat_df[c] = "UNKNOWN"
            cat_df[c] = cat_df[c].fillna("UNKNOWN").astype(str)

        for n in NUMERIC_FEATURES:
            if n not in cat_df:
                cat_df[n] = 0.0
            cat_df[n] = cat_df[n].fillna(0.0).astype(float)

        cat_encoded = self.encoder.transform(cat_df[CATEGORICAL_FEATURES])
        num_scaled = self.scaler.transform(cat_df[NUMERIC_FEATURES])

        return np.hstack([cat_encoded, num_scaled])

    def fit_transform(self, df_train: pd.DataFrame) -> np.ndarray:
        return self.fit(df_train).transform(df_train)

    def save(self, filepath: Path):
        """Saves fitted preprocessor to disk."""
        filepath.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, filepath)
        logger.info("Saved fitted preprocessor to: %s", filepath)

    @classmethod
    def load(cls, filepath: Path) -> "RailwayFeaturePreprocessor":
        """Loads fitted preprocessor from disk."""
        if not filepath.exists():
            raise FileNotFoundError(f"Preprocessor file not found at: {filepath}")
        return joblib.load(filepath)
