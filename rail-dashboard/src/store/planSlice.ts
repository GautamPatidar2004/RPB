import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../services/apiClient';

export const generatePlan = createAsyncThunk('plans/generate', async (data: any) => {
  const res = await apiClient.post('/api/plans/generate', data);
  return res.data;
});

export const resolveConflict = createAsyncThunk('plans/resolveConflict', async ({ planId, conflictId, resolutionData }: { planId: string, conflictId: string, resolutionData: any }) => {
  const res = await apiClient.patch(`/api/plans/${planId}/conflicts/${conflictId}`, resolutionData);
  return res.data;
});

const planSlice = createSlice({
  name: 'plans',
  initialState: { activePlan: null as any, isGenerating: false, isResolving: false },
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(generatePlan.pending, (state) => { state.isGenerating = true; })
      .addCase(generatePlan.fulfilled, (state, action) => {
        state.isGenerating = false;
        if (action.payload.plan) {
          state.activePlan = {
            ...action.payload.plan,
            assignedTasks: action.payload.assignedTasks || [],
            conflicts: action.payload.conflicts || [],
            metrics: action.payload.metrics || {}
          };
        }
      })
      .addCase(generatePlan.rejected, (state) => { state.isGenerating = false; })
      .addCase(resolveConflict.pending, (state) => { state.isResolving = true; })
      .addCase(resolveConflict.fulfilled, (state, action) => {
        state.isResolving = false;
        if (state.activePlan && state.activePlan.conflicts) {
          const conflict = state.activePlan.conflicts.find((c: any) => c.id === action.meta.arg.conflictId);
          if (conflict) {
            conflict.resolution_status = action.meta.arg.resolutionData.resolutionStatus || 'RESOLVED';
          }
        }
      })
      .addCase(resolveConflict.rejected, (state) => { state.isResolving = false; });
  }
});

export default planSlice.reducer;
