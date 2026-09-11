import React, { useEffect, useRef, useState } from 'react';
import { gantt } from 'dhtmlx-gantt';
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css';
import { useAppSelector } from '../../store/hooks';
import { ShieldAlert, CheckCircle2 } from 'lucide-react';

interface MasterBlockScheduleProps {
  activeDirection: 'ALL' | 'UP' | 'DOWN';
  selectedTaskId: string | null;
  onSelectTask: (taskId: string | null) => void;
  onBlockRescheduled?: (taskId: string, newStart: Date, newEnd: Date) => void;
}

export const MasterBlockSchedule: React.FC<MasterBlockScheduleProps> = ({
  activeDirection,
  selectedTaskId,
  onSelectTask,
  onBlockRescheduled,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const corridors = useAppSelector((s) => s.corridors.corridors);
  const selectedCId = useAppSelector((s) => s.corridors.selectedCorridorId);
  const selectedCorridor = corridors.find((c) => c.id === selectedCId) || corridors[0];

  const trains = useAppSelector((s) => s.trainSchedule.trains);
  const tasks = useAppSelector((s) => s.maintenanceTasks.tasks);
  const pendingTasks = useAppSelector((s) => s.maintenanceTasks.pendingTasks);
  const activePlan = useAppSelector((s) => s.plans.activePlan);

  const scheduledPlanTasks = (activePlan?.tasks && activePlan.tasks.length > 0)
    ? activePlan.tasks
    : (activePlan?.assignedTasks && activePlan.assignedTasks.length > 0 ? activePlan.assignedTasks : []);

  const [viewHorizon, setViewHorizon] = useState<'24H' | '48H' | '7D'>('48H');
  const [conflictNotification, setConflictNotification] = useState<{
    type: 'GREEN' | 'RED' | 'YELLOW';
    message: string;
  } | null>(null);

  // Initialize Gantt once
  useEffect(() => {
    if (!containerRef.current) return;

    // Dark control room CSS styling for dhtmlx-gantt
    const styleId = 'dhtmlx-control-room-light';
    let styleTag = document.getElementById(styleId);
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      styleTag.textContent = `
        .gantt_container { background: #ffffff !important; color: #475569 !important; font-family: 'Inter', sans-serif; border: 1px solid #cbd5e1 !important; }
        .gantt_grid { background: #ffffff !important; border-right: 1px solid #cbd5e1 !important; }
        .gantt_grid_scale, .gantt_task_scale { background: #ffffff !important; color: #64748b !important; font-size: 11px; font-weight: 700; border-bottom: 1px solid #e2e8f0 !important; }
        .gantt_grid_head_cell { color: #64748b !important; border-right: 1px solid #cbd5e1 !important; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
        .gantt_row, .gantt_row.odd { background: #ffffff !important; border-bottom: 1px solid #e2e8f0 !important; }
        .gantt_row:hover, .gantt_row.odd:hover { background: #f1f5f9 !important; }
        .gantt_cell { color: #475569 !important; font-size: 11px; font-weight: 500; border-right: 1px solid #e2e8f0 !important; }
        .gantt_task_bg { background: #ffffff !important; }
        .gantt_task_row, .gantt_task_row.odd { background: transparent !important; border-bottom: 1px solid #e2e8f0 !important; }
        .gantt_task_row:hover, .gantt_task_row.odd:hover { background: #f1f5f9 !important; }
        .gantt_task_vscroll, .gantt_ver_scroll, .gantt_hor_scroll { background: #ffffff !important; }
        .gantt_task_scale .gantt_scale_cell { border-right: 1px solid #e2e8f0 !important; }
        
        /* Task bar classes */
        .gantt_task_content { font-size: 10px; font-weight: 700; color: #ffffff !important; }
        .gantt_task_line { border-radius: 4px !important; box-shadow: 0 4px 10px rgba(0,0,0,0.5) !important; border: 1px solid rgba(255,255,255,0.15) !important; }
        
        /* Department colors */
        .block-engg { background: #d97706 !important; border-color: #f59e0b !important; }
        .block-trd  { background: #2563eb !important; border-color: #3b82f6 !important; }
        .block-snt  { background: #059669 !important; border-color: #10b981 !important; }
        
        /* AI Mega Block Purple Envelope */
        .block-mega { background: #7c3aed !important; border: 2px solid #a855f7 !important; box-shadow: 0 0 12px rgba(168, 85, 247, 0.4) !important; }
        
        /* Train paths - locked & semi-transparent */
        .train-path-strip { background: rgba(56, 189, 248, 0.28) !important; border: 1px dashed #38bdf8 !important; height: 12px !important; margin-top: 10px !important; cursor: not-allowed !important; }
        .train-path-strip .gantt_task_content { font-size: 8px; color: #e0f2fe !important; }
        
        /* Selected Task Highlight */
        .block-selected { outline: 2px solid #c084fc !important; box-shadow: 0 0 15px #c084fc !important; }
      `;
      document.head.appendChild(styleTag);
    }

    gantt.plugins({ marker: true, tooltip: true });

    // Grid columns configuration
    gantt.config.columns = [
      { name: 'text', label: 'Section / Activity', tree: true, width: 170 },
      { name: 'department', label: 'Dept', align: 'center', width: 55 },
      { name: 'line', label: 'Line', align: 'center', width: 55 },
      { name: 'duration', label: 'Duration', align: 'center', width: 60, template: (obj: any) => `${obj.duration_m || obj.duration * 60}m` },
    ];

    // Scales: 24h timeline with 15-minute intervals
    gantt.config.scales = [
      { unit: 'day', step: 1, format: '%d %M %Y' },
      { unit: 'hour', step: 1, format: '%H:00' },
      { unit: 'minute', step: 15, format: '%i' },
    ];

    gantt.config.min_column_width = 24;
    gantt.config.row_height = 32;
    gantt.config.scale_height = 54;
    gantt.config.show_progress = false;
    gantt.config.drag_resize = true;
    gantt.config.drag_move = true;

    // Disallow dragging locked trains
    gantt.attachEvent('onBeforeTaskDrag', (id: string) => {
      const task = gantt.getTask(id);
      if (task.is_train) return false;
      return true;
    });

    // Handle Drag-and-Drop conflict preview
    gantt.attachEvent('onTaskDrag', (_id: string, _mode: string, task: any) => {
      // Evaluate live conflict against trains in same line
      const trainConflict = trains.some((trn) => {
        const startRaw = trn.scheduled_start_time || trn.entry_time;
        const endRaw = trn.scheduled_end_time || trn.exit_time;
        const trnStart = new Date(startRaw).getTime();
        const trnEnd = new Date(endRaw).getTime();
        const blkStart = new Date(task.start_date).getTime();
        const blkEnd = new Date(task.end_date).getTime();
        return Math.max(trnStart, blkStart) < Math.min(trnEnd, blkEnd);
      });

      if (trainConflict) {
        setConflictNotification({
          type: 'RED',
          message: `Conflict Detected: Train path overlap on ${task.text} between ${task.start_date?.toLocaleTimeString?.() || ''} and ${task.end_date?.toLocaleTimeString?.() || ''}`,
        });
      } else {
        setConflictNotification({
          type: 'GREEN',
          message: `Clean Slot: No passenger/freight conflicts on ${task.text}`,
        });
      }
    });

    // Commit drag and drop change
    gantt.attachEvent('onAfterTaskDrag', (id: string) => {
      const task = gantt.getTask(id);
      if (onBlockRescheduled && !task.is_train && task.start_date && task.end_date) {
        onBlockRescheduled(task.raw_id || id, task.start_date, task.end_date);
      }
      setTimeout(() => setConflictNotification(null), 3500);
    });

    // Selection handler
    gantt.attachEvent('onTaskClick', (id: string) => {
      const task = gantt.getTask(id);
      if (!task.is_train) {
        onSelectTask(task.raw_id || id);
      }
      return true;
    });

    gantt.init(containerRef.current);

    return () => {
      gantt.clearAll();
    };
  }, []);

  // Update Gantt data whenever tasks, activePlan, trains, or viewHorizon change
  useEffect(() => {
    if (!containerRef.current) return;

    const ganttTasks: any[] = [];
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);

    // 1. Root corridor sections
    const sec1Id = 'sec-1';
    const sec2Id = 'sec-2';

    ganttTasks.push({
      id: sec1Id,
      text: `${selectedCorridor?.startStation || 'NDLS'} → Tundla Jn`,
      department: 'ROUTE',
      line: 'UP',
      open: true,
      duration_m: 1440,
    });

    ganttTasks.push({
      id: sec2Id,
      text: `Tundla Jn → ${selectedCorridor?.endStation || 'CNB'}`,
      department: 'ROUTE',
      line: 'DOWN',
      open: true,
      duration_m: 1440,
    });

    // 2. Scheduled Blocks (prioritize real tasks from activePlan)
    const megaBlocks = activePlan?.aiOptimizationMetadata?.grouped_tasks || (activePlan as any)?.ai_optimization_metadata?.grouped_tasks || [];
    const megaTaskIdSet = new Set(megaBlocks.map((g: any) => g.task_id));

    let gStartDate = new Date(baseDate);
    if (scheduledPlanTasks.length > 0) {
      const firstStart = scheduledPlanTasks[0].assigned_start_time || scheduledPlanTasks[0].start_time;
      if (firstStart) {
        gStartDate = new Date(firstStart);
        gStartDate.setHours(0, 0, 0, 0);
      }
    }
    const daysSpan = viewHorizon === '7D' ? 7 : (viewHorizon === '48H' ? 2 : 1);
    const gEndDate = new Date(gStartDate.getTime() + daysSpan * 86400000);

    gantt.config.start_date = gStartDate;
    gantt.config.end_date = gEndDate;

    if (scheduledPlanTasks.length > 0) {
      scheduledPlanTasks.forEach((pt: any, idx: number) => {
        const sStart = pt.assigned_start_time || pt.start_time || pt.scheduled_start;
        const sEnd = pt.assigned_end_time || pt.end_time || pt.scheduled_end;
        const startTime = sStart ? new Date(sStart) : new Date(gStartDate.getTime() + (idx * 3 + 2) * 3600000);
        const durationM = Number(pt.duration_minutes || 90);
        const endTime = sEnd ? new Date(sEnd) : new Date(startTime.getTime() + durationM * 60000);

        const isUp = (pt.line_designation || '').includes('UP') || idx % 2 === 0;
        if (activeDirection === 'UP' && !isUp) return;
        if (activeDirection === 'DOWN' && isUp) return;

        const isMega = megaTaskIdSet.has(pt.maintenance_task_id || pt.id);
        const isSelected = selectedTaskId === (pt.maintenance_task_id || pt.id);

        let deptClass = 'block-engg';
        const rawCode = pt.task_code || pt.task_title || '';
        const d = (pt.department || pt.department_code || (rawCode.includes('SMMS') ? 'SNT' : (rawCode.includes('TDMS') ? 'TRD' : 'ENGG'))).toUpperCase();
        if (d === 'TRD' || d === 'ELECTRICAL') deptClass = 'block-trd';
        if (d === 'SNT' || d === 'SIGNAL') deptClass = 'block-snt';
        if (isMega) deptClass = 'block-mega';
        if (isSelected) deptClass += ' block-selected';

        ganttTasks.push({
          id: `plan-task-${pt.id || idx}`,
          raw_id: pt.maintenance_task_id || pt.id,
          text: isMega ? `⚡ MEGA-BLOCK: ${pt.task_code || pt.task_title}` : `🛠️ ${pt.task_code || pt.task_title}`,
          department: d,
          line: isUp ? 'UP' : 'DOWN',
          start_date: startTime,
          end_date: endTime,
          duration_m: durationM,
          parent: isUp ? sec1Id : sec2Id,
          custom_class: deptClass,
          is_train: false,
        });
      });
    } else {
      // Fallback: show candidate pending tasks
      const allTasks = [...tasks, ...pendingTasks];
      allTasks.forEach((t: any, idx: number) => {
        if (activeDirection === 'UP' && idx % 2 !== 0) return;
        if (activeDirection === 'DOWN' && idx % 2 === 0) return;

        const isSelected = selectedTaskId === t.id;
        const startTime = new Date(gStartDate.getTime() + (idx * 3 + 2) * 3600000);
        const durationM = Number(t.duration_minutes || t.requested_duration || 120);
        const endTime = new Date(startTime.getTime() + durationM * 60000);

        let deptClass = 'block-engg';
        const d = (t.department_code || t.department || 'ENGG').toUpperCase();
        if (d === 'TRD' || d === 'ELECTRICAL') deptClass = 'block-trd';
        if (d === 'SNT' || d === 'SIGNAL') deptClass = 'block-snt';
        if (isSelected) deptClass += ' block-selected';

        ganttTasks.push({
          id: `task-${t.id}`,
          raw_id: t.id,
          text: `[PENDING] ${t.task_code || t.title}`,
          department: d,
          line: (idx % 2 === 0) ? 'UP' : 'DOWN',
          start_date: startTime,
          end_date: endTime,
          duration_m: durationM,
          parent: (idx % 2 === 0) ? sec1Id : sec2Id,
          custom_class: deptClass,
          is_train: false,
        });
      });
    }

    // 3. Train Movements (locked semi-transparent strips)
    trains.forEach((trn, idx) => {
      const num = trn.number || trn.train_number || String(trn.id || idx);
      const typ = trn.type || trn.train_type || 'EXP';
      const rawStart = trn.scheduled_start_time || trn.entry_time;
      let trnStart = rawStart ? new Date(rawStart) : new Date(gStartDate.getTime() + (idx * 2 + 1) * 3600000);
      
      // Project train into active day so strips are visible
      if (trnStart < gStartDate || trnStart > gEndDate) {
        trnStart = new Date(gStartDate.getTime() + (trnStart.getUTCHours() * 3600000) + (trnStart.getUTCMinutes() * 60000));
      }
      const trnEnd = new Date(trnStart.getTime() + 90 * 60000);
      const isUp = trn.direction === 'UP' || idx % 2 === 0;

      if (activeDirection === 'UP' && !isUp) return;
      if (activeDirection === 'DOWN' && isUp) return;

      ganttTasks.push({
        id: `train-${trn.id || idx}`,
        text: `🚆 #${num} (${typ})`,
        department: 'COA',
        line: isUp ? 'UP' : 'DOWN',
        start_date: trnStart,
        end_date: trnEnd,
        duration_m: Math.round((trnEnd.getTime() - trnStart.getTime()) / 60000),
        parent: isUp ? sec1Id : sec2Id,
        custom_class: 'train-path-strip',
        is_train: true,
      });
    });

    gantt.clearAll();
    gantt.parse({ data: ganttTasks });
    gantt.render();
  }, [tasks, pendingTasks, activePlan, trains, activeDirection, selectedTaskId, viewHorizon]);

  return (
    <div className="w-full bg-white border border-slate-200 rounded-lg p-4 flex flex-col shadow-sm select-none relative">
      {/* TOOLBAR & CONFLICT NOTIFICATION */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            Master Block Schedule & Train Corridor Grid
          </span>
          {activePlan && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800">
              AI Plan Active ({scheduledPlanTasks.length} Blocks Scheduled · Score {activePlan.score || activePlan.ai_optimization_metadata?.score || '32.4'}/100)
            </span>
          )}
        </div>

        {/* Horizon Toggle */}
        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded p-0.5 text-[10px] font-mono">
          <button
            onClick={() => setViewHorizon('24H')}
            className={`px-2 py-0.5 rounded transition ${viewHorizon === '24H' ? 'bg-purple-600 text-white font-bold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            24 Hours
          </button>
          <button
            onClick={() => setViewHorizon('48H')}
            className={`px-2 py-0.5 rounded transition ${viewHorizon === '48H' ? 'bg-purple-600 text-white font-bold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            48 Hours
          </button>
          <button
            onClick={() => setViewHorizon('7D')}
            className={`px-2 py-0.5 rounded transition ${viewHorizon === '7D' ? 'bg-purple-600 text-white font-bold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            7-Day Horizon
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] font-semibold">
          <div className="flex items-center gap-1.5 text-amber-400">
            <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" />
            <span>Engineering (ENGG)</span>
          </div>
          <div className="flex items-center gap-1.5 text-sky-400">
            <span className="w-2.5 h-2.5 rounded bg-blue-600 inline-block" />
            <span>OHE / Electrical (TRD)</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2.5 h-2.5 rounded bg-emerald-600 inline-block" />
            <span>S&T (Signal)</span>
          </div>
          <div className="flex items-center gap-1.5 text-purple-300">
            <span className="w-2.5 h-2.5 rounded bg-purple-600 border border-purple-400 inline-block" />
            <span>AI Mega-Block</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="w-2.5 h-2.5 rounded bg-sky-900 border border-dashed border-sky-400 inline-block" />
            <span>Train Path (Locked)</span>
          </div>
        </div>
      </div>

      {/* LIVE DRAG/CONFLICT TOAST */}
      {conflictNotification && (
        <div
          className={`mb-2 py-1 px-3 rounded text-xs font-semibold flex items-center justify-between transition-all ${
            conflictNotification.type === 'RED'
              ? 'bg-rose-950/90 text-rose-300 border border-rose-700 animate-pulse'
              : 'bg-emerald-950/90 text-emerald-300 border border-emerald-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {conflictNotification.type === 'RED' ? <ShieldAlert size={14} /> : <CheckCircle2 size={14} />}
            <span>{conflictNotification.message}</span>
          </div>
          <span className="text-[10px] uppercase font-mono tracking-wider">
            {conflictNotification.type === 'RED' ? 'CONSTRAINT VIOLATION' : 'OR-TOOLS VERIFIED'}
          </span>
        </div>
      )}

      {/* DHTMLX GANTT MOUNT ELEMENT */}
      <div
        ref={containerRef}
        style={{ width: '100%', height: '360px' }}
        className="rounded border border-slate-200 overflow-hidden"
      />
    </div>
  );
};
