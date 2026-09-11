from typing import Dict, Any, Tuple, Optional
import pandas as pd
from data.ingestion import DataIngestionService
from data.cleaning import DataCleaner
from data.feature_engineering import FeatureEngineer
from data.target_preparation import TargetPreparer
from data.quality_reporter import DataQualityReporter
from data.storage import DatasetStorageManager
from utils.logger import get_logger

logger = get_logger("data_pipeline")


class DataPipeline:
    """
    End-to-End Railway ML Data Preparation Pipeline:
    Raw Railway Data
    → Ingestion & Snapshot
    → Cleaning & Validation
    → Feature Engineering (Duration, Risk, Impact)
    → Target Preparation
    → ML-Ready Dataset Storage
    → Data Quality Reporting
    """

    def __init__(
        self,
        ingestion_service: Optional[DataIngestionService] = None,
        cleaner: Optional[DataCleaner] = None,
        feature_engineer: Optional[FeatureEngineer] = None,
        target_preparer: Optional[TargetPreparer] = None,
        quality_reporter: Optional[DataQualityReporter] = None,
        storage_manager: Optional[DatasetStorageManager] = None
    ):
        self.ingestion_service = ingestion_service or DataIngestionService()
        self.cleaner = cleaner or DataCleaner()
        self.feature_engineer = feature_engineer or FeatureEngineer()
        self.target_preparer = target_preparer or TargetPreparer()
        self.quality_reporter = quality_reporter or DataQualityReporter()
        self.storage_manager = storage_manager or DatasetStorageManager()

    async def run_pipeline_from_source(
        self,
        corridor_code: str = "NDLS-CNB",
        horizon_start: Optional[str] = None,
        horizon_end: Optional[str] = None
    ) -> Tuple[pd.DataFrame, Dict[str, Any], Dict[str, str]]:
        """
        Fetches live data from the backend data gateway and runs the full preparation pipeline.
        """
        logger.info("Executing DataPipeline from live source for corridor: %s", corridor_code)
        raw_bundle = await self.ingestion_service.fetch_corridor_planning_data(
            corridor_code=corridor_code,
            horizon_start=horizon_start,
            horizon_end=horizon_end
        )
        return self.process_raw_bundle(raw_bundle)

    def process_raw_bundle(
        self,
        raw_bundle: Dict[str, Any]
    ) -> Tuple[pd.DataFrame, Dict[str, Any], Dict[str, str]]:
        """
        Processes a raw data package through cleaning, feature engineering, and target preparation.
        Pure/reproducible method suitable for both live data and testing fixtures.
        """
        corridor = raw_bundle.get("corridor", {})
        raw_tasks = raw_bundle.get("maintenanceTasks", [])
        assets = raw_bundle.get("assets", [])
        windows = raw_bundle.get("blockWindows", [])
        trains = raw_bundle.get("trainMovements", [])
        dependencies = raw_bundle.get("dependencies", [])

        # 1. Save Raw Snapshot
        raw_path = self.storage_manager.save_raw_snapshot(raw_bundle)

        # 2. Build asset lookup map
        asset_map: Dict[str, Dict[str, Any]] = {}
        for a in assets:
            if a.get("id"):
                asset_map[str(a["id"])] = a
            if a.get("asset_code"):
                asset_map[str(a["asset_code"]).upper()] = a

        # 3. Clean and Validate Tasks
        cleaned_tasks, clean_metrics = self.cleaner.clean_tasks(raw_tasks)

        # 4. Feature Engineering & Target Preparation
        processed_rows: list[Dict[str, Any]] = []
        for task in cleaned_tasks:
            asset_id = str(task.get("asset_id") or "")
            asset_code = str(task.get("asset_code") or "").upper()
            matched_asset = asset_map.get(asset_id) or asset_map.get(asset_code)

            # Extract features
            features = self.feature_engineer.engineer_record_features(
                task=task,
                asset=matched_asset,
                corridor=corridor,
                trains=trains,
                windows=windows,
                dependencies=dependencies
            )

            # Prepare targets
            targets = self.target_preparer.prepare_targets(features)

            # Combine features + targets
            row = {**features, **targets}
            processed_rows.append(row)

        # 5. Build DataFrame
        if processed_rows:
            df = pd.DataFrame(processed_rows)
        else:
            df = pd.DataFrame()

        # 6. Generate Data Quality Report
        quality_report = self.quality_reporter.generate_report(df, clean_metrics)

        # 7. Persist Processed Dataset and Report
        dataset_path = self.storage_manager.save_processed_dataset(df)
        report_path = self.storage_manager.save_quality_report(quality_report)

        storage_paths = {
            "raw_snapshot": str(raw_path),
            "processed_dataset": str(dataset_path),
            "quality_report": str(report_path)
        }

        logger.info(
            "Pipeline successfully processed %d records into ML-ready dataset.",
            len(df)
        )
        return df, quality_report, storage_paths
