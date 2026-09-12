import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import corridorReducer from './corridorSlice';
import planReducer from './planSlice';
import taskReducer from './taskSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    corridors: corridorReducer,
    plans: planReducer,
    tasks: taskReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
