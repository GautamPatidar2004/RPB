import React from 'react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { selectCorridor } from '../store/corridorSlice';

interface Props {
  children: React.ReactNode;
  activeTab: 'hub' | 'plan';
  setActiveTab: (t: 'hub' | 'plan') => void;
}

export const CommandCenterLayout: React.FC<Props> = ({ children, activeTab, setActiveTab }) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(s => s.auth.user);
  const corridors = useAppSelector(s => s.corridors.corridors);
  const selectedCId = useAppSelector(s => s.corridors.selectedCorridorId);
  const selectedCorridor: any = corridors.find((c: any) => c.id === selectedCId);

  return (
    <div className="flex h-screen w-full bg-transparent overflow-hidden text-slate-800">
      {/* Sidebar */}
      <aside className="w-[260px] flex-shrink-0 flex flex-col border-r border-slate-200 glass-panel rounded-none shadow-[2px_0_10px_rgba(0,0,0,0.02)]">
        <div className="h-16 flex items-center px-4 border-b border-slate-200 bg-white/40">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-[0_4px_12px_rgba(37,99,235,0.3)]">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <div className="ml-3 font-bold leading-tight text-slate-900">
            AI Block Planner<br /><span className="text-[10px] text-slate-500 font-normal uppercase tracking-wider">Command Center</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <button onClick={() => setActiveTab('hub')} className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'hub' ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'}`}>
            <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            Unified Ingestion Hub
          </button>
          <button onClick={() => setActiveTab('plan')} className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'plan' ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'}`}>
            <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            Optimization Console
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200 bg-white/40">
          <div className="flex items-center">
            <div className="w-9 h-9 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-xs shadow-sm">
              {user?.fullName?.substring(0, 2).toUpperCase() || 'U'}
            </div>
            <div className="ml-3">
              <div className="text-xs font-bold text-slate-900">{user?.fullName}</div>
              <div className="text-[10px] text-slate-500 font-medium mt-0.5">{user?.role}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden p-6 gap-6 relative z-10 bg-slate-50/50">

        {/* Corridor Context Bar */}
        {activeTab !== 'plan' && (
          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className="px-3 py-2 bg-blue-50 text-blue-700 rounded-lg font-bold border border-blue-100 flex items-center shadow-sm">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                {selectedCorridor?.code || '---'}
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">{selectedCorridor?.name || 'Loading Corridor...'}</h2>
                <div className="text-xs text-slate-500 mt-1 flex gap-4">
                  <span className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5"></span>Zone: <strong className="text-slate-700 ml-1">{selectedCorridor?.zone}</strong></span>
                  <span className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5"></span>Division: <strong className="text-slate-700 ml-1">{selectedCorridor?.division}</strong></span>
                  <span className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5"></span>Length: <strong className="text-slate-700 ml-1">{selectedCorridor?.total_length_km} km</strong></span>
                  <span className="flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5"></span>Type: <strong className="text-slate-700 ml-1">{selectedCorridor?.line_type?.replace('_', ' ')}</strong></span>
                </div>
              </div>
            </div>

            {/* Dropdown for selecting other corridors */}
            <select
              className="text-sm border border-slate-200 rounded-lg px-4 py-2 bg-slate-50 text-slate-700 font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-sm cursor-pointer hover:bg-slate-100 transition-colors"
              value={selectedCorridor?.id || ''}
              onChange={(e) => dispatch(selectCorridor(e.target.value))}
            >
              {corridors.map((c: any) => (
                <option key={c.id} value={c.id}>{c.code}</option>
              ))}
            </select>
          </div>
        )}

        {children}
      </main>
    </div>
  );
};
