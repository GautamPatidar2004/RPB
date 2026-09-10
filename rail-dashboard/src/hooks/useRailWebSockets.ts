import { useEffect } from 'react';
import { useAppDispatch } from '../store/hooks';
import { updateTrainStatus } from '../store/trainScheduleSlice';
import { setOptimizedBlocks } from '../store/maintenanceBlockSlice';

/**
 * WebSocket hook — DISABLED: Backend does not implement socket.io.
 * Socket events from the API doc are REST-based only.
 * This hook is kept as a stub so it can be re-enabled when/if WebSockets are added to the backend.
 */
export const useRailWebSockets = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // NOTE: socket.io is not implemented in the backend (https://rpbackend-gold.vercel.app).
    // The backend is a REST API only. This hook is intentionally a no-op stub.
    // When the backend adds socket.io support, re-enable the socketService connection here.
    //
    // socket.on('SCHEDULE_RECALCULATED', (payload) => {
    //   if (payload.trains) dispatch(setInitialSchedules(payload.trains));
    //   if (payload.blocks) dispatch(setOptimizedBlocks(payload.blocks));
    // });
    // socket.on('TRAIN_DELAYED', (payload) => dispatch(updateTrainStatus(payload)));

    // Suppress "unused" lint warnings while stub is active
    void dispatch;
    void updateTrainStatus;
    void setOptimizedBlocks;
  }, [dispatch]);
};
