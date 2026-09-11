import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import apiClient from '../services/apiClient';

export interface BlockWindow {
  id: string;
  corridorId: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  availabilityStatus: 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'CANCELLED';
  blockType: string;
  lineDesignation: string;
  startKilometer: number | null;
  endKilometer: number | null;
  sourceSystem: string;
}

interface BlockWindowState {
  windows: BlockWindow[];
  isLoading: boolean;
  error: string | null;
}

const initialState: BlockWindowState = {
  windows: [],
  isLoading: false,
  error: null,
};

function mapApiWindow(w: any): BlockWindow {
  return {
    id: w.id,
    corridorId: w.corridor_id ?? w.corridorId ?? '',
    startTime: w.start_time ?? w.startTime ?? '',
    endTime: w.end_time ?? w.endTime ?? '',
    durationMinutes: Number(w.duration_minutes ?? w.durationMinutes ?? 0),
    availabilityStatus: w.availability_status ?? w.availabilityStatus ?? 'AVAILABLE',
    blockType: w.block_type ?? w.blockType ?? 'ENGINEERING',
    lineDesignation: w.line_designation ?? w.lineDesignation ?? '',
    startKilometer: w.start_kilometer ?? w.startKilometer ?? null,
    endKilometer: w.end_kilometer ?? w.endKilometer ?? null,
    sourceSystem: w.source_system ?? w.sourceSystem ?? '',
  };
}

export const fetchBlockWindows = createAsyncThunk(
  'blockWindows/fetchAll',
  async (params: { corridor_id?: string; availability_status?: string } = {}, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/api/block-windows', { params });
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Failed to load block windows.');
    }
  }
);

const blockWindowSlice = createSlice({
  name: 'blockWindows',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBlockWindows.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchBlockWindows.fulfilled, (state, action: PayloadAction<any>) => {
        state.isLoading = false;
        const raw = action.payload?.data ?? action.payload?.windows ?? [];
        state.windows = raw.map(mapApiWindow);
      })
      .addCase(fetchBlockWindows.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export default blockWindowSlice.reducer;
