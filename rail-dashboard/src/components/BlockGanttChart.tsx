import React, { useEffect, useRef } from 'react';
import { gantt } from 'dhtmlx-gantt';
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { updateBlockTime } from '../store/maintenanceBlockSlice';

// Department → color palette
const DEPT_COLORS: Record<string, { bar: string; label: string }> = {
  Engineering:   { bar: '#f59e0b', label: '#78350f' },
  OHE:           { bar: '#3b82f6', label: '#1e3a8a' },
  Signal:        { bar: '#a855f7', label: '#4a044e' },
  Track:         { bar: '#ec4899', label: '#831843' },
  Civil:         { bar: '#14b8a6', label: '#134e4a' },
  // API department codes
  ENGG:          { bar: '#f59e0b', label: '#78350f' },
  SNT:           { bar: '#a855f7', label: '#4a044e' },
  TRD:           { bar: '#3b82f6', label: '#1e3a8a' },
};

/** Returns today's date string in YYYY-MM-DD format (local time). */
function getTodayStr(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const dd   = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fromGanttDate(d: Date): string {
  return gantt.date.date_to_str('%Y-%m-%dT%H:%i:%s')(d);
}

export const BlockGanttChart: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dispatch = useAppDispatch();
  const blocks = useAppSelector(s => s.maintenanceBlock.blocks);
  const tasks  = useAppSelector(s => s.maintenanceTasks.tasks);
  const trains = useAppSelector(s => s.trainSchedule.trains);

  // Configure and init gantt once
  useEffect(() => {
    if (!containerRef.current) return;

    // ── Light skin overrides via inline CSS injection ──────────────────────────
    const styleId = 'gantt-custom-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        /* Gantt container */
        .gantt_container { background: #ffffff; color: #334155; font-family: 'Inter', sans-serif; border: none !important; }
        .gantt_grid { background: #ffffff; border-right: 1px solid #e2e8f5 !important; }
        .gantt_grid_scale, .gantt_task_scale { background: #f8fafd; color: #64748b; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; border-bottom: 1px solid #e2e8f5 !important; }
        .gantt_grid_head_cell { color: #64748b; border-right: 1px solid #e2e8f5 !important; text-transform: uppercase; font-size: 10px; letter-spacing: 0.06em; }
        .gantt_row, .gantt_row.odd { background: #ffffff; border-bottom: 1px solid #f0f4fb !important; }
        .gantt_row:hover, .gantt_row.odd:hover { background: #f8fafd; }
        .gantt_cell { color: #475569; font-size: 12px; font-weight: 500; border-right: 1px solid #f0f4fb !important; }
        .gantt_task_bg { background: #ffffff; }
        .gantt_task_row, .gantt_task_row.odd { background: transparent; border-bottom: 1px solid #f0f4fb !important; }
        .gantt_task_row:hover, .gantt_task_row.odd:hover { background: #f8fafd; }
        .gantt_line_wrapper div { background: transparent !important; }
        .gantt_task_vscroll { background: #ffffff; }
        .gantt_ver_scroll { background: #f0f4fb; }
        .gantt_hor_scroll { background: #f0f4fb; }
        /* Task bars */
        .gantt_task_content { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: #fff; }
        .gantt_task_line { border-radius: 6px !important; box-shadow: 0 2px 6px rgba(0,0,0,0.12); }
        /* Train strips — thin, semi-transparent */
        .train-strip { border-radius: 3px !important; opacity: 0.7; height: 7px !important; margin-top: 14px !important; }
        .train-strip .gantt_task_content { display: none; }
        /* Resize handle */
        .gantt_task_drag { background: rgba(255,255,255,0.4) !important; }
        /* Today line */
        .gantt_today { background: rgba(37,99,235,0.06) !important; }
        /* Time scale alternating columns */
        .gantt_task_scale .gantt_scale_cell { border-right: 1px solid #e2e8f5 !important; }
        /* Scrollbar */
        .gantt_container ::-webkit-scrollbar { width: 5px; height: 5px; }
        .gantt_container ::-webkit-scrollbar-track { background: #f8fafd; }
        .gantt_container ::-webkit-scrollbar-thumb { background: #cdd5e8; border-radius: 3px; }
        /* Section/project rows */
        .gantt_row.gantt_row_project { background: #eff6ff !important; border-bottom: 1px solid #dbeafe !important; }
        .gantt_row.gantt_row_project .gantt_cell { color: #2563eb !important; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
        .gantt_task_row.gantt_row_project { background: #eff6ff !important; border-bottom: 1px solid #dbeafe !important; }
        .gantt_task_line.gantt_project { display: none; }
        /* Empty state */
        .gantt_empty_state { display: flex; align-items: center; justify-content: center; height: 100%; color: #94a3b8; font-size: 13px; }
      `;
      document.head.appendChild(style);
    }

    const today = getTodayStr();

    // ── Scale configuration ────────────────────────────────────────────────────
    gantt.config.scales = [
      { unit: 'hour', step: 1, format: '%H:00' },
    ];
    gantt.config.scale_height = 36;
    gantt.config.row_height = 36;
    gantt.config.start_date = new Date(`${today}T00:00:00`);
    gantt.config.end_date   = new Date(`${today}T24:00:00`);
    gantt.config.date_format = '%Y-%m-%dT%H:%i:%s';

    // ── Layout & columns ──────────────────────────────────────────────────────
    gantt.config.grid_width = 200;
    gantt.config.columns = [
      { name: 'text', label: 'Department / Train', tree: true, width: 200 },
    ];

    // ── Interaction permissions ───────────────────────────────────────────────
    gantt.config.drag_move   = true;
    gantt.config.drag_resize = true;
    gantt.config.drag_links  = false;
    gantt.config.details_on_dblclick = false;
    gantt.config.drag_progress = false;

    // ── Custom task color callback ─────────────────────────────────────────────
    gantt.templates.task_class = (_start: Date, _end: Date, task: any) => {
      if (task.type === 'train') return 'train-strip';
      return '';
    };
    gantt.templates.task_text = (_start: Date, _end: Date, task: any) => {
      if (task.type === 'train') return '';
      return task.dept ?? task.text;
    };

    gantt.init(containerRef.current);

    // ── Drag/Resize → Redux sync ───────────────────────────────────────────────
    const dragEvent = gantt.attachEvent('onAfterTaskDrag', (id: string) => {
      const task = gantt.getTask(id);
      if (task.type === 'train' || (task as any).readonly) return;
      const startDate = task.start_date as Date | undefined;
      const endDate   = task.end_date   as Date | undefined;
      if (!startDate || !endDate) return;
      dispatch(updateBlockTime({
        id: String(id),
        start_time: fromGanttDate(startDate),
        end_time:   fromGanttDate(endDate),
      }));
    });

    // Prevent dragging readonly tasks (trains + APPROVED blocks)
    const permEvent = gantt.attachEvent('onBeforeTaskDrag', (id: string) => {
      const task = gantt.getTask(id);
      return !(task.type === 'train' || task.readonly);
    });

    return () => {
      gantt.detachEvent(dragEvent);
      gantt.detachEvent(permEvent);
      gantt.clearAll();
    };
  }, []);

  // Re-parse data when Redux state changes
  useEffect(() => {
    const today = getTodayStr();

    // ── Collect unique section keys from real API data ─────────────────────────
    // Use maintenanceTasks (from API) as the source of truth for grouping
    const sectionMap = new Map<string, string>();

    // From maintenance tasks: group by department_code as "section"
    tasks.forEach(t => {
      const deptKey = `dept-${t.department}`;
      sectionMap.set(deptKey, t.department);
    });

    // From local blocks: group by section_id
    blocks.forEach(b => {
      if (!sectionMap.has(b.section_id)) {
        sectionMap.set(b.section_id, b.section_id.replace(/-/g, ' → ').toUpperCase());
      }
    });

    // From trains: group by section_id
    trains.forEach(t => {
      if (!sectionMap.has(t.section_id)) {
        sectionMap.set(t.section_id, `Section ${t.section_id.replace('sec-', '').replace(/-/g, ' → ').toUpperCase()}`);
      }
    });

    // If no real data yet, show a placeholder row
    if (sectionMap.size === 0) {
      gantt.clearAll();
      gantt.parse({ data: [], links: [] });
      return;
    }

    // ── Project rows (one per section/department) ──────────────────────────────
    const projectTasks = Array.from(sectionMap.entries()).map(([key, label], i) => ({
      id: `proj-${key}`,
      text: label,
      type: gantt.config.types.project as string,
      open: true,
      start_date: `${today} 00:00`,
      end_date:   `${today} 23:59`,
      sortorder: i,
    }));

    // ── Maintenance tasks from API ──────────────────────────────────────────────
    const taskBars = tasks
      .filter(t => t.status !== 'COMPLETED' && t.status !== 'DEFERRED')
      .map(t => {
        const dept = t.department ?? 'Engineering';
        const palette = DEPT_COLORS[dept] ?? { bar: '#64748b', label: '#1e293b' };
        // Duration: default 2 hours from now if no scheduled window
        const now = new Date();
        const startStr = `${today} ${String(now.getHours()).padStart(2, '0')}:00`;
        const endHour  = Math.min(now.getHours() + Math.ceil((t.estimatedDurationMinutes ?? 120) / 60), 23);
        const endStr   = `${today} ${String(endHour).padStart(2, '0')}:00`;
        return {
          id: t.id,
          text: t.title ?? dept,
          dept,
          parent: `proj-dept-${dept}`,
          start_date: startStr,
          end_date:   endStr,
          color: palette.bar,
          textColor: palette.label,
          readonly: t.status === 'IN_PROGRESS',
          type: 'block',
        } as any;
      });

    // ── Draggable local blocks (from maintenanceBlockSlice) ────────────────────
    const blockBars = blocks.map(b => {
      const palette = DEPT_COLORS[b.department] ?? { bar: '#64748b', label: '#1e293b' };
      // Normalize dates to today if they came from old seed data
      const normalizeDate = (dt: string) => {
        if (!dt) return `${today} 00:00`;
        const d = new Date(dt);
        return isNaN(d.getTime())
          ? `${today} 00:00`
          : `${today} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      };
      return {
        id: b.id,
        text: b.department,
        dept: b.department,
        parent: `proj-${b.section_id}`,
        start_date: normalizeDate(b.start_time),
        end_date:   normalizeDate(b.end_time),
        color: palette.bar,
        textColor: palette.label,
        readonly: b.status === 'APPROVED',
        type: 'block',
      } as any;
    });

    // ── Train strips ───────────────────────────────────────────────────────────
    const trainBars = trains.map(t => {
      const normalizeDate = (dt: string) => {
        if (!dt) return `${today} 00:00`;
        const d = new Date(dt);
        return isNaN(d.getTime())
          ? `${today} 00:00`
          : `${today} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      };
      return {
        id: t.id,
        text: `${t.number} (${t.type})`,
        parent: `proj-${t.section_id}`,
        start_date: normalizeDate(t.entry_time),
        end_date:   normalizeDate(t.exit_time),
        color: t.status === 'DELAYED' || t.status === 'REGULATED' ? '#ef4444' : '#64748b',
        type: 'train',
        readonly: true,
      } as any;
    });

    gantt.clearAll();
    gantt.parse({
      data: [...projectTasks, ...taskBars, ...blockBars, ...trainBars] as any[],
      links: [],
    });
  }, [blocks, tasks, trains]);

  return (
    <div className="w-full h-full rounded-b-xl overflow-hidden" ref={containerRef} />
  );
};


