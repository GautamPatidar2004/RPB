import { configureStore } from '@reduxjs/toolkit';
import trainScheduleReducer from './trainScheduleSlice';
import maintenanceBlockReducer from './maintenanceBlockSlice';
import maintenanceTaskReducer from './maintenanceTaskSlice';
import authReducer from './authSlice';
import corridorReducer from './corridorSlice';
import syncReducer from './syncSlice';
import planReducer from './planSlice';
import blockWindowReducer from './blockWindowSlice';
import assetReducer from './assetSlice';

export const store = configureStore({
  reducer: {
    trainSchedule:    trainScheduleReducer,
    maintenanceBlock: maintenanceBlockReducer,  // local Gantt drag state
    maintenanceTasks: maintenanceTaskReducer,   // real API data
    auth:             authReducer,
    corridors:        corridorReducer,
    sync:             syncReducer,
    plans:            planReducer,
    blockWindows:     blockWindowReducer,       // block windows from /api/block-windows
    assets:           assetReducer,             // infrastructure assets from /api/assets
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
