from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class GenerateSyntheticRequest(BaseModel):
    """Request model for generating synthetic historical Railway block records."""
    n_records: int = Field(default=1200, ge=10, le=50000, description="Number of synthetic records to generate")
    seed: int = Field(default=42, description="Random seed for deterministic reproducibility")
    corridors: Optional[List[str]] = Field(default=None, description="Corridor codes to simulate")
    output_filename: str = Field(default="synthetic_dataset.csv", description="Output CSV filename")


class SyntheticGenerationResponse(BaseModel):
    """Response model after generating synthetic records."""
    status: str
    records_generated: int
    dataset_path: str
    report_path: str
    features_count: int
    targets_count: int
    quality_status: str
    summary_statistics: Dict[str, Any]


class CombineDatasetRequest(BaseModel):
    """Request model for combining real and synthetic datasets."""
    include_real: bool = Field(default=True, description="Whether to include real dataset records")
    real_dataset_filename: str = Field(default="ml_ready_dataset.csv", description="Filename of real processed dataset")
    synthetic_dataset_filename: str = Field(default="synthetic_dataset.csv", description="Filename of synthetic dataset")
    output_filename: str = Field(default="combined_dataset.csv", description="Output combined filename")


class CombineDatasetResponse(BaseModel):
    """Response model after combining datasets."""
    status: str
    total_records: int
    real_records_count: int
    synthetic_records_count: int
    output_path: str
