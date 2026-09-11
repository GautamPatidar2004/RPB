import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import apiClient from '../services/apiClient';

export interface AIMetadata {
  planning_run_id?: string;
  pipeline_status?: string;
  score?: number;
  score_breakdown?: Record<string, any>;
  predicted_metrics?: {
    mean_predicted_duration_minutes?: number;
    scheduled_tasks_count?: number;
    unscheduled_tasks_count?: number;
  };
  optimization_metrics?: {
    solver_status?: string;
    solve_time_ms?: number;
    objective_score?: number;
    schedule_rate_pct?: number;
  };
  explanation?: {
    summary?: string;
    selected_plan_reason?: string;
    key_decisions?: string[];
    operational_impact?: string;
    asset_availability_impact?: string;
    priority_maintenance?: string[];
    unscheduled_tasks?: string[];
    warnings?: string[];
    tradeoffs?: any[];
  } | null;
  model_versions?: Record<string, string>;
  optimizer_status?: string;
  grouped_tasks?: any[];
  unscheduled_requests?: any[];
  warnings?: string[];
  conflicts?: any[];
  source_systems?: string[];
  stage_durations_ms?: Record<string, number>;
  total_execution_time_ms?: number;
}

export interface BlockPlan {
  id: string;
  planReference?: string;
  plan_reference?: string;
  corridorId?: string;
  corridor_id?: string;
  corridorCode?: string;
  corridor_code?: string;
  status: 'OPTIMIZED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  approvalState?: 'PENDING' | 'APPROVED' | 'REJECTED';
  approval_state?: 'PENDING' | 'APPROVED' | 'REJECTED';
  horizonMode?: 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
  horizonStartDate?: string;
  horizon_start_date?: string;
  horizonEndDate?: string;
  horizon_end_date?: string;
  version: number;
  utilizationPercentage?: string | number;
  utilization_percentage?: string | number;
  totalBlockDurationMinutes?: number;
  total_block_duration_minutes?: number;
  conflictCount?: number;
  conflict_count?: number;
  createdAt?: string;
  created_at?: string;
  tasks?: any[];
  assignedTasks?: any[];
  conflicts?: any[];
  approvals?: any[];
  score?: number;
  metrics?: any;
  aiOptimizationMetadata?: AIMetadata;
  ai_optimization_metadata?: AIMetadata;
}

export interface PlanningRun {
  id: string;
  planning_run_id: string;
  corridor_id: string;
  horizon_start: string;
  horizon_end: string;
  input_request_ids: string[] | string;
  source_systems: string[] | string;
  status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  plan_id: string | null;
  failure_reason: string | null;
  execution_metadata?: AIMetadata | Record<string, any>;
  created_at: string;
  updated_at: string;
  plan?: BlockPlan | null;
}

export type PlanningTelemetryState = 'IDLE' | 'CONNECTED' | 'CALCULATING' | 'RE_OPTIMIZING' | 'SUCCESS' | 'ERROR' | 'NO_FEASIBLE_PLAN';

interface PlanState {
  plans: BlockPlan[];
  activePlan: BlockPlan | null;
  planningRuns: PlanningRun[];
  activePlanningRun: PlanningRun | null;
  planningState: PlanningTelemetryState;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
}

const initialState: PlanState = {
  plans: [],
  activePlan: null,
  planningRuns: [],
  activePlanningRun: null,
  planningState: 'CONNECTED',
  isLoading: false,
  isGenerating: false,
  error: null,
};

// Fetch plans list
export const fetchPlans = createAsyncThunk(
  'plans/fetchAll',
  async (params: { corridor_code?: string; status?: string } = {}, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/api/plans', { params });
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.error ?? err.response?.data?.message ?? 'Failed to load plans.');
    }
  }
);

// Fetch specific plan details
export const fetchPlanById = createAsyncThunk(
  'plans/fetchById',
  async (id: string, { rejectWithValue }) => {
    try {
      const res = await apiClient.get(`/api/plans/${id}`);
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.error ?? err.response?.data?.message ?? 'Failed to load plan.');
    }
  }
);

// Submit AI planning run (Prompt 3 end-to-end connection)
export const submitPlanningRun = createAsyncThunk(
  'plans/submitPlanningRun',
  async (
    payload: {
      corridorCode?: string;
      corridorId?: string;
      horizonStart?: string;
      horizonEnd?: string;
      requestIds?: string[];
      executeNow?: boolean;
      forceDeterministicExplanation?: boolean;
    },
    { rejectWithValue }
  ) => {
    try {
      const res = await apiClient.post('/api/planning-runs', {
        corridorCode: payload.corridorCode || 'NDLS-CNB',
        horizonStart: payload.horizonStart,
        horizonEnd: payload.horizonEnd,
        requestIds: payload.requestIds,
        execute_now: payload.executeNow !== false,
        force_deterministic_explanation: payload.forceDeterministicExplanation ?? true,
      });
      return res.data;
    } catch (err: any) {
      const msg = err.response?.data?.error ?? err.response?.data?.message ?? 'Failed to execute planning run.';
      return rejectWithValue(msg);
    }
  }
);

// Approve & lock plan
export const approvePlan = createAsyncThunk(
  'plans/approvePlan',
  async (
    { planId, notes }: { planId: string; notes?: string },
    { rejectWithValue }
  ) => {
    try {
      const res = await apiClient.post(`/api/plans/${planId}/approve`, {
        notes: notes || 'Approved & Locked by Section Controller via Command Dashboard',
      });
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.error ?? err.response?.data?.message ?? 'Failed to approve block plan.');
    }
  }
);

// Fetch historical planning runs
export const fetchPlanningRuns = createAsyncThunk(
  'plans/fetchPlanningRuns',
  async (params: { corridor_id?: string; status?: string } = {}, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/api/planning-runs', { params });
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.error ?? 'Failed to load planning runs.');
    }
  }
);

