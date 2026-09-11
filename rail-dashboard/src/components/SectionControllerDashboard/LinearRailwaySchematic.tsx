import React, { useState } from 'react';
import { useAppSelector } from '../../store/hooks';
import { Train as TrainIcon, Wrench, MapPin, Zap } from 'lucide-react';

interface LinearRailwaySchematicProps {
  activeDirection: 'ALL' | 'UP' | 'DOWN';
  selectedTaskId: string | null;
  onSelectTask: (taskId: string | null) => void;
}

export const LinearRailwaySchematic: React.FC<LinearRailwaySchematicProps> = ({
  activeDirection,
  selectedTaskId,
  onSelectTask,
}) => {
  const corridors = useAppSelector((s) => s.corridors.corridors);
  const selectedCId = useAppSelector((s) => s.corridors.selectedCorridorId);
  const selectedCorridor = corridors.find((c) => c.id === selectedCId) || corridors[0];

  const trains = useAppSelector((s) => s.trainSchedule.trains);
  const pendingTasks = useAppSelector((s) => s.maintenanceTasks.pendingTasks);
  const activePlan = useAppSelector((s) => s.plans.activePlan);

  const [hoveredEntity, setHoveredEntity] = useState<{
    type: 'STATION' | 'TRAIN' | 'BLOCK' | 'SECTION';
    title: string;
    details: string;
    metrics?: string;
    x: number;
    y: number;
  } | null>(null);

  const totalLengthKm = Number(selectedCorridor?.lengthKm || 440);
  const startStation = selectedCorridor?.startStation || 'Origin (NDLS)';
  const endStation = selectedCorridor?.endStation || 'Terminus (CNB)';

  // Build synthetic intermediate stations along the corridor
  const stations = [
    { id: 'stn-0', name: startStation, km: 0, x: 80 },
    { id: 'stn-1', name: 'Aligarh Jn', km: Math.round(totalLengthKm * 0.28), x: 300 },
    { id: 'stn-2', name: 'Tundla Jn (Crossover)', km: Math.round(totalLengthKm * 0.46), x: 500 },
    { id: 'stn-3', name: 'Etawah Jn', km: Math.round(totalLengthKm * 0.70), x: 720 },
    { id: 'stn-4', name: endStation, km: totalLengthKm, x: 920 },
  ];

  // Helper to convert KM coordinate into SVG X coordinate
  const kmToX = (km: number) => {
    const clamped = Math.max(0, Math.min(totalLengthKm, km));
    return 80 + (clamped / totalLengthKm) * 840;
  };

  // Scheduled and pending blocks to render on track
  const planTasks = (activePlan?.tasks && activePlan.tasks.length > 0)
    ? activePlan.tasks
    : (activePlan?.assignedTasks && activePlan.assignedTasks.length > 0 ? activePlan.assignedTasks : []);

  const scheduledTaskMap = new Map();
  planTasks.forEach((pt: any) => {
    scheduledTaskMap.set(pt.maintenance_task_id || pt.maintenanceTaskId || pt.id, pt);
  });

  const allTasks = [...planTasks, ...pendingTasks];

  // Active trains (filter by activeDirection if requested)
  const activeTrains = trains.filter((t) => {
    if (activeDirection === 'UP' && t.direction === 'DOWN') return false;
    if (activeDirection === 'DOWN' && t.direction === 'UP') return false;
    return t.status !== 'COMPLETED' && t.status !== 'CANCELLED';
  });

  return (
    <div className="w-full bg-white border border-slate-200 rounded-lg p-4 relative shadow-sm overflow-hidden select-none">
      {/* HEADER CONTROLS & LEGEND */}
      <div className="flex items-center justify-between mb-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            Linear Track Schematic Topology
          </span>
          <span className="text-slate-500 font-mono text-[11px]">
            [{startStation} KM 0.0 → {endStation} KM {totalLengthKm}.0]
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-rose-600 inline-block" />
            <span>Possession Block</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-amber-500 inline-block border border-dashed border-amber-300" />
            <span>Staging / Prepared</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />
            <span>Passenger</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
            <span>Freight</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap size={11} className="text-blue-400" />
            <span>25kV OHE Active</span>
          </div>
        </div>
      </div>

      {/* SVG SCHEMATIC CANVAS */}
      <div className="relative w-full overflow-x-auto">
        <svg viewBox="0 0 1000 170" className="w-full min-w-[900px] h-44" preserveAspectRatio="xMidYMid meet">
          <defs>
            {/* Striped Pattern for Crew Staging / Preparation Blocks */}
            <pattern id="stagingStripe" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="8" stroke="#f59e0b" strokeWidth="4" />
              <line x1="4" y1="0" x2="4" y2="8" stroke="#78350f" strokeWidth="4" />
            </pattern>

            {/* Glowing filter for selected block */}
            <filter id="selectionGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* ================================================================= */}
          {/* TRACK 1: UP MAIN LINE (TOP TRACK, Y = 60) */}
          {/* ================================================================= */}
          {(activeDirection === 'ALL' || activeDirection === 'UP') && (
            <g id="up-line-group">
              <text x="30" y="64" fill="#94a3b8" fontSize="10" fontWeight="bold" fontFamily="monospace">
                UP MAIN
              </text>
              {/* Base ballast line */}
              <line x1="80" y1="60" x2="920" y2="60" stroke="#334155" strokeWidth="8" strokeLinecap="round" />
              {/* Sleepers */}
              <line x1="80" y1="60" x2="920" y2="60" stroke="#64748b" strokeWidth="2" strokeDasharray="5 4" />

              {/* Direction arrow */}
              <path d="M 880 54 L 890 60 L 880 66 Z" fill="#64748b" />
            </g>
          )}

          {/* ================================================================= */}
          {/* TRACK 2: DOWN MAIN LINE (BOTTOM TRACK, Y = 110) */}
          {/* ================================================================= */}
          {(activeDirection === 'ALL' || activeDirection === 'DOWN') && (
            <g id="down-line-group">
              <text x="14" y="114" fill="#94a3b8" fontSize="10" fontWeight="bold" fontFamily="monospace">
                DOWN MAIN
              </text>
              {/* Base ballast line */}
              <line x1="80" y1="110" x2="920" y2="110" stroke="#334155" strokeWidth="8" strokeLinecap="round" />
              {/* Sleepers */}
              <line x1="80" y1="110" x2="920" y2="110" stroke="#64748b" strokeWidth="2" strokeDasharray="5 4" />

              {/* Direction arrow (Opposite) */}
              <path d="M 120 104 L 110 110 L 120 116 Z" fill="#64748b" />
            </g>
          )}

          {/* ================================================================= */}
          {/* CROSSOVERS / JUNCTION TURNOUTS (At Tundla Jn, X = 500) */}
          {/* ================================================================= */}
          <g id="crossovers" opacity="0.8">
            <line x1="470" y1="60" x2="530" y2="110" stroke="#475569" strokeWidth="3" strokeDasharray="3 3" />
            <line x1="470" y1="110" x2="530" y2="60" stroke="#475569" strokeWidth="3" strokeDasharray="3 3" />
            <text x="500" y="88" fill="#64748b" fontSize="8" textAnchor="middle" fontFamily="monospace">
              UNIVERSAL CROSSOVER
            </text>
          </g>

          {/* ================================================================= */}
          {/* ACTIVE & SCHEDULED MAINTENANCE BLOCK OVERLAYS */}
          {/* ================================================================= */}
          {allTasks.map((t, idx) => {
            const startKm = t.start_kilometer ?? t.asset?.start_kilometer ?? (idx * 50 + 40);
            const endKm = t.end_kilometer ?? t.asset?.end_kilometer ?? (startKm + 8);
            const x1 = kmToX(startKm);
            const x2 = kmToX(endKm);
            const width = Math.max(24, x2 - x1);

            const isScheduled = t.status === 'SCHEDULED' || scheduledTaskMap.has(t.id) || scheduledTaskMap.has(t.maintenance_task_id);
            const isStaging = t.status === 'PLANNING' || t.status === 'INCOMING';
            const isSelected = selectedTaskId === t.id || selectedTaskId === t.maintenance_task_id;

            // Determine track line based on line_designation or index
            const isUp = (t.line_designation || '').includes('UP') || idx % 2 === 0;
            if (activeDirection === 'UP' && !isUp) return null;
            if (activeDirection === 'DOWN' && isUp) return null;

            const trackY = isUp ? 60 : 110;

            let fillColor = '#ef4444'; // Red = Blocked/Possession
            if (isStaging) fillColor = 'url(#stagingStripe)';
            if (t.status === 'COMPLETED') fillColor = '#10b981';

            const displayTitle = t.task_title || t.title || t.task_code || 'Track Possession Block';
            const displayCode = t.task_code || t.code || '';
            const dept = t.department || t.department_code || 'ENGG';

            return (
              <g
                key={`block-${t.id || idx}`}
                className="cursor-pointer transition-all duration-150"
                onClick={() => onSelectTask(isSelected ? null : (t.maintenance_task_id || t.id))}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoveredEntity({
                    type: 'BLOCK',
                    title: `Block: ${displayCode} - ${displayTitle}`,
                    details: `${dept} | ${t.maintenance_type || 'MAINTENANCE'} | KM ${startKm}-${endKm}`,
                    metrics: `Duration: ${t.duration_minutes || 120}m | Status: ${isScheduled ? 'SCHEDULED (LOCKED)' : t.status}`,
                    x: rect.left + rect.width / 2,
                    y: rect.top - 10,
                  });
                }}
                onMouseLeave={() => setHoveredEntity(null)}
              >
                {/* Highlight Glow if selected */}
                {isSelected && (
                  <rect
                    x={x1 - 2}
                    y={trackY - 10}
                    width={width + 4}
                    height={20}
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth="3"
                    filter="url(#selectionGlow)"
                    rx="4"
                  />
                )}

                {/* Block occupation bar */}
                <rect
                  x={x1}
                  y={trackY - 6}
                  width={width}
                  height={12}
                  fill={fillColor}
                  stroke={isSelected ? '#c084fc' : (isScheduled ? '#b91c1c' : '#d97706')}
                  strokeWidth="1.5"
                  rx="3"
                  opacity={isSelected ? 1 : 0.9}
                />

                {/* Block Task Code text */}
                <text
                  x={x1 + width / 2}
                  y={trackY + 3}
                  fill="#ffffff"
                  fontSize="8"
                  fontWeight="bold"
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  {t.department}
                </text>

                {/* Warning badge if power block required */}
                {t.power_block_required && (
                  <circle cx={x1 + width - 4} cy={trackY - 4} r="3" fill="#38bdf8" />
                )}
              </g>
            );
          })}

          {/* ================================================================= */}
          {/* LIVE TRAIN GLYPHS */}
          {/* ================================================================= */}
          {activeTrains.map((trn, idx) => {
            // Compute x position along the corridor
            const progress = ((idx + 1) * 0.17) % 1.0;
            const km = Math.round(progress * totalLengthKm);
            const xPos = kmToX(km);
            const isUp = trn.direction === 'UP' || idx % 2 === 0;
            const yPos = isUp ? 60 : 110;
            const trainNum = trn.number || trn.train_number || String(trn.id || idx);
            const trainType = trn.type || trn.train_type || 'EXPRESS';
            const isFreight = trainType.toUpperCase().includes('FREIGHT') || trainType.toUpperCase().includes('GOODS');

            return (
              <g
                key={`train-${trn.id || idx}`}
                className="cursor-pointer group"
                transform={`translate(${xPos}, ${yPos})`}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoveredEntity({
                    type: 'TRAIN',
                    title: `Train #${trainNum} (${trainType})`,
                    details: `Direction: ${isUp ? 'UP' : 'DOWN'} | Current KM: ${km}`,
                    metrics: `Speed: ${isFreight ? '75 km/h' : '110 km/h'} | Status: ${trn.status}`,
                    x: rect.left + 15,
                    y: rect.top - 10,
                  });
                }}
                onMouseLeave={() => setHoveredEntity(null)}
              >
                {/* Direction indicator triangle */}
                <polygon
                  points={isUp ? '12,0 0,-7 0,7' : '-12,0 0,-7 0,7'}
                  fill={isFreight ? '#f59e0b' : '#38bdf8'}
                />

                {/* Train body pill */}
                <rect
                  x={isUp ? -24 : -6}
                  y="-8"
                  width="30"
                  height="16"
                  rx="3"
                  fill={isFreight ? '#78350f' : '#0369a1'}
                  stroke={isFreight ? '#f59e0b' : '#38bdf8'}
                  strokeWidth="1.5"
                />

                {/* Train Number Label */}
                <text
                  x={isUp ? -9 : 9}
                  y="3"
                  fill="#ffffff"
                  fontSize="7"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {String(trainNum).slice(0, 5)}
                </text>
              </g>
            );
          })}

          {/* ================================================================= */}
          {/* STATIONS & JUNCTION NODES */}
          {/* ================================================================= */}
          {stations.map((stn) => (
            <g
              key={stn.id}
              className="cursor-pointer hover:opacity-100"
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoveredEntity({
                  type: 'STATION',
                  title: `${stn.name} (KM ${stn.km}.0)`,
                  details: 'Major Interlocking & Crossover Node',
                  metrics: 'Interlocked Route: 25kV OHE Active',
                  x: rect.left,
                  y: rect.top - 10,
                });
              }}
              onMouseLeave={() => setHoveredEntity(null)}
            >
              {/* Station vertical datum line */}
              <line x1={stn.x} y1="40" x2={stn.x} y2="130" stroke="#475569" strokeWidth="1" strokeDasharray="2 2" />

              {/* Station node dot */}
              <circle cx={stn.x} cy="60" r="5" fill="#f8fafc" stroke="#0284c7" strokeWidth="2.5" />
              <circle cx={stn.x} cy="110" r="5" fill="#f8fafc" stroke="#0284c7" strokeWidth="2.5" />

              {/* Station Name Badge */}
              <rect x={stn.x - 45} y="15" width="90" height="18" rx="3" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
              <text x={stn.x} y="27" fill="#334155" fontSize="9" fontWeight="bold" textAnchor="middle">
                {stn.name}
              </text>

              {/* KM marker */}
              <text x={stn.x} y="145" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">
                KM {stn.km}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* FLOATING INSPECTION TOOLTIP */}
      {hoveredEntity && (
        <div
          className="fixed pointer-events-none z-50 px-3 py-2 rounded bg-slate-50/95 border border-slate-300 shadow-2xl text-slate-900 text-xs backdrop-blur max-w-xs transition-opacity"
          style={{ left: Math.min(window.innerWidth - 240, hoveredEntity.x - 80), top: hoveredEntity.y - 65 }}
        >
          <div className="font-bold text-sky-400 flex items-center gap-1.5">
            {hoveredEntity.type === 'TRAIN' && <TrainIcon size={12} />}
            {hoveredEntity.type === 'BLOCK' && <Wrench size={12} />}
            {hoveredEntity.type === 'STATION' && <MapPin size={12} />}
            {hoveredEntity.title}
          </div>
          <div className="text-[11px] text-slate-700 mt-0.5">{hoveredEntity.details}</div>
          {hoveredEntity.metrics && (
            <div className="text-[10px] text-emerald-400 font-mono mt-1 pt-1 border-t border-slate-200">
              {hoveredEntity.metrics}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
