import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from data.synthetic_generator import RailwaySyntheticGenerator, SYNTHETIC_DIR
from data.synthetic_validator import SyntheticDataValidator
from data.dataset_combiner import DatasetCombiner
from schemas.synthetic import (
    GenerateSyntheticRequest,
    SyntheticGenerationResponse,
    CombineDatasetRequest,
    CombineDatasetResponse
)
from utils.logger import get_logger

logger = get_logger("synthetic_route")
router = APIRouter(prefix="/api/v1/data", tags=["Synthetic Historical Dataset"])


@router.post(
    "/synthetic/generate",
    response_model=SyntheticGenerationResponse,
    summary="Generate Synthetic Historical Dataset",
    description="Generates realistic synthetic Railway maintenance and block planning records with correlated features and noise."
)
async def generate_synthetic_dataset(
    req: GenerateSyntheticRequest
) -> SyntheticGenerationResponse:
    try:
        generator = RailwaySyntheticGenerator(seed=req.seed)
        df, out_path = generator.generate_dataset(
            n_records=req.n_records,
            corridors=req.corridors,
            output_filename=req.output_filename
        )

        validator = SyntheticDataValidator()
        report = validator.validate(df)

        feature_cols = [c for c in df.columns if c.startswith("feat_")]
        target_cols = [c for c in df.columns if c.startswith("target_")]

        return SyntheticGenerationResponse(
            status=report["validation_status"],
            records_generated=len(df),
            dataset_path=str(out_path),
            report_path=str(SYNTHETIC_DIR / "synthetic_data_quality_report.json"),
            features_count=len(feature_cols),
            targets_count=len(target_cols),
            quality_status=report["validation_status"],
            summary_statistics=report.get("target_summaries", {})
        )
    except Exception as e:
        logger.error("Failed to generate synthetic dataset: %s", str(e))
        raise HTTPException(
            status_code=400,
            detail=f"Synthetic dataset generation failed: {type(e).__name__} - {str(e)}"
        )


@router.get(
    "/synthetic/report",
    summary="Get Synthetic Data Quality Report",
    description="Retrieves the quality validation report for the synthetic historical dataset."
)
async def get_synthetic_quality_report():
    report_path = SYNTHETIC_DIR / "synthetic_data_quality_report.json"
    if not report_path.exists():
        # Generate default dataset if not exists
        generator = RailwaySyntheticGenerator()
        df, _ = generator.generate_dataset(n_records=1200)
        validator = SyntheticDataValidator()
        return validator.validate(df)

    with open(report_path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.post(
    "/combine",
    response_model=CombineDatasetResponse,
    summary="Combine Real and Synthetic Datasets",
    description="Safely combines real historical records with synthetic records only when explicitly requested."
)
async def combine_datasets(
    req: CombineDatasetRequest
) -> CombineDatasetResponse:
    try:
        combiner = DatasetCombiner()
        combined_df, out_path = combiner.combine_datasets(
            include_real=req.include_real,
            real_filename=req.real_dataset_filename,
            synthetic_filename=req.synthetic_dataset_filename,
            output_filename=req.output_filename
        )

        real_count = int((combined_df["data_source"] == "real").sum()) if "data_source" in combined_df else 0
        synthetic_count = int((combined_df["data_source"] == "synthetic").sum()) if "data_source" in combined_df else len(combined_df)

        return CombineDatasetResponse(
            status="SUCCESS",
            total_records=len(combined_df),
            real_records_count=real_count,
            synthetic_records_count=synthetic_count,
            output_path=str(out_path)
        )
    except Exception as e:
        logger.error("Failed to combine datasets: %s", str(e))
        raise HTTPException(
            status_code=400,
            detail=f"Dataset combination failed: {type(e).__name__} - {str(e)}"
        )
