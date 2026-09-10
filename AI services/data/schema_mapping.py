from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List


@dataclass
class RawCorridor:
    id: str
    code: str
    name: str
    length_km: float = 0.0
    line_type: str = "DOUBLE_LINE"
    electrified: bool = True


@dataclass
class RawAsset:
    id: str
    asset_code: str
    asset_type: str
    name: str
    location: str
    start_kilometer: Optional[float] = None
    end_kilometer: Optional[float] = None
    criticality: str = "MEDIUM"
    health_status: str = "OPERATIONAL"
    source_system: str = "TMS"


@dataclass
class RawMaintenanceTask:
    id: str
    task_code: str
    title: str
    description: Optional[str] = None
    maintenance_type: str = "TRACK_TAMPING"
    duration_minutes: int = 120
    priority: int = 3
    criticality: str = "MEDIUM"
    urgency: str = "MEDIUM"
    required_by_date: Optional[str] = None
    status: str = "PENDING"
    power_block_required: bool = False
    traffic_block_required: bool = True
    speed_restriction_kmph: Optional[int] = None
    operational_constraints: Dict[str, Any] = field(default_factory=dict)
    asset_id: Optional[str] = None
    asset_code: Optional[str] = None
    asset_name: Optional[str] = None
    asset_location: Optional[str] = None
    department_code: str = "ENGG"
    source_system: str = "TMS"


@dataclass
class RawBlockWindow:
    id: str
    start_time: str
    end_time: str
    duration_minutes: int = 120
    availability_status: str = "AVAILABLE"
    block_type: str = "TRAFFIC_BLOCK"
    line_designation: Optional[str] = None
    start_kilometer: Optional[float] = None
    end_kilometer: Optional[float] = None
    operational_constraints: Dict[str, Any] = field(default_factory=dict)
    source_system: str = "COA"


@dataclass
class RawTrainMovement:
    id: str
    train_number: str
    service_identifier: str
    scheduled_start_time: str
    scheduled_end_time: str
    direction: str = "UP"
    train_type: str = "MAIL_EXPRESS"
    priority: int = 3
    status: str = "SCHEDULED"
    operational_details: Dict[str, Any] = field(default_factory=dict)
    source_system: str = "COA"


# Field mapping from raw backend JSON keys to normalized internal naming
TASK_FIELD_MAP = {
    "id": "id",
    "task_code": "task_code",
    "title": "title",
    "description": "description",
    "maintenance_type": "maintenance_type",
    "duration_minutes": "duration_minutes",
    "priority": "priority",
    "criticality": "criticality",
    "urgency": "urgency",
    "required_by_date": "required_by_date",
    "status": "status",
    "power_block_required": "power_block_required",
    "traffic_block_required": "traffic_block_required",
    "speed_restriction_kmph": "speed_restriction_kmph",
    "operational_constraints": "operational_constraints",
    "asset_id": "asset_id",
    "asset_code": "asset_code",
    "asset_name": "asset_name",
    "asset_location": "asset_location",
    "department_code": "department_code",
    "source_system": "source_system"
}
