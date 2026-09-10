import pytest
import pandas as pd
from data.cleaning import DataCleaner
from data.feature_engineering import FeatureEngineer
from data.target_preparation import TargetPreparer
from data.pipeline import DataPipeline
from data.quality_reporter import DataQualityReporter


@pytest.fixture
def sample_raw_bundle():
    """Provides realistic Railway data bundle fixture."""
    return {
        "corridor": {
            "id": "c1111111-1111-1111-1111-111111111111",
            "code": "NDLS-CNB",
            "name": "New Delhi - Kanpur Central",
            "length_km": 440.5,
            "line_type": "DOUBLE_LINE",
            "electrified": True
        },
        "maintenanceTasks": [
            {
                "id": "t1111111-1111-1111-1111-111111111111",
                "task_code": "TAMP-UP-112",
                "title": "Mechanized Heavy Track Tamping",
                "description": "Tamping of UP Main Line track",
                "maintenance_type": "TRACK_TAMPING",
                "duration_minutes": 180,
                "priority": 1,
                "criticality": "CRITICAL",
                "urgency": "HIGH",
                "required_by_date": "2026-09-15T18:00:00Z",
                "status": "PENDING",
                "power_block_required": False,
                "traffic_block_required": True,
                "speed_restriction_kmph": 30,
                "asset_id": "a1111111-1111-1111-1111-111111111111",
                "department_code": "ENGG",
                "source_system": "TMS"
            },
            {
                "id": "t2222222-2222-2222-2222-222222222222",
                "task_code": "SIG-PNT-44",
                "title": "Point Machine Testing",
                "description": "Routine quarterly overhaul",
                "maintenance_type": "POINTS_TESTING",
                "duration_minutes": 90,
                "priority": 2,
                "criticality": "HIGH",
                "urgency": "MEDIUM",
                "required_by_date": "2026-09-18T12:00:00Z",
                "status": "SCHEDULED",
                "power_block_required": False,
                "traffic_block_required": True,
                "speed_restriction_kmph": None,
                "asset_id": "a2222222-2222-2222-2222-222222222222",
                "department_code": "snt",  # lower case test
                "source_system": "SMMS"
            }
        ],
        "assets": [
            {
                "id": "a1111111-1111-1111-1111-111111111111",
                "asset_code": "TRK-UP-112",
                "asset_type": "TRACK",
                "name": "UP Main Track KM 112-116",
                "location": "KM 112 to 116",
                "start_kilometer": 112.0,
                "end_kilometer": 116.0,
                "criticality": "CRITICAL",
                "health_status": "MAINTENANCE_REQUIRED"
            },
            {
                "id": "a2222222-2222-2222-2222-222222222222",
                "asset_code": "SIG-EI-CNB",
                "asset_type": "INTERLOCKING",
                "name": "Central Cabin CNB",
                "location": "Kanpur Yard",
                "start_kilometer": 439.5,
                "end_kilometer": 440.5,
                "criticality": "HIGH",
                "health_status": "OPERATIONAL"
            }
        ],
        "blockWindows": [
            {
                "id": "w1",
                "duration_minutes": 210,
                "availability_status": "AVAILABLE",
                "block_type": "TRAFFIC_BLOCK"
            }
        ],
        "trainMovements": [
            {
                "id": "m1",
                "train_number": "22436",
                "train_type": "VANDE_BHARAT",
                "priority": 1
            }
        ],
        "dependencies": []
    }


def test_data_cleaning_and_standardization(sample_raw_bundle):
    """Test cleaner standardizes casing, handles missing values, and clamps durations."""
    cleaner = DataCleaner()
    cleaned, metrics = cleaner.clean_tasks(sample_raw_bundle["maintenanceTasks"])

    assert len(cleaned) == 2
    assert metrics["duplicates_removed"] == 0

    # Test lowercase 'snt' was standardized to uppercase 'SNT'
    t2 = next(t for t in cleaned if t["task_code"] == "SIG-PNT-44")
    assert t2["department_code"] == "SNT"

    # Test missing speed restriction imputed to 0.0
    assert t2["speed_restriction_kmph"] == 0.0

    # Test priority bounds
    assert t2["priority"] == 2


def test_cleaning_deduplication():
    """Test cleaner deduplicates duplicate task codes or IDs."""
    cleaner = DataCleaner()
    duplicate_tasks = [
        {"id": "task-1", "task_code": "DUP-01", "duration_minutes": 100},
        {"id": "task-1", "task_code": "DUP-01", "duration_minutes": 100},
        {"id": "task-2", "task_code": "DUP-01", "duration_minutes": 120}
    ]
    cleaned, metrics = cleaner.clean_tasks(duplicate_tasks)
    assert len(cleaned) == 1
    assert metrics["duplicates_removed"] == 2


