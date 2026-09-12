import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../services/apiClient';

export const fetchCorridors: any = createAsyncThunk('corridors/fetch', async () => {
  const res = await apiClient.get('/api/corridors');
  return res.data;
});

const corridorSlice = createSlice({
  name: 'corridors',
  initialState: { corridors: [], selectedCorridorId: null, isLoading: false },
  reducers: {
    selectCorridor(state, action) { state.selectedCorridorId = action.payload; }
  },
  extraReducers: (builder) => {
    builder.addCase(fetchCorridors.pending, (state) => { state.isLoading = true; })
      .addCase(fetchCorridors.fulfilled, (state: any, action) => {
        state.isLoading = false;
        state.corridors = action.payload.data || [];
        if (state.corridors.length > 0) state.selectedCorridorId = state.corridors[0].id;
      });
  }
});

export const { selectCorridor } = corridorSlice.actions;
export default corridorSlice.reducer;
