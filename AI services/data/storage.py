import json
from pathlib import Path
from typing import Optional, Dict, Any
import pandas as pd
from utils.logger import get_logger

logger = get_logger("dataset_storage")

DATA_DIR = Path(__file__).resolve().parent
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"


class DatasetStorageManager:
    """
    Manages local filesystem storage of raw ingested snapshots and processed ML-ready datasets.
    Ensures strict logical separation between raw input streams and processed feature matrices.
    """

    def __init__(self, raw_dir: Optional[Path] = None, processed_dir: Optional[Path] = None):
        self.raw_dir = raw_dir or RAW_DIR
        self.processed_dir = processed_dir or PROCESSED_DIR

        # Create directories if they do not exist
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.processed_dir.mkdir(parents=True, exist_ok=True)

    def save_raw_snapshot(self, data: Dict[str, Any], filename: str = "latest_raw_snapshot.json") -> Path:
        """Saves a JSON snapshot of the raw ingested planning dataset."""
        file_path = self.raw_dir / filename
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
        logger.info("Saved raw data snapshot to: %s", file_path)
        return file_path

    def save_processed_dataset(self, df: pd.DataFrame, filename: str = "ml_ready_dataset.csv") -> Path:
        """Saves the ML-ready feature matrix to CSV."""
        file_path = self.processed_dir / filename
        df.to_csv(file_path, index=False, encoding="utf-8")
        logger.info("Saved ML-ready processed dataset (%d rows, %d cols) to: %s", len(df), len(df.columns), file_path)
        return file_path

    def save_quality_report(self, report: Dict[str, Any], filename: str = "data_quality_report.json") -> Path:
        """Saves the data quality inspection report to JSON."""
        file_path = self.processed_dir / filename
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        logger.info("Saved data quality report to: %s", file_path)
        return file_path

    def load_processed_dataset(self, filename: str = "ml_ready_dataset.csv") -> Optional[pd.DataFrame]:
        """Loads the processed dataset if available."""
        file_path = self.processed_dir / filename
        if not file_path.exists():
            return None
        return pd.read_csv(file_path)

    def load_latest_quality_report(self, filename: str = "data_quality_report.json") -> Optional[Dict[str, Any]]:
        """Loads the latest quality report if available."""
        file_path = self.processed_dir / filename
        if not file_path.exists():
            return None
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
