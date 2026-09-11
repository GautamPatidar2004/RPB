from datetime import datetime, timezone
from typing import Dict, Any, List
import pandas as pd
from data.target_preparation import TARGET_METADATA
from utils.logger import get_logger

logger = get_logger("quality_reporter")


class DataQualityReporter:
    """
    Generates a compact, rigorous data-quality report assessing completeness,
    anomalies, and model-training readiness.
    """

    def generate_report(
        self,
        df: pd.DataFrame,
        cleaning_metrics: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Builds a comprehensive data quality inspection report.
        """
        now_str = datetime.now(timezone.utc).isoformat()
        total_records = len(df)

        # 1. Missing Value Summary
        missing_summary: Dict[str, int] = {}
        for col in df.columns:
            null_count = int(df[col].isna().sum())
            if null_count > 0:
                missing_summary[col] = null_count

        # 2. Feature Availability and Dtypes
        feature_cols = [c for c in df.columns if c.startswith("feat_")]
        feature_availability = {col: str(df[col].dtype) for col in feature_cols}

        # 3. Target Availability & Statistical Distributions
        target_cols = [c for c in df.columns if c.startswith("target_")]
        target_availability: Dict[str, Dict[str, Any]] = {}
        targets_fully_available = True

        for target in target_cols:
            meta = TARGET_METADATA.get(target, {})
            nulls = int(df[target].isna().sum())
            if nulls > 0 or total_records == 0:
                targets_fully_available = False

            if total_records > 0 and not df[target].isna().all():
                target_availability[target] = {
                    "label_type": meta.get("label_type", "derived"),
                    "count": int(df[target].count()),
                    "missing": nulls,
                    "min": round(float(df[target].min()), 2),
                    "max": round(float(df[target].max()), 2),
                    "mean": round(float(df[target].mean()), 2),
                    "std": round(float(df[target].std()), 2) if total_records > 1 else 0.0
                }
            else:
                target_availability[target] = {
                    "label_type": meta.get("label_type", "derived"),
                    "count": 0,
                    "missing": total_records
                }

        # 4. Readiness Status Assessment
        is_ready = (
            total_records >= 1 and
            len(feature_cols) >= 10 and
            targets_fully_available and
            len(missing_summary) == 0
        )
        readiness_status = "READY_FOR_TRAINING" if is_ready else "NEEDS_MORE_DATA"

        report = {
            "dataset_name": "railway_block_planning_ml",
            "generated_at": now_str,
            "record_count": total_records,
            "duplicate_count": cleaning_metrics.get("duplicates_removed", 0),
            "invalid_record_count": cleaning_metrics.get("records_with_quality_issues", 0),
            "missing_value_summary": missing_summary,
            "feature_availability": feature_availability,
            "target_availability": target_availability,
            "dataset_readiness_status": readiness_status,
            "recommendations": [
                "Dataset contains clean baseline records from active railway corridor.",
                "Suitable for Prompt 3 synthetic dataset augmentation or Prompt 4 ML modeling."
            ] if is_ready else [
                "Ensure at least one valid maintenance task exists in the planning horizon."
            ]
        }

        logger.info("Quality report generated: status=%s records=%d", readiness_status, total_records)
        return report
