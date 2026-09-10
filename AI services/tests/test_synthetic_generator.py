import pytest
import pandas as pd
from data.synthetic_generator import RailwaySyntheticGenerator
from data.synthetic_validator import SyntheticDataValidator, EXPECTED_PROMPT2_COLUMNS
from data.dataset_combiner import DatasetCombiner


def test_synthetic_generation_default():
    """Test generating default 100-record test dataset."""
    generator = RailwaySyntheticGenerator(seed=42)
    df, out_path = generator.generate_dataset(n_records=100, output_filename="test_synth.csv")

    assert isinstance(df, pd.DataFrame)
    assert len(df) == 100
    assert out_path.exists()
    assert df["data_source"].iloc[0] == "synthetic"
    assert df["generator_version"].iloc[0] == "1.0.0"
    assert df["random_seed"].iloc[0] == 42


def test_schema_compatibility_with_prompt2():
    """Verify 100% column parity with Prompt 2 ML-ready schema."""
    generator = RailwaySyntheticGenerator(seed=42)
    df, _ = generator.generate_dataset(n_records=50)

    for col in EXPECTED_PROMPT2_COLUMNS:
        assert col in df.columns, f"Expected Prompt 2 column '{col}' missing from synthetic dataset"

    # Verify zero null values across all columns
    assert df[EXPECTED_PROMPT2_COLUMNS].isna().sum().sum() == 0


def test_seed_reproducibility():
    """Verify using identical seed produces exact identical values."""
    gen1 = RailwaySyntheticGenerator(seed=123)
    df1, _ = gen1.generate_dataset(n_records=50, output_filename="test_seed1.csv")

    gen2 = RailwaySyntheticGenerator(seed=123)
    df2, _ = gen2.generate_dataset(n_records=50, output_filename="test_seed2.csv")

    # Values must match exactly
    pd.testing.assert_frame_equal(df1, df2)


def test_target_generation_and_ranges():
    """Verify generated target labels satisfy physical range boundaries."""
    generator = RailwaySyntheticGenerator(seed=99)
    df, _ = generator.generate_dataset(n_records=200)

    # 1. Maintenance Duration
    assert (df["target_maintenance_duration"] > 0).all()
    assert df["target_maintenance_duration"].min() >= 30.0
    assert df["target_maintenance_duration"].max() <= 720.0

    # 2. Asset Risk & Priority
    assert (df["target_asset_risk_priority"] >= 0.0).all()
    assert (df["target_asset_risk_priority"] <= 100.0).all()

    # 3. Operational Impact
    assert (df["target_operational_impact"] >= 0.0).all()
    assert (df["target_operational_impact"] <= 100.0).all()


def test_domain_correlations():
    """Verify domain correlations are positive and non-trivial."""
    generator = RailwaySyntheticGenerator(seed=42)
    df, _ = generator.generate_dataset(n_records=500)

    # Complexity vs Duration
    c_dur = df["feat_work_complexity_score"].corr(df["target_maintenance_duration"])
    assert c_dur > 0.20, f"Expected positive complexity-duration correlation, got {c_dur}"

    # Asset Health vs Risk Priority
    c_risk = df["feat_asset_health_score"].corr(df["target_asset_risk_priority"])
    assert c_risk > 0.20, f"Expected positive health-risk correlation, got {c_risk}"

    # Train Traffic vs Operational Impact
    c_imp = df["feat_train_traffic_count"].corr(df["target_operational_impact"])
    assert c_imp > 0.20, f"Expected positive traffic-impact correlation, got {c_imp}"


def test_quality_validation():
    """Verify SyntheticDataValidator returns VALID on generated dataset."""
    generator = RailwaySyntheticGenerator(seed=42)
    df, _ = generator.generate_dataset(n_records=100)

    validator = SyntheticDataValidator()
    report = validator.validate(df)

    assert report["validation_status"] == "VALID"
    assert len(report["issues_detected"]) == 0
    assert len(report["checks_passed"]) >= 5


def test_invalid_config_handling():
    """Verify invalid configurations are safely caught and rejected."""
    generator = RailwaySyntheticGenerator(seed=42)

    with pytest.raises(ValueError, match="n_records must be greater than 0"):
        generator.generate_dataset(n_records=0)

    with pytest.raises(ValueError, match="Unknown corridor code"):
        generator.generate_dataset(n_records=10, corridors=["NON_EXISTENT_CORRIDOR"])


def test_dataset_combiner():
    """Verify DatasetCombiner merges real and synthetic datasets with correct provenance."""
    combiner = DatasetCombiner()
    # Combine using synthetic dataset
    combined_df, path = combiner.combine_datasets(
        include_real=True,
        real_filename="ml_ready_dataset.csv",
        synthetic_filename="synthetic_dataset.csv",
        output_filename="test_combined.csv"
    )

    assert isinstance(combined_df, pd.DataFrame)
    assert len(combined_df) > 0
    assert "data_source" in combined_df.columns
    assert path.exists()

    # Check that data sources are marked properly
    sources = set(combined_df["data_source"].unique())
    assert "synthetic" in sources
