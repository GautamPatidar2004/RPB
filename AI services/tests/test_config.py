from config.settings import Settings


def test_settings_defaults():
    """Verify default configurations are valid."""
    settings = Settings(
        backend_api_url="http://localhost:5000",
        backend_auth_username="planner",
        backend_auth_password="SecretPassword",
        pghost="db.example.com",
        pgpassword="DatabaseSecret"
    )

    assert settings.ai_service_port == 8000
    assert settings.backend_api_url == "http://localhost:5000"
    assert "http://localhost:3000" in settings.cors_origins

    # Safe summary must not contain passwords
    summary = settings.get_safe_summary()
    assert "SecretPassword" not in str(summary)
    assert "DatabaseSecret" not in str(summary)
    assert "pgpassword" not in summary
    assert "backend_auth_password" not in summary
    assert summary["backend_configured"] is True
    assert summary["supabase_configured"] is True
