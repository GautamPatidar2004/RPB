import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import apiClient from '../services/apiClient';

export interface Asset {
  id: string;
  assetCode: string;
  assetType: string;
  name: string;
  location: string;
  corridorId: string;
  startKilometer: number | null;
  endKilometer: number | null;
  criticality: string;
  healthStatus: string;
  sourceSystem: string;
  isActive: boolean;
}

export interface AssetSummary {
  total: number;
  active: number;
  critical: number;
  degraded: number;
  healthy: number;
}

interface AssetState {
  assets: Asset[];
  summary: AssetSummary | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: AssetState = {
  assets: [],
  summary: null,
  isLoading: false,
  error: null,
};

function mapApiAsset(a: any): Asset {
  return {
    id: a.id,
    assetCode: a.asset_code ?? a.assetCode ?? '',
    assetType: a.asset_type ?? a.assetType ?? '',
    name: a.name ?? '',
    location: a.location ?? '',
    corridorId: a.corridor_id ?? a.corridorId ?? '',
    startKilometer: a.start_kilometer ?? a.startKilometer ?? null,
    endKilometer: a.end_kilometer ?? a.endKilometer ?? null,
    criticality: a.criticality ?? 'LOW',
    healthStatus: a.health_status ?? a.healthStatus ?? 'GOOD',
    sourceSystem: a.source_system ?? a.sourceSystem ?? '',
    isActive: a.is_active ?? a.isActive ?? true,
  };
}

export const fetchAssets = createAsyncThunk(
  'assets/fetchAll',
  async (params: { corridor_id?: string; asset_type?: string; criticality?: string } = {}, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/api/assets', { params });
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Failed to load assets.');
    }
  }
);

export const fetchAssetSummary = createAsyncThunk(
  'assets/fetchSummary',
  async (_, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/api/assets/summary');
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Failed to load asset summary.');
    }
  }
);

const assetSlice = createSlice({
  name: 'assets',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAssets.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchAssets.fulfilled, (state, action: PayloadAction<any>) => {
        state.isLoading = false;
        const raw = action.payload?.data ?? action.payload?.assets ?? [];
        state.assets = raw.map(mapApiAsset);
      })
      .addCase(fetchAssets.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    builder.addCase(fetchAssetSummary.fulfilled, (state, action: PayloadAction<any>) => {
      const raw = action.payload?.summary ?? action.payload?.data ?? null;
      if (raw) {
        state.summary = {
          total: raw.total_assets ?? raw.total ?? 0,
          active: raw.operational_count ?? raw.active ?? 0,
          critical: raw.critical_assets_count ?? raw.critical ?? 0,
          degraded: raw.maintenance_required_count ?? raw.degraded ?? 0,
          healthy: raw.operational_count ?? raw.healthy ?? 0,
        };
      }
    });
  },
});

export default assetSlice.reducer;
