import time
from typing import List, Dict, Any, Union
import pandas as pd

from models.loader import ModelLoaderService, get_model_loader
from models.preprocessor import RISK_TIERS
from schemas.prediction import BatchBlockCandidateItem, BatchBlockPredictionResult, BatchPredictionResponse
from utils.logger import get_logger

logger = get_logger("batch_predictor")


def classify_impact_tier(score: float) -> str:
    """Categorizes continuous operational impact friction score (0-100) into actionable tiers."""
    if score < 30.0:
        return "LOW"
    elif score < 60.0:
        return "MODERATE"
    elif score < 80.0:
        return "HIGH"
    else:
        return "SEVERE"


class BatchPredictorService:
    """
    High-throughput internal batch prediction engine for candidate maintenance blocks.
    Executes vectorized transformations and simultaneous evaluations across all 3 models.
    Designed for in-memory OR-Tools constraint optimization workflows (Prompt 7) as well as API serving.
    """

    def __init__(self, loader: ModelLoaderService):
        self.loader = loader

    def predict_candidates(
        self,
        candidates: List[Union[BatchBlockCandidateItem, Dict[str, Any]]]
    ) -> BatchPredictionResponse:
        """
        Executes vectorized batch prediction on candidate blocks.
        """
        start_time = time.perf_counter()

        if not candidates:
            return BatchPredictionResponse(
                total_candidates=0,
                predictions=[],
                model_version=self.loader.version,
                processing_time_ms=0.0,
                success=True
            )

        candidate_ids = []
        rows = []

        for idx, c in enumerate(candidates):
            if isinstance(c, BatchBlockCandidateItem):
                cid = c.candidate_id
                row = c.to_feature_row()
            elif isinstance(c, dict):
                c_copy = dict(c)
                cid = str(c_copy.pop("candidate_id", None) or f"candidate_{idx}")
                # Parse through item to guarantee validated transformations
                parsed = BatchBlockCandidateItem(candidate_id=cid, **c_copy)
                row = parsed.to_feature_row()
            else:
                raise ValueError(f"Unsupported candidate item type: {type(c)}")

            candidate_ids.append(cid)
            rows.append(row)

        df_batch = pd.DataFrame(rows)

        # 1. Vectorized Predictions
        durations = self.loader.predict_duration(df_batch)
        risk_classes, risk_probs = self.loader.predict_risk(df_batch)
        impacts = self.loader.predict_impact(df_batch)

        # 2. Assemble Results
        results: List[BatchBlockPredictionResult] = []
        for i in range(len(candidates)):
            r_idx = int(risk_classes[i])
            r_tier = RISK_TIERS.get(r_idx, "UNKNOWN")
            r_prob_dist = {
                "LOW": round(float(risk_probs[i][0]), 4),
                "MEDIUM": round(float(risk_probs[i][1]), 4),
                "HIGH": round(float(risk_probs[i][2]), 4)
            }
            r_conf = round(float(risk_probs[i][r_idx]), 4)
            imp_val = round(float(impacts[i]), 2)

            results.append(
                BatchBlockPredictionResult(
                    candidate_id=candidate_ids[i],
                    predicted_duration_minutes=round(float(durations[i]), 1),
                    predicted_risk_tier=r_tier,
                    risk_confidence=r_conf,
                    risk_probabilities=r_prob_dist,
                    predicted_operational_impact=imp_val,
                    impact_tier=classify_impact_tier(imp_val)
                )
            )

        elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
        logger.info("Batch prediction completed for %d candidates in %.2f ms", len(candidates), elapsed_ms)

        return BatchPredictionResponse(
            total_candidates=len(candidates),
            predictions=results,
            model_version=self.loader.version,
            processing_time_ms=elapsed_ms,
            success=True
        )


def get_batch_predictor() -> BatchPredictorService:
    """Dependency provider for BatchPredictorService."""
    loader = get_model_loader()
    return BatchPredictorService(loader=loader)
