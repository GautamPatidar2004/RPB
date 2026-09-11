import sys
from pathlib import Path
import pytest

# Ensure root AI services directory is in sys.path for test discovery
AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

from main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Provides a synchronous FastAPI TestClient."""
    with TestClient(app) as test_client:
        yield test_client
