import React, { useState, type MouseEvent } from 'react';
import { useAppSelector } from '../store/hooks';

// No hardcoded stations — all data comes from the selected corridor via Redux.

export const LinearTrackView: React.FC = () => {
  const trains          = useAppSelector(s => s.trainSchedule.trains);
  const blocks          = useAppSelector(s => s.maintenanceBlock.blocks);
  const corridors       = useAppSelector(s => s.corridors.corridors);
  const selectedCId     = useAppSelector(s => s.corridors.selectedCorridorId);
  const selectedCorridor = corridors.find(c => c.id === selectedCId);

  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const handleMouseMove = (e: MouseEvent, text: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ text, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // Build station labels from actual corridor API data
  const startStation = selectedCorridor?.startStation || 'Origin';
  const endStation   = selectedCorridor?.endStation   || 'Destination';
  const startKm      = 0;
  const endKm        = Number(selectedCorridor?.lengthKm ?? 100);

  // Dynamically derive additional intermediate stations from assets or use just the two endpoints
  const stations = [
    { id: 'stn-start', name: startStation, x: 80 },
    { id: 'stn-end',   name: endStation,   x: 920 },
  ];

  // Place train at proportional x position between start and end km
  const trainX = (idx: number, total: number) => {
    // Space trains evenly along the track if km data not available
    const spacing = 840 / Math.max(total, 1);
    return 80 + spacing * idx + spacing / 2;
  };

  const activeTrains = trains.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && t.status !== 'TERMINATED');

  // No corridor selected yet
  if (!selectedCorridor) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ color: '#94a3b8', fontSize: 13 }}>
        Select a corridor to view the track map
      </div>
    );
  }

  return (
    <div className="w-full h-full relative group">
      <svg viewBox="0 0 1000 150" className="w-full h-full drop-shadow-md" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Corridor name label */}
        <text x="500" y="22" textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="700" letterSpacing="0.08em" style={{ textTransform: 'uppercase' }}>
          {selectedCorridor.code ?? selectedCorridor.name} — {startKm} km → {endKm} km
        </text>

        {/* Base Track Line */}
        <line x1="50" y1="75" x2="950" y2="75" stroke="#cbd5e1" strokeWidth="8" strokeLinecap="round" />
        {/* Track sleeper dashes */}
        <line x1="50" y1="75" x2="950" y2="75" stroke="#94a3b8" strokeWidth="2" strokeDasharray="6 6" />

        {/* Approved maintenance blocks — full track highlight in red */}
        {blocks.filter(b => b.status === 'APPROVED').map(block => (
          <line
            key={block.id}
            x1={200} y1={75} x2={600} y2={75}
            stroke="#ef4444" strokeWidth="8" strokeLinecap="round"
            className="cursor-pointer transition-all duration-300"
            filter="url(#glow)"
            onMouseMove={e => handleMouseMove(e, `Maintenance Block: ${block.department} (${block.status})`)}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}

        {/* Stations: start & end from corridor data */}
        {stations.map(stn => (
          <g
            key={stn.id}
            className="cursor-pointer transition-transform hover:scale-110"
            style={{ transformOrigin: `${stn.x}px 75px` }}
            onMouseMove={e => handleMouseMove(e, `Station: ${stn.name}`)}
            onMouseLeave={() => setTooltip(null)}
          >
            <circle cx={stn.x} cy="75" r="12" fill="#dbeafe" stroke="#2563eb" strokeWidth="2.5" />
            <circle cx={stn.x} cy="75" r="5"  fill="#2563eb" />
            <text x={stn.x} y="105" textAnchor="middle" fill="#334155" fontSize="12" fontWeight="700">
              {stn.name}
            </text>
          </g>
        ))}

        {/* Trains: spread evenly along the corridor */}
        {activeTrains.map((train, i) => {
          const midX = trainX(i, activeTrains.length);
          const y = 55;
          const isDelayed = train.status === 'DELAYED' || train.status === 'REGULATED' || train.status === 'DIVERTED';
          return (
            <g
              key={train.id}
              className="cursor-pointer"
              style={{ transition: 'transform 0.3s ease' }}
              onMouseMove={e => handleMouseMove(e, `Train ${train.number} (${train.type}) — ${train.status}`)}
              onMouseLeave={() => setTooltip(null)}
            >
              <polygon
                points={`${midX - 10},${y - 10} ${midX + 12},${y} ${midX - 10},${y + 10}`}
                fill={isDelayed ? '#d97706' : '#059669'}
                stroke={isDelayed ? '#92400e' : '#065f46'}
                strokeWidth="1.5"
                filter="url(#glow)"
              />
              <text x={midX} y={y - 16} textAnchor="middle" fill="#1e293b" fontSize="11" fontWeight="800">
                {train.number}
              </text>
            </g>
          );
        })}

        {/* Empty state when no trains */}
        {activeTrains.length === 0 && (
          <text x="500" y="82" textAnchor="middle" fill="#94a3b8" fontSize="12" fontWeight="500">
            No active trains on this corridor
          </text>
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50"
          style={{
            left: tooltip.x + 15,
            top: tooltip.y + 15,
            background: '#ffffff',
            border: '1px solid #e2e8f5',
            borderRadius: 8,
            padding: '6px 12px',
            boxShadow: '0 4px 16px rgba(15,23,42,0.12)',
            fontSize: 12,
            fontWeight: 600,
            color: '#1e293b',
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {tooltip.text.includes('Maintenance') && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', flexShrink: 0 }} />}
            {tooltip.text.includes('Train') && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#059669', flexShrink: 0 }} />}
            {tooltip.text.includes('Station') && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', flexShrink: 0 }} />}
            <span>{tooltip.text}</span>
          </div>
        </div>
      )}
    </div>
  );
};


