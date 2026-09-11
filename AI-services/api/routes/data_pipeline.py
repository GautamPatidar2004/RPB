from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from data.pipeline import DataPipeline
from data.storage import DatasetStorageManager
from schemas.data_pipeline import (
    PipelineRunResponse,
    DataQualityReportResponse,
    DatasetSummaryResponse
)
from utils.logger import get_logger

logger = get_logger("data_pipeline_route")
router = APIRouter(prefix="/api/v1/data", tags=["Data Preparation Pipeline"])


@router.post(
    "/prepare",
    response_model=PipelineRunResponse,
    summary="Execute Data Preparation Pipeline",
    description="Ingests Railway planning data from backend, cleans it, engineers features, prepares targets, and stores the ML-ready dataset."
)
async def run_data_preparation(
    corridor_code: str = Query(default="NDLS-CNB", description="Railway corridor code"),
    horizon_start: Optional[str] = Query(default=None, description="Horizon start ISO timestamp"),
    horizon_end: Optional[str] = Query(default=None, description="Horizon end ISO timestamp")
) -> PipelineRunResponse:
    pipeline = DataPipeline()
    try:
        df, report, paths = await pipeline.run_pipeline_from_source(
            corridor_code=corridor_code,
            horizon_start=horizon_start,
            horizon_end=horizon_end
        )

        return PipelineRunResponse(
            status="SUCCESS" if len(df) > 0 else "WARNING",
            corridor_code=corridor_code,
            records_ingested=report.get("record_count", 0) + report.get("duplicate_count", 0),
            records_processed=len(df),
            dataset_path=paths["processed_dataset"],
            report_path=paths["quality_report"]
        )
    except Exception as e:
        logger.error("Failed executing data preparation pipeline: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Data preparation pipeline failed: {type(e).__name__} - {str(e)}"
        )


@router.get(
    "/quality-report",
    response_model=DataQualityReportResponse,
    summary="Get Data Quality Inspection Report",
    description="Returns the latest compact data-quality assessment for the processed ML dataset."
)
async def get_data_quality_report() -> DataQualityReportResponse:
    storage = DatasetStorageManager()
    report = storage.load_latest_quality_report()
    if not report:
        # If no report on disk, run pipeline once to generate baseline
        pipeline = DataPipeline()
        try:
            _, report, _ = await pipeline.run_pipeline_from_source()
        except Exception as e:
            raise HTTPException(
                status_code=404,
                detail=f"Quality report not found and could not generate from source: {str(e)}"
            )

    return DataQualityReportResponse(**report)


@router.get(
    "/dataset-summary",
    response_model=DatasetSummaryResponse,
    summary="Get ML-Ready Dataset Summary",
    description="Returns shapes, feature columns, and target column definitions for downstream ML modeling."
)
async def get_dataset_summary() -> DatasetSummaryResponse:
    storage = DatasetStorageManager()
    df = storage.load_processed_dataset()
    if df is None or len(df) == 0:
        # Generate on the fly
        pipeline = DataPipeline()
        df, _, _ = await pipeline.run_pipeline_from_source()

    feature_cols = [c for c in df.columns if c.startswith("feat_")]
    target_cols = [c for c in df.columns if c.startswith("target_")]
    numeric_cols = [c for c in feature_cols if df[c].dtype in ("int64", "float64")]
    categorical_cols = [c for c in feature_cols if df[c].dtype == "object"]

    return DatasetSummaryResponse(
        total_rows=len(df),
        total_features=len(feature_cols),
        feature_columns=feature_cols,
        target_columns=target_cols,
        categorical_columns=categorical_cols,
        numeric_columns=numeric_cols
    )
