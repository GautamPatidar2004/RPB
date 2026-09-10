import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import apiClient from '../services/apiClient';

export interface SyncSourceStatus {
  sourceCode: string;
  sourceName: string;
  lastSyncAt: string | null;
  status: 'COMPLETED' | 'RUNNING' | 'FAILED' | 'NEVER';
  recordsLastRun: number;
}

interface SyncState {
  sources: SyncSourceStatus[];
  isLoading: boolean;
  isSyncing: boolean;
  syncingSource: string | null;
  lastFetchedAt: string | null;
  error: string | null;
}

const initialState: SyncState = {
  sources: [],
  isLoading: false,
  isSyncing: false,
  syncingSource: null,
  lastFetchedAt: null,
  error: null,
};

export const fetchSyncStatus = createAsyncThunk(
  'sync/fetchStatus',
  async (_, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/api/sync/status');
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Failed to load sync status.');
    }
  }
);

export const triggerSync = createAsyncThunk(
  'sync/trigger',
  async (source: 'TMS' | 'SMMS' | 'TDMS' | 'COA' | 'BDMS', { rejectWithValue }) => {
    try {
      const res = await apiClient.post(`/api/sync/trigger/${source}`);
      return { source, data: res.data };
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? `Failed to sync ${source}.`);
    }
  }
);

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSyncStatus.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchSyncStatus.fulfilled, (state, action: PayloadAction<any>) => {
        state.isLoading = false;
        state.sources = action.payload?.data ?? action.payload?.sources ?? [];
        state.lastFetchedAt = new Date().toISOString();
      })
      .addCase(fetchSyncStatus.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    builder
      .addCase(triggerSync.pending, (state, action) => {
        state.isSyncing = true;
        state.syncingSource = action.meta.arg;
      })
      .addCase(triggerSync.fulfilled, (state) => {
        state.isSyncing = false;
        state.syncingSource = null;
      })
      .addCase(triggerSync.rejected, (state) => {
        state.isSyncing = false;
        state.syncingSource = null;
      });
  },
});

export default syncSlice.reducer;
