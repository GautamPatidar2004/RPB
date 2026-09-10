import React, { useState } from 'react';
import {
  LayoutDashboard, Map, Calendar, Activity, Settings, LogOut,
  Bell, RefreshCw, Train, Wrench, Filter, ChevronRight,
  ChevronDown, Loader, DatabaseZap
} from 'lucide-react';
import { LinearTrackView } from '../components/LinearTrackView';
import { BlockGanttChart } from '../components/BlockGanttChart';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { useRailWebSockets } from '../hooks/useRailWebSockets';
import { logoutUser } from '../store/authSlice';
import { selectCorridor } from '../store/corridorSlice';
import { fetchSyncStatus, triggerSync } from '../store/syncSlice';
import { generatePlan } from '../store/planSlice';

interface DashboardLayoutProps {
  children?: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  useRailWebSockets();

  const dispatch = useAppDispatch();
  const trains       = useAppSelector(s => s.trainSchedule.trains);
  const blocks       = useAppSelector(s => s.maintenanceBlock.blocks);
  const user         = useAppSelector(s => s.auth.user);
  const corridors    = useAppSelector(s => s.corridors.corridors);
  const selectedCId  = useAppSelector(s => s.corridors.selectedCorridorId);
  const syncSources  = useAppSelector(s => s.sync.sources);
  const isSyncing    = useAppSelector(s => s.sync.isSyncing);
  const isGenerating = useAppSelector(s => s.plans.isGenerating);
  const taskSummary  = useAppSelector(s => s.maintenanceTasks.summary);

  const selectedCorridor = corridors.find(c => c.id === selectedCId);

  const onTimeCount  = trains.filter(t => t.status === 'ON_TIME' || t.status === 'SCHEDULED').length;
  const delayedCount = trains.filter(t => t.status === 'DELAYED' || t.status === 'REGULATED').length;
  const pendingCount = taskSummary?.pending ?? blocks.filter(b => b.status === 'PENDING').length;
  const approvedCount = blocks.filter(b => b.status === 'APPROVED').length;

  const [activeNav, setActiveNav] = useState('overview');
  const [showCorridorMenu, setShowCorridorMenu] = useState(false);
  const [currentTime] = useState(() =>
    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  );

  const lastSyncAt = syncSources.length > 0
    ? syncSources.reduce((latest, s) => s.lastSyncAt && s.lastSyncAt > (latest ?? '') ? s.lastSyncAt : latest, null as string | null)
    : null;

  const handleLogout = () => dispatch(logoutUser());
  const handleRefresh = () => { dispatch(fetchSyncStatus()); };
  const handleTriggerSync = () => {
    dispatch(triggerSync('TMS'));
    dispatch(triggerSync('COA'));
  };
  const handleGeneratePlan = () => {
    if (!selectedCorridor) return;
    dispatch(generatePlan({
      corridorCode: selectedCorridor.code,
      horizonMode: 'WEEKLY',
      startDate: new Date().toISOString(),
    }));
  };

  const navItems = [
    { id: 'overview', icon: <LayoutDashboard size={16} />, label: 'Overview' },
    { id: 'track',    icon: <Map size={16} />,             label: 'Track Schematics' },
    { id: 'gantt',    icon: <Calendar size={16} />,        label: 'Block Planning' },
    { id: 'live',     icon: <Activity size={16} />,        label: 'Live Operations' },
  ];

  // Role-based: only Planner + Admin can generate plans
  const canGeneratePlan = user?.role === 'Admin' || user?.role === 'Planner';

  return (
    <div className="app-shell">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="logo-icon">
            <Train size={16} color="white" />
          </div>
          <div className="logo-text">
            IR Block Planner
            <span>Ministry of Railways</span>
          </div>
        </div>

        {/* Corridor badge / selector */}
        <div style={{ margin: '12px 12px 4px', position: 'relative' }}>
          <button
            onClick={() => setShowCorridorMenu(p => !p)}
            style={{ width: '100%', padding: '8px 12px', background: 'var(--accent-amber-light)', border: '1px solid #fde68a', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent-amber)' }}>
                {selectedCorridor ? `⬡ ${selectedCorridor.zone ?? ''} Zone` : '⬡ Loading…'}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 1 }}>
                {selectedCorridor ? selectedCorridor.code : '—'}
              </div>
            </div>
            <ChevronDown size={12} color="var(--accent-amber)" />
          </button>

