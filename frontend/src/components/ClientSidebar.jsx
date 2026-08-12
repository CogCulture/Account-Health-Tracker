import React, { useState, useMemo, useEffect } from 'react';
import { RefreshCw, Search, HeartPulse, ChevronRight, ChevronDown, Calendar, History, Settings, LayoutGrid, Mic, Filter, Folder, FolderOpen } from 'lucide-react';
import { isProjectBrand } from '../utils/brandTypes';

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
  onShowOverview,
  onShowSettings,
  onShowMeetings,
  // Period state (controlled by parent so ScoreScreen knows the period)
  month, year, onMonthChange, onYearChange,
  // Client selection
  selectedClient,
  onSelectClient,
  // Cache of already-computed scores { clientName: { percentage, rating } }
  clientScores,
  // Lifted props
  clients,
  activePairs,
  loadStatus,
  onLoadClients,
  activeView,
}) {
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'PROJECTS' | 'RETAINERS'
  const [openPods, setOpenPods]     = useState({});

  // Group clients by POD / Domain
  const podGroups = useMemo(() => {
    const map = new Map();
    const knownPods = ['POD 1', 'POD 2', 'POD 4', 'Panasonic', 'SRHU', 'B2B'];
    knownPods.forEach(p => map.set(p, []));

    (clients || []).forEach(client => {
      let podName = 'Other';
      const pair = (activePairs || []).find(p => p.id === client.pairId);
      if (pair && pair.name) {
        podName = pair.name;
      } else {
        const match = (client.label || '').match(/\((POD\s*\d+|Panasonic|SRHU|B2B)\)/i);
        if (match) {
          const raw = match[1].toUpperCase();
          if (raw.includes('POD1')) podName = 'POD 1';
          else if (raw.includes('POD2')) podName = 'POD 2';
          else if (raw.includes('POD4')) podName = 'POD 4';
          else if (raw.includes('PANASONIC')) podName = 'Panasonic';
          else if (raw.includes('SRHU')) podName = 'SRHU';
          else if (raw.includes('B2B')) podName = 'B2B';
        }
      }

      if (!map.has(podName)) {
        map.set(podName, []);
      }
      map.get(podName).push(client);
    });

    const result = [];
    for (const [name, list] of map.entries()) {
      if (list.length > 0) {
        result.push({ name, clients: list });
      }
    }
    return result;
  }, [clients, activePairs]);

  // Auto-expand POD containing selectedClient or when searching
  useEffect(() => {
    if (selectedClient) {
      const foundPod = podGroups.find(g => g.clients.some(c => c.key === selectedClient));
      if (foundPod) {
        setOpenPods(prev => ({ ...prev, [foundPod.name]: true }));
      }
    }
  }, [selectedClient, podGroups]);

  const togglePod = (podName) => {
    setOpenPods(prev => ({ ...prev, [podName]: !prev[podName] }));
  };

  const isSearching = search.trim().length > 0;

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

      {/* ── All Brands Button (Home) ──────────────── */}
      <div style={{ padding: '0.75rem 0.75rem 0.25rem' }}>
        <button
          onClick={onShowOverview}
          className={`all-brands-home-btn ${activeView === 'overview' ? 'active' : ''}`}
        >
          <LayoutGrid size={15} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
            All Brands Dashboard
          </span>
        </button>
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

      {activeView === 'dashboard' && (
        <>
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

          {/* ── Type Filter Dropdown (All Brands / Projects / Retainers) ── */}
          <div style={{ padding: '0.3rem 0.75rem 0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--card-bg, #ffffff)', border: '1px solid var(--card-border, rgba(0, 0, 0, 0.12))', borderRadius: 8, padding: '0.2rem 0.5rem' }}>
              <Filter size={12} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
              <select
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  width: '100%',
                  background: 'transparent',
                  color: 'var(--text-primary, #0f172a)',
                  border: 'none',
                  outline: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem 0'
                }}
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
              >
                <option value="ALL" style={{ background: '#ffffff', color: '#0f172a' }}>All Brands</option>
                <option value="PROJECTS" style={{ background: '#ffffff', color: '#0284c7' }}>Projects</option>
                <option value="RETAINERS" style={{ background: '#ffffff', color: '#6d28d9' }}>Retainers</option>
              </select>
            </div>
          </div>

          {/* ── POD Grouped Accordion List ───────────────────────────── */}
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

            {loadStatus === 'loaded' && podGroups.map(group => {
              const groupFiltered = group.clients.filter(c => {
                const matchesSearch = c.label.toLowerCase().includes(search.toLowerCase());
                if (!matchesSearch) return false;

                const isProj = isProjectBrand(c.label);
                if (typeFilter === 'PROJECTS') return isProj;
                if (typeFilter === 'RETAINERS') return !isProj;
                return true;
              });

              if (groupFiltered.length === 0) return null;

              const isOpen = isSearching || openPods[group.name] !== false; // open by default if not set to false

              return (
                <div key={group.name} style={{ marginBottom: '0.4rem' }}>
                  {/* POD Accordion Header */}
                  <button
                    onClick={() => togglePod(group.name)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.65rem',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--card-border, rgba(255, 255, 255, 0.08))',
                      borderRadius: 8,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {isOpen ? (
                        <ChevronDown size={14} style={{ color: 'var(--accent-primary)' }} />
                      ) : (
                        <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                      )}
                      <span>{group.name}</span>
                    </div>

                    <span style={{
                      fontSize: '0.66rem',
                      fontWeight: 600,
                      padding: '0.1rem 0.4rem',
                      borderRadius: 99,
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: 'var(--text-secondary)'
                    }}>
                      {groupFiltered.length} {typeFilter === 'PROJECTS' ? 'Proj' : typeFilter === 'RETAINERS' ? 'Ret' : ''}
                    </span>
                  </button>

                  {/* POD Client Items */}
                  {isOpen && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.2rem',
                      paddingLeft: '0.5rem',
                      marginTop: '0.25rem',
                      borderLeft: '2px solid rgba(255, 255, 255, 0.06)',
                      marginLeft: '0.5rem'
                    }}>
                      {groupFiltered.map(client => {
                        const score  = clientScores[`${client.key}__${month}__${year}`];
                        const active = client.key === selectedClient && activeView === 'dashboard';
                        const color  = score ? (RATING_COLORS[score.rating] || '#EF4444') : null;
                        const isProj = isProjectBrand(client.label);

                        // Clean display label (remove redundant POD suffix for clean UI)
                        const displayLabel = client.label.replace(/\s*\([^)]*\)/, '');

                        return (
                          <button
                            key={client.key}
                            className={`sidebar-client-btn ${active ? 'active' : ''}`}
                            onClick={() => onSelectClient(client.key)}
                            style={{ padding: '0.4rem 0.5rem' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '0.4rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflow: 'hidden' }}>
                                <span className="sidebar-client-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {displayLabel}
                                </span>
                                <span style={{
                                  fontSize: '0.6rem',
                                  fontWeight: 700,
                                  padding: '0.08rem 0.3rem',
                                  borderRadius: 4,
                                  background: isProj ? 'rgba(56, 189, 248, 0.12)' : 'rgba(167, 139, 250, 0.12)',
                                  color: isProj ? '#38bdf8' : '#a78bfa',
                                  border: `1px solid ${isProj ? 'rgba(56, 189, 248, 0.3)' : 'rgba(167, 139, 250, 0.3)'}`,
                                  flexShrink: 0
                                }}>
                                  {isProj ? 'PROJ' : 'RET'}
                                </span>
                              </div>
                              {score ? (
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color, flexShrink: 0 }}>
                                  {score.percentage}%
                                </span>
                              ) : (
                                <ChevronRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
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
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </>
      )}

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

        {/* History / Meetings row */}
        <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
          <button
            className="theme-toggle"
            onClick={onShowHistory}
            title="View history"
            style={{
              flex: 1,
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
          <button
            className="theme-toggle"
            onClick={onShowMeetings}
            title="Meeting insights"
            style={{
              flex: 1,
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
            <Mic size={13} />
            <span>Meetings</span>
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
