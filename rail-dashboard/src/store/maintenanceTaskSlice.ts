import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import apiClient from '../services/apiClient';

// API-sourced maintenance task (from /api/maintenance-tasks)
export interface MaintenanceTask {
  id: string;
  title: string;
  description: string;
  department: string; // 'ENGG' | 'SNT' | 'TRD'
  sourceSystem: string;
  corridorId: string;
  assetId: string | null;
  status: 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'DEFERRED';
  priority: number;
  trafficBlockRequired: boolean;
  powerBlockRequired: boolean;
  estimatedDurationMinutes: number;
  requiredByBefore: string | null;
  createdAt: string;
}

export interface MaintenanceTaskSummary {
  total: number;
  pending: number;
  scheduled: number;
  in_progress: number;
  completed: number;
  deferred: number;
  critical: number;
  power_block_tasks?: number;
  traffic_block_tasks?: number;
}

interface MaintenanceTaskState {
  tasks: MaintenanceTask[];
  summary: MaintenanceTaskSummary | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: MaintenanceTaskState = {
  tasks: [],
  summary: null,
  isLoading: false,
  error: null,
};

export const fetchMaintenanceTasks = createAsyncThunk(
  'maintenanceTasks/fetchAll',
  async (params: { corridorId?: string; corridor_id?: string; status?: string; department?: string } = {}, { rejectWithValue }) => {
    try {
      const queryParams: any = { ...params };
      if (params.corridorId && !queryParams.corridor_id) {
        queryParams.corridor_id = params.corridorId;
      }
      const res = await apiClient.get('/api/maintenance-tasks', { params: queryParams });
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Failed to load maintenance tasks.');
    }
  }
);

export const fetchMaintenanceTaskSummary = createAsyncThunk(
  'maintenanceTasks/fetchSummary',
  async (_, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/api/maintenance-tasks/summary');
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Failed to load task summary.');
    }
  }
);

export const patchMaintenanceTaskStatus = createAsyncThunk(
  'maintenanceTasks/patchStatus',
  async ({ id, status, notes }: { id: string; status: string; notes?: string }, { rejectWithValue }) => {
    try {
      const res = await apiClient.patch(`/api/maintenance-tasks/${id}/status`, { status, notes });
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Failed to update task status.');
    }
  }
);

const maintenanceTaskSlice = createSlice({
  name: 'maintenanceTasks',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMaintenanceTasks.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchMaintenanceTasks.fulfilled, (state, action: PayloadAction<any>) => {
        state.isLoading = false;
        state.tasks = action.payload?.data ?? action.payload?.tasks ?? [];
      })
      .addCase(fetchMaintenanceTasks.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    builder.addCase(fetchMaintenanceTaskSummary.fulfilled, (state, action: PayloadAction<any>) => {
      const raw = action.payload?.summary ?? action.payload?.data ?? null;
      if (raw) {
        // Normalize backend field names (pending_count) to frontend interface (pending)
        state.summary = {
          total: raw.total_tasks ?? raw.total ?? 0,
          pending: raw.pending_count ?? raw.pending ?? 0,
          scheduled: raw.scheduled_count ?? raw.scheduled ?? 0,
          in_progress: raw.in_progress_count ?? raw.in_progress ?? 0,
          completed: raw.completed_count ?? raw.completed ?? 0,
          deferred: raw.deferred_count ?? raw.deferred ?? 0,
          critical: raw.priority_1_urgent_count ?? raw.critical ?? 0,
          power_block_tasks: raw.power_block_tasks ?? 0,
          traffic_block_tasks: raw.traffic_block_tasks ?? 0,
        };
      }
    });
  },
});

export default maintenanceTaskSlice.reducer;
