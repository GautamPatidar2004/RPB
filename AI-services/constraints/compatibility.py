from typing import Optional
from constraints.config import ConstraintConfig, get_default_constraint_config
from constraints.models import BlockCandidate, CompatibilityResult
from utils.logger import get_logger

logger = get_logger("task_compatibility")


class TaskCompatibilityEngine:
    """
    Evaluates mutual co-scheduling and shadow block compatibility between maintenance tasks.
    Enforces configuration-driven rules for department synergy, spatial clustering,
    machine non-interference, and exclusive track possessions.
    """

    def __init__(self, config: Optional[ConstraintConfig] = None):
        self.config = config or get_default_constraint_config()

    def check_compatibility(
        self,
        task_a: BlockCandidate,
        task_b: BlockCandidate
    ) -> CompatibilityResult:
        """
        Determines whether task_a and task_b can be combined into an integrated or shadow block.
        """
        # 1. Self comparison
        if task_a.candidate_id == task_b.candidate_id:
            return CompatibilityResult(
                is_compatible=False,
                can_shadow=False,
                distance_km=0.0,
                shared_corridor=True,
                reason="Cannot combine a task with itself."
            )

        # 2. Corridor Check
        if task_a.corridor_code != task_b.corridor_code:
            return CompatibilityResult(
                is_compatible=False,
                can_shadow=False,
                distance_km=999.0,
                shared_corridor=False,
                reason=f"Corridor mismatch: {task_a.corridor_code} vs {task_b.corridor_code}"
            )

        # 3. Spatial Proximity Check
        # Distance measured from start kilometer markers
        distance = abs(task_a.start_kilometer - task_b.start_kilometer)
        if distance > self.config.max_grouping_distance_km:
            return CompatibilityResult(
                is_compatible=False,
                can_shadow=False,
                distance_km=round(distance, 2),
                shared_corridor=True,
                reason=(
                    f"Tasks exceed maximum spatial grouping distance: {distance:.2f} km "
                    f"> {self.config.max_grouping_distance_km} km threshold."
                )
            )

        # 4. Exclusive Work Types Check
        maint_a = task_a.maintenance_type.upper()
        maint_b = task_b.maintenance_type.upper()

        if maint_a in self.config.exclusive_maintenance_types:
            return CompatibilityResult(
                is_compatible=False,
                can_shadow=False,
                distance_km=round(distance, 2),
                shared_corridor=True,
                reason=f"Task A ({maint_a}) mandates exclusive track possession (no shadow work allowed)."
            )

        if maint_b in self.config.exclusive_maintenance_types:
            return CompatibilityResult(
                is_compatible=False,
                can_shadow=False,
                distance_km=round(distance, 2),
                shared_corridor=True,
                reason=f"Task B ({maint_b}) mandates exclusive track possession (no shadow work allowed)."
            )

        # 5. Specialized Machinery Conflict
        # If both tasks require the exact same specialized machine, they cannot operate simultaneously
        if (
            task_a.machinery_required
            and task_b.machinery_required
            and task_a.machinery_required == task_b.machinery_required
        ):
            return CompatibilityResult(
                is_compatible=False,
                can_shadow=False,
                distance_km=round(distance, 2),
                shared_corridor=True,
                reason=f"Machinery conflict: both tasks require the same unit '{task_a.machinery_required}'."
            )

        # 6. Same Asset Direct Interference
        # Same exact physical asset cannot undergo conflicting physical operations simultaneously
        if task_a.asset_id == task_b.asset_id:
            # SNT and ENGG on the same track or turnout can only combine if explicitly compatible
            compat_set_a = self.config.compatible_maintenance_pairs.get(maint_a, set())
            if maint_b not in compat_set_a:
                return CompatibilityResult(
                    is_compatible=False,
                    can_shadow=False,
                    distance_km=round(distance, 2),
                    shared_corridor=True,
                    reason=f"Same asset ({task_a.asset_code}) cannot undergo {maint_a} and {maint_b} simultaneously."
                )

        # 7. Department Synergy Check & Configuration-Driven Pair Lookup
        compat_a = self.config.compatible_maintenance_pairs.get(maint_a, set())
        compat_b = self.config.compatible_maintenance_pairs.get(maint_b, set())

        is_pair_compatible = (maint_b in compat_a) or (maint_a in compat_b)

        # Both require power block -> High synergy for Integrated Block
        power_synergy = task_a.power_block_required and task_b.power_block_required

        if is_pair_compatible or power_synergy:
            reason_str = (
                f"Integrated block eligible: {task_a.department} ({maint_a}) and "
                f"{task_b.department} ({maint_b}) are compatible within {distance:.2f} km."
            )
            if power_synergy:
                reason_str += " Shared OHE de-energization window."

            return CompatibilityResult(
                is_compatible=True,
                can_shadow=True,
                distance_km=round(distance, 2),
                shared_corridor=True,
                reason=reason_str
            )

        # Routine non-conflicting tasks in different departments
        if task_a.department != task_b.department and not task_a.power_block_required and not task_b.power_block_required:
            return CompatibilityResult(
                is_compatible=True,
                can_shadow=True,
                distance_km=round(distance, 2),
                shared_corridor=True,
                reason=(
                    f"Routine inter-departmental shadow block: {task_a.department} and {task_b.department} "
                    f"within {distance:.2f} km with zero power block interference."
                )
            )

        return CompatibilityResult(
            is_compatible=False,
            can_shadow=False,
            distance_km=round(distance, 2),
            shared_corridor=True,
            reason=f"No compatibility rule defined between {maint_a} and {maint_b}."
        )
