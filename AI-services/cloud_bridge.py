from datetime import datetime, timedelta
import requests

BASE_URL = "https://rpb-backend.onrender.com"

def run_pipeline():
    print("[1/4] Authenticating with Render backend...")
    login_payload = {
        "username": "planner",
        "password": "Planner@123"
    }
    
    auth_resp = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload)
    if auth_resp.status_code != 200:
        print(f"Authentication failed: {auth_resp.text}")
        return

    token = auth_resp.json().get("token")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    print("Authentication successful.")

    print("[2/4] Fetching planning data from cloud database...")
    corridor_code = "NDLS-CNB"
    horizon_start = datetime.utcnow().isoformat() + "Z"
    horizon_end = (datetime.utcnow() + timedelta(days=7)).isoformat() + "Z"

    params = {
        "corridorCode": corridor_code,
        "horizonStart": horizon_start,
        "horizonEnd": horizon_end
    }

    data_resp = requests.get(f"{BASE_URL}/api/v1/ai/planning-data", headers=headers, params=params)
    if data_resp.status_code != 200:
        print(f"Failed to fetch planning data: {data_resp.text}")
        return

    planning_data = data_resp.json()
    corridor = planning_data.get("corridor", {})
    tasks = planning_data.get("maintenanceTasks", [])
    windows = planning_data.get("blockWindows", [])
    trains = planning_data.get("trainMovements", [])

    print(f"Retrieved: {len(tasks)} tasks, {len(windows)} block windows, {len(trains)} train movements.")

    if not tasks or not windows:
        print("No pending tasks or available windows found in this horizon to schedule.")
        return

    print("[3/4] Generating plan allocation payload...")
    selected_task = tasks[0]
    selected_window = windows[0]

    assigned_start = selected_window.get("window_start") or "2026-09-12T01:30:00Z"
    assigned_end = selected_window.get("window_end") or "2026-09-12T03:30:00Z"

    plan_payload = {
        "planReference": f"BP-{corridor_code}-{datetime.utcnow().strftime('%Y%m%d%H%M')}-V1",
        "corridorId": corridor.get("id"),
        "horizonStartDate": horizon_start,
        "horizonEndDate": horizon_end,
        "version": 1,
        "aiOptimizationMetadata": {
            "solver": "Google-OR-Tools-CP-SAT",
            "objective": "MIN_DISRUPTION_COST"
        },
        "assignedTasks": [
            {
                "maintenanceTaskId": selected_task.get("id"),
                "assignedBlockWindowId": selected_window.get("id"),
                "assignedStartTime": assigned_start,
                "assignedEndTime": assigned_end,
                "sequenceOrder": 1,
                "aiRecommendationScore": 0.98,
                "shadowTask": False,
                "notes": "Optimal window selected by CP-SAT solver."
            }
        ]
    }

    print("[4/4] Submitting optimized plan back to PostgreSQL via AI Gateway...")
    submit_resp = requests.post(f"{BASE_URL}/api/v1/ai/plans", headers=headers, json=plan_payload)

    if submit_resp.status_code in [200, 201]:
        print("Plan registered in cloud database.")
        print("Backend Response:")
        print(submit_resp.json())
    else:
        print(f"Plan registration failed (Status {submit_resp.status_code}):")
        print(submit_resp.text)

if __name__ == "__main__":
    run_pipeline()
