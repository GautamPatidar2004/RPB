import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import apiClient from '../services/apiClient';

export interface MaintenanceTask {
  id: string;
  task_code?: string;
  taskCode?: string;
  request_id?: string;
  title: string;
  description: string;
  department: string; // 'ENGG' | 'SNT' | 'TRD' | 'CIVIL' | 'ELECTRICAL' | 'SIGNAL'
  department_code?: string;
  sourceSystem?: string;
  source_system?: string;
  corridorId?: string;
  corridor_id?: string;
  assetId?: string | null;
  asset_id?: string | null;
  asset?: {
    id?: string;
    asset_code?: string;
    asset_type?: string;
    name?: string;
    location?: string;
    start_kilometer?: number;
    end_kilometer?: number;
    criticality?: string;
  } | null;
  defect?: {
    id?: string;
    defect_code?: string;
    defect_type?: string;
    severity?: string;
    failure_risk?: string;
  } | null;
  status: 'INCOMING' | 'PENDING' | 'PLANNING' | 'SCHEDULED' | 'POSTPONED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'DEFERRED';
  priority: number;
  criticality?: string;
  severity?: string;
  urgency?: string;
  maintenance_type?: string;
  maintenanceType?: string;
  trafficBlockRequired?: boolean;
  traffic_block_required?: boolean;
  powerBlockRequired?: boolean;
  power_block_required?: boolean;
  speed_restriction_kmph?: number;
  duration_minutes?: number;
  requested_duration?: number;
  estimatedDurationMinutes?: number;
  requiredByBefore?: string | null;
  required_by_date?: string | null;
  preferred_window?: any;
  required_resources?: any;
  operational_constraints?: any;
  location?: string;
  start_kilometer?: number;
  end_kilometer?: number;
  createdAt?: string;
  created_at?: string;
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
  pendingTasks: MaintenanceTask[];
  selectedTaskIds: string[];
  summary: MaintenanceTaskSummary | null;
  isLoading: boolean;
  isLoadingPending: boolean;
  error: string | null;
}

const initialState: MaintenanceTaskState = {
  tasks: [],
  pendingTasks: [],
  selectedTaskIds: [],
  summary: null,
  isLoading: false,
  isLoadingPending: false,
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

export const fetchPendingTasks = createAsyncThunk(
  'maintenanceTasks/fetchPending',
  async (params: { corridor_code?: string; corridor_id?: string; department?: string } | void, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/api/maintenance-tasks/pending', { params: params || {} });
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Failed to load pending maintenance queue.');
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
  reducers: {
    toggleTaskSelection: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      if (state.selectedTaskIds.includes(id)) {
        state.selectedTaskIds = state.selectedTaskIds.filter(item => item !== id);
      } else {
        state.selectedTaskIds.push(id);
      }
    },
    selectAllPendingTasks: (state) => {
      state.selectedTaskIds = state.pendingTasks.map(t => t.id);
    },
    clearSelectedTasks: (state) => {
      state.selectedTaskIds = [];
    }
  },
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

    builder
      .addCase(fetchPendingTasks.pending, (state) => { state.isLoadingPending = true; })
      .addCase(fetchPendingTasks.fulfilled, (state, action: PayloadAction<any>) => {
        state.isLoadingPending = false;
        state.pendingTasks = action.payload?.data ?? [];
      })
      .addCase(fetchPendingTasks.rejected, (state) => {
        state.isLoadingPending = false;
      });

    builder.addCase(fetchMaintenanceTaskSummary.fulfilled, (state, action: PayloadAction<any>) => {
      const raw = action.payload?.summary ?? action.payload?.data ?? null;
      if (raw) {
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

export const { toggleTaskSelection, selectAllPendingTasks, clearSelectedTasks } = maintenanceTaskSlice.actions;
export default maintenanceTaskSlice.reducer;
