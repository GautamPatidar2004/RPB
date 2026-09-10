import math
from pathlib import Path
from typing import List, Dict, Any, Optional
import numpy as np
import pandas as pd
from utils.logger import get_logger

logger = get_logger("synthetic_generator")

SYNTHETIC_DIR = Path(__file__).resolve().parent / "synthetic"

CORRIDOR_CONFIGS = {
    "NDLS-CNB": {"length_km": 440.5, "electrified": 1, "double_line": 1, "traffic_range": (8, 16)},
    "HWH-DDU": {"length_km": 675.0, "electrified": 1, "double_line": 1, "traffic_range": (6, 14)},
    "CSMT-KYN": {"length_km": 54.0, "electrified": 1, "double_line": 1, "traffic_range": (14, 24)},
    "MAS-GDR": {"length_km": 138.0, "electrified": 1, "double_line": 1, "traffic_range": (5, 12)}
}

# Domain catalogs
MAINTENANCE_CATALOG = {
    "ENGG": [
        {"type": "TRACK_TAMPING", "asset": "TRACK", "base_dur": 180, "traffic_blk": 1, "power_blk": 0, "speed_rest_p": 0.8},
        {"type": "RAIL_GRINDING", "asset": "TRACK", "base_dur": 210, "traffic_blk": 1, "power_blk": 0, "speed_rest_p": 0.7},
        {"type": "TURNOUT_PACKING", "asset": "TURNOUT", "base_dur": 120, "traffic_blk": 1, "power_blk": 0, "speed_rest_p": 0.4},
        {"type": "DEEP_SCREENING", "asset": "TRACK", "base_dur": 240, "traffic_blk": 1, "power_blk": 0, "speed_rest_p": 0.9},
        {"type": "RAIL_FRACTURE_REPAIR", "asset": "TRACK", "base_dur": 90, "traffic_blk": 1, "power_blk": 0, "speed_rest_p": 0.9}
    ],
    "SNT": [
        {"type": "POINTS_TESTING", "asset": "INTERLOCKING", "base_dur": 90, "traffic_blk": 1, "power_blk": 0, "speed_rest_p": 0.1},
        {"type": "AXLE_COUNTER_OVERHAUL", "asset": "AXLE_COUNTER", "base_dur": 75, "traffic_blk": 0, "power_blk": 0, "speed_rest_p": 0.0},
        {"type": "SIGNAL_ASPECT_ALIGNMENT", "asset": "SIGNAL", "base_dur": 60, "traffic_blk": 0, "power_blk": 0, "speed_rest_p": 0.0},
        {"type": "TRACK_CIRCUIT_CHECK", "asset": "TRACK_CIRCUIT", "base_dur": 60, "traffic_blk": 1, "power_blk": 0, "speed_rest_p": 0.1},
        {"type": "INTERLOCKING_LOGIC_TEST", "asset": "INTERLOCKING", "base_dur": 120, "traffic_blk": 1, "power_blk": 0, "speed_rest_p": 0.0}
    ],
    "TRD": [
        {"type": "OHE_INSPECTION", "asset": "OHE_LINE", "base_dur": 120, "traffic_blk": 1, "power_blk": 1, "speed_rest_p": 0.2},
        {"type": "CANTILEVER_ADJUSTMENT", "asset": "OHE_MAST", "base_dur": 150, "traffic_blk": 1, "power_blk": 1, "speed_rest_p": 0.1},
        {"type": "CONTACT_WIRE_RENEWAL", "asset": "OHE_LINE", "base_dur": 210, "traffic_blk": 1, "power_blk": 1, "speed_rest_p": 0.5},
        {"type": "SUBSTATION_MAINTENANCE", "asset": "TRACTION_SUBSTATION", "base_dur": 180, "traffic_blk": 0, "power_blk": 1, "speed_rest_p": 0.0},
        {"type": "INSULATOR_WASHING", "asset": "OHE_INSULATOR", "base_dur": 90, "traffic_blk": 1, "power_blk": 1, "speed_rest_p": 0.0}
    ]
}

CRITICALITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
CRITICALITY_SCORES = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}

URGENCIES = ["IMMEDIATE", "HIGH", "MEDIUM", "LOW"]
URGENCY_SCORES = {"IMMEDIATE": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}

HEALTH_STATUSES = ["FAILED", "MAINTENANCE_REQUIRED", "DEGRADED", "UNDER_MAINTENANCE", "OPERATIONAL"]
HEALTH_SCORES = {
    "FAILED": 5,
    "MAINTENANCE_REQUIRED": 4,
    "DEGRADED": 3,
    "UNDER_MAINTENANCE": 2,
    "OPERATIONAL": 1
}


