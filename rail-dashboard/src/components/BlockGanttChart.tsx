import React, { useEffect, useRef } from 'react';
import { gantt } from 'dhtmlx-gantt';
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { updateBlockTime } from '../store/maintenanceBlockSlice';

// Department → color palette
const DEPT_COLORS: Record<string, { bar: string; label: string }> = {
  Engineering: { bar: '#f59e0b', label: '#78350f' },
  OHE:         { bar: '#3b82f6', label: '#1e3a8a' },
  Signal:      { bar: '#a855f7', label: '#4a044e' },
  Track:       { bar: '#ec4899', label: '#831843' },
  Civil:       { bar: '#14b8a6', label: '#134e4a' },
};

const SECTION_LABELS: Record<string, string> = {
  'sec-a-b': 'Section A → B',
  'sec-b-c': 'Section B → C',
  'sec-c-d': 'Section C → D',
  'sec-d-e': 'Section D → E',
};

const TODAY = '2024-01-01';

function fromGanttDate(d: Date): string {
  return gantt.date.date_to_str('%Y-%m-%dT%H:%i:%s')(d);
}

export const BlockGanttChart: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dispatch = useAppDispatch();
  const blocks = useAppSelector(s => s.maintenanceBlock.blocks);
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
      `;
      document.head.appendChild(style);
    }

    // ── Scale configuration ────────────────────────────────────────────────────
    gantt.config.scales = [
      { unit: 'hour', step: 1, format: '%H:00' },
    ];
    gantt.config.scale_height = 36;
    gantt.config.row_height = 36;
    gantt.config.start_date = new Date(`${TODAY}T00:00:00`);
    gantt.config.end_date   = new Date(`${TODAY}T24:00:00`);
    gantt.config.date_format = '%Y-%m-%dT%H:%i:%s';

    // ── Layout & columns ──────────────────────────────────────────────────────
    gantt.config.grid_width = 180;
    gantt.config.columns = [
      { name: 'text', label: 'Track Section', tree: true, width: 180 },
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
    const SECTION_IDS = Object.keys(SECTION_LABELS);

    // Project rows (one per section) — use string dates to satisfy SerializedTask
    const projectTasks = SECTION_IDS.map((sectionId, i) => ({
      id: `proj-${sectionId}`,
      text: SECTION_LABELS[sectionId],
      type: gantt.config.types.project as string,
      open: true,
      start_date: `${TODAY} 00:00`,
      end_date:   `${TODAY} 23:59`,
      sortorder: i,
    }));

    // Maintenance block tasks
    const blockTasks = blocks.map(b => {
      const palette = DEPT_COLORS[b.department] ?? { bar: '#64748b', label: '#1e293b' };
      return {
        id: b.id,
        text: b.department,
        dept: b.department,
        parent: `proj-${b.section_id}`,
        start_date: b.start_time.replace('T', ' ').substring(0, 16),
        end_date:   b.end_time.replace('T', ' ').substring(0, 16),
        color: palette.bar,
        textColor: palette.label,
        readonly: b.status === 'APPROVED',
        type: 'block',
      } as any;
    });

    // Train strip tasks
    const trainTasks = trains.map(t => ({
      id: t.id,
      text: `${t.number} (${t.type})`,
      parent: `proj-${t.section_id}`,
      start_date: t.entry_time.replace('T', ' ').substring(0, 16),
      end_date:   t.exit_time.replace('T', ' ').substring(0, 16),
      color: t.status === 'DELAYED' ? '#ef4444' : '#64748b',
      type: 'train',
      readonly: true,
    } as any));

    gantt.clearAll();
    gantt.parse({
      data: [...projectTasks, ...blockTasks, ...trainTasks] as any[],
      links: [],
    });
  }, [blocks, trains]);

  return (
    <div className="w-full h-full rounded-b-xl overflow-hidden" ref={containerRef} />
  );
};
