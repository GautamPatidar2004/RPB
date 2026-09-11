import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { generatePlan, resolveConflict } from '../store/planSlice';

const calculatePosition = (startStr?: string, endStr?: string) => {
  if (!startStr || !endStr) return null;
  try {
    const s = new Date(startStr);
    const e = new Date(endStr);
    const startHour = s.getUTCHours() + s.getUTCMinutes() / 60;
    const endHour = e.getUTCHours() + e.getUTCMinutes() / 60;
    let duration = endHour - startHour;
    if (duration < 0) duration += 24;
    return {
      left: `${(startHour / 24) * 100}%`,
      width: `${(duration / 24) * 100}%`
    };
  } catch (e) { return null; }
};

const MaintenanceTaskItem = ({ at, i }: { at: any, i: number }) => {
  const [hovered, setHovered] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  const pos = calculatePosition(at.assigned_start_time, at.assigned_end_time) || { left: `${(i * 15) + 2}%`, width: '10%' };
  const TASK_COLORS = ['bg-amber-500 border-amber-600', 'bg-blue-500 border-blue-600', 'bg-emerald-500 border-emerald-600', 'bg-purple-500 border-purple-600', 'bg-rose-500 border-rose-600', 'bg-cyan-500 border-cyan-600'];
  const TASK_SHADOWS = ['shadow-[0_2px_8px_rgba(245,158,11,0.3)]', 'shadow-[0_2px_8px_rgba(59,130,246,0.3)]', 'shadow-[0_2px_8px_rgba(16,185,129,0.3)]', 'shadow-[0_2px_8px_rgba(168,85,247,0.3)]', 'shadow-[0_2px_8px_rgba(244,63,94,0.3)]', 'shadow-[0_2px_8px_rgba(6,182,212,0.3)]'];
  const colorClass = TASK_COLORS[i % TASK_COLORS.length];
  const shadowClass = TASK_SHADOWS[i % TASK_SHADOWS.length];

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({ top: rect.top, left: rect.left, width: rect.width });
    setHovered(true);
  };

  return (
    <>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setHovered(false)}
        className={`absolute h-7 rounded-lg border ${colorClass} ${shadowClass} flex items-center justify-center cursor-pointer px-1 text-[9px] font-bold text-white whitespace-nowrap z-20`}
        style={{ ...pos, top: `${i * 40 + 28}px` }}
      >
        <span className="truncate w-full text-center px-1">
          {at.maintenance_task_id ? at.maintenance_task_id.split('-').slice(0, 2).join('-') : 'TASK'}
        </span>
      </div>

      {hovered && createPortal(
        <div
          className="fixed transform -translate-x-1/2 -translate-y-full w-64 bg-slate-900/95 backdrop-blur-sm text-white text-xs rounded-xl p-3 shadow-2xl z-[9999] pointer-events-none text-left whitespace-normal leading-relaxed border border-slate-700"
          style={{ top: coords.top - 8, left: coords.left + (coords.width / 2) }}
        >
          <div className="font-bold text-sm mb-1 text-white">{at.maintenance_task_id || 'Unknown Task'}</div>
          <div className="text-slate-300 mb-3">{at.notes || 'No description provided by AI.'}</div>
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
            <span className="text-emerald-400 flex items-center">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Score: {at.ai_recommendation_score ? (at.ai_recommendation_score * 100).toFixed(1) : 'N/A'}%
            </span>
            <span className="text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">{at.status || 'SCHEDULED'}</span>
          </div>
          {/* Tooltip Arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-900/95"></div>
        </div>,
        document.body
      )}
    </>
  );
};

const TrainItem = ({ t, i }: { t: any, i: number }) => {
  const [hovered, setHovered] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  const pos = calculatePosition(t.scheduled_departure || t.start_time || t.departure_time, t.scheduled_arrival || t.end_time || t.arrival_time) || { left: `${(i * 10) + 5}%`, width: '15%' };

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({ top: rect.top, left: rect.left, width: rect.width });
    setHovered(true);
  };

  return (
    <>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setHovered(false)}
        className="absolute h-4 bg-slate-400 rounded-full cursor-pointer hover:bg-slate-500 transition-colors z-10"
        style={{ ...pos, top: `${i * 32 + 28}px` }}
      ></div>

      {hovered && createPortal(
        <div
          className="fixed transform -translate-x-1/2 -translate-y-full w-56 bg-slate-900/95 backdrop-blur-sm text-white text-xs rounded-xl p-3 shadow-2xl z-[9999] pointer-events-none text-left whitespace-normal leading-relaxed border border-slate-700"
          style={{ top: coords.top - 8, left: coords.left + (coords.width / 2) }}
        >
          <div className="font-bold text-sm mb-1 text-white flex items-center">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            Train {t.train_number || t.id?.split('-')[0] || 'Unknown'}
          </div>
          <div className="text-slate-300 mb-3">{t.name || 'Scheduled Train Activity'}</div>
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
            <span className="text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">{t.train_type || 'EXPRESS'}</span>
            <span className="text-blue-400">Prio: {t.priority || 1}</span>
          </div>
          {/* Tooltip Arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-900/95"></div>
        </div>,
        document.body
      )}
    </>
  );
};

export const PlanConsole: React.FC = () => {
  const dispatch = useAppDispatch();
  const selectedCId = useAppSelector(s => s.corridors.selectedCorridorId);
  const corridors = useAppSelector(s => s.corridors.corridors);
  const selectedCorridor: any = corridors.find((c: any) => c.id === selectedCId);
  const { activePlan, isGenerating } = useAppSelector((s: any) => s.plans);
  const { trains } = useAppSelector((s: any) => s.tasks);

  const handleGenerate = () => {
    if (selectedCorridor) {
      dispatch(generatePlan({ corridorCode: selectedCorridor.code, horizonMode: 'WEEKLY' }));
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-6 w-full">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">AI Optimization Console</h1>
          <p className="text-sm text-slate-500 mt-1">Resolve conflicts natively.</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-[0_4px_12px_rgba(16,185,129,0.3)] transition-all flex items-center disabled:opacity-50">
          {isGenerating ? 'Computing...' : 'Generate Plan'}
        </button>
      </header>

      {/* The Core Custom CSS Timeline View */}
      <div className="flex-1 glass-panel p-6 flex flex-col min-h-0">
        <h2 className="text-lg font-semibold mb-4 text-slate-800">Conflict Detection & Resolution</h2>

        {activePlan ? (
          <div className="flex-1 overflow-y-auto flex flex-col gap-6 min-h-0 pr-2 custom-scrollbar">
            {/* Plan Metrics */}
            {activePlan.metrics && (
              <div className="grid grid-cols-4 gap-4 flex-shrink-0">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">Total Assigned</span>
                  <span className="text-2xl font-black text-slate-900">{activePlan.metrics.taskCount} Tasks</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">Block Utilization</span>
                  <span className="text-2xl font-black text-slate-900">{activePlan.metrics.utilizationPercentage}%</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">AI Safety Buffer</span>
                  <span className="text-2xl font-black text-emerald-600">{activePlan.metrics.totalDurationMinutes}m</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">Detected Conflicts</span>
                  <span className={`text-2xl font-black ${activePlan.metrics.conflictCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{activePlan.metrics.conflictCount}</span>
                </div>
              </div>
            )}

            <div className="flex flex-col border border-slate-200 rounded-xl bg-white shadow-sm flex-shrink-0 relative">
              {/* Custom Time Scale Header - Sticky */}
              <div className="sticky top-0 z-30 h-8 bg-slate-50 border-b border-slate-200 flex shadow-sm">
                {[...Array(24)].map((_, i) => (
                  <div key={i} className="flex-1 border-r border-slate-200 text-[10px] text-slate-500 font-medium p-1 text-center">{i}:00</div>
                ))}
              </div>

              <div className="bg-slate-50/50 flex flex-col relative z-10">
                {/* Timeline Tracks */}
                <div className="p-5 space-y-8 flex-shrink-0">
                  {/* Trains Track */}
                  <div className="relative bg-white rounded-lg border border-slate-200 shadow-sm" style={{ height: `${Math.max(1, trains.length) * 32 + 40}px` }}>
                    <div className="absolute top-2 left-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider z-10">Scheduled Trains</div>
                    {trains.map((t: any, i: number) => (
                      <TrainItem key={t.id || i} t={t} i={i} />
                    ))}
                  </div>

                  {/* Maintenance Track */}
                  <div className="relative bg-white rounded-lg border border-slate-200 shadow-sm" style={{ height: `${Math.max(1, activePlan.assignedTasks?.length || 1) * 40 + 40}px` }}>
                    <div className="absolute top-2 left-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider z-10">Assigned Maintenance Tasks</div>
                    {activePlan.assignedTasks?.map((at: any, i: number) => (
                      <MaintenanceTaskItem key={at.id || i} at={at} i={i} />
                    ))}
                  </div>
                </div>

                {/* Conflict Resolution Area */}
                <div className="p-5 border-t border-slate-200 bg-white flex-1">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">Conflict Resolution Queue</h3>
                  <div className="flex flex-col gap-4">
                    {activePlan.conflicts && activePlan.conflicts.map((conflict: any) => (
                      <div key={conflict.id} className={`p-4 border rounded-xl shadow-sm ${conflict.resolution_status === 'RESOLVED' || conflict.resolution_status === 'TRAIN_REGULATED' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                        <h3 className={`font-bold mb-2 flex items-center text-sm ${conflict.resolution_status === 'RESOLVED' || conflict.resolution_status === 'TRAIN_REGULATED' ? 'text-emerald-700' : 'text-red-700'}`}>
                          {conflict.resolution_status === 'RESOLVED' || conflict.resolution_status === 'TRAIN_REGULATED' ? (
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          )}
                          {conflict.resolution_status === 'RESOLVED' || conflict.resolution_status === 'TRAIN_REGULATED' ? 'Conflict Resolved' : 'AI Detected Conflict'}
                        </h3>
                        <p className={`text-xs mb-3 font-medium ${conflict.resolution_status === 'RESOLVED' || conflict.resolution_status === 'TRAIN_REGULATED' ? 'text-emerald-600' : 'text-red-600'}`}>{conflict.description || `Task ${conflict.maintenanceTaskId} overlaps with Train ${conflict.trainId}.`}</p>

                        {conflict.resolution_status !== 'RESOLVED' && conflict.resolution_status !== 'TRAIN_REGULATED' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => dispatch(resolveConflict({ planId: activePlan.id, conflictId: conflict.id, resolutionData: { resolutionStatus: 'TRAIN_REGULATED' } }))}
                              className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 rounded-lg text-xs font-bold transition-colors shadow-sm">
                              Regulate Train
                            </button>
                            <button
                              onClick={() => dispatch(resolveConflict({ planId: activePlan.id, conflictId: conflict.id, resolutionData: { resolutionStatus: 'TASK_RESCHEDULED' } }))}
                              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-colors shadow-sm">
                              Modify Task Time
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {(!activePlan.conflicts || activePlan.conflicts.length === 0) && (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-sm opacity-60">
                        <h3 className="text-slate-600 font-bold mb-1 flex items-center text-sm">
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          No Conflicts Detected
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">The AI schedule is conflict-free.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center border-2 border-slate-200 border-dashed rounded-xl bg-slate-50/50">
            <div className="text-slate-500 font-medium text-sm flex flex-col items-center">
              <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              Select constraints and generate a plan to visualize conflicts.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
