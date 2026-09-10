from pathlib import Path
from typing import Tuple, Optional
import pandas as pd
from utils.logger import get_logger

logger = get_logger("dataset_combiner")

DATA_DIR = Path(__file__).resolve().parent
PROCESSED_DIR = DATA_DIR / "processed"
SYNTHETIC_DIR = DATA_DIR / "synthetic"


class DatasetCombiner:
    """
    Combines real Railway historical records with synthetic records safely.
    Strictly preserves data provenance by tracking `data_source` on every record.
    Never mixes real and synthetic records unless explicitly invoked.
    """

    def __init__(
        self,
        processed_dir: Optional[Path] = None,
        synthetic_dir: Optional[Path] = None
    ):
        self.processed_dir = processed_dir or PROCESSED_DIR
        self.synthetic_dir = synthetic_dir or SYNTHETIC_DIR

    def combine_datasets(
        self,
        include_real: bool = True,
        real_filename: str = "ml_ready_dataset.csv",
        synthetic_filename: str = "synthetic_dataset.csv",
        output_filename: str = "combined_dataset.csv"
    ) -> Tuple[pd.DataFrame, Path]:
        """
        Merges real and synthetic datasets when explicitly enabled.
        """
        synthetic_path = self.synthetic_dir / synthetic_filename
        if not synthetic_path.exists():
            raise FileNotFoundError(f"Synthetic dataset not found at {synthetic_path}. Generate it first.")

        synthetic_df = pd.read_csv(synthetic_path)
        synthetic_df["data_source"] = "synthetic"

        if include_real:
            real_path = self.processed_dir / real_filename
            if real_path.exists():
                real_df = pd.read_csv(real_path)
                real_df["data_source"] = "real"

                # Align columns
                all_cols = [c for c in real_df.columns if c in synthetic_df.columns]
                # Ensure all key features are preserved
                for col in synthetic_df.columns:
                    if col not in real_df.columns:
                        real_df[col] = None

                combined_df = pd.concat([real_df, synthetic_df], ignore_index=True)
                logger.info("Combined %d real records and %d synthetic records (total: %d)",
                            len(real_df), len(synthetic_df), len(combined_df))
            else:
                logger.warning("Real dataset %s not found. Using synthetic only.", real_path)
                combined_df = synthetic_df
        else:
            logger.info("Real data inclusion disabled. Using %d synthetic records.", len(synthetic_df))
            combined_df = synthetic_df

        # Save combined dataset to processed directory
        output_path = self.processed_dir / output_filename
        combined_df.to_csv(output_path, index=False, encoding="utf-8")
        logger.info("Saved combined dataset to: %s", output_path)

        return combined_df, output_path
