import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import apiClient from '../services/apiClient';

export interface Train {
  id: string;
  number: string;
  type: string;
  section_id: string;  // maps from corridorId for LinearTrackView
  entry_time: string;
  exit_time: string;
  status: string;
  // Extra fields from API
  trainName?: string;
  priority?: number;
  corridorId?: string;
}

interface TrainScheduleState {
  trains: Train[];
  isLoading: boolean;
  error: string | null;
}

const initialState: TrainScheduleState = {
  // Seed data shown until API responds
  trains: [
    { id: 'trn-1', number: '12951', type: 'Rajdhani', section_id: 'sec-a-b', entry_time: '2024-01-01T00:00:00', exit_time: '2024-01-01T01:30:00', status: 'ON_TIME' },
    { id: 'trn-2', number: '16317', type: 'Express',  section_id: 'sec-c-d', entry_time: '2024-01-01T04:00:00', exit_time: '2024-01-01T06:00:00', status: 'DELAYED' },
    { id: 'trn-3', number: '22691', type: 'Mail',     section_id: 'sec-d-e', entry_time: '2024-01-01T12:00:00', exit_time: '2024-01-01T14:00:00', status: 'ON_TIME' },
  ],
  isLoading: false,
  error: null,
};

// Map API train_movement record to internal Train shape
function mapApiTrain(t: any): Train {
  return {
    id: t.id,
    number: t.trainNumber ?? t.train_number ?? t.id,
    type: t.trainType ?? t.train_type ?? 'EXPRESS',
    trainName: t.trainName ?? t.train_name ?? '',
    priority: t.priority ?? 3,
    corridorId: t.corridorId ?? t.corridor_id ?? '',
    // Map to section_id using corridorId so LinearTrackView can render
    section_id: t.section_id ?? 'sec-a-b',
    entry_time: t.scheduledEntryTime ?? t.scheduled_entry_time ?? t.entryTime ?? new Date().toISOString(),
    exit_time: t.scheduledExitTime  ?? t.scheduled_exit_time  ?? t.exitTime  ?? new Date().toISOString(),
    status: t.status ?? 'SCHEDULED',
  };
}

export const fetchTrainMovements = createAsyncThunk(
  'trainSchedule/fetchMovements',
  async (params: { corridor_id?: string; status?: string; train_type?: string } = {}, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/api/train-movements', { params });
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Failed to load train movements.');
    }
  }
);

export const trainScheduleSlice = createSlice({
  name: 'trainSchedule',
  initialState,
  reducers: {
    setInitialSchedules: (state, action: PayloadAction<Train[]>) => {
      state.trains = action.payload;
    },
    updateTrainStatus: (state, action: PayloadAction<{ id: string; status: string }>) => {
      const train = state.trains.find((t) => t.id === action.payload.id);
      if (train) train.status = action.payload.status;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTrainMovements.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchTrainMovements.fulfilled, (state, action: PayloadAction<any>) => {
        state.isLoading = false;
        const raw = action.payload?.data ?? action.payload?.trainMovements ?? action.payload?.movements ?? [];
        if (raw.length > 0) {
          state.trains = raw.map(mapApiTrain);
        }
        // If API returns empty, keep seed data
      })
      .addCase(fetchTrainMovements.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        // Keep seed data on error
      });
  },
});

export const { setInitialSchedules, updateTrainStatus } = trainScheduleSlice.actions;
export default trainScheduleSlice.reducer;
