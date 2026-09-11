import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface MaintenanceBlock {
  id: string;
  section_id: string;
  department: string;
  start_time: string;
  end_time: string;
  status: 'PENDING' | 'APPROVED';
}

interface MaintenanceBlockState {
  blocks: MaintenanceBlock[];
}

const initialState: MaintenanceBlockState = {
  // Populated via setOptimizedBlocks from planSlice when a plan is loaded
  blocks: [],
};


export const maintenanceBlockSlice = createSlice({
  name: 'maintenanceBlock',
  initialState,
  reducers: {
    addRequest: (state, action: PayloadAction<MaintenanceBlock>) => {
      state.blocks.push(action.payload);
    },
    updateBlockStatus: (
      state,
      action: PayloadAction<{ id: string; status: 'PENDING' | 'APPROVED' }>
    ) => {
      const block = state.blocks.find((b) => b.id === action.payload.id);
      if (block) {
        block.status = action.payload.status;
      }
    },
    updateBlockTime: (
      state,
      action: PayloadAction<{ id: string; start_time: string; end_time: string }>
    ) => {
      const block = state.blocks.find((b) => b.id === action.payload.id);
      if (block) {
        block.start_time = action.payload.start_time;
        block.end_time = action.payload.end_time;
      }
    },
    setOptimizedBlocks: (state, action: PayloadAction<MaintenanceBlock[]>) => {
      state.blocks = action.payload;
    },
  },
});

export const { addRequest, updateBlockStatus, updateBlockTime, setOptimizedBlocks } = maintenanceBlockSlice.actions;
export default maintenanceBlockSlice.reducer;
