import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../services/apiClient';

export const fetchAllData = createAsyncThunk('tasks/fetchAll', async (corridorId: string) => {
  const [tasks, trains, blocks] = await Promise.all([
    apiClient.get(`/api/maintenance-tasks?corridor_id=${corridorId}`),
    apiClient.get(`/api/train-movements?corridor_id=${corridorId}`),
    apiClient.get(`/api/block-windows?corridor_id=${corridorId}`)
  ]);
  return {
    tasks: tasks.data.data || [],
    trains: trains.data.data || [],
    blocks: blocks.data.data || []
  };
});

const taskSlice = createSlice({
  name: 'tasks',
  initialState: { maintenanceTasks: [], trains: [], blockWindows: [], isLoading: false },
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchAllData.pending, (state) => { state.isLoading = true; })
           .addCase(fetchAllData.fulfilled, (state, action) => {
               state.isLoading = false;
               state.maintenanceTasks = action.payload.tasks;
               state.trains = action.payload.trains;
               state.blockWindows = action.payload.blocks;
           });
  }
});

export default taskSlice.reducer;
