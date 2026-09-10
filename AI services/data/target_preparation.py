from typing import Dict, Any


TARGET_METADATA = {
    "target_maintenance_duration": {
        "dtype": "float64",
        "label_type": "ground_truth",
        "source_field": "maintenance_tasks.duration_minutes",
        "unit": "minutes",
        "description": "True maintenance duration requested or executed for the work order"
    },
    "target_asset_risk_priority": {
        "dtype": "float64",
        "label_type": "derived_label",
        "source_formula": "Normalized weighted composite (health: 30%, criticality: 25%, urgency: 25%, priority: 20%) + overdue penalty",
        "unit": "risk_score_0_to_100",
        "description": "Multi-attribute asset and task criticality score for prioritizing block dispatch"
    },
    "target_operational_impact": {
        "dtype": "float64",
        "label_type": "derived_label",
        "source_formula": "Train traffic density (30%) + High-priority trains (30%) + Block requirement (20%) + Duration impact (20%)",
        "unit": "impact_score_0_to_100",
        "description": "Operational friction and delay potential imposed on railway traffic"
    }
}


class TargetPreparer:
    """
    Prepares ground-truth and transparently derived target variables for downstream ML models.
    Marks every label origin explicitly to prevent phantom or fabricated training data.
    """

    def prepare_targets(self, features: Dict[str, Any]) -> Dict[str, float]:
        """
        Computes the target variables for a single record from its engineered features.
        """
        # 1. Target: Maintenance Duration (Ground truth from task record)
        target_duration = float(features.get("raw_requested_duration_minutes", 120.0))

        # 2. Target: Asset Risk & Priority Score (0.0 to 100.0)
        # Health score: 1 to 5 -> maps to 6 to 30 pts
        health_pts = (features.get("feat_asset_health_score", 1) / 5.0) * 30.0

        # Criticality score: 1 to 4 -> maps to 6.25 to 25 pts
        crit_pts = (features.get("feat_asset_criticality_score", 2) / 4.0) * 25.0

        # Urgency score: 1 to 4 -> maps to 6.25 to 25 pts
        urg_pts = (features.get("feat_task_urgency_score", 2) / 4.0) * 25.0

        # Inverted Priority: 1 to 5 -> maps to 4 to 20 pts
        prio_pts = (features.get("feat_task_priority_score", 3) / 5.0) * 20.0

        # Overdue penalty (+10 pts)
        overdue_pts = 10.0 if features.get("feat_is_overdue") else 0.0

        target_risk_priority = round(min(100.0, health_pts + crit_pts + urg_pts + prio_pts + overdue_pts), 2)

        # 3. Target: Operational Impact Score (0.0 to 100.0)
        total_trains = float(features.get("feat_train_traffic_count", 0))
        high_prio_trains = float(features.get("feat_high_priority_train_count", 0))
        traffic_block = float(features.get("feat_traffic_block_req", 1))

        # Traffic volume: up to 30 pts
        traffic_pts = min(30.0, total_trains * 10.0)

        # High priority passenger trains impacted: up to 30 pts
        high_prio_pts = min(30.0, high_prio_trains * 15.0)

        # Traffic block disruption: 20 pts
        block_disrupt_pts = 20.0 if traffic_block > 0 else 5.0

        # Duration impact: 20 pts
        duration_pts = min(20.0, (target_duration / 180.0) * 20.0)

        target_op_impact = round(min(100.0, traffic_pts + high_prio_pts + block_disrupt_pts + duration_pts), 2)

        return {
            "target_maintenance_duration": target_duration,
            "target_asset_risk_priority": target_risk_priority,
            "target_operational_impact": target_op_impact
        }
