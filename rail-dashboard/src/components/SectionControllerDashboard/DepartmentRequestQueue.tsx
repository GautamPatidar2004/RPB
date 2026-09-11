import React from 'react';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import {
  toggleTaskSelection,
  selectAllPendingTasks,
  clearSelectedTasks,
  fetchPendingTasks,
  type MaintenanceTask,
} from '../../store/maintenanceTaskSlice';
import { submitPlanningRun, fetchPlans, fetchPlanById } from '../../store/planSlice';
import {
  Wrench, CheckSquare, Square,
  Clock, Zap, Sparkles
} from 'lucide-react';

interface DepartmentRequestQueueProps {
  selectedTaskId: string | null;
  onSelectTask: (taskId: string | null) => void;
}

export const DepartmentRequestQueue: React.FC<DepartmentRequestQueueProps> = ({
  selectedTaskId,
  onSelectTask,
}) => {
  const dispatch = useAppDispatch();
  const pendingTasks = useAppSelector((s) => s.maintenanceTasks.pendingTasks);
  const tasks = useAppSelector((s) => s.maintenanceTasks.tasks);
  const selectedTaskIds = useAppSelector((s) => s.maintenanceTasks.selectedTaskIds);
  const isGenerating = useAppSelector((s) => s.plans.isGenerating);
  const corridors = useAppSelector((s) => s.corridors.corridors);
  const selectedCId = useAppSelector((s) => s.corridors.selectedCorridorId);
  const selectedCorridor = corridors.find((c) => c.id === selectedCId) || corridors[0];

  // Combine pending queue: prefer pendingTasks, fallback to any tasks in PENDING/INCOMING status
  const queueItems: MaintenanceTask[] = pendingTasks.length > 0
    ? pendingTasks
    : tasks.filter((t) => t.status === 'PENDING' || t.status === 'INCOMING');

  const allSelected = queueItems.length > 0 && queueItems.every((t) => selectedTaskIds.includes(t.id));

  // Handle trigger AI Planning Run for selected or all pending requests
  const handleTriggerPlanningRun = async () => {
    const targetIds = selectedTaskIds.length > 0 ? selectedTaskIds : queueItems.map((t) => t.id);
    try {
      const res: any = await dispatch(
        submitPlanningRun({
          corridorCode: selectedCorridor?.code || 'NDLS-CNB',
          horizonStart: new Date().toISOString(),
          horizonEnd: new Date(Date.now() + 7 * 86400000).toISOString(),
          requestIds: targetIds,
          executeNow: true,
          forceDeterministicExplanation: true,
        })
      ).unwrap();

      if (res?.plan?.id) {
        dispatch(fetchPlanById(res.plan.id));
      }
      dispatch(fetchPendingTasks());
      dispatch(fetchPlans({}));
    } catch (err) {
      console.error('Failed to execute AI planning run:', err);
    }
  };

  const getSourceBadgeClass = (source?: string) => {
    const s = (source || 'DEMO').toUpperCase();
    if (s.includes('BDMS')) return 'bg-amber-950 text-amber-300 border-amber-700';
    if (s.includes('TDMS')) return 'bg-sky-950 text-sky-300 border-sky-700';
    if (s.includes('SMMS')) return 'bg-emerald-950 text-emerald-300 border-emerald-700';
    return 'bg-purple-950 text-purple-300 border-purple-700';
  };

  const getPriorityBadgeClass = (priority: number) => {
    if (priority === 1) return 'bg-rose-950 text-rose-300 border-rose-700 font-bold';
    if (priority === 2) return 'bg-amber-950 text-amber-300 border-amber-700 font-semibold';
    return 'bg-slate-800 text-slate-300 border-slate-700';
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg flex flex-col h-full shadow-inner select-none overflow-hidden">
      {/* QUEUE HEADER */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Wrench size={14} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              Department Request Queue
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {queueItems.length}
              </span>
            </div>
            <div className="text-[10px] text-slate-400">Incoming demands from BDMS, TDMS, SMMS</div>
          </div>
        </div>

        {/* BATCH PLANNING BUTTON */}
        <button
          onClick={handleTriggerPlanningRun}
          disabled={isGenerating || queueItems.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-900/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles size={13} className={isGenerating ? 'animate-spin' : ''} />
          <span>{isGenerating ? 'Optimizing...' : 'Run AI Planning'}</span>
        </button>
      </div>

      {/* SELECTION ACTIONS */}
      <div className="px-3 py-1.5 bg-slate-900/30 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
        <button
          onClick={() => (allSelected ? dispatch(clearSelectedTasks()) : dispatch(selectAllPendingTasks()))}
          className="flex items-center gap-1.5 hover:text-slate-200 transition"
        >
          {allSelected ? <CheckSquare size={13} className="text-purple-400" /> : <Square size={13} />}
          <span>{allSelected ? 'Deselect All' : 'Select All Eligible'}</span>
        </button>
        <span>{selectedTaskIds.length} of {queueItems.length} selected for batch</span>
      </div>

      {/* QUEUE LIST TABLE */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80">
        {queueItems.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No pending maintenance requests for this corridor.
            <div className="text-[11px] text-slate-600 mt-1">Use "Simulate Feed" above to generate incoming demands.</div>
          </div>
        ) : (
          queueItems.map((task) => {
            const isSelectedForBatch = selectedTaskIds.includes(task.id);
            const isSelectedRow = selectedTaskId === task.id;
            const startKm = task.start_kilometer ?? task.asset?.start_kilometer ?? 0;
            const endKm = task.end_kilometer ?? task.asset?.end_kilometer ?? (startKm + 2);
            const duration = task.duration_minutes || task.requested_duration || 120;
            const sourceCode = task.source_system || task.sourceSystem || 'DEMO';

            return (
              <div
                key={task.id}
                onClick={() => onSelectTask(isSelectedRow ? null : task.id)}
                className={`p-2.5 transition-colors cursor-pointer flex items-start gap-2.5 ${
                  isSelectedRow
                    ? 'bg-purple-950/40 border-l-2 border-purple-500'
                    : 'hover:bg-slate-900/50'
                }`}
              >
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch(toggleTaskSelection(task.id));
                  }}
                  className="mt-0.5 text-slate-400 hover:text-purple-400 transition"
                >
                  {isSelectedForBatch ? (
                    <CheckSquare size={14} className="text-purple-400" />
                  ) : (
                    <Square size={14} />
                  )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <span className="font-mono text-xs font-bold text-slate-200 truncate">
                      {task.task_code || task.taskCode || task.title}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-mono tracking-wider ${getSourceBadgeClass(
                        sourceCode
                      )}`}
                    >
                      {sourceCode}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-300 font-medium truncate mb-1">
                    {task.title || `${task.department} Maintenance Task`}
                  </div>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                    <span className="px-1 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                      {task.department}
                    </span>
                    <span className={`px-1 py-0.2 rounded border ${getPriorityBadgeClass(task.priority)}`}>
                      P{task.priority}
                    </span>
                    <span className="flex items-center gap-1 font-mono">
                      <Clock size={10} />
                      {duration}m
                    </span>
                    <span>KM {startKm}-{endKm}</span>

                    {task.power_block_required && (
                      <span className="text-sky-400 flex items-center gap-0.5 font-semibold">
                        <Zap size={9} />
                        OHE
                      </span>
                    )}

                    {task.defect?.defect_code && (
                      <span className="text-rose-400 font-mono">
                        {task.defect.defect_code}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
