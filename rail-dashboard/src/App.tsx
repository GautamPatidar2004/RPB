import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { fetchCurrentUser } from './store/authSlice';
import { fetchCorridors, fetchCorridorSummary } from './store/corridorSlice';
import { fetchTrainMovements } from './store/trainScheduleSlice';
import { fetchMaintenanceTasks, fetchMaintenanceTaskSummary } from './store/maintenanceTaskSlice';
import { fetchSyncStatus } from './store/syncSlice';
import { fetchPlans } from './store/planSlice';
import { LoginPage } from './pages/LoginPage';
import { DashboardLayout } from './layouts/DashboardLayout';

function App() {
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector(s => s.auth);
  const corridors = useAppSelector(s => s.corridors.corridors);
  const selectedCorridorId = useAppSelector(s => s.corridors.selectedCorridorId);
  const selectedCorridor = corridors.find(c => c.id === selectedCorridorId);

  // On mount: validate existing token
  useEffect(() => {
    const token = localStorage.getItem('rail_token');
    if (token) {
      dispatch(fetchCurrentUser());
    }
  }, [dispatch]);

  // After auth: load all dashboard data
  useEffect(() => {
    if (!isAuthenticated) return;
    dispatch(fetchCorridors());
    dispatch(fetchCorridorSummary());
    dispatch(fetchSyncStatus());
    dispatch(fetchMaintenanceTaskSummary());
  }, [isAuthenticated, dispatch]);

  // When corridor is selected, fetch corridor-scoped data
  useEffect(() => {
    if (!isAuthenticated || !selectedCorridorId) return;
    dispatch(fetchTrainMovements({ corridor_id: selectedCorridorId }));
    dispatch(fetchMaintenanceTasks({ corridorId: selectedCorridorId }));
    dispatch(fetchPlans({ corridor_code: selectedCorridor?.code }));
  }, [isAuthenticated, selectedCorridorId, dispatch]);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <DashboardLayout />;
}

export default App;
