import React, { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchAllData } from '../store/taskSlice';

const getDepartmentColor = (code: string) => {
  if (code === 'ENGG') return 'bg-amber-500';
  if (code === 'SNT') return 'bg-purple-500';
  if (code === 'TRD') return 'bg-blue-500';
  return 'bg-slate-500';
};

const getDepartmentBadge = (code: string) => {
  if (code === 'ENGG') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (code === 'SNT') return 'bg-purple-50 text-purple-700 border-purple-200';
  if (code === 'TRD') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

const getCriticalityBadge = (crit: string) => {
  if (crit === 'CRITICAL') return 'bg-red-50 text-red-700 border-red-200';
  if (crit === 'HIGH') return 'bg-orange-50 text-orange-700 border-orange-200';
  if (crit === 'MEDIUM') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
};

export const UnifiedIngestionHub: React.FC = () => {
  const dispatch = useAppDispatch();
  const selectedCId = useAppSelector(s => s.corridors.selectedCorridorId);
  const { maintenanceTasks, trains, blockWindows, isLoading } = useAppSelector(s => s.tasks);

  useEffect(() => {
    if (selectedCId) {
      dispatch(fetchAllData(selectedCId));
    }
  }, [dispatch, selectedCId]);

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-6 w-full">
      <header className="flex justify-between items-end flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Unified Ingestion Hub</h1>
          <p className="text-sm text-slate-500 mt-1">Aggregated live data from TMS, SMMS, TDMS, COA, and BDMS.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2" style={{ animation: 'pulse-ring 2s infinite' }}></span>
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Systems Synced</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Maintenance Backlog */}
        <div className="col-span-2 glass-panel flex flex-col p-6 min-h-0">
          <h2 className="text-lg font-semibold mb-4 text-slate-800 flex-shrink-0">Cross-Department Backlog</h2>
          <div className="flex-1 overflow-y-auto pr-3 space-y-4 custom-scrollbar min-h-0">
            {isLoading ? (
              <div className="animate-pulse flex space-x-4"><div className="flex-1 space-y-4 py-1"><div className="h-4 bg-slate-200 rounded w-3/4"></div><div className="space-y-2"><div className="h-4 bg-slate-200 rounded"></div><div className="h-4 bg-slate-200 rounded w-5/6"></div></div></div></div>
            ) : maintenanceTasks.length === 0 ? (
              <div className="text-sm text-slate-500 italic flex items-center justify-center h-full">No pending tasks for this corridor.</div>
            ) : (
              maintenanceTasks.map((t: any) => (
                <div key={t.id} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                   {/* Department Color Accent Line */}
                   <div className={`absolute top-0 left-0 w-1.5 h-full ${getDepartmentColor(t.department_code)}`}></div>
                   
                   <div className="flex justify-between items-start pl-3">
                      <div className="flex-1 pr-4">
                         <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t.external_record_id || t.id.split('-')[0]}</span>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${getCriticalityBadge(t.criticality || 'MEDIUM')}`}>
                               {t.criticality || 'MEDIUM'}
                            </span>
                         </div>
                         <h3 className="font-bold text-slate-900 text-sm leading-tight">{t.title || 'Untitled Maintenance Task'}</h3>
                         <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description || 'No description provided.'}</p>
                      </div>
                      <div className={`text-[10px] px-2 py-1.5 rounded-lg font-bold flex flex-col items-center border ${getDepartmentBadge(t.department_code)} shadow-sm`}>
                         <span className="tracking-wide">{t.department_code || 'UNK'}</span>
                         <span className="text-[8px] opacity-75">{t.source_system || 'SYS'}</span>
                      </div>
                   </div>
                   
                   <div className="mt-4 ml-3 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <div className="flex flex-col">
                         <span className="text-[9px] uppercase font-bold text-slate-400">Duration</span>
                         <span className="text-xs font-bold text-slate-700">{t.duration_minutes || t.estimatedDurationMinutes || '--'} min</span>
                      </div>
                      <div className="flex flex-col">
                         <span className="text-[9px] uppercase font-bold text-slate-400">Asset</span>
                         <span className="text-xs font-bold text-slate-700 truncate" title={t.asset_name}>{t.asset_name || 'Network Wide'}</span>
                      </div>
                      <div className="flex flex-col">
                         <span className="text-[9px] uppercase font-bold text-slate-400">Blocks Req.</span>
                         <div className="flex gap-1.5 mt-0.5">
                            {t.traffic_block_required ? <span className="w-5 h-5 rounded bg-red-100 text-red-600 flex items-center justify-center text-[9px] font-black border border-red-200" title="Traffic Block Required">T</span> : null}
                            {t.power_block_required ? <span className="w-5 h-5 rounded bg-amber-100 text-amber-600 flex items-center justify-center text-[9px] font-black border border-amber-200" title="Power Block Required">P</span> : null}
                            {!t.traffic_block_required && !t.power_block_required ? <span className="text-xs text-slate-400 font-medium">None</span> : null}
                         </div>
                      </div>
                      <div className="flex flex-col">
                         <span className="text-[9px] uppercase font-bold text-slate-400">Speed Restr.</span>
                         <span className="text-xs font-bold text-slate-700">{t.speed_restriction_kmph ? `${t.speed_restriction_kmph} km/h` : 'None'}</span>
                      </div>
                   </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Network State */}
        <div className="glass-panel flex flex-col p-6 gap-6">
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-1">Active Trains (COA)</h2>
              <div className="text-4xl font-black text-slate-900">{trains.length}</div>
            </div>
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-1">Available Windows (BDMS)</h2>
              <div className="text-4xl font-black text-slate-900">{blockWindows.length}</div>
            </div>
            
            <div className="mt-auto pt-4 border-t border-slate-200">
              <button className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-[0_4px_14px_rgba(37,99,235,0.3)] transition-all">
                Trigger AI Synchronization
              </button>
            </div>
        </div>
      </div>
    </div>
  );
};