def test_feature_engineering_calculations(sample_raw_bundle):
    """Test feature engineering correctly extracts all domain metrics."""
    engineer = FeatureEngineer()
    task = sample_raw_bundle["maintenanceTasks"][0]
    asset = sample_raw_bundle["assets"][0]
    corridor = sample_raw_bundle["corridor"]
    trains = sample_raw_bundle["trainMovements"]
    windows = sample_raw_bundle["blockWindows"]

    features = engineer.engineer_record_features(
        task=task,
        asset=asset,
        corridor=corridor,
        trains=trains,
        windows=windows,
        dependencies=[]
    )

    # Duration features
    assert features["feat_maint_type"] == "TRACK_TAMPING"
    assert features["feat_priority"] == 1
    assert features["feat_power_block_req"] == 0
    assert features["feat_traffic_block_req"] == 1
    assert features["feat_speed_restriction_kmph"] == 30.0
    assert features["feat_work_complexity_score"] > 1.0

    # Asset risk features
    assert features["feat_asset_criticality_score"] == 4  # CRITICAL
    assert features["feat_asset_health_score"] == 4       # MAINTENANCE_REQUIRED
    assert features["feat_task_priority_score"] == 5      # 6 - 1 = 5 (Highest urgency)

    # Operational impact features
    assert features["feat_train_traffic_count"] == 1
    assert features["feat_high_priority_train_count"] == 1
    assert features["feat_available_window_count"] == 1
    assert features["feat_total_available_window_minutes"] == 210


def test_target_preparation():
    """Test target variable calculation logic and range boundaries."""
    preparer = TargetPreparer()
    features = {
        "raw_requested_duration_minutes": 180,
        "feat_asset_health_score": 4,        # 4/5 * 30 = 24
        "feat_asset_criticality_score": 4,   # 4/4 * 25 = 25
        "feat_task_urgency_score": 3,        # 3/4 * 25 = 18.75
        "feat_task_priority_score": 5,       # 5/5 * 20 = 20
        "feat_is_overdue": 1,                # +10
        "feat_train_traffic_count": 3,
        "feat_high_priority_train_count": 2,
        "feat_traffic_block_req": 1
    }

    targets = preparer.prepare_targets(features)
    assert targets["target_maintenance_duration"] == 180.0
    assert 0.0 <= targets["target_asset_risk_priority"] <= 100.0
    assert targets["target_asset_risk_priority"] > 80.0  # High risk due to critical overdue
    assert 0.0 <= targets["target_operational_impact"] <= 100.0


def test_pipeline_end_to_end(sample_raw_bundle):
    """Test full pipeline execution from raw bundle to ML-ready DataFrame."""
    pipeline = DataPipeline()
    df, report, paths = pipeline.process_raw_bundle(sample_raw_bundle)

    assert isinstance(df, pd.DataFrame)
    assert len(df) == 2

    # Check key columns
    expected_cols = [
        "feat_maint_type", "feat_department", "feat_work_complexity_score",
        "feat_asset_criticality_score", "feat_asset_health_score",
        "feat_train_traffic_count", "target_maintenance_duration",
        "target_asset_risk_priority", "target_operational_impact"
    ]
    for col in expected_cols:
        assert col in df.columns, f"Missing expected column: {col}"

    # Verify zero null values in features or targets
    assert df[expected_cols].isna().sum().sum() == 0

    # Verify Quality Report
    assert report["record_count"] == 2
    assert report["dataset_readiness_status"] == "READY_FOR_TRAINING"


def test_empty_dataset_handling():
    """Test pipeline gracefully handles empty dataset without crashing."""
    pipeline = DataPipeline()
    empty_bundle = {
        "corridor": {"code": "EMPTY"},
        "maintenanceTasks": [],
        "assets": [],
        "blockWindows": [],
        "trainMovements": [],
        "dependencies": []
    }
    df, report, paths = pipeline.process_raw_bundle(empty_bundle)

    assert len(df) == 0
    assert report["record_count"] == 0
    assert report["dataset_readiness_status"] == "NEEDS_MORE_DATA"


def test_preprocessing_reproducibility(sample_raw_bundle):
    """Verify running the pipeline twice on identical input produces identical outputs."""
    pipeline = DataPipeline()
    df1, report1, _ = pipeline.process_raw_bundle(sample_raw_bundle)
    df2, report2, _ = pipeline.process_raw_bundle(sample_raw_bundle)

    # Compare values directly
    assert df1["target_maintenance_duration"].tolist() == df2["target_maintenance_duration"].tolist()
    assert df1["target_asset_risk_priority"].tolist() == df2["target_asset_risk_priority"].tolist()
    assert df1["target_operational_impact"].tolist() == df2["target_operational_impact"].tolist()
    assert df1["feat_work_complexity_score"].tolist() == df2["feat_work_complexity_score"].tolist()
