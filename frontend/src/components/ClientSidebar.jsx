import React, { useState } from 'react';
import { RefreshCw, Search, HeartPulse, ChevronRight, Calendar, Sun, Moon, History, Settings } from 'lucide-react';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
const YEARS = Array.from({ length: 6 }, (_, i) => 2023 + i);

const RATING_COLORS = {
  Excellent:         '#10B981',
  Good:              '#F59E0B',
  'Needs Attention': '#F97316',
  Critical:          '#EF4444',
};

export default function ClientSidebar({
  onShowHistory,
  onShowSettings,
  // Period state (controlled by parent so ScoreScreen knows the period)
  month, year, onMonthChange, onYearChange,
  // Client selection
  selectedClient,
  onSelectClient,
  // Cache of already-computed scores { clientName: { percentage, rating } }
  clientScores,
  // Lifted props
  clients,
  loadStatus,
  onLoadClients,
}) {
  const [search, setSearch]         = useState('');

  const filtered = clients.filter(c =>
    c.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside className="sidebar">
      {/* ── Logo ───────────────────────── */}
      <div className="sidebar-header" style={{ justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', width: '100%' }}>
          <HeartPulse size={20} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
            Account Health
          </span>
        </div>
      </div>

      {/* ── Period selector ───────────────────────── */}
      <div className="sidebar-period">
        <div style={{ flex: 1 }}>
          <label className="form-label" style={{ fontSize: '0.68rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Calendar size={10} /> Month
          </label>
          <select
            className="form-control"
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
            value={month}
            onChange={e => onMonthChange(parseInt(e.target.value))}
          >
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label className="form-label" style={{ fontSize: '0.68rem', marginBottom: '0.25rem' }}>Year</label>
          <select
            className="form-control"
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
            value={year}
            onChange={e => onYearChange(parseInt(e.target.value))}
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* ── Search ────────────────────────────────── */}
      <div className="sidebar-search-wrap">
        <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          className="sidebar-search-input"
          type="text"
          placeholder="Search clients…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Client list ───────────────────────────── */}
      <nav className="sidebar-client-list">
        {loadStatus === 'loading' && (
          <div className="sidebar-status-msg">
            <RefreshCw size={13} className="spin" /> Loading…
          </div>
        )}
        {loadStatus === 'error' && (
          <div className="sidebar-status-msg" style={{ color: 'var(--color-critical)' }}>
            Failed to connect. <button onClick={onLoadClients} style={{ color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>Retry</button>
          </div>
        )}
        {loadStatus === 'loaded' && filtered.length === 0 && (
          <div className="sidebar-status-msg">No clients match.</div>
        )}

        {loadStatus === 'loaded' && filtered.map(client => {
          const score  = clientScores[`${client.key}__${month}__${year}`];
          const active = client.key === selectedClient;
          const color  = score ? (RATING_COLORS[score.rating] || '#EF4444') : null;

          return (
            <button
              key={client.key}
              className={`sidebar-client-btn ${active ? 'active' : ''}`}
              onClick={() => onSelectClient(client.key)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span className="sidebar-client-name">{client.label}</span>
                {score ? (
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color, flexShrink: 0 }}>
                    {score.percentage}%
                  </span>
                ) : (
                  <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                )}
              </div>
              {score && (
                <div className="sidebar-score-bar">
                  <div className="sidebar-score-bar-fill" style={{ width: `${score.percentage}%`, backgroundColor: color }} />
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Sidebar Bottom / Footer ────────────────── */}
      <div style={{
        marginTop: 'auto',
        borderTop: '1px solid var(--card-border)',
        padding: '0.75rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        background: 'var(--card-bg)',
      }}>
        {/* Sheets button — full width on top */}
        <button
          onClick={onShowSettings}
          title="Manage team sheets"
          style={{
            width: '100%',
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--card-border)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.78rem',
          }}
        >
          <Settings size={13} />
          <span>Manage Teams</span>
        </button>

        {/* History row */}
        <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
          <button 
            className="theme-toggle" 
            onClick={onShowHistory} 
            title="View history" 
            style={{ 
              width: '100%',
              height: 34, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '0.4rem',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--card-border)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.78rem',
            }}
          >
            <History size={13} />
            <span>History</span>
          </button>
        </div>

        {/* Footer text */}
        {loadStatus === 'loaded' && (
          <div style={{
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}>
            {clients.length} client{clients.length !== 1 ? 's' : ''} · {MONTHS[month]} {year}          </div>
        )}
      </div>
    </aside>
  );
}
