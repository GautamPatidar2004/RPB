from typing import Dict, Set, Any
from pydantic import BaseModel, Field


class ConstraintConfig(BaseModel):
    """
    Centralized, deterministic Railway operational and safety constraint configuration.
    Configurable parameters govern all buffer times, duration limits, and concurrency rules.
    """
    # 1. Operational Safety Buffers (minutes)
    min_headway_buffer_minutes: int = Field(
        default=15,
        ge=0,
        description="Minimum temporal safety headway between train path and block slot"
    )
    ohe_power_isolation_buffer_minutes: int = Field(
        default=10,
        ge=0,
        description="Mandatory de-energization and earthing buffer before/after OHE work"
    )
    speed_restriction_recovery_minutes: int = Field(
        default=20,
        ge=0,
        description="Buffer time required for timetable stabilization following speed restriction"
    )

    # 2. Block Duration Boundaries (minutes)
    min_block_duration_minutes: int = Field(
        default=15,
        ge=5,
        description="Minimum feasible maintenance block duration"
    )
    max_block_duration_minutes: int = Field(
        default=720,
        le=1440,
        description="Maximum continuous maintenance block duration (12 hours)"
    )

    # 3. Spatial & Concurrency Constraints
    max_concurrent_blocks_per_section: int = Field(
        default=1,
        ge=1,
        description="Maximum concurrent active blocks allowed within the same section/span"
    )
    max_grouping_distance_km: float = Field(
        default=5.0,
        ge=0.1,
        description="Maximum distance in kilometers between tasks to be eligible for a shared/shadow block"
    )

    # 4. Departmental Resource Capacities (per corridor)
    max_concurrent_crews: Dict[str, int] = Field(
        default_factory=lambda: {
            "ENGG": 5,
            "SNT": 4,
            "TRD": 3
        },
        description="Maximum simultaneous maintenance crews available per department"
    )
    max_concurrent_machines: Dict[str, int] = Field(
        default_factory=lambda: {
            "CSU-09-3X Tamping Express": 2,
            "Rail Grinding Machine (RGM)": 1,
            "BCM Deep Screening Machine": 1,
            "Flash Butt Welding Plant": 1,
            "OHE Wiring Train": 1,
            "Tower Wagon": 2
        },
        description="Maximum simultaneous specialized track machines available per corridor"
    )

    # 5. Exclusive Maintenance Types (tasks that cannot share blocks with other heavy work)
    exclusive_maintenance_types: Set[str] = Field(
        default_factory=lambda: {
            "RAIL_FRACTURE_REPAIR",  # Emergency track restoration: absolute single possession
            "DEEP_SCREENING",         # Heavy track disruption occupying full section
            "RAIL_GRINDING"          # High-speed track grinding traversing continuous track
        },
        description="Maintenance types that mandate exclusive possession of the track"
    )

    # 6. Compatible Task Pairs (Maintenance types that can be co-scheduled in an integrated block)
    compatible_maintenance_pairs: Dict[str, Set[str]] = Field(
        default_factory=lambda: {
            "TRACK_TAMPING": {"OHE_INSPECTION", "TRACK_CIRCUIT_CHECK", "POINTS_TESTING", "CANTILEVER_ADJUSTMENT"},
            "TURNOUT_PACKING": {"POINTS_TESTING", "INTERLOCKING_LOGIC_TEST", "OHE_INSPECTION"},
            "OHE_INSPECTION": {"TRACK_TAMPING", "TURNOUT_PACKING", "TRACK_CIRCUIT_CHECK", "SIGNAL_ASPECT_ALIGNMENT"},
            "CONTACT_WIRE_RENEWAL": {"INTERLOCKING_LOGIC_TEST", "SIGNAL_ASPECT_ALIGNMENT"},
            "POINTS_TESTING": {"TURNOUT_PACKING", "TRACK_TAMPING", "INTERLOCKING_LOGIC_TEST"},
            "TRACK_CIRCUIT_CHECK": {"TRACK_TAMPING", "OHE_INSPECTION", "AXLE_COUNTER_OVERHAUL"},
            "AXLE_COUNTER_OVERHAUL": {"TRACK_CIRCUIT_CHECK", "POINTS_TESTING"},
            "INSULATOR_WASHING": {"OHE_INSPECTION", "CANTILEVER_ADJUSTMENT"}
        },
        description="Map of compatible task types for integrated/shadow blocks"
    )

    # 7. Soft Penalty & Objective Weights (for Prompt 7 optimization guidance)
    soft_weights: Dict[str, float] = Field(
        default_factory=lambda: {
            "weight_train_conflict_regular": 50.0,
            "weight_train_conflict_high_priority": 250.0,
            "weight_overdue_penalty": 100.0,
            "weight_shadow_grouping_bonus": -40.0,
            "weight_duration_utilization": 1.0,
            "weight_operational_friction": 2.0
        },
        description="Weights applied during soft metric penalty and objective computation"
    )


def get_default_constraint_config() -> ConstraintConfig:
    """Returns default ConstraintConfig instance."""
    return ConstraintConfig()
