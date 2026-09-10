import React, { useEffect, useState } from 'react';
import { Train, ChevronRight, Shield, AlertCircle, Eye, EyeOff, Loader } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { loginUser, fetchDemoAccounts, clearError, type DemoAccount } from '../store/authSlice';

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  Admin:      { bg: '#fef2f2', text: '#dc2626', border: '#fecaca', icon: '🔴' },
  Planner:    { bg: '#fffbeb', text: '#d97706', border: '#fde68a', icon: '🟡' },
  Operations: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe', icon: '🔵' },
};

export const LoginPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isLoading, error, demoAccounts, demoAccountsLoading } = useAppSelector(s => s.auth);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchDemoAccounts());
    return () => { dispatch(clearError()); };
  }, [dispatch]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    dispatch(loginUser({ username, password }));
  };

  const fillDemo = (acc: DemoAccount) => {
    setUsername(acc.username);
    setPassword(acc.password || acc.hint || '');
  };

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-base)', display: 'flex', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Left decorative panel */}
      <div style={{ width: '42%', background: 'linear-gradient(160deg, #1e40af 0%, #2563eb 40%, #3b82f6 100%)', display: 'flex', flexDirection: 'column', padding: '48px', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.2)' }}>
              <Train size={24} color="white" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'white', letterSpacing: '-0.01em' }}>IR Block Planner</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>Ministry of Railways</div>
            </div>
          </div>

          <h1 style={{ fontSize: 36, fontWeight: 800, color: 'white', letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 16 }}>
            Intelligent Block<br />Planning System
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, maxWidth: 320 }}>
            AI-powered track maintenance scheduling for high-density railway corridors across the Indian Railways network.
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Active Corridors', value: '2+' },
            { label: 'Daily Trains', value: '200+' },
            { label: 'Uptime', value: '99.9%' },
            { label: 'Avg. Resolution', value: '< 2h' },
          ].map(stat => (
            <div key={stat.label} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.1)', borderRadius: 10, backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-0.02em', fontFamily: 'JetBrains Mono, monospace' }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right login panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 48px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          
          {/* Heading */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Shield size={16} color="var(--accent-blue)" />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-blue)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Secure Login</span>
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
              Welcome back
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6 }}>
              Sign in to access the Block Planning Console.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, marginBottom: 20 }}>
              <AlertCircle size={15} color="#dc2626" />
              <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onFocus={() => setFocusedField('username')}
                onBlur={() => setFocusedField(null)}
                placeholder="planner / operations / admin"
                style={{ width: '100%', padding: '11px 14px', background: '#fff', border: `1.5px solid ${focusedField === 'username' ? '#2563eb' : '#e2e8f5'}`, borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', boxShadow: focusedField === 'username' ? '0 0 0 3px rgba(37,99,235,0.1)' : 'none', transition: 'all 0.15s' }}
                autoComplete="username"
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="••••••••••"
                  style={{ width: '100%', padding: '11px 42px 11px 14px', background: '#fff', border: `1.5px solid ${focusedField === 'password' ? '#2563eb' : '#e2e8f5'}`, borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', boxShadow: focusedField === 'password' ? '0 0 0 3px rgba(37,99,235,0.1)' : 'none', transition: 'all 0.15s' }}
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPassword(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !username || !password}
              style={{ width: '100%', padding: '13px 16px', background: isLoading || !username || !password ? '#e2e8f5' : 'linear-gradient(135deg, #1d4ed8, #2563eb)', border: 'none', borderRadius: 10, color: isLoading || !username || !password ? '#94a3b8' : 'white', fontSize: 14, fontWeight: 700, cursor: isLoading || !username || !password ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s', boxShadow: isLoading || !username || !password ? 'none' : '0 4px 14px rgba(37,99,235,0.3)', boxSizing: 'border-box' }}
            >
              {isLoading
                ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Signing in…</>
                : <>Sign In <ChevronRight size={15} /></>
              }
            </button>
          </form>

          {/* Demo accounts */}
          <div style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                {demoAccountsLoading ? 'Loading…' : 'Quick Access'}
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            </div>

            {demoAccountsLoading ? (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <Loader size={20} color="var(--text-muted)" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : demoAccounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px dashed var(--border-default)' }}>
                Backend offline — enter credentials manually
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {demoAccounts.map((acc, i) => {
                  const palette = ROLE_COLORS[acc.role] ?? ROLE_COLORS['Operations'];
                  return (
                    <button key={i} onClick={() => fillDemo(acc)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 18 }}>{palette.icon}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: palette.text }}>{acc.fullName ?? acc.username}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{acc.designation ?? acc.role} · @{acc.username}</div>
                        </div>
                      </div>
                      <ChevronRight size={14} color={palette.text} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 32, letterSpacing: '0.02em' }}>
            © 2026 Indian Railways · Block Planning System · Restricted Access
          </p>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
