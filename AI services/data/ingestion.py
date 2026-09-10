from datetime import datetime, timezone
from typing import Dict, Any, Optional
from data.data_access import DataAccessLayer, get_data_access
from utils.logger import get_logger

logger = get_logger("data_ingestion")


class DataIngestionService:
    """
    Ingests raw Railway planning data from the existing backend/Supabase data layer.
    Reuses the prompt 1 DataAccessLayer without altering any external schema.
    """

    def __init__(self, data_access: Optional[DataAccessLayer] = None):
        self.data_access = data_access or get_data_access()

    async def fetch_corridor_planning_data(
        self,
        corridor_code: str = "NDLS-CNB",
        horizon_start: Optional[str] = None,
        horizon_end: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Fetches the complete planning dataset package for a given corridor and planning horizon.
        """
        logger.info("Ingesting planning data for corridor: %s", corridor_code)
        raw_data = await self.data_access.get_planning_data(
            corridor_code=corridor_code,
            horizon_start=horizon_start,
            horizon_end=horizon_end
        )

        tasks = raw_data.get("maintenanceTasks", [])
        assets = raw_data.get("assets", [])
        windows = raw_data.get("blockWindows", [])
        trains = raw_data.get("trainMovements", [])
        corridor = raw_data.get("corridor", {})
        constraints = raw_data.get("operationalConstraints", {})
        dependencies = raw_data.get("dependencies", [])

        logger.info(
            "Ingested %d tasks, %d assets, %d windows, %d trains for corridor %s",
            len(tasks), len(assets), len(windows), len(trains), corridor_code
        )

        return {
            "corridor_code": corridor_code,
            "ingested_at": datetime.now(timezone.utc).isoformat(),
            "corridor": corridor,
            "planningHorizon": raw_data.get("planningHorizon", {}),
            "maintenanceTasks": tasks,
            "assets": assets,
            "blockWindows": windows,
            "trainMovements": trains,
            "dependencies": dependencies,
            "operationalConstraints": constraints
        }
