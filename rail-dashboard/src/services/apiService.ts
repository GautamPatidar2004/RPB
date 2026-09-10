import { useState } from 'react';
import apiClient from './apiClient';
import { useAppDispatch } from '../store/hooks';
import { addRequest, type MaintenanceBlock } from '../store/maintenanceBlockSlice';

/**
 * Custom hook to handle API submissions for Maintenance Blocks (local Gantt state).
 * POSTs to /api/maintenance-tasks on the backend.
 * Manages loading and error states internally.
 */
export const useSubmitMaintenanceBlock = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useAppDispatch();

  const submitBlock = async (blockData: Omit<MaintenanceBlock, 'id' | 'status'>) => {
    setIsLoading(true);
    setError(null);

    try {
      // NOTE: POST /api/maintenance-tasks is not in the documented public API.
      // Tasks arrive via /api/sync/trigger from TMS/SMMS/TDMS.
      // This endpoint call is kept for future direct submission support.
      const response = await apiClient.post<{ data: MaintenanceBlock }>('/api/maintenance-tasks', blockData);
      const created: MaintenanceBlock = response.data?.data ?? (response.data as unknown as MaintenanceBlock);
      dispatch(addRequest(created));
      return created;
    } catch (err: any) {
      const errorMessage = err.response?.data?.message ?? 'Failed to submit maintenance block.';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return { submitBlock, isLoading, error };
};
