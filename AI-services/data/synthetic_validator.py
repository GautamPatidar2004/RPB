import json
from pathlib import Path
from typing import Dict, Any, List
import pandas as pd
from utils.logger import get_logger

logger = get_logger("synthetic_validator")

SYNTHETIC_DIR = Path(__file__).resolve().parent / "synthetic"

EXPECTED_PROMPT2_COLUMNS = [
    "task_id", "task_code", "asset_id", "corridor_code",
    "feat_maint_type", "feat_department", "feat_asset_type", "feat_priority",
    "feat_power_block_req", "feat_traffic_block_req", "feat_speed_restriction_kmph",
    "feat_work_complexity_score", "feat_corridor_length_km", "feat_corridor_electrified",
    "feat_corridor_double_line", "feat_section_span_km", "feat_dependency_count",
    "feat_asset_criticality", "feat_asset_criticality_score", "feat_asset_health_status",
    "feat_asset_health_score", "feat_task_urgency", "feat_task_urgency_score",
    "feat_days_until_required", "feat_is_overdue", "feat_task_priority_score",
    "feat_train_traffic_count", "feat_high_priority_train_count",
    "feat_high_priority_train_ratio", "feat_available_window_count",
    "feat_total_available_window_minutes", "feat_window_to_task_duration_ratio",
    "feat_potential_train_conflicts", "raw_requested_duration_minutes",
    "target_maintenance_duration", "target_asset_risk_priority",
    "target_operational_impact"
]


class SyntheticDataValidator:
    """
    Validates synthetic Railway datasets for schema parity, statistical distribution plausibility,
    realistic correlation direction, range integrity, and absence of anomalies.
    """

    def validate(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Executes complete quality validation on the synthetic dataset.
        """
        issues: List[str] = []
        checks_passed: List[str] = []

        # 1. Schema Check
        missing_cols = [c for c in EXPECTED_PROMPT2_COLUMNS if c not in df.columns]
        if missing_cols:
            issues.append(f"Missing expected schema columns: {missing_cols}")
        else:
            checks_passed.append("100% schema parity with Prompt 2 ML-ready schema")

        # 2. Missing values check
        null_counts = df.isna().sum().to_dict()
        cols_with_nulls = {k: v for k, v in null_counts.items() if v > 0}
        if cols_with_nulls:
            issues.append(f"Found null values in columns: {cols_with_nulls}")
        else:
            checks_passed.append("Zero missing values across all records")

        # 3. Duplicate check
        dup_codes = int(df["task_code"].duplicated().sum()) if "task_code" in df else 0
        if dup_codes > 0:
            issues.append(f"Found {dup_codes} duplicate task_code values")
        else:
            checks_passed.append("Zero duplicate task records")

        # 4. Target Range Checks
        if "target_maintenance_duration" in df:
            dur_min = float(df["target_maintenance_duration"].min())
            dur_max = float(df["target_maintenance_duration"].max())
            if dur_min <= 0 or dur_max > 1440:
                issues.append(f"Invalid duration range: [{dur_min}, {dur_max}]")
            else:
                checks_passed.append(f"Duration target strictly positive: [{dur_min}, {dur_max}] min")

        if "target_asset_risk_priority" in df:
            risk_min = float(df["target_asset_risk_priority"].min())
            risk_max = float(df["target_asset_risk_priority"].max())
            if risk_min < 0.0 or risk_max > 100.0:
                issues.append(f"Risk target out of [0, 100] range: [{risk_min}, {risk_max}]")
            else:
                checks_passed.append(f"Risk priority target in [0, 100] range: [{risk_min}, {risk_max}]")

        if "target_operational_impact" in df:
            imp_min = float(df["target_operational_impact"].min())
            imp_max = float(df["target_operational_impact"].max())
            if imp_min < 0.0 or imp_max > 100.0:
                issues.append(f"Operational impact target out of [0, 100] range: [{imp_min}, {imp_max}]")
            else:
                checks_passed.append(f"Operational impact target in [0, 100] range: [{imp_min}, {imp_max}]")

        # 5. Correlation Direction Checks (Domain Sanity)
        correlations: Dict[str, float] = {}
        if len(df) > 10:
            # Complexity vs Duration
            if "feat_work_complexity_score" in df and "target_maintenance_duration" in df:
                c_dur = float(df["feat_work_complexity_score"].corr(df["target_maintenance_duration"]))
                correlations["complexity_vs_duration"] = round(c_dur, 3)
                if c_dur <= 0.10:
                    issues.append(f"Weak or negative complexity-duration correlation: {c_dur}")
                else:
                    checks_passed.append(f"Positive complexity-duration correlation: {c_dur:.2f}")

            # Asset Health vs Risk
            if "feat_asset_health_score" in df and "target_asset_risk_priority" in df:
                c_risk = float(df["feat_asset_health_score"].corr(df["target_asset_risk_priority"]))
                correlations["health_vs_risk"] = round(c_risk, 3)
                if c_risk <= 0.10:
                    issues.append(f"Weak or negative health-risk correlation: {c_risk}")
                else:
                    checks_passed.append(f"Positive health-risk correlation: {c_risk:.2f}")

            # Traffic vs Operational Impact
            if "feat_train_traffic_count" in df and "target_operational_impact" in df:
                c_imp = float(df["feat_train_traffic_count"].corr(df["target_operational_impact"]))
                correlations["traffic_vs_impact"] = round(c_imp, 3)
                if c_imp <= 0.10:
                    issues.append(f"Weak or negative traffic-impact correlation: {c_imp}")
                else:
                    checks_passed.append(f"Positive traffic-impact correlation: {c_imp:.2f}")

        # 6. Unrealistic Combination Check
        if "feat_is_overdue" in df and "feat_days_until_required" in df:
            invalid_overdue = df[(df["feat_is_overdue"] == 1) & (df["feat_days_until_required"] > 0)]
            if len(invalid_overdue) > 0:
                issues.append(f"Found {len(invalid_overdue)} records marked overdue with positive days remaining")
            else:
                checks_passed.append("Zero contradictory overdue status records")

        status = "VALID" if len(issues) == 0 else "INVALID"

        report = {
            "validation_status": status,
            "total_records": len(df),
            "checks_passed": checks_passed,
            "issues_detected": issues,
            "correlations": correlations,
            "target_summaries": {
                target: {
                    "mean": round(float(df[target].mean()), 2),
                    "std": round(float(df[target].std()), 2),
                    "min": round(float(df[target].min()), 2),
                    "max": round(float(df[target].max()), 2)
                }
                for target in ["target_maintenance_duration", "target_asset_risk_priority", "target_operational_impact"]
                if target in df
            }
        }

        # Save quality report to disk
        report_path = SYNTHETIC_DIR / "synthetic_data_quality_report.json"
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)

        logger.info("Synthetic validation complete: %s (%d checks passed, %d issues)",
                    status, len(checks_passed), len(issues))
        return report
