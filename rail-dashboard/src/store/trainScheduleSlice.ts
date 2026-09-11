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
  trains: [],
  isLoading: false,
  error: null,
};

// Map API train_movement record to internal Train shape
function mapApiTrain(t: any): Train {
  return {
    id: t.id,
    number: t.train_number ?? t.trainNumber ?? t.id,
    type: t.train_type ?? t.trainType ?? 'EXPRESS',
    trainName: t.service_identifier ?? t.trainName ?? t.train_name ?? '',
    priority: t.priority ?? 3,
    corridorId: t.corridor_id ?? t.corridorId ?? '',
    // Map to section_id: use corridor_id as fallback section reference
    section_id: t.section_id ?? 'sec-a-b',
    entry_time: t.scheduled_start_time ?? t.scheduledEntryTime ?? t.scheduled_entry_time ?? new Date().toISOString(),
    exit_time: t.scheduled_end_time ?? t.scheduledExitTime ?? t.scheduled_exit_time ?? new Date().toISOString(),
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
