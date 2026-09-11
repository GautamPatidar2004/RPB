from datetime import timedelta
from typing import List, Dict, Any, Optional
from constraints.config import ConstraintConfig, get_default_constraint_config
from constraints.models import (
    BlockCandidate,
    TrainMovementSummary,
    BlockWindowSummary,
    ConflictViolation,
    ConflictType,
    Severity
)
from constraints.compatibility import TaskCompatibilityEngine
from utils.logger import get_logger

logger = get_logger("conflict_detector")


class ConflictDetector:
    """
    Reusable conflict detection engine identifying hard constraint violations across:
    - Block timing & duration
    - Block vs Block (Asset collision, section concurrency, machine collision)
    - Block vs Train (Direct path overlap, headway buffer violation)
    - Block vs Maintenance Window (Boundary overflow)
    - Task Dependencies (Prerequisite completion order)
    - Departmental & Machine Resource Capacities
    """

    def __init__(
        self,
        config: Optional[ConstraintConfig] = None,
        compatibility_engine: Optional[TaskCompatibilityEngine] = None
    ):
        self.config = config or get_default_constraint_config()
        self.compatibility_engine = compatibility_engine or TaskCompatibilityEngine(self.config)

    def check_timing_and_duration(self, block: BlockCandidate) -> List[ConflictViolation]:
        """Validates that block timestamps are strictly ordered and durations within safe limits."""
        violations: List[ConflictViolation] = []

        # 1. Start < End
        if block.end_time <= block.start_time:
            violations.append(
                ConflictViolation(
                    conflict_type=ConflictType.INVALID_TIMING,
                    involved_ids=[block.candidate_id],
                    severity=Severity.CRITICAL,
                    violated_constraint="chk_assigned_times_order",
                    explanation=(
                        f"Assigned block end_time ({block.end_time.isoformat()}) must be "
                        f"strictly after start_time ({block.start_time.isoformat()})."
                    ),
                    details={"start_time": block.start_time.isoformat(), "end_time": block.end_time.isoformat()}
                )
            )
            return violations  # Cannot evaluate duration if timing is inverted

        # 2. Duration limits
        dur = block.duration_minutes
        if dur < self.config.min_block_duration_minutes:
            violations.append(
                ConflictViolation(
                    conflict_type=ConflictType.INVALID_DURATION,
                    involved_ids=[block.candidate_id],
                    severity=Severity.HIGH,
                    violated_constraint="chk_min_block_duration",
                    explanation=(
                        f"Block duration {dur:.1f} minutes is below mandatory minimum safety "
                        f"threshold of {self.config.min_block_duration_minutes} minutes."
                    ),
                    details={"duration_minutes": dur, "min_allowed": self.config.min_block_duration_minutes}
                )
            )

        if dur > self.config.max_block_duration_minutes:
            violations.append(
                ConflictViolation(
                    conflict_type=ConflictType.INVALID_DURATION,
                    involved_ids=[block.candidate_id],
                    severity=Severity.HIGH,
                    violated_constraint="chk_max_block_duration",
                    explanation=(
                        f"Block duration {dur:.1f} minutes exceeds maximum allowable continuous "
                        f"possession of {self.config.max_block_duration_minutes} minutes (12 hours)."
                    ),
                    details={"duration_minutes": dur, "max_allowed": self.config.max_block_duration_minutes}
                )
            )

        return violations

    def check_block_vs_block(
        self,
        block_a: BlockCandidate,
        block_b: BlockCandidate
    ) -> List[ConflictViolation]:
        """Detects collisions, asset conflicts, and unauthorized concurrencies between two blocks."""
        violations: List[ConflictViolation] = []

        # Self comparison
        if block_a.candidate_id == block_b.candidate_id:
            return violations

        # Temporal Overlap Check: (StartA < EndB) and (EndA > StartB)
        is_overlapping = (block_a.start_time < block_b.end_time) and (block_a.end_time > block_b.start_time)
        if not is_overlapping:
            return violations

        # 1. Exact Same Asset Conflict
        if block_a.asset_id == block_b.asset_id:
            # Check if authorized shadow/integrated combination
            compat = self.compatibility_engine.check_compatibility(block_a, block_b)
            if not compat.is_compatible:
                violations.append(
                    ConflictViolation(
                        conflict_type=ConflictType.SAME_ASSET_SIMULTANEOUS_MAINTENANCE,
                        involved_ids=[block_a.candidate_id, block_b.candidate_id, block_a.asset_id],
                        severity=Severity.CRITICAL,
                        violated_constraint="chk_same_asset_no_simultaneous_work",
                        explanation=(
                            f"Simultaneous incompatible maintenance on asset [{block_a.asset_code}]: "
                            f"{block_a.department} ({block_a.maintenance_type}) and "
                            f"{block_b.department} ({block_b.maintenance_type}) overlap in time. "
                            f"Reason: {compat.reason}"
                        ),
                        details={
                            "asset_id": block_a.asset_id,
                            "asset_code": block_a.asset_code,
                            "block_a": block_a.candidate_id,
                            "block_b": block_b.candidate_id
                        }
                    )
                )

        # 2. Same Section Spatial Concurrency Conflict
        if block_a.corridor_code == block_b.corridor_code:
            # Span overlap within localized section (within 2 km)
            spatial_overlap = abs(block_a.start_kilometer - block_b.start_kilometer) < 2.0
            if spatial_overlap:
                compat = self.compatibility_engine.check_compatibility(block_a, block_b)
                if not compat.is_compatible and not (block_a.is_shadow_block or block_b.is_shadow_block):
                    violations.append(
                        ConflictViolation(
                            conflict_type=ConflictType.CORRIDOR_CONCURRENCY_EXCEEDED,
                            involved_ids=[block_a.candidate_id, block_b.candidate_id],
                            severity=Severity.HIGH,
                            violated_constraint="chk_max_concurrent_blocks_per_section",
                            explanation=(
                                f"Corridor section concurrency exceeded on {block_a.corridor_code}: "
                                f"Blocks [{block_a.candidate_id}] and [{block_b.candidate_id}] operate "
                                f"simultaneously within 2 km without an authorized shadow pairing."
                            ),
                            details={
                                "corridor_code": block_a.corridor_code,
                                "block_a_km": block_a.start_kilometer,
                                "block_b_km": block_b.start_kilometer
                            }
                        )
                    )

        # 3. Specialized Machine Collision
        if (
            block_a.machinery_required
            and block_b.machinery_required
            and block_a.machinery_required == block_b.machinery_required
        ):
            violations.append(
                ConflictViolation(
                    conflict_type=ConflictType.RESOURCE_CAPACITY_EXCEEDED,
                    involved_ids=[block_a.candidate_id, block_b.candidate_id],
                    severity=Severity.CRITICAL,
                    violated_constraint="chk_machinery_exclusive_allocation",
                    explanation=(
                        f"Specialized machine [{block_a.machinery_required}] is simultaneously requested "
                        f"by both block [{block_a.candidate_id}] and block [{block_b.candidate_id}]."
                    ),
                    details={"machine": block_a.machinery_required}
                )
            )

        return violations

    def check_block_vs_train(
        self,
        block: BlockCandidate,
        train: TrainMovementSummary
    ) -> List[ConflictViolation]:
        """Evaluates traffic block interference with scheduled train paths and safety headway buffers."""
        violations: List[ConflictViolation] = []

        # If block requires no traffic interruption, no train conflict
        if not block.traffic_block_required:
            return violations

        b_start = block.start_time
        b_end = block.end_time
        t_start = train.scheduled_start_time
        t_end = train.scheduled_end_time

        # 1. Direct Temporal Overlap: (b_start < t_end) and (b_end > t_start)
        is_direct_overlap = (b_start < t_end) and (b_end > t_start)
        if is_direct_overlap:
            is_crit = train.is_high_priority
            violations.append(
                ConflictViolation(
                    conflict_type=ConflictType.TRAIN_PATH_OVERLAP,
                    involved_ids=[block.candidate_id, train.train_id, train.train_number],
                    severity=Severity.CRITICAL if is_crit else Severity.HIGH,
                    violated_constraint="chk_no_traffic_block_during_scheduled_train",
                    explanation=(
                        f"Block [{block.candidate_id}] overlaps directly with Train #{train.train_number} "
                        f"({train.train_type}, Priority {train.priority}). "
                        f"{'CRITICAL: High-priority passenger service impacted!' if is_crit else ''}"
                    ),
                    details={
                        "train_number": train.train_number,
                        "train_type": train.train_type,
                        "train_priority": train.priority,
                        "is_high_priority": is_crit,
                        "overlap_start": max(b_start, t_start).isoformat(),
                        "overlap_end": min(b_end, t_end).isoformat()
                    }
                )
            )
            return violations  # If direct overlap, skip headway calculation

        # 2. Safety Headway Buffer Check
        # Buffer required between block end and train start, or train end and block start
        headway_mins = self.config.min_headway_buffer_minutes
        buffer_delta = timedelta(minutes=headway_mins)

        # Case A: Train passes right after block ends
        if b_end <= t_start and (t_start - b_end) < buffer_delta:
            gap_mins = (t_start - b_end).total_seconds() / 60.0
            violations.append(
                ConflictViolation(
                    conflict_type=ConflictType.HEADWAY_BUFFER_VIOLATION,
                    involved_ids=[block.candidate_id, train.train_id, train.train_number],
                    severity=Severity.HIGH if train.is_high_priority else Severity.MEDIUM,
                    violated_constraint="chk_min_headway_buffer",
                    explanation=(
                        f"Headway buffer violation: Train #{train.train_number} starts only {gap_mins:.1f} min "
                        f"after block [{block.candidate_id}] ends (mandatory buffer is {headway_mins} min)."
                    ),
                    details={"gap_minutes": gap_mins, "required_buffer_minutes": headway_mins}
                )
            )

        # Case B: Block starts right after train passes
        if t_end <= b_start and (b_start - t_end) < buffer_delta:
            gap_mins = (b_start - t_end).total_seconds() / 60.0
            violations.append(
                ConflictViolation(
                    conflict_type=ConflictType.HEADWAY_BUFFER_VIOLATION,
                    involved_ids=[block.candidate_id, train.train_id, train.train_number],
                    severity=Severity.HIGH if train.is_high_priority else Severity.MEDIUM,
                    violated_constraint="chk_min_headway_buffer",
                    explanation=(
                        f"Headway buffer violation: Block [{block.candidate_id}] starts only {gap_mins:.1f} min "
                        f"after Train #{train.train_number} clears section (mandatory buffer is {headway_mins} min)."
                    ),
                    details={"gap_minutes": gap_mins, "required_buffer_minutes": headway_mins}
                )
            )

        return violations

    def check_block_vs_window(
        self,
        block: BlockCandidate,
        window: BlockWindowSummary
    ) -> List[ConflictViolation]:
        """Validates that candidate block fits strictly inside assigned corridor block window."""
        violations: List[ConflictViolation] = []

        if block.start_time < window.start_time or block.end_time > window.end_time:
            violations.append(
                ConflictViolation(
                    conflict_type=ConflictType.WINDOW_BOUNDARY_EXCEEDED,
                    involved_ids=[block.candidate_id, window.window_id],
                    severity=Severity.HIGH,
                    violated_constraint="chk_block_within_window_boundaries",
                    explanation=(
                        f"Block [{block.candidate_id}] slot [{block.start_time.isoformat()} to "
                        f"{block.end_time.isoformat()}] exceeds window [{window.window_id}] boundaries "
                        f"[{window.start_time.isoformat()} to {window.end_time.isoformat()}]."
                    ),
                    details={
                        "block_slot": {"start": block.start_time.isoformat(), "end": block.end_time.isoformat()},
                        "window_slot": {"start": window.start_time.isoformat(), "end": window.end_time.isoformat()}
                    }
                )
            )

        return violations

    def check_dependencies(
        self,
        candidate: BlockCandidate,
        all_blocks: List[BlockCandidate]
    ) -> List[ConflictViolation]:
        """Enforces finish-to-start precedence ordering for task dependencies."""
        violations: List[ConflictViolation] = []
        if not candidate.depends_on_task_ids:
            return violations

        block_by_task = {b.task_id: b for b in all_blocks if b.task_id}

        for prereq_id in candidate.depends_on_task_ids:
            prereq_block = block_by_task.get(prereq_id)
            if prereq_block:
                # Prerequisite must complete before candidate starts
                if prereq_block.end_time > candidate.start_time:
                    violations.append(
                        ConflictViolation(
                            conflict_type=ConflictType.DEPENDENCY_ORDER_VIOLATION,
                            involved_ids=[candidate.candidate_id, prereq_block.candidate_id, prereq_id],
                            severity=Severity.CRITICAL,
                            violated_constraint="chk_finish_to_start_dependency",
                            explanation=(
                                f"Precedence violation: Block [{candidate.candidate_id}] starts at "
                                f"{candidate.start_time.isoformat()} before prerequisite task [{prereq_id}] "
                                f"finishes at {prereq_block.end_time.isoformat()}."
                            ),
                            details={
                                "candidate_start": candidate.start_time.isoformat(),
                                "prerequisite_end": prereq_block.end_time.isoformat()
                            }
                        )
                    )

        return violations

    def check_aggregate_resource_capacities(
        self,
        blocks: List[BlockCandidate]
    ) -> List[ConflictViolation]:
        """
        Validates that simultaneous blocks do not exceed maximum departmental crew
        or specialized machinery availability at any time point.
        """
        violations: List[ConflictViolation] = []
        if len(blocks) <= 1:
            return violations

        # Collect critical time points (all start and end times)
        time_points = set()
        for b in blocks:
            time_points.add(b.start_time)
            time_points.add(b.end_time)

        sorted_times = sorted(list(time_points))

        # Check consumption at midpoint of each interval
        for i in range(len(sorted_times) - 1):
            t_mid = sorted_times[i] + (sorted_times[i + 1] - sorted_times[i]) / 2

            # Find active blocks at t_mid
            active = [b for b in blocks if b.start_time <= t_mid < b.end_time]
            if not active:
                continue

            # 1. Department Crews
            crew_counts = {"ENGG": 0, "SNT": 0, "TRD": 0}
            for b in active:
                dept = b.department.upper()
                if dept in crew_counts:
                    crew_counts[dept] += b.crew_required

            for dept, count in crew_counts.items():
                max_allowed = self.config.max_concurrent_crews.get(dept, 5)
                if count > max_allowed:
                    violations.append(
                        ConflictViolation(
                            conflict_type=ConflictType.RESOURCE_CAPACITY_EXCEEDED,
                            involved_ids=[b.candidate_id for b in active if b.department.upper() == dept],
                            severity=Severity.HIGH,
                            violated_constraint=f"chk_max_concurrent_crews_{dept}",
                            explanation=(
                                f"Department [{dept}] crew capacity exceeded at {t_mid.isoformat()}: "
                                f"{count} crews requested, maximum available is {max_allowed}."
                            ),
                            details={"department": dept, "requested_crews": count, "max_crews": max_allowed}
                        )
                    )

            # 2. Specialized Machinery
            machine_counts: Dict[str, int] = {}
            for b in active:
                if b.machinery_required:
                    m = b.machinery_required
                    machine_counts[m] = machine_counts.get(m, 0) + 1

            for m, count in machine_counts.items():
                max_m = self.config.max_concurrent_machines.get(m, 1)
                if count > max_m:
                    violations.append(
                        ConflictViolation(
                            conflict_type=ConflictType.RESOURCE_CAPACITY_EXCEEDED,
                            involved_ids=[b.candidate_id for b in active if b.machinery_required == m],
                            severity=Severity.CRITICAL,
                            violated_constraint="chk_max_concurrent_machines",
                            explanation=(
                                f"Machine [{m}] over-allocated at {t_mid.isoformat()}: "
                                f"{count} units active simultaneously, maximum fleet capacity is {max_m}."
                            ),
                            details={"machine": m, "active_units": count, "max_fleet_capacity": max_m}
                        )
                    )

        return violations
