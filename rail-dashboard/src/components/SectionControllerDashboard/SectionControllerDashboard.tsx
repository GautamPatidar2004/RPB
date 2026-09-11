import React, { useState, useEffect } from 'react';
import { GlobalTelemetryBar } from './GlobalTelemetryBar';
import { LinearRailwaySchematic } from './LinearRailwaySchematic';
import { MasterBlockSchedule } from './MasterBlockSchedule';
import { DepartmentRequestQueue } from './DepartmentRequestQueue';
import { AIRecommendationCard } from './AIRecommendationCard';
import { ConflictResolutionDock } from './ConflictResolutionDock';
import { useAppDispatch } from '../../store/hooks';
import { fetchPendingTasks } from '../../store/maintenanceTaskSlice';
import { fetchPlanningRuns, fetchPlans, fetchPlanById } from '../../store/planSlice';

export const SectionControllerDashboard: React.FC = () => {
  const dispatch = useAppDispatch();
  const [activeDirection, setActiveDirection] = useState<'ALL' | 'UP' | 'DOWN'>('ALL');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [_selectedConflictId, setSelectedConflictId] = useState<string | null>(null);

  // Initial load of pending tasks, plans, and planning runs
  useEffect(() => {
    dispatch(fetchPendingTasks({}));
    dispatch(fetchPlans({})).then((res: any) => {
      const first = res.payload?.data?.[0] || res.payload?.plans?.[0];
      if (first?.id) {
        dispatch(fetchPlanById(first.id));
      }
    });
    dispatch(fetchPlanningRuns({}));
  }, [dispatch]);

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* 1. TOP: Global Telemetry & Status Bar */}
      <div className="flex-none bg-white border-b border-slate-200 shadow-sm px-4 py-3 z-10 relative">
        <GlobalTelemetryBar 
          activeDirection={activeDirection}
          onDirectionChange={setActiveDirection}
        />
      </div>

      {/* Main Operational Scrollable / Structured View */}
      <div className="flex-1 flex flex-col min-h-0 px-4 pt-4 pb-6 space-y-5 overflow-y-auto custom-scrollbar bg-slate-50/50">
        
        {/* 2. UPPER: Linear Railway Schematic (Dual-Track, Station Nodes, Trains, Possessions) */}
        <div className="flex-none h-[180px] w-full min-w-[900px]">
          <LinearRailwaySchematic 
            activeDirection={activeDirection}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
          />
        </div>

        {/* 3. CENTRAL: Master Block Schedule (24-hr Gantt, 15m grid, Department Envelopes, Drag Conflict Preview) */}
        <div className="flex-none h-[380px] w-full min-w-[900px]">
          <MasterBlockSchedule 
            activeDirection={activeDirection}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
          />
        </div>

        {/* 4. LOWER: Tri-Column Dense Operational Command Dock */}
        <div className="flex-1 min-h-[360px] grid grid-cols-1 xl:grid-cols-12 gap-5 pb-2">
          {/* Left Column: Department Request Queue */}
          <div className="xl:col-span-4 h-full min-h-[340px]">
            <DepartmentRequestQueue 
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
            />
          </div>

          {/* Middle Column: AI Recommendation Card */}
          <div className="xl:col-span-4 h-full min-h-[340px]">
            <AIRecommendationCard />
          </div>

          {/* Right Column: Conflict Resolution Dock */}
          <div className="xl:col-span-4 h-full min-h-[340px]">
            <ConflictResolutionDock 
              onSelectConflict={setSelectedConflictId}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SectionControllerDashboard;
