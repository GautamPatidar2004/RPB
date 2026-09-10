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
      state.summary = action.payload?.data ?? null;
    });
  },
});

export default maintenanceTaskSlice.reducer;
