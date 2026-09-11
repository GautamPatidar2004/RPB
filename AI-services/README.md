# Railway AI Service Foundation

FastAPI-based AI Service foundation for the Indian Railways Automatic Block Planning system.

## 1. Install Dependencies

Ensure Python 3.10+ is installed, then run:

```bash
pip install -r requirements.txt
```

## 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Review or edit settings in `.env`:
- `AI_SERVICE_PORT`: Port to run the service on (default: `8000`)
- `BACKEND_API_URL`: URL of the Node.js backend (default: `http://localhost:5000`)
- `BACKEND_AUTH_USERNAME` / `BACKEND_AUTH_PASSWORD`: Credentials for AI data access (default: `planner` / `Planner@123`)
- `PGHOST` / `PGPORT` / `PGDATABASE`: Supabase PostgreSQL settings (mirrored from backend)

## 3. Run the AI Service

Start with Python or Uvicorn:

```bash
python main.py
```

Or using uvicorn directly:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive API documentation will be accessible at:
- Swagger UI: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`
- Status check: `http://localhost:8000/api/v1/status`
- Data connection test: `http://localhost:8000/api/v1/data/test-connection`

## 4. Run Tests

Run the automated test suite with pytest:

```bash
pytest tests/ -v
```