          {showCorridorMenu && corridors.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '1px solid var(--border-default)', borderRadius: 8, marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
              {corridors.map(c => (
                <button key={c.id} onClick={() => { dispatch(selectCorridor(c.id)); setShowCorridorMenu(false); }}
                  style={{ width: '100%', padding: '8px 12px', background: c.id === selectedCId ? 'var(--accent-blue-light)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: c.id === selectedCId ? 'var(--accent-blue)' : 'var(--text-primary)' }}>{c.code}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.startStation} → {c.endStation} · {c.lengthKm} km</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          <div className="nav-section-label">Operations</div>
          {navItems.map(item => (
            <a key={item.id} href="#" className={`nav-item ${activeNav === item.id ? 'active' : ''}`}
              onClick={e => { e.preventDefault(); setActiveNav(item.id); }}>
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {activeNav === item.id && <span className="nav-dot" />}
            </a>
          ))}

          {/* Generate plan — only shown for allowed roles */}
          {canGeneratePlan && (
            <>
              <div className="nav-section-label" style={{ marginTop: 12 }}>AI Planning</div>
              <button
                onClick={handleGeneratePlan}
                disabled={isGenerating || !selectedCorridor}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: isGenerating ? 'not-allowed' : 'pointer', background: 'var(--accent-blue-light)', border: '1px solid #bfdbfe', color: 'var(--accent-blue)', transition: 'all 0.15s' }}>
                {isGenerating ? <Loader size={16} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} /> : <DatabaseZap size={16} style={{ flexShrink: 0 }} />}
                {isGenerating ? 'Generating…' : 'Generate Weekly Plan'}
              </button>
            </>
          )}

          <div className="nav-section-label" style={{ marginTop: 12 }}>System</div>
          {/* Sync trigger */}
          <button onClick={handleTriggerSync} disabled={isSyncing}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: isSyncing ? 'not-allowed' : 'pointer', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', transition: 'all 0.15s' }}>
            <RefreshCw size={16} style={{ flexShrink: 0, animation: isSyncing ? 'spin 1s linear infinite' : 'none', color: 'var(--text-muted)' }} />
            {isSyncing ? 'Syncing…' : 'Sync Railway Data'}
          </button>
          <a href="#" className="nav-item">
            <span className="nav-icon"><Settings size={16} /></span>
            Settings
          </a>
        </nav>

        {/* Footer user */}
        <div className="sidebar-footer">
          {/* Sync health indicator */}
          {lastSyncAt && (
            <div style={{ padding: '6px 10px', marginBottom: 4, fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-emerald)', display: 'inline-block', flexShrink: 0 }} />
              Last sync: {new Date(lastSyncAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <div className="sidebar-user">
            <div className="user-avatar">
              <img
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName ?? 'User')}&background=1d4ed8&color=fff&bold=true`}
                alt="User"
              />
            </div>
            <div className="user-info">
              <div className="user-name">{user?.fullName ?? user?.username ?? 'Controller'}</div>
              <div className="user-role">{user?.designation ?? user?.role ?? '—'}</div>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </div>
          <button onClick={handleLogout} className="nav-item" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <span className="nav-icon"><LogOut size={16} /></span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main Area ────────────────────────────────────────── */}
      <div className="main-area">
        {/* Header */}
        <header className="top-header">
          <div className="header-left">
            <div>
              <div className="header-title">
                Block Planning Dashboard
                {selectedCorridor && <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent-blue)', marginLeft: 8 }}>· {selectedCorridor.code}</span>}
              </div>
              <div className="header-subtitle">
                {selectedCorridor
                  ? `${selectedCorridor.startStation} → ${selectedCorridor.endStation} · ${selectedCorridor.lengthKm} km · ${selectedCorridor.zone} Zone`
                  : 'Real-time track occupancy & maintenance coordination'}
              </div>
            </div>
            <div className="live-badge">
              <span className="live-dot" />
              System Live
            </div>
          </div>

          <div className="header-right">
            <div className="header-stat">
              <div className="stat-value on-time">{onTimeCount}</div>
              <div className="stat-label">On Time</div>
            </div>
            <div className="header-stat">
              <div className="stat-value delayed">{delayedCount}</div>
              <div className="stat-label">Delayed</div>
            </div>
            <div className="header-stat">
              <div className="stat-value pending">{pendingCount}</div>
              <div className="stat-label">Pending Tasks</div>
            </div>
            <div className="header-stat" style={{ borderRight: 'none', paddingRight: 0 }}>
              <div className="stat-value" style={{ color: 'var(--accent-blue)', fontFamily: "'JetBrains Mono', monospace" }}>{currentTime}</div>
              <div className="stat-label">IST</div>
            </div>

            <div style={{ width: 1, height: 32, background: 'var(--border-subtle)', margin: '0 4px' }} />
            <button className="icon-btn" title="Refresh data" onClick={handleRefresh}>
              <RefreshCw size={15} />
            </button>
            <button className="icon-btn" title="Notifications">
              <Bell size={15} />
              <span className="notif-dot" />
            </button>
            <button className="icon-btn" title="Filter">
              <Filter size={15} />
            </button>
          </div>
        </header>

        {/* Dashboard Grid */}
        <main className="dashboard-content">
          {children ? children : (
            <>
              {/* ── Top Panel: Linear Track Schematic ─────────── */}
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <span className="panel-icon"><Map size={14} /></span>
                    Linear Track Schematic
                    {selectedCorridor && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>({selectedCorridor.code})</span>}
                  </div>
                  <div className="panel-actions">
                    <div className="legend">
                      <div className="legend-item"><div className="legend-dot" style={{ background: '#ef4444' }} /> Maintenance</div>
                      <div className="legend-item"><div className="legend-dot" style={{ background: '#10b981' }} /> On Time</div>
                      <div className="legend-item"><div className="legend-dot" style={{ background: '#f59e0b' }} /> Delayed</div>
                    </div>
                    <span className="panel-badge approved">{approvedCount} Active</span>
                    <span className="panel-badge pending">{pendingCount} Tasks</span>
                  </div>
                </div>
                <div className="panel-body">
                  <LinearTrackView />
                </div>
              </div>

              {/* ── Bottom Panel: Block Gantt Chart ───────────── */}
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <span className="panel-icon"><Calendar size={14} /></span>
                    24-Hour Block Planning Gantt
                  </div>
                  <div className="panel-actions">
                    <div className="legend">
                      <div className="legend-item"><div className="legend-dot" style={{ background: '#f59e0b' }} /> Engineering</div>
                      <div className="legend-item"><div className="legend-dot" style={{ background: '#3b82f6' }} /> OHE</div>
                      <div className="legend-item"><div className="legend-dot" style={{ background: '#a855f7' }} /> Signal</div>
                      <div className="legend-item"><div className="legend-dot" style={{ background: '#64748b', borderRadius: '1px' }} /> Train Strip</div>
                    </div>
                    <span className="panel-badge pending">PENDING = Draggable</span>
                    <Wrench size={13} style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
                <div className="panel-body">
                  <BlockGanttChart />
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
