from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple
from utils.logger import get_logger

logger = get_logger("data_cleaning")

# Canonical Railway Domains
VALID_DEPARTMENTS = {"ENGG", "SNT", "TRD", "OPTG", "MECH", "COMM"}
VALID_CRITICALITIES = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
VALID_URGENCIES = {"IMMEDIATE": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
VALID_HEALTH_STATUSES = {
    "FAILED": 5,
    "MAINTENANCE_REQUIRED": 4,
    "DEGRADED": 3,
    "UNDER_MAINTENANCE": 2,
    "OPERATIONAL": 1
}


class DataCleaner:
    """
    Reusable data cleaning and validation service.
    Imputes missing values, enforces railway domain schemas, fixes invalid dates/durations,
    and deduplicates without silently discarding critical operational records.
    """

    def clean_tasks(self, raw_tasks: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Cleans and validates a list of raw maintenance task dictionaries.
        Returns: (cleaned_tasks, cleaning_metrics)
        """
        cleaned: List[Dict[str, Any]] = []
        seen_ids = set()
        seen_codes = set()
        duplicate_count = 0
        invalid_count = 0
        imputed_fields_count: Dict[str, int] = {}

        now = datetime.now(timezone.utc)

        for raw in raw_tasks:
            task = dict(raw)
            issues: List[str] = []

            # 1. Deduplication Check
            task_id = str(task.get("id") or "")
            task_code = str(task.get("task_code") or "").strip().upper()

            if task_id in seen_ids or (task_code and task_code in seen_codes):
                duplicate_count += 1
                logger.debug("Duplicate task detected: id=%s code=%s", task_id, task_code)
                continue

            if task_id:
                seen_ids.add(task_id)
            if task_code:
                seen_codes.add(task_code)

            # 2. Department standardization
            dept = str(task.get("department_code") or "").strip().upper()
            if dept not in VALID_DEPARTMENTS:
                imputed_fields_count["department_code"] = imputed_fields_count.get("department_code", 0) + 1
                dept = "ENGG"
                issues.append("Standardized department to ENGG")
            task["department_code"] = dept

            # 3. Maintenance type
            m_type = str(task.get("maintenance_type") or "").strip().upper()
            if not m_type:
                imputed_fields_count["maintenance_type"] = imputed_fields_count.get("maintenance_type", 0) + 1
                m_type = "GENERAL_TRACK_MAINTENANCE"
            task["maintenance_type"] = m_type

            # 4. Priority validation (1 to 5)
            try:
                prio = int(task.get("priority", 3))
                if prio < 1 or prio > 5:
                    issues.append(f"Priority {prio} clamped to 1-5 range")
                    prio = max(1, min(5, prio))
            except (ValueError, TypeError):
                imputed_fields_count["priority"] = imputed_fields_count.get("priority", 0) + 1
                prio = 3
            task["priority"] = prio

            # 5. Criticality validation
            crit = str(task.get("criticality") or "").strip().upper()
            if crit not in VALID_CRITICALITIES:
                imputed_fields_count["criticality"] = imputed_fields_count.get("criticality", 0) + 1
                crit = "MEDIUM"
                issues.append("Imputed criticality to MEDIUM")
            task["criticality"] = crit

            # 6. Urgency validation
            urg = str(task.get("urgency") or "").strip().upper()
            if urg not in VALID_URGENCIES:
                imputed_fields_count["urgency"] = imputed_fields_count.get("urgency", 0) + 1
                urg = "MEDIUM"
                issues.append("Imputed urgency to MEDIUM")
            task["urgency"] = urg

            # 7. Duration bounds validation
            try:
                dur = int(task.get("duration_minutes", 120))
                if dur <= 0:
                    dur = 60
                    issues.append("Invalid non-positive duration; adjusted to 60m")
                elif dur > 1440:  # > 24 hours
                    dur = 1440
                    issues.append("Duration exceeded 24 hours; clamped to 1440m")
            except (ValueError, TypeError):
                imputed_fields_count["duration_minutes"] = imputed_fields_count.get("duration_minutes", 0) + 1
                dur = 120
            task["duration_minutes"] = dur

            # 8. Date validation
            req_date_raw = task.get("required_by_date")
            parsed_date = None
            if req_date_raw:
                try:
                    if isinstance(req_date_raw, str):
                        clean_date_str = req_date_raw.replace("Z", "+00:00")
                        parsed_date = datetime.fromisoformat(clean_date_str)
                    elif isinstance(req_date_raw, datetime):
                        parsed_date = req_date_raw
                except Exception:
                    issues.append("Invalid required_by_date format; imputed")

            if not parsed_date:
                imputed_fields_count["required_by_date"] = imputed_fields_count.get("required_by_date", 0) + 1
                parsed_date = now
            task["parsed_required_by_date"] = parsed_date

            # 9. Speed restriction
            try:
                sr = float(task.get("speed_restriction_kmph") or 0.0)
                if sr < 0:
                    sr = 0.0
            except (ValueError, TypeError):
                sr = 0.0
            task["speed_restriction_kmph"] = sr

            # 10. Block flags
            task["power_block_required"] = bool(task.get("power_block_required", False))
            task["traffic_block_required"] = bool(task.get("traffic_block_required", True))

            # Audit tracking
            task["is_valid"] = len(issues) == 0
            if not task["is_valid"]:
                invalid_count += 1
            task["data_quality_issues"] = issues

            cleaned.append(task)

        metrics = {
            "total_input": len(raw_tasks),
            "cleaned_records": len(cleaned),
            "duplicates_removed": duplicate_count,
            "records_with_quality_issues": invalid_count,
            "imputed_fields": imputed_fields_count
        }

        logger.info("Cleaning complete: %d records processed, %d duplicates removed", len(cleaned), duplicate_count)
        return cleaned, metrics
