def test_status_endpoint(client):
    """Test GET /api/v1/status returns 200, valid structure, and no secrets."""
    response = client.get("/api/v1/status")
    assert response.status_code == 200
    data = response.json()

    assert "status" in data
    assert data["service"] == "railway-ai-service"
    assert "version" in data
    assert "timestamp" in data
    assert "environment" in data

    # Verify backend and supabase structures
    assert "backend_connection" in data
    backend = data["backend_connection"]
    assert "status" in backend
    assert "url" in backend
    assert "authenticated" in backend

    assert "supabase_connection" in data
    supabase = data["supabase_connection"]
    assert "status" in supabase
    assert "host_configured" in supabase

    # Critical Security Check: Ensure zero credentials exposed
    response_text = response.text.lower()
    assert "gautam123" not in response_text
    assert "planner@123" not in response_text
    assert "password" not in response_text


def test_data_connection_test_endpoint(client):
    """Test GET /api/v1/data/test-connection returns diagnostic structure."""
    response = client.get("/api/v1/data/test-connection")
    assert response.status_code == 200
    data = response.json()

    assert "success" in data
    assert "timestamp" in data
    assert "backend" in data
    assert "supabase" in data

    # Ensure zero credentials exposed
    response_text = response.text.lower()
    assert "gautam123" not in response_text
    assert "planner@123" not in response_text
