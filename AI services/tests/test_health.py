def test_health_endpoint(client):
    """Test GET /health returns 200 and valid health payload."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "railway-ai-service"
    assert "version" in data
