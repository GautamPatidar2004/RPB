from fastapi import APIRouter, Depends, HTTPException, status
import pandas as pd

from models.loader import ModelLoaderService, get_model_loader, ModelNotReadyError
from models.batch_predictor import BatchPredictorService, get_batch_predictor, classify_impact_tier
from models.preprocessor import RISK_TIERS
from schemas.prediction import (
    DurationPredictionRequest,
    DurationPredictionResponse,
    RiskPredictionRequest,
    RiskPredictionResponse,
    OperationalImpactRequest,
    OperationalImpactResponse,
    BatchPredictionRequest,
    BatchPredictionResponse,
    ModelStatusResponse
)
from utils.logger import get_logger

logger = get_logger("prediction_api")

router = APIRouter(prefix="/api/v1", tags=["ML Predictions & Models"])


@router.get(
    "/models/status",
    response_model=ModelStatusResponse,
    summary="Get ML model loading and readiness status",
    description="Returns detailed status for duration, risk, and operational impact models."
)
def get_models_status(
    loader: ModelLoaderService = Depends(get_model_loader)
) -> ModelStatusResponse:
    """Returns safe metadata, versioning, readiness, and performance metrics."""
    try:
        status_dict = loader.get_model_status()
        return ModelStatusResponse(**status_dict)
    except Exception as e:
        logger.error("Error retrieving model status: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve model status."
        )


@router.post(
    "/predict/duration",
    response_model=DurationPredictionResponse,
    summary="Predict maintenance block duration",
    description="Uses trained XGBRegressor model to estimate maintenance duration in minutes."
)
def predict_duration(
    request: DurationPredictionRequest,
    loader: ModelLoaderService = Depends(get_model_loader)
) -> DurationPredictionResponse:
    """Predicts required block duration based on maintenance attributes and corridor context."""
    try:
        row = request.to_feature_row()
        df = pd.DataFrame([row])
        pred_duration = loader.predict_duration(df)[0]

        return DurationPredictionResponse(
            predicted_duration_minutes=round(float(pred_duration), 1),
            model_version=loader.version,
            success=True
        )
    except ModelNotReadyError as e:
        logger.warning("Duration prediction rejected: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Duration model is currently unavailable: {str(e)}"
        )
    except Exception as e:
        logger.error("Duration prediction failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Prediction failure during duration estimation."
        )


@router.post(
    "/predict/risk",
    response_model=RiskPredictionResponse,
    summary="Predict asset risk and urgency tier",
    description="Uses trained XGBClassifier model to categorize block into LOW, MEDIUM, or HIGH risk."
)
def predict_risk(
    request: RiskPredictionRequest,
    loader: ModelLoaderService = Depends(get_model_loader)
) -> RiskPredictionResponse:
    """Predicts asset risk tier along with winning class confidence and probability distribution."""
    try:
        row = request.to_feature_row()
        df = pd.DataFrame([row])
        class_preds, prob_preds = loader.predict_risk(df)

        win_idx = int(class_preds[0])
        win_tier = RISK_TIERS.get(win_idx, "UNKNOWN")
        probabilities = {
            "LOW": round(float(prob_preds[0][0]), 4),
            "MEDIUM": round(float(prob_preds[0][1]), 4),
            "HIGH": round(float(prob_preds[0][2]), 4)
        }
        confidence = round(float(prob_preds[0][win_idx]), 4)

        return RiskPredictionResponse(
            predicted_risk_tier=win_tier,
            risk_class_index=win_idx,
            confidence=confidence,
            probabilities=probabilities,
            model_version=loader.version,
            success=True
        )
    except ModelNotReadyError as e:
        logger.warning("Risk prediction rejected: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Risk model is currently unavailable: {str(e)}"
        )
    except Exception as e:
        logger.error("Risk prediction failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Prediction failure during risk evaluation."
        )


@router.post(
    "/predict/operational-impact",
    response_model=OperationalImpactResponse,
    summary="Predict corridor operational impact",
    description="Uses trained XGBRegressor model to predict traffic disruption friction score (0-100)."
)
def predict_operational_impact(
    request: OperationalImpactRequest,
    loader: ModelLoaderService = Depends(get_model_loader)
) -> OperationalImpactResponse:
    """Predicts operational friction score and assigns an impact severity tier."""
    try:
        row = request.to_feature_row()
        df = pd.DataFrame([row])
        pred_impact = loader.predict_impact(df)[0]
        impact_val = round(float(pred_impact), 2)

        return OperationalImpactResponse(
            predicted_operational_impact=impact_val,
            impact_tier=classify_impact_tier(impact_val),
            model_version=loader.version,
            success=True
        )
    except ModelNotReadyError as e:
        logger.warning("Operational impact prediction rejected: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Operational impact model is currently unavailable: {str(e)}"
        )
    except Exception as e:
        logger.error("Operational impact prediction failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Prediction failure during operational impact estimation."
        )


@router.post(
    "/predict/batch",
    response_model=BatchPredictionResponse,
    summary="Predict all 3 targets for a batch of candidate blocks",
    description="Vectorized evaluation predicting duration, risk, and impact simultaneously for multiple candidates."
)
def predict_batch(
    request: BatchPredictionRequest,
    batch_predictor: BatchPredictorService = Depends(get_batch_predictor)
) -> BatchPredictionResponse:
    """Processes candidate blocks in a single vectorized ML pass."""
    try:
        return batch_predictor.predict_candidates(request.candidates)
    except ModelNotReadyError as e:
        logger.warning("Batch prediction rejected: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Models are currently unavailable for batch prediction: {str(e)}"
        )
    except Exception as e:
        logger.error("Batch prediction failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Vectorized batch prediction failed."
        )
