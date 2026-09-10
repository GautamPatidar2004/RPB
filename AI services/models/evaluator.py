from typing import Dict, Any
import numpy as np
from sklearn.metrics import (
    mean_absolute_error,
    root_mean_squared_error,
    r2_score,
    accuracy_score,
    precision_recall_fscore_support
)
from sklearn.dummy import DummyRegressor, DummyClassifier
from utils.logger import get_logger

logger = get_logger("model_evaluator")


class ModelEvaluator:
    """
    Evaluates trained XGBoost models against test datasets and establishes
    rigorous baseline comparisons to verify predictive value.
    """

    @staticmethod
    def evaluate_regression(
        y_true: np.ndarray,
        y_pred: np.ndarray,
        y_train: np.ndarray,
        task_name: str = "duration"
    ) -> Dict[str, Any]:
        """Calculates MAE, RMSE, R² and compares against DummyRegressor baseline."""
        mae = float(mean_absolute_error(y_true, y_pred))
        rmse = float(root_mean_squared_error(y_true, y_pred))
        r2 = float(r2_score(y_true, y_pred))

        # Baseline: DummyRegressor predicting mean
        dummy = DummyRegressor(strategy="mean")
        dummy.fit(np.zeros((len(y_train), 1)), y_train)
        dummy_pred = dummy.predict(np.zeros((len(y_true), 1)))

        baseline_mae = float(mean_absolute_error(y_true, dummy_pred))
        baseline_rmse = float(root_mean_squared_error(y_true, dummy_pred))
        baseline_r2 = float(r2_score(y_true, dummy_pred))

        mae_improvement_pct = round(((baseline_mae - mae) / baseline_mae) * 100.0, 2) if baseline_mae > 0 else 0.0

        metrics = {
            "task": task_name,
            "mae": round(mae, 3),
            "rmse": round(rmse, 3),
            "r2": round(r2, 4),
            "baseline_mean_mae": round(baseline_mae, 3),
            "baseline_mean_rmse": round(baseline_rmse, 3),
            "baseline_r2": round(baseline_r2, 4),
            "mae_improvement_pct": mae_improvement_pct,
            "beats_baseline": mae < baseline_mae
        }
        logger.info("[%s Evaluation] MAE=%.2f (Baseline: %.2f, +%.1f%%), R²=%.3f",
                    task_name, mae, baseline_mae, mae_improvement_pct, r2)
        return metrics

    @staticmethod
    def evaluate_classification(
        y_true: np.ndarray,
        y_pred: np.ndarray,
        y_train: np.ndarray,
        task_name: str = "risk_priority"
    ) -> Dict[str, Any]:
        """Calculates Accuracy, Precision, Recall, F1 and compares against majority-class baseline."""
        acc = float(accuracy_score(y_true, y_pred))
        p_macro, r_macro, f1_macro, _ = precision_recall_fscore_support(y_true, y_pred, average="macro", zero_division=0)
        p_weight, r_weight, f1_weight, _ = precision_recall_fscore_support(y_true, y_pred, average="weighted", zero_division=0)

        # Baseline: DummyClassifier predicting most frequent class
        dummy = DummyClassifier(strategy="most_frequent")
        dummy.fit(np.zeros((len(y_train), 1)), y_train)
        dummy_pred = dummy.predict(np.zeros((len(y_true), 1)))
        baseline_acc = float(accuracy_score(y_true, dummy_pred))
        _, _, baseline_f1, _ = precision_recall_fscore_support(y_true, dummy_pred, average="weighted", zero_division=0)

        metrics = {
            "task": task_name,
            "accuracy": round(acc, 4),
            "precision_weighted": round(float(p_weight), 4),
            "recall_weighted": round(float(r_weight), 4),
            "f1_weighted": round(float(f1_weight), 4),
            "precision_macro": round(float(p_macro), 4),
            "recall_macro": round(float(r_macro), 4),
            "f1_macro": round(float(f1_macro), 4),
            "baseline_accuracy": round(baseline_acc, 4),
            "baseline_f1_weighted": round(float(baseline_f1), 4),
            "beats_baseline": acc > baseline_acc
        }
        logger.info("[%s Evaluation] Accuracy=%.3f (Baseline: %.3f), F1=%.3f",
                    task_name, acc, baseline_acc, f1_weight)
        return metrics