const planSlice = createSlice({
  name: 'plans',
  initialState,
  reducers: {
    clearPlanError: (state) => {
      state.error = null;
    },
    setPlanningState: (state, action: PayloadAction<PlanningTelemetryState>) => {
      state.planningState = action.payload;
    },
    setActivePlan: (state, action: PayloadAction<BlockPlan | null>) => {
      state.activePlan = action.payload;
    },
    setActivePlanningRun: (state, action: PayloadAction<PlanningRun | null>) => {
      state.activePlanningRun = action.payload;
    },
    updateTaskSchedule: (
      state,
      action: PayloadAction<{ taskId: string; scheduledStart: string; scheduledEnd: string }>
    ) => {
      if (state.activePlan && state.activePlan.tasks) {
        const task = state.activePlan.tasks.find((t) => t.id === action.payload.taskId);
        if (task) {
          task.scheduled_start = action.payload.scheduledStart;
          task.scheduled_end = action.payload.scheduledEnd;
        }
      }
    },
  },
  extraReducers: (builder) => {
    // fetchPlans
    builder
      .addCase(fetchPlans.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchPlans.fulfilled, (state, action: PayloadAction<any>) => {
        state.isLoading = false;
        const rawPlans = action.payload?.data ?? action.payload?.plans ?? [];
        state.plans = rawPlans.map((p: any) => {
          const meta = p.aiOptimizationMetadata || p.ai_optimization_metadata;
          return {
            ...p,
            aiOptimizationMetadata: meta,
            ai_optimization_metadata: meta,
            score: p.score ?? meta?.score ?? p.metrics?.score ?? 75.0,
            tasks: p.tasks || p.assignedTasks || [],
          };
        });
        if (state.plans.length > 0) {
          state.activePlan = state.plans[0];
        }
      })
      .addCase(fetchPlans.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // fetchPlanById
    builder.addCase(fetchPlanById.fulfilled, (state, action: PayloadAction<any>) => {
      const plan = action.payload?.data ?? action.payload?.plan ?? null;
      if (plan) {
        const meta = plan.aiOptimizationMetadata || plan.ai_optimization_metadata;
        const normalized = {
          ...plan,
          aiOptimizationMetadata: meta,
          ai_optimization_metadata: meta,
          score: plan.score ?? meta?.score ?? plan.metrics?.score ?? 75.0,
          tasks: plan.tasks || plan.assignedTasks || [],
        };
        state.activePlan = normalized;
        const idx = state.plans.findIndex((p) => p.id === plan.id);
        if (idx !== -1) {
          state.plans[idx] = normalized;
        } else {
          state.plans.unshift(normalized);
        }
      }
    });

    // submitPlanningRun
    builder
      .addCase(submitPlanningRun.pending, (state) => {
        state.isGenerating = true;
        state.planningState = 'CALCULATING';
        state.error = null;
      })
      .addCase(submitPlanningRun.fulfilled, (state, action: PayloadAction<any>) => {
        state.isGenerating = false;
        const result = action.payload;
        if (result?.success && result?.plan) {
          state.planningState = 'SUCCESS';
          const meta = result.aiMetadata || result.plan.aiOptimizationMetadata || result.plan.ai_optimization_metadata;
          const plan = {
            ...result.plan,
            aiOptimizationMetadata: meta,
            ai_optimization_metadata: meta,
            score: result.score ?? meta?.score ?? result.plan.metrics?.score ?? 75.0,
            tasks: result.plan.tasks || result.plan.assignedTasks || [],
            conflicts: meta?.conflicts || result.plan.conflicts || [],
          };
          state.activePlan = plan;
          state.plans.unshift(plan);
          state.activePlanningRun = {
            id: result.plan.id,
            planning_run_id: result.planningRunId,
            corridor_id: result.plan.corridor_id,
            horizon_start: result.plan.horizon_start_date,
            horizon_end: result.plan.horizon_end_date,
            input_request_ids: [],
            source_systems: meta?.source_systems || ['DEMO'],
            status: 'COMPLETED',
            plan_id: result.plan.id,
            failure_reason: null,
            execution_metadata: meta,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            plan: plan,
          };
        } else if (result?.status === 'COMPLETED_WITH_UNSCHEDULED_TASKS') {
          state.planningState = 'NO_FEASIBLE_PLAN';
        } else {
          state.planningState = 'ERROR';
          state.error = result?.error || 'Planning pipeline returned non-optimal result.';
        }
      })
      .addCase(submitPlanningRun.rejected, (state, action) => {
        state.isGenerating = false;
        state.planningState = 'ERROR';
        state.error = action.payload as string;
      });

    // approvePlan
    builder
      .addCase(approvePlan.fulfilled, (state, action: PayloadAction<any>) => {
        const approvedPlan = action.payload?.plan ?? action.payload?.data;
        if (approvedPlan) {
          state.activePlan = approvedPlan;
          const idx = state.plans.findIndex((p) => p.id === approvedPlan.id);
          if (idx !== -1) {
            state.plans[idx] = approvedPlan;
          }
        } else if (state.activePlan) {
          state.activePlan.status = 'APPROVED';
          state.activePlan.approvalState = 'APPROVED';
        }
      });

    // fetchPlanningRuns
    builder.addCase(fetchPlanningRuns.fulfilled, (state, action: PayloadAction<any>) => {
      state.planningRuns = action.payload?.data ?? [];
    });
  },
});

export const { clearPlanError, setPlanningState, setActivePlan, setActivePlanningRun, updateTaskSchedule } = planSlice.actions;
export const generatePlan = submitPlanningRun;
export default planSlice.reducer;
