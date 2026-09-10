import React, { useState, type MouseEvent } from 'react';
import { useAppSelector } from '../store/hooks';

const STATIONS = [
  { id: 'stn-a', name: 'Station A', x: 100 },
  { id: 'stn-b', name: 'Station B', x: 300 },
  { id: 'stn-c', name: 'Station C', x: 500 },
  { id: 'stn-d', name: 'Station D', x: 700 },
  { id: 'stn-e', name: 'Station E', x: 900 },
];

const SECTIONS = [
  { id: 'sec-a-b', from: 'stn-a', to: 'stn-b' },
  { id: 'sec-b-c', from: 'stn-b', to: 'stn-c' },
  { id: 'sec-c-d', from: 'stn-c', to: 'stn-d' },
  { id: 'sec-d-e', from: 'stn-d', to: 'stn-e' },
];

export const LinearTrackView: React.FC = () => {
  const trains = useAppSelector((state) => state.trainSchedule.trains);
  const blocks = useAppSelector((state) => state.maintenanceBlock.blocks);
  
  const [tooltip, setTooltip] = useState<{ text: string, x: number, y: number } | null>(null);

  const handleMouseMove = (e: MouseEvent, text: string) => {
    // We use clientX/clientY relative to the container for accurate HTML overlay positioning
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ 
      text, 
      x: e.clientX - rect.left, 
      y: e.clientY - rect.top 
    });
  };

  const getSectionCoords = (sectionId: string) => {
    const section = SECTIONS.find((s) => s.id === sectionId);
    if (!section) return null;
    const from = STATIONS.find((s) => s.id === section.from);
    const to = STATIONS.find((s) => s.id === section.to);
    if (!from || !to) return null;
    return { x1: from.x, x2: to.x };
  };

  return (
    <div className="w-full h-full relative group">
      <svg viewBox="0 0 1000 150" className="w-full h-full drop-shadow-md" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Base Track Line — light rail gray */}
        <line x1="50" y1="75" x2="950" y2="75" stroke="#cbd5e1" strokeWidth="8" strokeLinecap="round" />
        {/* Track sleeper dashes */}
        <line x1="50" y1="75" x2="950" y2="75" stroke="#94a3b8" strokeWidth="2" strokeDasharray="6 6" />

        {/* Maintenance Blocks */}
        {blocks.filter(b => b.status === 'APPROVED').map((block) => {
          const coords = getSectionCoords(block.section_id);
          if (!coords) return null;
          return (
            <line
              key={block.id}
              x1={coords.x1}
              y1={75}
              x2={coords.x2}
              y2={75}
              stroke="#ef4444"
              strokeWidth="8"
              strokeLinecap="round"
              className="cursor-pointer transition-all duration-300"
              filter="url(#glow)"
              onMouseMove={(e) => handleMouseMove(e, `Maintenance Active: ${block.department} (${block.start_time} - ${block.end_time})`)}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}

        {/* Stations */}
        {STATIONS.map((stn) => (
          <g 
            key={stn.id} 
            className="cursor-pointer transition-transform hover:scale-110" 
            style={{ transformOrigin: `${stn.x}px 75px` }}
            onMouseMove={(e) => handleMouseMove(e, `Station: ${stn.name}`)}
            onMouseLeave={() => setTooltip(null)}
          >
            {/* Outer ring */}
            <circle cx={stn.x} cy="75" r="12" fill="#dbeafe" stroke="#2563eb" strokeWidth="2.5" />
            {/* Inner dot */}
            <circle cx={stn.x} cy="75" r="5" fill="#2563eb" />
            {/* Label */}
            <text x={stn.x} y="105" textAnchor="middle" fill="#334155" fontSize="13" fontWeight="700">
              {stn.name}
            </text>
          </g>
        ))}

        {/* Trains */}
        {trains.filter(t => t.status !== 'COMPLETED').map((train, i) => {
          const coords = getSectionCoords(train.section_id);
          if (!coords) return null;
          
          // Spread trains slightly if there are multiple in the same section
          const midX = (coords.x1 + coords.x2) / 2 + (i * 20 - 20); 
          const y = 60; // offset vertically above the line

          return (
            <g 
              key={train.id} 
              className="cursor-pointer"
              style={{ transition: 'transform 0.3s ease' }}
              onMouseMove={(e) => handleMouseMove(e, `Train ${train.number} (${train.type}) — ${train.status}`)}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Triangle pointing right */}
              <polygon 
                points={`${midX-10},${y-10} ${midX+12},${y} ${midX-10},${y+10}`} 
                fill={train.status === 'DELAYED' || train.status === 'REGULATED' ? '#d97706' : '#059669'}
                stroke={train.status === 'DELAYED' || train.status === 'REGULATED' ? '#92400e' : '#065f46'}
                strokeWidth="1.5" 
                filter="url(#glow)"
              />
              <text x={midX} y={y - 16} textAnchor="middle" fill="#1e293b" fontSize="11" fontWeight="800">
                {train.number}
              </text>
            </g>
          );
        })}
      </svg>
      
      {/* Light-mode HTML Tooltip */}
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
            {tooltip.text.includes('Maintenance') && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', flexShrink: 0 }}></div>}
            {tooltip.text.includes('Train') && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#059669', flexShrink: 0 }}></div>}
            {tooltip.text.includes('Station') && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', flexShrink: 0 }}></div>}
            <span>{tooltip.text}</span>
          </div>
        </div>
      )}
    </div>
  );
};
