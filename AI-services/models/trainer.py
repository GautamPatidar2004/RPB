from pathlib import Path
from typing import Dict, Any, Tuple, Optional
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
import xgboost as xgb
from models.config import TrainingConfig
from models.preprocessor import RailwayFeaturePreprocessor, discretize_risk
from models.evaluator import ModelEvaluator
from models.artifacts import ModelArtifactManager
from utils.logger import get_logger

logger = get_logger("model_trainer")

REQUIRED_TARGETS = [
    "target_maintenance_duration",
    "target_asset_risk_priority",
    "target_operational_impact"
]


class MLTrainingPipeline:
    """
    Orchestrates the XGBoost training pipeline for:
    1. Duration Model (XGBRegressor)
    2. Asset Risk/Priority Model (XGBClassifier)
    3. Operational Impact Model (XGBRegressor)
    """

    def __init__(self, config: Optional[TrainingConfig] = None):
        self.config = config or TrainingConfig()
        self.version_dir = self.config.get_version_dir()
        self.artifact_manager = ModelArtifactManager(self.version_dir)

    def load_dataset(self, dataset_path: Optional[str] = None) -> Tuple[pd.DataFrame, str]:
        """Loads and validates the training dataset from disk."""
        target_path = Path(dataset_path or self.config.dataset_path)

        # Fallback to combined if synthetic doesn't exist
        if not target_path.exists():
            comb_path = Path(self.config.combined_dataset_path)
            if comb_path.exists():
                target_path = comb_path
            else:
                raise FileNotFoundError(f"Training dataset not found at: {target_path}")

        df = pd.read_csv(target_path)
        if len(df) == 0:
            raise ValueError(f"Training dataset at {target_path} is completely empty.")

        # Validate required targets
        for t in REQUIRED_TARGETS:
            if t not in df.columns:
                raise ValueError(f"Required target column '{t}' is missing from dataset.")

        # Remove rows with NaN targets
        clean_df = df.dropna(subset=REQUIRED_TARGETS).reset_index(drop=True)
        if len(clean_df) == 0:
            raise ValueError("All rows contain NaN in required targets.")

        data_source_mode = "combined" if "data_source" in clean_df and len(clean_df["data_source"].unique()) > 1 else "synthetic"
        logger.info("Loaded %d valid records from %s (mode=%s)", len(clean_df), target_path, data_source_mode)
        return clean_df, data_source_mode

    def run(self, dataset_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Executes the end-to-end training pipeline.
        """
        logger.info("Starting ML Training Pipeline for version %s...", self.config.model_version)

        # 1. Load and validate data
        df, data_source_mode = self.load_dataset(dataset_path)

        # 2. Split Data: Train (70%), Val (15%), Test (15%)
        test_plus_val = self.config.test_size + self.config.val_size
        df_train, df_temp = train_test_split(
            df,
            test_size=test_plus_val,
            random_state=self.config.random_seed
        )

        relative_test_ratio = self.config.test_size / test_plus_val
        df_val, df_test = train_test_split(
            df_temp,
            test_size=relative_test_ratio,
            random_state=self.config.random_seed
        )

        logger.info("Dataset split: Train=%d, Val=%d, Test=%d",
                    len(df_train), len(df_val), len(df_test))

        # 3. Fit Preprocessor strictly on Train
        preprocessor = RailwayFeaturePreprocessor()
        X_train = preprocessor.fit_transform(df_train)
        X_val = preprocessor.transform(df_val)
        X_test = preprocessor.transform(df_test)

        # 4. Prepare Target Arrays
        # Model A: Duration (Regression)
        y_train_dur = df_train["target_maintenance_duration"].to_numpy(dtype=float)
        y_val_dur = df_val["target_maintenance_duration"].to_numpy(dtype=float)
        y_test_dur = df_test["target_maintenance_duration"].to_numpy(dtype=float)

        # Model B: Risk/Priority (3-class Discretized Classification)
        y_train_risk = df_train["target_asset_risk_priority"].apply(discretize_risk).to_numpy(dtype=int)
        y_val_risk = df_val["target_asset_risk_priority"].apply(discretize_risk).to_numpy(dtype=int)
        y_test_risk = df_test["target_asset_risk_priority"].apply(discretize_risk).to_numpy(dtype=int)

        # Model C: Operational Impact (Regression)
        y_train_imp = df_train["target_operational_impact"].to_numpy(dtype=float)
        y_val_imp = df_val["target_operational_impact"].to_numpy(dtype=float)
        y_test_imp = df_test["target_operational_impact"].to_numpy(dtype=float)

        # 5. Train Model A: Duration Model
        logger.info("Training Model A: Maintenance Duration Model (XGBRegressor)...")
        dur_model = xgb.XGBRegressor(**self.config.xgb_params_duration)
        dur_model.fit(
            X_train, y_train_dur,
            eval_set=[(X_val, y_val_dur)],
            verbose=False
        )
        y_pred_dur = dur_model.predict(X_test)
        metrics_dur = ModelEvaluator.evaluate_regression(y_test_dur, y_pred_dur, y_train_dur, "duration")

        # 6. Train Model B: Risk/Priority Model
        logger.info("Training Model B: Asset Risk Model (XGBClassifier)...")
        risk_model = xgb.XGBClassifier(**self.config.xgb_params_risk)
        risk_model.fit(
            X_train, y_train_risk,
            eval_set=[(X_val, y_val_risk)],
            verbose=False
        )
        y_pred_risk = risk_model.predict(X_test)
        metrics_risk = ModelEvaluator.evaluate_classification(y_test_risk, y_pred_risk, y_train_risk, "risk")

        # 7. Train Model C: Operational Impact Model
        logger.info("Training Model C: Operational Impact Model (XGBRegressor)...")
        imp_model = xgb.XGBRegressor(**self.config.xgb_params_impact)
        imp_model.fit(
            X_train, y_train_imp,
            eval_set=[(X_val, y_val_imp)],
            verbose=False
        )
        y_pred_imp = imp_model.predict(X_test)
        metrics_imp = ModelEvaluator.evaluate_regression(y_test_imp, y_pred_imp, y_train_imp, "impact")

        # 8. Save Artifacts & Reports
        dataset_info = {
            "data_source_mode": data_source_mode,
            "total_records": len(df),
            "train_records": len(df_train),
            "val_records": len(df_val),
            "test_records": len(df_test)
        }
        all_metrics = {
            "duration": metrics_dur,
            "risk": metrics_risk,
            "impact": metrics_imp
        }

        saved_paths = self.artifact_manager.save_artifacts(
            duration_model=dur_model,
            risk_model=risk_model,
            impact_model=imp_model,
            preprocessor=preprocessor,
            config_summary=self.config.model_dump(),
            dataset_info=dataset_info,
            evaluation_metrics=all_metrics,
            model_version=self.config.model_version
        )

        logger.info("ML Training Pipeline finished successfully!")
        return {
            "status": "SUCCESS",
            "model_version": self.config.model_version,
            "metrics": all_metrics,
            "artifacts": saved_paths
        }
