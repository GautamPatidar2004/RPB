import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import apiClient from '../services/apiClient';

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  fullName: string;
  designation: string;
  department: string;
  employeeId: string;
}

export interface DemoAccount {
  username: string;
  password?: string;
  hint?: string;
  role: string;
  fullName?: string;
  designation?: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  demoAccounts: DemoAccount[];
  demoAccountsLoading: boolean;
}

const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('rail_token'),
  isAuthenticated: !!localStorage.getItem('rail_token'),
  isLoading: false,
  error: null,
  demoAccounts: [],
  demoAccountsLoading: false,
};

// Async thunks
export const fetchDemoAccounts = createAsyncThunk(
  'auth/fetchDemoAccounts',
  async (_, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/api/auth/demo-accounts');
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Could not load demo accounts.');
    }
  }
);

export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (credentials: { username: string; password: string }, { rejectWithValue }) => {
    try {
      const res = await apiClient.post('/api/auth/login', credentials);
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Login failed. Check credentials.');
    }
  }
);

export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/api/auth/me');
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Session expired.');
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async () => {
    try {
      await apiClient.post('/api/auth/logout');
    } catch {
      // Always clear local state even if API fails
    }
    return null;
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => { state.error = null; },
    forceLogout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      localStorage.removeItem('rail_token');
    },
  },
  extraReducers: (builder) => {
    // Demo accounts
    builder
      .addCase(fetchDemoAccounts.pending, (state) => { state.demoAccountsLoading = true; })
      .addCase(fetchDemoAccounts.fulfilled, (state, action: PayloadAction<any>) => {
        state.demoAccountsLoading = false;
        state.demoAccounts = action.payload?.demoAccounts ?? action.payload?.data ?? action.payload?.accounts ?? [];
      })
      .addCase(fetchDemoAccounts.rejected, (state) => { state.demoAccountsLoading = false; });

    // Login
    builder
      .addCase(loginUser.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(loginUser.fulfilled, (state, action: PayloadAction<any>) => {
        state.isLoading = false;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        localStorage.setItem('rail_token', action.payload.token);
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Fetch current user
    builder
      .addCase(fetchCurrentUser.fulfilled, (state, action: PayloadAction<any>) => {
        state.user = action.payload?.user ?? action.payload?.data;
        state.isAuthenticated = true;
      })
      .addCase(fetchCurrentUser.rejected, (state) => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        localStorage.removeItem('rail_token');
      });

    // Logout
    builder.addCase(logoutUser.fulfilled, (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      localStorage.removeItem('rail_token');
    });
  },
});

export const { clearError, forceLogout } = authSlice.actions;
export default authSlice.reducer;
