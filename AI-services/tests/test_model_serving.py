import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

import pytest
from fastapi.testclient import TestClient

from main import app
from models.loader import ModelLoaderService, get_model_loader, ModelNotReadyError
from models.batch_predictor import BatchPredictorService, get_batch_predictor, classify_impact_tier
from schemas.prediction import BatchBlockCandidateItem


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_model_status_endpoint(client):
    """Verifies GET /api/v1/models/status returns comprehensive readiness status."""
    res = client.get("/api/v1/models/status")
    assert res.status_code == 200
    data = res.json()

    assert data["ready"] is True
    assert data["model_version"] == "v1"
    assert data["preprocessor_ready"] is True
    assert data["feature_count"] > 0
    assert "duration_model" in data["loaded_models"]
    assert "risk_model" in data["loaded_models"]
    assert "impact_model" in data["loaded_models"]
    assert data["loaded_models"]["duration_model"]["loaded"] is True
    assert data["loaded_models"]["risk_model"]["loaded"] is True
    assert data["loaded_models"]["impact_model"]["loaded"] is True
    assert "metrics_summary" in data
    # Ensure no secrets leaked
    assert "supabase_key" not in str(data).lower()
    assert "postgres" not in str(data).lower()


def test_predict_duration_endpoint(client):
    """Verifies POST /api/v1/predict/duration with realistic block payload."""
    payload = {
        "corridor_code": "NDLS-CNB",
        "department": "ENGG",
        "maintenance_type": "TRACK_TAMPING",
        "asset_type": "TRACK",
        "asset_criticality": "HIGH",
        "asset_health_status": "DEGRADED",
        "task_urgency": "HIGH",
        "priority": 4,
        "power_block_required": False,
        "traffic_block_required": True,
        "speed_restriction_kmph": 30.0,
        "work_complexity_score": 3.5,
        "corridor_length_km": 440.0,
        "corridor_electrified": True,
        "corridor_double_line": True,
        "section_span_km": 3.0,
        "dependency_count": 1,
        "train_traffic_count": 28,
        "high_priority_train_count": 7,
        "available_window_count": 2,
        "total_available_window_minutes": 200.0,
        "days_until_required": 2.0,
        "requested_duration_minutes": 180.0
    }

    res = client.post("/api/v1/predict/duration", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["model_version"] == "v1"
    assert isinstance(data["predicted_duration_minutes"], (int, float))
    assert data["predicted_duration_minutes"] >= 15.0


def test_predict_risk_endpoint(client):
    """Verifies POST /api/v1/predict/risk returns tier, confidence, and probabilities."""
    payload = {
        "corridor_code": "NDLS-CNB",
        "department": "ENGG",
        "maintenance_type": "RAIL_FRACTURE_REPAIR",
        "asset_type": "TRACK",
        "asset_criticality": "CRITICAL",
        "asset_health_status": "FAILED",
        "task_urgency": "IMMEDIATE",
        "priority": 5,
        "days_until_required": -1.0,
        "is_overdue": True,
        "traffic_block_required": True
    }

    res = client.post("/api/v1/predict/risk", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["model_version"] == "v1"
    assert data["predicted_risk_tier"] in ["LOW", "MEDIUM", "HIGH"]
    assert 0.0 <= data["confidence"] <= 1.0
    assert "probabilities" in data
    assert abs(sum(data["probabilities"].values()) - 1.0) < 0.01


def test_predict_operational_impact_endpoint(client):
    """Verifies POST /api/v1/predict/operational-impact returns friction score and tier."""
    payload = {
        "corridor_code": "NDLS-CNB",
        "department": "TRD",
        "maintenance_type": "OHE_INSPECTION",
        "asset_type": "OHE_LINE",
        "power_block_required": True,
        "traffic_block_required": True,
        "train_traffic_count": 45,
        "high_priority_train_count": 15,
        "speed_restriction_kmph": 20.0,
        "work_complexity_score": 4.0,
        "potential_train_conflicts": 12
    }

    res = client.post("/api/v1/predict/operational-impact", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["model_version"] == "v1"
    assert 0.0 <= data["predicted_operational_impact"] <= 100.0
    assert data["impact_tier"] in ["LOW", "MODERATE", "HIGH", "SEVERE"]


def test_predict_batch_endpoint(client):
    """Verifies POST /api/v1/predict/batch with multiple heterogeneous candidates."""
    candidates = [
        {
            "candidate_id": "cand_001",
            "corridor_code": "NDLS-CNB",
            "department": "ENGG",
            "maintenance_type": "TRACK_TAMPING",
            "asset_type": "TRACK",
            "asset_criticality": "HIGH",
            "asset_health_status": "DEGRADED",
            "task_urgency": "HIGH",
            "priority": 4,
            "traffic_block_required": True,
            "train_traffic_count": 25,
            "high_priority_train_count": 5
        },
        {
            "candidate_id": "cand_002",
            "corridor_code": "NDLS-CNB",
            "department": "SNT",
            "maintenance_type": "POINTS_TESTING",
            "asset_type": "TURNOUT",
            "asset_criticality": "MEDIUM",
            "asset_health_status": "OPERATIONAL",
            "task_urgency": "LOW",
            "priority": 2,
            "traffic_block_required": False,
            "train_traffic_count": 15,
            "high_priority_train_count": 3
        },
        {
            "candidate_id": "cand_003",
            "corridor_code": "NDLS-CNB",
            "department": "TRD",
            "maintenance_type": "OHE_INSPECTION",
            "asset_type": "OHE_LINE",
            "asset_criticality": "CRITICAL",
            "asset_health_status": "MAINTENANCE_REQUIRED",
            "task_urgency": "MEDIUM",
            "priority": 3,
            "power_block_required": True,
            "train_traffic_count": 35,
            "high_priority_train_count": 10
        }
    ]

    res = client.post("/api/v1/predict/batch", json={"candidates": candidates})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["total_candidates"] == 3
    assert len(data["predictions"]) == 3
    assert data["processing_time_ms"] >= 0.0

    c1 = data["predictions"][0]
    assert c1["candidate_id"] == "cand_001"
    assert c1["predicted_duration_minutes"] >= 15.0
    assert c1["predicted_risk_tier"] in ["LOW", "MEDIUM", "HIGH"]
    assert 0.0 <= c1["predicted_operational_impact"] <= 100.0


def test_in_memory_batch_predictor_direct():
    """Verifies direct Python BatchPredictorService execution for Prompt 7 integration."""
    predictor = get_batch_predictor()
    item = BatchBlockCandidateItem(
        candidate_id="direct_opt_01",
        corridor_code="NDLS-CNB",
        department="ENGG",
        maintenance_type="TRACK_TAMPING",
        asset_type="TRACK",
        priority=3
    )

    response = predictor.predict_candidates([item])
    assert response.success is True
    assert response.total_candidates == 1
    pred = response.predictions[0]
    assert pred.candidate_id == "direct_opt_01"
    assert pred.predicted_duration_minutes >= 15.0
    assert pred.predicted_risk_tier in ["LOW", "MEDIUM", "HIGH"]
    assert 0.0 <= pred.predicted_operational_impact <= 100.0


def test_validation_invalid_inputs(client):
    """Verifies schema validation properly rejects invalid data."""
    # 1. Invalid department
    res = client.post("/api/v1/predict/duration", json={"department": "UNKNOWN_DEPT"})
    assert res.status_code == 422

    # 2. Invalid criticality
    res = client.post("/api/v1/predict/risk", json={"asset_criticality": "SUPER_CRITICAL"})
    assert res.status_code == 422

    # 3. Invalid priority (> 5)
    res = client.post("/api/v1/predict/duration", json={"priority": 10})
    assert res.status_code == 422

    # 4. Negative speed restriction
    res = client.post("/api/v1/predict/duration", json={"speed_restriction_kmph": -25.0})
    assert res.status_code == 422

    # 5. high_priority_train_count exceeding total train_traffic_count
    res = client.post("/api/v1/predict/operational-impact", json={
        "train_traffic_count": 10,
        "high_priority_train_count": 25
    })
    assert res.status_code == 422


def test_model_not_ready_handling(client):
    """Verifies 503 is returned when models are not loaded."""
    class MockUnreadyLoader:
        is_ready = False
        version = "v1"
        def predict_duration(self, df):
            raise ModelNotReadyError("Model artifacts not loaded.")

    app.dependency_overrides[get_model_loader] = lambda: MockUnreadyLoader()
    try:
        res = client.post("/api/v1/predict/duration", json={"department": "ENGG"})
        assert res.status_code == 503
        assert "unavailable" in res.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


def test_classify_impact_tier():
    """Verifies impact tier categorization."""
    assert classify_impact_tier(10.0) == "LOW"
    assert classify_impact_tier(29.9) == "LOW"
    assert classify_impact_tier(30.0) == "MODERATE"
    assert classify_impact_tier(59.9) == "MODERATE"
    assert classify_impact_tier(60.0) == "HIGH"
    assert classify_impact_tier(79.9) == "HIGH"
    assert classify_impact_tier(80.0) == "SEVERE"
    assert classify_impact_tier(95.0) == "SEVERE"
