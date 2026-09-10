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
  blocks: [
    {
      id: 'blk-1',
      section_id: 'sec-a-b',
      department: 'Engineering',
      start_time: '2024-01-01T02:00:00',
      end_time: '2024-01-01T05:00:00',
      status: 'APPROVED',
    },
    {
      id: 'blk-2',
      section_id: 'sec-c-d',
      department: 'OHE',
      start_time: '2024-01-01T06:00:00',
      end_time: '2024-01-01T10:00:00',
      status: 'PENDING',
    },
    {
      id: 'blk-3',
      section_id: 'sec-b-c',
      department: 'Signal',
      start_time: '2024-01-01T14:00:00',
      end_time: '2024-01-01T17:00:00',
      status: 'PENDING',
    },
  ],
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
