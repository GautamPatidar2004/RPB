from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from data.cleaning import VALID_CRITICALITIES, VALID_URGENCIES, VALID_HEALTH_STATUSES
from utils.logger import get_logger

logger = get_logger("feature_engineering")


class FeatureEngineer:
    """
    Constructs ML-ready features from cleaned Railway maintenance tasks, asset metadata,
    and corridor operational context.
    Strictly uses available fields without fabricating unsupported attributes.
    """

    def engineer_record_features(
        self,
        task: Dict[str, Any],
        asset: Optional[Dict[str, Any]],
        corridor: Dict[str, Any],
        trains: List[Dict[str, Any]],
        windows: List[Dict[str, Any]],
        dependencies: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Engineers a single tabular feature dictionary for one maintenance block task.
        """
        now = datetime.now(timezone.utc)
        asset_info = asset or {}

        # -------------------------------------------------------------
        # 1. DURATION PREDICTION FEATURES
        # -------------------------------------------------------------
        maint_type = task.get("maintenance_type", "GENERAL_TRACK_MAINTENANCE")
        dept = task.get("department_code", "ENGG")
        asset_type = asset_info.get("asset_type", "TRACK")
        priority = int(task.get("priority", 3))
        power_block_req = 1 if task.get("power_block_required") else 0
        traffic_block_req = 1 if task.get("traffic_block_required") else 0
        speed_rest = float(task.get("speed_restriction_kmph") or 0.0)

        # Count direct dependencies for this task
        task_id = str(task.get("id") or "")
        dep_count = sum(
            1 for d in dependencies
            if str(d.get("task_id")) == task_id or str(d.get("depends_on_task_id")) == task_id
        )

        # Work complexity composite score (1.0 to ~5.0)
        work_complexity = (
            (1.5 if traffic_block_req else 0.5) +
            (1.0 if power_block_req else 0.0) +
            min(1.5, speed_rest / 40.0) +
            min(1.0, dep_count * 0.5)
        )

        # Corridor infrastructure factors
        corridor_len = float(corridor.get("length_km") or corridor.get("total_length_km") or 400.0)
        corridor_electrified = 1 if corridor.get("electrified", True) else 0
        corridor_double_line = 1 if "DOUBLE" in str(corridor.get("line_type", "")).upper() else 0

        # Section span (km)
        start_km = asset_info.get("start_kilometer")
        end_km = asset_info.get("end_kilometer")
        if start_km is not None and end_km is not None and end_km >= start_km:
            section_span_km = float(end_km - start_km)
        else:
            section_span_km = 1.0  # default localized 1km span

        # -------------------------------------------------------------
        # 2. ASSET RISK & PRIORITY FEATURES
        # -------------------------------------------------------------
        asset_crit = str(asset_info.get("criticality") or task.get("criticality") or "MEDIUM").upper()
        asset_crit_score = VALID_CRITICALITIES.get(asset_crit, 2)

        asset_health = str(asset_info.get("health_status", "OPERATIONAL")).upper()
        asset_health_score = VALID_HEALTH_STATUSES.get(asset_health, 1)

        task_urg = str(task.get("urgency", "MEDIUM")).upper()
        task_urg_score = VALID_URGENCIES.get(task_urg, 2)

        # Due date calculations
        req_date = task.get("parsed_required_by_date") or now
        days_until_req = (req_date - now).total_seconds() / 86400.0
        is_overdue = 1 if days_until_req < 0 else 0

        # Inverted priority: priority 1 (highest) gets score 5; priority 5 gets score 1
        task_priority_score = 6 - priority

        # -------------------------------------------------------------
        # 3. OPERATIONAL IMPACT FEATURES
        # -------------------------------------------------------------
        total_trains = len(trains)
        high_prio_trains = sum(1 for t in trains if int(t.get("priority", 3)) <= 2)
        high_prio_ratio = (high_prio_trains / total_trains) if total_trains > 0 else 0.0

        total_windows = len(windows)
        total_window_mins = sum(int(w.get("duration_minutes", 0)) for w in windows)

        task_dur = max(15, int(task.get("duration_minutes", 120)))
        window_to_task_ratio = (total_window_mins / task_dur) if task_dur > 0 else 1.0

        # Approximate potential train interference count based on section traffic
        potential_conflicts = min(total_trains, int(traffic_block_req * (high_prio_trains + 1)))

        # Assemble unified feature dictionary
        features = {
            # Identifiers & Raw Context
            "task_id": task.get("id"),
            "task_code": task.get("task_code"),
            "asset_id": task.get("asset_id") or asset_info.get("id"),
            "corridor_code": corridor.get("code", "NDLS-CNB"),

            # Duration Features
            "feat_maint_type": maint_type,
            "feat_department": dept,
            "feat_asset_type": asset_type,
            "feat_priority": priority,
            "feat_power_block_req": power_block_req,
            "feat_traffic_block_req": traffic_block_req,
            "feat_speed_restriction_kmph": speed_rest,
            "feat_work_complexity_score": round(work_complexity, 3),
            "feat_corridor_length_km": corridor_len,
            "feat_corridor_electrified": corridor_electrified,
            "feat_corridor_double_line": corridor_double_line,
            "feat_section_span_km": round(section_span_km, 3),
            "feat_dependency_count": dep_count,

            # Asset Risk & Urgency Features
            "feat_asset_criticality": asset_crit,
            "feat_asset_criticality_score": asset_crit_score,
            "feat_asset_health_status": asset_health,
            "feat_asset_health_score": asset_health_score,
            "feat_task_urgency": task_urg,
            "feat_task_urgency_score": task_urg_score,
            "feat_days_until_required": round(days_until_req, 2),
            "feat_is_overdue": is_overdue,
            "feat_task_priority_score": task_priority_score,

            # Operational Impact Features
            "feat_train_traffic_count": total_trains,
            "feat_high_priority_train_count": high_prio_trains,
            "feat_high_priority_train_ratio": round(high_prio_ratio, 3),
            "feat_available_window_count": total_windows,
            "feat_total_available_window_minutes": total_window_mins,
            "feat_window_to_task_duration_ratio": round(window_to_task_ratio, 3),
            "feat_potential_train_conflicts": potential_conflicts,

            # Baseline duration
            "raw_requested_duration_minutes": task_dur
        }

        return features