class RailwaySyntheticGenerator:
    """
    Generates realistic synthetic Railway maintenance records.
    Maintains physical correlations between work complexity, asset conditions,
    operational impact, and duration while embedding realistic statistical noise.
    """

    def __init__(self, seed: int = 42):
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        SYNTHETIC_DIR.mkdir(parents=True, exist_ok=True)

    def generate_dataset(
        self,
        n_records: int = 1200,
        corridors: Optional[List[str]] = None,
        output_filename: str = "synthetic_dataset.csv"
    ) -> Tuple[pd.DataFrame, Path]:
        """
        Generates `n_records` synthetic historical rows in the ML-ready schema.
        """
        if n_records <= 0:
            raise ValueError("n_records must be greater than 0")

        selected_corridors = corridors or list(CORRIDOR_CONFIGS.keys())
        for c in selected_corridors:
            if c not in CORRIDOR_CONFIGS:
                raise ValueError(f"Unknown corridor code: {c}. Valid: {list(CORRIDOR_CONFIGS.keys())}")

        logger.info("Generating %d synthetic Railway records with seed %d...", n_records, self.seed)

        rows: List[Dict[str, Any]] = []
        departments = ["ENGG", "SNT", "TRD"]
        dept_probs = [0.45, 0.30, 0.25]

        for i in range(n_records):
            # 1. Select corridor
            corridor_code = self.rng.choice(selected_corridors)
            corr_cfg = CORRIDOR_CONFIGS[corridor_code]

            # 2. Select department & maintenance task type
            dept = self.rng.choice(departments, p=dept_probs)
            item = self.rng.choice(MAINTENANCE_CATALOG[dept])

            maint_type = item["type"]
            asset_type = item["asset"]
            base_dur = item["base_dur"]
            traffic_block_req = item["traffic_blk"]
            power_block_req = item["power_blk"]

            # Speed restriction
            if self.rng.random() < item["speed_rest_p"]:
                speed_rest = float(self.rng.choice([15, 20, 30, 45, 50]))
            else:
                speed_rest = 0.0

            # Dependencies
            dep_count = int(self.rng.choice([0, 1, 2, 3], p=[0.70, 0.20, 0.07, 0.03]))

            # Section span
            section_span = round(float(self.rng.uniform(0.5, 6.0)), 2)

            # Complexity calculation
            work_complexity = (
                (1.5 if traffic_block_req else 0.5) +
                (1.0 if power_block_req else 0.0) +
                min(1.5, speed_rest / 40.0) +
                min(1.0, dep_count * 0.5) +
                float(self.rng.uniform(-0.1, 0.2))
            )
            work_complexity = round(max(0.8, work_complexity), 3)

            # Asset health & criticality
            # Emergency/urgent tasks have poorer health & higher criticality
            if maint_type == "RAIL_FRACTURE_REPAIR":
                asset_health = "FAILED"
                asset_crit = "CRITICAL"
                urgency = "IMMEDIATE"
                priority = 1
                is_overdue = 1
                days_until_req = round(float(self.rng.uniform(-2.0, 0.0)), 2)
            else:
                asset_health = self.rng.choice(
                    HEALTH_STATUSES,
                    p=[0.05, 0.25, 0.35, 0.15, 0.20]
                )
                asset_crit = self.rng.choice(
                    CRITICALITIES,
                    p=[0.20, 0.35, 0.35, 0.10]
                )

                # Urgency correlates with health and criticality
                h_score = HEALTH_SCORES[asset_health]
                c_score = CRITICALITY_SCORES[asset_crit]

                if h_score >= 4 or c_score == 4:
                    urgency = self.rng.choice(["IMMEDIATE", "HIGH", "MEDIUM"], p=[0.40, 0.45, 0.15])
                    priority = int(self.rng.choice([1, 2, 3], p=[0.50, 0.40, 0.10]))
                    is_overdue = int(self.rng.choice([0, 1], p=[0.60, 0.40]))
                else:
                    urgency = self.rng.choice(["HIGH", "MEDIUM", "LOW"], p=[0.15, 0.60, 0.25])
                    priority = int(self.rng.choice([2, 3, 4, 5], p=[0.20, 0.50, 0.20, 0.10]))
                    is_overdue = int(self.rng.choice([0, 1], p=[0.90, 0.10]))

                if is_overdue:
                    days_until_req = round(float(self.rng.uniform(-7.0, -0.1)), 2)
                else:
                    days_until_req = round(float(self.rng.uniform(0.5, 14.0)), 2)

            asset_crit_score = CRITICALITY_SCORES[asset_crit]
            asset_health_score = HEALTH_SCORES[asset_health]
            task_urg_score = URGENCY_SCORES[urgency]
            task_priority_score = 6 - priority

            # Traffic density on corridor
            t_min, t_max = corr_cfg["traffic_range"]
            train_traffic_count = int(self.rng.integers(t_min, t_max + 1))
            high_prio_trains = int(self.rng.integers(1, max(2, int(train_traffic_count * 0.6))))
            high_prio_ratio = round(high_prio_trains / train_traffic_count, 3)

            # Available windows
            window_count = int(self.rng.integers(1, 4))
            total_window_mins = int(window_count * self.rng.integers(120, 240))

            # Requested duration with baseline noise
            duration_noise = float(self.rng.normal(0, 12))
            requested_dur = int(max(30, round(base_dur + (work_complexity * 10) + duration_noise)))
            window_to_task_ratio = round(total_window_mins / requested_dur, 3)
            potential_conflicts = min(train_traffic_count, int(traffic_block_req * (high_prio_trains + self.rng.integers(0, 2))))

            # ---------------------------------------------------------
            # TARGET VARIABLES (Physically grounded with realistic noise)
            # ---------------------------------------------------------
            # 1. Target Maintenance Duration:
            # Correlates with base duration, complexity, section span, plus non-linear stochastic variance
            complexity_factor = 1.0 + 0.12 * (work_complexity - 2.0)
            span_factor = 1.0 + 0.03 * min(section_span, 5.0)
            exec_noise = float(self.rng.normal(0, 18.0))
            target_duration = round(max(30.0, float(base_dur * complexity_factor * span_factor + exec_noise)), 1)

            # 2. Target Asset Risk & Priority Score (0 to 100):
            # Health (30%) + Criticality (25%) + Urgency (25%) + Priority (20%) + Overdue penalty + Noise
            h_pts = (asset_health_score / 5.0) * 30.0
            c_pts = (asset_crit_score / 4.0) * 25.0
            u_pts = (task_urg_score / 4.0) * 25.0
            p_pts = (task_priority_score / 5.0) * 20.0
            od_pts = 10.0 if is_overdue else 0.0
            risk_noise = float(self.rng.normal(0, 3.0))
            target_risk = round(min(100.0, max(5.0, h_pts + c_pts + u_pts + p_pts + od_pts + risk_noise)), 2)

            # 3. Target Operational Impact (0 to 100):
            # Traffic density (30%) + High-prio trains (30%) + Block requirement (20%) + Duration (20%) + Noise
            traffic_pts = min(30.0, (train_traffic_count / 15.0) * 30.0)
            high_prio_pts = min(30.0, (high_prio_trains / 6.0) * 30.0)
            block_disrupt_pts = 20.0 if traffic_block_req else 5.0
            duration_impact_pts = min(20.0, (target_duration / 240.0) * 20.0)
            impact_noise = float(self.rng.normal(0, 3.5))
            target_impact = round(min(100.0, max(5.0, traffic_pts + high_prio_pts + block_disrupt_pts + duration_impact_pts + impact_noise)), 2)

            # Construct row
            task_id = f"synth-task-{i+1:05d}"
            task_code = f"SYN-{dept}-{i+1:04d}"
            asset_id = f"synth-asset-{dept}-{self.rng.integers(100, 999)}"

            row = {
                # Identifiers & Metadata
                "task_id": task_id,
                "task_code": task_code,
                "asset_id": asset_id,
                "corridor_code": corridor_code,

                # Duration Features
                "feat_maint_type": maint_type,
                "feat_department": dept,
                "feat_asset_type": asset_type,
                "feat_priority": priority,
                "feat_power_block_req": power_block_req,
                "feat_traffic_block_req": traffic_block_req,
                "feat_speed_restriction_kmph": speed_rest,
                "feat_work_complexity_score": work_complexity,
                "feat_corridor_length_km": corr_cfg["length_km"],
                "feat_corridor_electrified": corr_cfg["electrified"],
                "feat_corridor_double_line": corr_cfg["double_line"],
                "feat_section_span_km": section_span,
                "feat_dependency_count": dep_count,

                # Asset Risk Features
                "feat_asset_criticality": asset_crit,
                "feat_asset_criticality_score": asset_crit_score,
                "feat_asset_health_status": asset_health,
                "feat_asset_health_score": asset_health_score,
                "feat_task_urgency": urgency,
                "feat_task_urgency_score": task_urg_score,
                "feat_days_until_required": days_until_req,
                "feat_is_overdue": is_overdue,
                "feat_task_priority_score": task_priority_score,

                # Operational Impact Features
                "feat_train_traffic_count": train_traffic_count,
                "feat_high_priority_train_count": high_prio_trains,
                "feat_high_priority_train_ratio": high_prio_ratio,
                "feat_available_window_count": window_count,
                "feat_total_available_window_minutes": total_window_mins,
                "feat_window_to_task_duration_ratio": window_to_task_ratio,
                "feat_potential_train_conflicts": potential_conflicts,

                # Requested baseline
                "raw_requested_duration_minutes": requested_dur,

                # Target Variables
                "target_maintenance_duration": target_duration,
                "target_asset_risk_priority": target_risk,
                "target_operational_impact": target_impact,

                # Provenance Metadata
                "data_source": "synthetic",
                "generator_version": "1.0.0",
                "random_seed": self.seed
            }

            rows.append(row)

        df = pd.DataFrame(rows)

        # Persist to disk
        out_path = SYNTHETIC_DIR / output_filename
        df.to_csv(out_path, index=False, encoding="utf-8")
        logger.info("Saved %d synthetic records to: %s", len(df), out_path)

        return df, out_path
