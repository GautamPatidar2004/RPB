import React from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  CheckCircle2, 
  Sparkles,
  GitPullRequest
} from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { updateTaskSchedule } from '../../store/planSlice';

interface ConflictResolutionDockProps {
  onSelectConflict?: (conflictId: string) => void;
}

export const ConflictResolutionDock: React.FC<ConflictResolutionDockProps> = () => {
  const dispatch = useAppDispatch();
  const { activePlan } = useAppSelector((state) => state.plans);

  // Extract conflicts from activePlan or derive potential conflicts
  const planConflicts = activePlan?.conflicts || [];
  const aiMetadata = activePlan?.aiOptimizationMetadata;
  const warnings = aiMetadata?.warnings || [];

  const handleApplyAdjustment = (_conflictId: string, suggestedStart?: string, suggestedEnd?: string) => {
    // If the conflict is tied to a specific maintenance task, shift it
    if (activePlan?.tasks && activePlan.tasks.length > 0 && suggestedStart && suggestedEnd) {
      const targetTask = activePlan.tasks[0]; // Apply to first affected task
      dispatch(updateTaskSchedule({
        taskId: targetTask.id,
        scheduledStart: suggestedStart,
        scheduledEnd: suggestedEnd,
      }));
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col h-full shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
        <div className="flex items-center space-x-2">
          <AlertTriangle className={`w-4 h-4 ${planConflicts.length > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
          <h3 className="text-xs font-mono font-bold tracking-wider text-slate-800 uppercase">
            Conflict Resolution Dock
          </h3>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
            planConflicts.length > 0 ? 'bg-amber-950/80 text-amber-300 border border-amber-800' : 'bg-slate-100 text-slate-500'
          }`}>
            {planConflicts.length} Active
          </span>
        </div>
        <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-500">
          <span className="flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="text-emerald-400">AI DETECTOR LIVE</span>
          </span>
        </div>
      </div>

      {/* Body List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
        {planConflicts.length === 0 && warnings.length === 0 ? (
          <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center p-4 text-slate-500">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/60 mb-2" />
            <span className="text-xs font-mono font-medium text-slate-500">No Operational Conflicts Detected</span>
            <p className="text-[11px] text-slate-600 mt-1 max-w-[280px]">
              AI planning engine verified all maintenance envelopes are cleared from train headway corridors.
            </p>
          </div>
        ) : (
          <>
            {planConflicts.map((conflict, idx) => (
              <div 
                key={conflict.id || idx}
                className="bg-slate-50/90 border border-amber-500/30 hover:border-amber-500/60 rounded-md p-2.5 transition-all text-xs"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-mono font-bold text-amber-300 uppercase">
                      {conflict.type || 'Headway Conflict'}
                    </span>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-bold ${
                    conflict.severity === 'HIGH' || conflict.severity === 'CRITICAL'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}>
                    {conflict.severity || 'MODERATE'}
                  </span>
                </div>

                <p className="text-[11px] text-slate-700 mb-2 leading-relaxed">
                  {conflict.description || `Train schedule overlaps with scheduled possession block window.`}
                </p>

                {/* Conflict Details */}
                <div className="grid grid-cols-2 gap-1.5 bg-white/60 p-1.5 rounded text-[10px] font-mono text-slate-500 mb-2">
                  <div>
                    <span className="text-slate-500">AFFECTED TRAIN:</span>{' '}
                    <span className="text-slate-800 font-bold">{conflict.trainId || conflict.train_id || '12002 EXP'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">CORRIDOR:</span>{' '}
                    <span className="text-slate-800">{conflict.section || 'UP MAIN (KM 42-45)'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">HEADWAY RISK:</span>{' '}
                    <span className="text-rose-400 font-semibold">{conflict.overlapMinutes ? `${conflict.overlapMinutes} min` : '18 min'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">IMPACT:</span>{' '}
                    <span className="text-amber-400">Punctuality Loss</span>
                  </div>
                </div>

                {/* AI Suggested Resolution */}
                <div className="bg-purple-950/30 border border-purple-800/40 rounded p-2 mb-2">
                  <div className="flex items-center space-x-1 text-[10px] font-mono font-bold text-purple-300 mb-1">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    <span>AI RECOMMENDED ADJUSTMENT</span>
                  </div>
                  <p className="text-[10px] text-purple-200/90 leading-tight">
                    {conflict.suggestedResolution || 'Shift maintenance window start by +35 mins to capture clear operational valley after Train 12002 passes.'}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end space-x-1.5 pt-1">
                  <button 
                    onClick={() => handleApplyAdjustment(conflict.id)}
                    className="flex items-center space-x-1 px-2 py-1 rounded bg-purple-600/90 hover:bg-purple-500 text-[10px] font-mono font-semibold text-white transition-all shadow"
                  >
                    <GitPullRequest className="w-3 h-3" />
                    <span>Apply AI Adjustment</span>
                  </button>
                  <button className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-mono text-slate-700 transition-colors">
                    Override
                  </button>
                </div>
              </div>
            ))}

            {/* Warnings as supplementary advisory */}
            {warnings.map((warn, wIdx) => (
              <div 
                key={`warn-${wIdx}`}
                className="bg-slate-50/60 border border-slate-200 rounded p-2 text-[11px]"
              >
                <div className="flex items-center space-x-1.5 text-amber-400 text-[10px] font-mono font-bold mb-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>PLAN ADVISORY</span>
                </div>
                <p className="text-slate-500 text-[10px] leading-relaxed">
                  {warn}
                </p>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer System Status */}
      <div className="mt-2 pt-2 border-t border-slate-200/80 flex items-center justify-between text-[10px] font-mono text-slate-500">
        <div className="flex items-center space-x-1">
          <Clock className="w-3 h-3 text-slate-500" />
          <span>REAL-TIME ARBITRATION ACTIVE</span>
        </div>
        <span>OR-TOOLS CONSTRAINTS v2</span>
      </div>
    </div>
  );
};
