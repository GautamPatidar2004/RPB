from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class PipelineRunResponse(BaseModel):
    """Response returned when data preparation pipeline runs."""
    status: str = Field(description="Pipeline execution status (SUCCESS, WARNING, ERROR)")
    corridor_code: str = Field(description="Railway corridor processed")
    records_ingested: int = Field(description="Total raw maintenance tasks ingested")
    records_processed: int = Field(description="Valid ML-ready rows produced")
    dataset_path: str = Field(description="File path to the generated ML-ready dataset")
    report_path: str = Field(description="File path to the generated quality report")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DataQualityReportResponse(BaseModel):
    """Response model representing the data quality assessment."""
    dataset_name: str = Field(default="railway_maintenance_blocks")
    generated_at: str = Field(description="Timestamp of report generation")
    record_count: int = Field(description="Total processed rows")
    duplicate_count: int = Field(description="Duplicate records found")
    invalid_record_count: int = Field(description="Invalid records flagged")
    missing_value_summary: Dict[str, int] = Field(description="Missing count per feature")
    feature_availability: Dict[str, str] = Field(description="Feature dtypes and presence")
    target_availability: Dict[str, Dict[str, Any]] = Field(description="Target statistics and label type")
    dataset_readiness_status: str = Field(description="Readiness status: READY_FOR_TRAINING or NEEDS_MORE_DATA")


class DatasetSummaryResponse(BaseModel):
    """Summary of the ML-ready dataset."""
    total_rows: int
    total_features: int
    feature_columns: List[str]
    target_columns: List[str]
    categorical_columns: List[str]
    numeric_columns: List[str]
