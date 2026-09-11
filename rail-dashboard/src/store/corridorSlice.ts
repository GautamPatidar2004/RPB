import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import apiClient from '../services/apiClient';

export interface Corridor {
  id: string;
  code: string;
  name: string;
  zone: string;
  division: string;
  startStation: string;
  endStation: string;
  lengthKm: number;
  electrified: boolean;
  lineType: string;
}

export interface CorridorSummary {
  total_corridors: number;
  active_corridors: number;
  electrified_corridors: number;
  total_length_km: number;
}

interface CorridorState {
  corridors: Corridor[];
  selectedCorridorId: string | null;
  summary: CorridorSummary | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: CorridorState = {
  corridors: [],
  selectedCorridorId: null,
  summary: null,
  isLoading: false,
  error: null,
};

export const fetchCorridors = createAsyncThunk(
  'corridors/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/api/corridors');
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Failed to load corridors.');
    }
  }
);

export const fetchCorridorSummary = createAsyncThunk(
  'corridors/fetchSummary',
  async (_, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/api/corridors/summary');
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Failed to load corridor summary.');
    }
  }
);

function mapApiCorridor(c: any): Corridor {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    zone: c.zone ?? '',
    division: c.division ?? '',
    startStation: c.startStation ?? c.start_station ?? '',
    endStation: c.endStation ?? c.end_station ?? '',
    lengthKm: Number(c.lengthKm ?? c.total_length_km ?? 0),
    electrified: Boolean(c.electrified),
    lineType: c.lineType ?? c.line_type ?? 'DOUBLE',
  };
}

const corridorSlice = createSlice({
  name: 'corridors',
  initialState,
  reducers: {
    selectCorridor: (state, action: PayloadAction<string>) => {
      state.selectedCorridorId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCorridors.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchCorridors.fulfilled, (state, action: PayloadAction<any>) => {
        state.isLoading = false;
        const raw = action.payload?.data ?? action.payload?.corridors ?? [];
        const list = raw.map(mapApiCorridor);
        state.corridors = list;
        // Auto-select first corridor
        if (list.length > 0 && !state.selectedCorridorId) {
          state.selectedCorridorId = list[0].id;
        }
      })
      .addCase(fetchCorridors.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    builder
      .addCase(fetchCorridorSummary.fulfilled, (state, action: PayloadAction<any>) => {
        state.summary = action.payload?.summary ?? action.payload?.data ?? null;
      });
  },
});

export const { selectCorridor } = corridorSlice.actions;
export default corridorSlice.reducer;
