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
  direction?: 'UP' | 'DOWN' | string;
  train_number?: string;
  train_type?: string;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
}

interface TrainScheduleState {
  trains: Train[];
  isLoading: boolean;
  error: string | null;
}

const initialState: TrainScheduleState = {
  trains: [],
  isLoading: false,
  error: null,
};

// Map API train_movement record to internal Train shape
function mapApiTrain(t: any): Train {
  const num = t.train_number ?? t.trainNumber ?? t.number ?? t.id;
  const typ = t.train_type ?? t.trainType ?? t.type ?? 'EXPRESS';
  const start = t.scheduled_start_time ?? t.scheduledEntryTime ?? t.scheduled_entry_time ?? t.entry_time ?? new Date().toISOString();
  const end = t.scheduled_end_time ?? t.scheduledExitTime ?? t.scheduled_exit_time ?? t.exit_time ?? new Date().toISOString();
  const dir = t.direction ?? (parseInt(String(num).replace(/\D/g, '') || '0', 10) % 2 === 0 ? 'UP' : 'DOWN');

  return {
    id: t.id,
    number: num,
    train_number: num,
    type: typ,
    train_type: typ,
    trainName: t.service_identifier ?? t.trainName ?? t.train_name ?? '',
    priority: t.priority ?? 3,
    corridorId: t.corridor_id ?? t.corridorId ?? '',
    section_id: t.section_id ?? 'sec-a-b',
    entry_time: start,
    exit_time: end,
    scheduled_start_time: start,
    scheduled_end_time: end,
    status: t.status ?? 'SCHEDULED',
    direction: dir,
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
        state.trains = raw.map(mapApiTrain);
      })
      .addCase(fetchTrainMovements.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const { setInitialSchedules, updateTrainStatus } = trainScheduleSlice.actions;
export default trainScheduleSlice.reducer;
