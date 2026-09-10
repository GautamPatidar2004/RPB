import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import apiClient from '../services/apiClient';

export interface BlockPlan {
  id: string;
  planReference: string;
  corridorId: string;
  corridorCode: string;
  status: 'OPTIMIZED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  approvalState: 'PENDING' | 'APPROVED' | 'REJECTED';
  horizonMode: 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
  horizonStartDate: string;
  horizonEndDate: string;
  version: number;
  utilizationPercentage: string;
  totalBlockDurationMinutes: number;
  conflictCount: number;
  createdAt: string;
  assignedTasks: any[];
  conflicts: any[];
  metrics: any;
}

interface PlanState {
  plans: BlockPlan[];
  activePlan: BlockPlan | null;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
}

const initialState: PlanState = {
  plans: [],
  activePlan: null,
  isLoading: false,
  isGenerating: false,
  error: null,
};

export const fetchPlans = createAsyncThunk(
  'plans/fetchAll',
  async (params: { corridor_code?: string; status?: string } = {}, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/api/plans', { params });
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Failed to load plans.');
    }
  }
);

export const fetchPlanById = createAsyncThunk(
  'plans/fetchById',
  async (id: string, { rejectWithValue }) => {
    try {
      const res = await apiClient.get(`/api/plans/${id}`);
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Failed to load plan.');
    }
  }
);

export const generatePlan = createAsyncThunk(
  'plans/generate',
  async (
    payload: { corridorCode: string; horizonMode: 'WEEKLY' | 'MONTHLY'; startDate: string; optimizationGoal?: string },
    { rejectWithValue }
  ) => {
    try {
      const res = await apiClient.post('/api/plans/generate', {
        optimizationGoal: 'BALANCED_MIN_CONFLICTS',
        ...payload,
      });
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Failed to generate plan.');
    }
  }
);

const planSlice = createSlice({
  name: 'plans',
  initialState,
  reducers: {
    clearPlanError: (state) => { state.error = null; },
    setActivePlan: (state, action: PayloadAction<BlockPlan>) => {
      state.activePlan = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPlans.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchPlans.fulfilled, (state, action: PayloadAction<any>) => {
        state.isLoading = false;
        state.plans = action.payload?.data ?? action.payload?.plans ?? [];
      })
      .addCase(fetchPlans.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    builder
      .addCase(fetchPlanById.fulfilled, (state, action: PayloadAction<any>) => {
        state.activePlan = action.payload?.data ?? action.payload?.plan ?? null;
      });

    builder
      .addCase(generatePlan.pending, (state) => { state.isGenerating = true; state.error = null; })
      .addCase(generatePlan.fulfilled, (state, action: PayloadAction<any>) => {
        state.isGenerating = false;
        const plan = action.payload?.plan ?? action.payload?.data;
        if (plan) {
          state.activePlan = plan;
          state.plans.unshift(plan);
        }
      })
      .addCase(generatePlan.rejected, (state, action) => {
        state.isGenerating = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearPlanError, setActivePlan } = planSlice.actions;
export default planSlice.reducer;
