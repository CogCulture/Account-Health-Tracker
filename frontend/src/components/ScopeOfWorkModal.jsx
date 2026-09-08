import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  ExternalLink, 
  Clock, 
  Layers, 
  Search, 
  RefreshCw, 
  AlertCircle, 
  FileSpreadsheet, 
  Calendar,
  Check,
  ChevronRight,
  TrendingUp,
  Tag,
  Link2,
  Trash2,
  Edit3,
  CheckCircle2,
  Maximize2,
  Minimize2,
  UserCheck,
  XCircle
} from 'lucide-react';
import { fetchSheetData, fetchSheetTabs } from '../utils/sheetsApi';
import { parseSOWRows } from '../utils/sheetsParser';
import { apiUrl } from '../utils/apiClient';

function extractSheetId(input) {
  const trimmed = (input || '').trim();
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Normalizes text for keyword matching between SOW item and monthly deliverables.
 */
function normalizeText(txt) {
  return (txt || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STATUS_CYCLE = ['Monthly', 'Done', 'CTR', 'ATR', 'Not Done'];

/**
 * Determines current status for a SOW item:
 * Done | Not Done | CTR | ATR | Monthly
 */
function getSowItemStatus(item, allMonthDeliverables = [], manualStatusOverrides = {}) {
  if (!item) return 'Not Done';
  if (manualStatusOverrides[item.id]) {
    return manualStatusOverrides[item.id];
  }

  // 1. Check if the sheet row itself has an explicit status cell
  if (item.status) {
    const s = item.status.toString().toLowerCase().trim();
    if (s === 'done' || s === 'closed' || s === 'completed') return 'Done';
    if (s === 'ctr' || s.includes('ctr') || s.includes('client')) return 'CTR';
    if (s === 'atr' || s.includes('atr') || s.includes('agency')) return 'ATR';
    if (s === 'monthly' || s.includes('month')) return 'Monthly';
    if (s === 'not done' || s.includes('pending') || s.includes('open') || s === 'not-done') return 'Not Done';
  }

  // 2. Keyword match against actual jobs done this month
  const normSow = normalizeText(item.launchCreative || item.rawCells?.[1] || item.sowItem || '');
  if (normSow) {
    const sowWords = normSow.split(' ').filter(w => w.length > 2);
    const matchedJob = allMonthDeliverables.find(job => {
      const jobName = normalizeText(job.deliverable || job.jobId || '');
      if (!jobName) return false;
      if (jobName.includes(normSow) || normSow.includes(jobName)) return true;
      if (sowWords.length > 0) {
        const matchCount = sowWords.filter(word => jobName.includes(word)).length;
        if (matchCount >= Math.min(2, sowWords.length)) return true;
      }
      return false;
    });

    if (matchedJob) {
      const jobStatus = (matchedJob.status || '').toString().toLowerCase().trim();
      if (jobStatus === 'closed' || jobStatus === 'completed' || jobStatus === 'done') {
        return 'Done';
      }
      if (jobStatus.includes('ctr') || jobStatus.includes('client')) {
        return 'CTR';
      }
      if (jobStatus.includes('atr') || jobStatus.includes('agency') || jobStatus.includes('in progress') || jobStatus.includes('in-progress') || jobStatus.includes('ongoing')) {
        return 'ATR';
      }
    }
  }

  // 3. Check if recurring monthly item
  if (item.isMonthly) {
    return 'Monthly';
  }

  return 'Not Done';
}

/**
 * Renders stylized status badge with icon
 */
function renderStatusBadge(statusVal) {
  switch (statusVal) {
    case 'Monthly':
      return (
        <span className="sow-badge sow-badge-monthly" title="Monthly Retainer (Click to cycle: Monthly → Done → CTR → ATR → Not Done)">
          <Calendar size={11} />
          <span>Monthly</span>
        </span>
      );
    case 'Done':
      return (
        <span className="sow-badge sow-badge-done" title="Done / Completed (Click to cycle: Monthly → Done → CTR → ATR → Not Done)">
          <Check size={11} />
          <span>Done</span>
        </span>
      );
    case 'CTR':
      return (
        <span className="sow-badge sow-badge-ctr" title="CTR - Client Turnaround / Awaiting Client (Click to cycle)">
          <UserCheck size={11} />
          <span>CTR</span>
        </span>
      );
    case 'ATR':
      return (
        <span className="sow-badge sow-badge-atr" title="ATR - Agency Turnaround / In Progress (Click to cycle)">
          <RefreshCw size={11} />
          <span>ATR</span>
        </span>
      );
    case 'Not Done':
    default:
      return (
        <span className="sow-badge sow-badge-not-done" title="Not Done / Pending (Click to cycle: Monthly → Done → CTR → ATR → Not Done)">
          <XCircle size={11} />
          <span>Not Done</span>
        </span>
      );
  }
}

export default function ScopeOfWorkModal({
  isOpen,
  onClose,
  clientName,
  month,
  year,
  monthName,
  sowId: propSowId,
  jobRows = [],
  activePair,
  onPairsChanged
}) {
  const [sowId, setSowId] = useState(() => {
    return propSowId || activePair?.sowId || localStorage.getItem('sow_sheet_override_id') || '';
  });
  
  const [sowData, setSowData] = useState(null);
  const [availableTabs, setAvailableTabs] = useState([]);
  const [selectedTab, setSelectedTab] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // Controls 3-column vs full sheet view

  // User manual status override toggle { [sowItemId]: 'Monthly' | 'Done' | 'CTR' | 'ATR' | 'Not Done' }
  const [manualStatusOverrides, setManualStatusOverrides] = useState({});

  useEffect(() => {
    const idToSet = propSowId || activePair?.sowId || localStorage.getItem('sow_sheet_override_id') || '';
    setSowId(idToSet);
  }, [propSowId, activePair]);

  // Extract monthly category breakdown & jobs for the selected month
  const { allMonthDeliverables, doneDeliverables, categoryStats } = useMemo(() => {
    const list = Array.isArray(jobRows) ? jobRows : [];
    const done = list.filter(j => {
      const s = (j.status || '').toString().toLowerCase().trim();
      return s === 'closed' || s === 'completed' || s === 'done';
    });

    const total = list.length || 1;
    const statsMap = {};

    list.forEach(job => {
      const type = (job.jobType || job.deliverableType || 'Others').trim() || 'Others';
      if (!statsMap[type]) {
        statsMap[type] = { type, count: 0, doneCount: 0, pendingCount: 0 };
      }
      statsMap[type].count += 1;
      const s = (job.status || '').toString().toLowerCase().trim();
      if (s === 'closed' || s === 'completed' || s === 'done') {
        statsMap[type].doneCount += 1;
      } else {
        statsMap[type].pendingCount += 1;
      }
    });

    const sortedCats = Object.values(statsMap)
      .map(item => ({
        ...item,
        pct: Math.round((item.count / total) * 100)
      }))
      .sort((a, b) => {
        if (a.type.toLowerCase() === 'others') return 1;
        if (b.type.toLowerCase() === 'others') return -1;
        return b.count - a.count;
      });

    return {
      allMonthDeliverables: list,
      doneDeliverables: done,
      categoryStats: sortedCats
    };
  }, [jobRows]);

  // Fetch SOW Sheet data for this client
  const loadSOWData = async (targetId, tabOverride) => {
    const idToUse = targetId || sowId;
    if (!idToUse) {
      setSowData(null);
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Fetch available tabs in the SOW sheet
      const tabs = await fetchSheetTabs(idToUse);
      if (!tabs || tabs.length === 0) {
        throw new Error('No tabs found in the Scope of Work sheet.');
      }
      setAvailableTabs(tabs);

      // 2. Find tab matching clientName or use tabOverride
      let matchedTab = tabOverride;
      if (!matchedTab) {
        const targetLower = (clientName || '').toLowerCase().trim();
        matchedTab = tabs.find(t => t.toLowerCase().trim() === targetLower);

        // Clean prefix match (e.g. "Shriram Properties (POD2)" or "Shriram Properties" -> "Shriram")
        if (!matchedTab) {
          const cleanName = targetLower.split('(')[0].trim();
          matchedTab = tabs.find(t => {
            const tl = t.toLowerCase().trim();
            return cleanName.includes(tl) || tl.includes(cleanName) ||
                   (cleanName.includes('shriram') && tl.includes('shriram')) ||
                   (cleanName.includes('srhu') && tl.includes('srhu')) ||
                   (cleanName.includes('trehan') && tl.includes('trehan'));
          });
        }

        // If only 1 tab exists or none matched, fallback to first tab
        if (!matchedTab && tabs.length > 0) {
          matchedTab = tabs[0];
        }
      }

      if (!matchedTab) {
        throw new Error(`Could not find a tab for "${clientName}" in the Scope of Work sheet.`);
      }

      setSelectedTab(matchedTab);

      // 3. Fetch raw data for the tab
      const rawValues = await fetchSheetData(idToUse, matchedTab);
      const parsed = parseSOWRows(rawValues, clientName);
      setSowData({
        tabName: matchedTab,
        ...parsed
      });
      setShowUrlInput(false);
    } catch (err) {
      console.warn('[ScopeOfWorkModal] Failed to load SOW data:', err);
      setError(err.message || 'Failed to load Scope of Work sheet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSowData(null);
  }, [clientName]);

  useEffect(() => {
    if (isOpen) {
      if (sowId) {
        if (!sowData) {
          loadSOWData(sowId);
        }
      } else {
        setSowData(null);
      }
    }
  }, [isOpen, sowId, clientName]);

  const handleConnectCustomUrl = async () => {
    const extracted = extractSheetId(urlInput);
    if (!extracted) {
      setError('Invalid Google Sheet URL. Please copy and paste the full URL from your browser address bar.');
      return;
    }

    localStorage.setItem('sow_sheet_override_id', extracted);
    setSowId(extracted);
    setUrlInput('');
    setError('');

    // If activePair exists, save to DB in background
    if (activePair) {
      try {
        const res = await fetch(apiUrl('/api/teams'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...activePair, sowId: extracted })
        });
        const data = await res.json();
        if (onPairsChanged && data.teams) {
          onPairsChanged(data.teams.filter(t => t.active));
        }
      } catch (e) {
        console.warn('Failed to update team with new SOW ID:', e);
      }
    }

    loadSOWData(extracted);
  };

  const handleRemoveSheet = async () => {
    localStorage.removeItem('sow_sheet_override_id');
    setSowId('');
    setSowData(null);
    setAvailableTabs([]);
    setSelectedTab('');
    setShowUrlInput(true);

    if (activePair) {
      try {
        const res = await fetch(apiUrl('/api/teams'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...activePair, sowId: '' })
        });
        const data = await res.json();
        if (onPairsChanged && data.teams) {
          onPairsChanged(data.teams.filter(t => t.active));
        }
      } catch (e) {
        console.warn('Failed to clear team SOW ID:', e);
      }
    }
  };

  const handleTabChange = (tabName) => {
    setSelectedTab(tabName);
    loadSOWData(sowId, tabName);
  };

  const toggleItemStatus = (itemId, currentVal) => {
    const idx = STATUS_CYCLE.indexOf(currentVal);
    const nextVal = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length] || 'Monthly';
    setManualStatusOverrides(prev => ({
      ...prev,
      [itemId]: nextVal
    }));
  };

  // Filter SOW items based on search across all raw cells & fields
  const filteredSowItems = useMemo(() => {
    return (sowData?.items || []).filter(item => {
      if (item.isSectionHeader) {
        return !searchTerm;
      }
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();

      if (Array.isArray(item.rawCells) && item.rawCells.some(c => (c || '').toString().toLowerCase().includes(term))) {
        return true;
      }

      return (
        (item.launchCreative && item.launchCreative.toLowerCase().includes(term)) ||
        (item.numberOfCreative && item.numberOfCreative.toLowerCase().includes(term)) ||
        (item.remarks && item.remarks.toLowerCase().includes(term)) ||
        (item.platforms && item.platforms.toLowerCase().includes(term)) ||
        (item.sizes && item.sizes.toLowerCase().includes(term))
      );
    });
  }, [sowData, searchTerm]);

  // Filter Category Breakdown based on search
  const filteredCategories = useMemo(() => {
    if (!searchTerm) return categoryStats;
    const term = searchTerm.toLowerCase();
    return categoryStats.filter(cat => cat.type.toLowerCase().includes(term));
  }, [categoryStats, searchTerm]);

  if (!isOpen) return null;

  return (
    <div className="sow-modal-backdrop" onClick={onClose}>
      <div 
        className={`sow-modal-container ${isExpanded ? 'expanded' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="sow-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ 
              backgroundColor: 'rgba(59, 130, 246, 0.15)', 
              padding: '0.6rem', 
              borderRadius: '12px', 
              color: '#3B82F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Layers size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Scope of Work vs. Monthly Deliverables
                </h2>
                {activePair?.name && (
                  <span style={{ 
                    fontSize: '0.72rem', 
                    fontWeight: 700, 
                    padding: '0.15rem 0.6rem', 
                    borderRadius: '20px', 
                    background: 'rgba(59, 130, 246, 0.12)', 
                    color: '#3B82F6',
                    border: '1px solid rgba(59, 130, 246, 0.25)'
                  }}>
                    {activePair.name}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{clientName}</strong> • {monthName} {year}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {/* Direct Link to Google Sheet if connected */}
            {sowId && (
              <a
                href={`https://docs.google.com/spreadsheets/d/${sowId}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ 
                  fontSize: '0.78rem', 
                  padding: '0.4rem 0.75rem', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.35rem' 
                }}
                title="Open Scope of Work Google Sheet in a new tab"
              >
                <FileSpreadsheet size={14} color="#10B981" />
                <span>Open SOW Sheet</span>
                <ExternalLink size={12} style={{ opacity: 0.7 }} />
              </a>
            )}

            {sowId && (
              <button
                type="button"
                onClick={() => setShowUrlInput(prev => !prev)}
                className="btn btn-secondary"
                style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                title="Change or reingest Scope of Work sheet URL"
              >
                <Edit3 size={13} />
                <span>{showUrlInput ? 'Hide URL' : 'Change URL'}</span>
              </button>
            )}

            {sowId && (
              <button
                type="button"
                onClick={handleRemoveSheet}
                className="btn btn-secondary"
                style={{ fontSize: '0.78rem', padding: '0.4rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#EF4444' }}
                title="Remove / Disconnect SOW sheet"
              >
                <Trash2 size={13} />
                <span>Remove</span>
              </button>
            )}

            <button 
              onClick={onClose} 
              className="sow-modal-close-btn"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Optional URL Ingestion Bar (Visible when no sheet connected or user clicks Change URL) ── */}
        {(showUrlInput || !sowId) && (
          <div style={{
            padding: '0.85rem 1.4rem',
            background: 'rgba(59, 130, 246, 0.08)',
            borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Link2 size={15} color="#3B82F6" />
                <span>Re-ingest Scope of Work Google Sheet via URL:</span>
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Syncs sheet headers, columns, and tracks Done / Not Done / CTR / ATR / Monthly status
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Link2 size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Paste Google Sheet URL (e.g. https://docs.google.com/spreadsheets/d/1QG7BYHIKowHgXc967OzrODMETezlM67InMXu6rPmN6Q/edit...)"
                  value={urlInput}
                  onChange={e => { setUrlInput(e.target.value); setError(''); }}
                  className="form-control"
                  style={{ paddingLeft: '2.2rem', fontSize: '0.82rem', width: '100%' }}
                />
              </div>
              <button
                className="btn btn-primary"
                style={{ fontSize: '0.82rem', padding: '0.45rem 1rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                onClick={handleConnectCustomUrl}
                disabled={!urlInput.trim() || loading}
              >
                {loading ? <RefreshCw size={14} className="spin" /> : <CheckCircle2 size={14} />}
                <span>Ingest Sheet</span>
              </button>
            </div>
            {error && (
              <div style={{ fontSize: '0.78rem', color: '#EF4444', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <AlertCircle size={13} />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Subheader / Search & Tabs Toolbar ────────────────────────────────────── */}
        <div className="sow-modal-toolbar">
          <div className="sow-search-box">
            <Search size={15} style={{ color: 'var(--text-muted)' }} />
            <input 
              type="text"
              placeholder="Search deliverables, tasks, or sheet columns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="sow-search-input"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => loadSOWData(sowId, selectedTab)}
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              title="Reload SOW Sheet data"
              disabled={loading || !sowId}
            >
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* ── Main View (Split or Expanded) ────────────────────────────────────────────────── */}
        <div className={`sow-modal-body ${isExpanded ? 'expanded' : ''}`}>

          {/* ════════ LEFT SIDE / FULL WIDTH: Scope of Work Table ════════ */}
          <div className="sow-panel left-panel">
            <div className="sow-panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                <span className="sow-panel-title">SCOPE OF WORK (SOW)</span>
                {sowData?.items && (
                  <span className="sow-count-badge">
                    {filteredSowItems.filter(x => !x.isSectionHeader).length} items
                  </span>
                )}
                {sowData?.tabName && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    (Tab: <strong>{sowData.tabName}</strong>)
                  </span>
                )}
              </div>

              {/* Expand / Collapse Button on the right side of Scope */}
              <button
                type="button"
                onClick={() => setIsExpanded(prev => !prev)}
                className="btn btn-secondary sow-expand-btn"
                style={{
                  fontSize: '0.74rem',
                  padding: '0.28rem 0.65rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: isExpanded ? 'rgba(59, 130, 246, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                  color: isExpanded ? '#3B82F6' : 'var(--text-primary)',
                  border: isExpanded ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--card-border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  marginLeft: 'auto',
                  flexShrink: 0
                }}
                title={isExpanded ? "Collapse to 3 columns split view" : "Expand Scope of Work to view full sheet with all columns"}
              >
                {isExpanded ? (
                  <>
                    <Minimize2 size={13} />
                    <span>Collapse</span>
                  </>
                ) : (
                  <>
                    <Maximize2 size={13} />
                    <span>Expand Scope (Full Sheet)</span>
                  </>
                )}
              </button>
            </div>

            {/* SOW Table Container with custom scrollbar */}
            <div className="sow-scroll-container">
              {loading ? (
                <div className="sow-loading-state">
                  <RefreshCw size={26} className="spin" style={{ color: 'var(--accent-primary)' }} />
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    Loading Scope of Work from Google Sheets…
                  </p>
                </div>
              ) : !sowId ? (
                <div className="sow-empty-state">
                  <FileSpreadsheet size={32} style={{ color: '#3B82F6', marginBottom: '0.5rem', opacity: 0.8 }} />
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: 'var(--text-primary)' }}>
                    No Scope of Work Sheet Ingested
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '380px', lineHeight: 1.5, margin: 0 }}>
                    Paste your Scope of Work Google Sheets link in the ingestion bar above to load the deliverables table.
                  </p>
                </div>
              ) : error ? (
                <div className="sow-error-state">
                  <AlertCircle size={24} style={{ color: '#EF4444', marginBottom: '0.35rem' }} />
                  <p style={{ fontSize: '0.85rem', color: '#EF4444', fontWeight: 600 }}>{error}</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '380px', marginTop: '0.2rem', lineHeight: 1.5 }}>
                    Paste your Scope of Work Google Sheet URL below to connect it directly:
                  </p>

                  <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.5rem', width: '100%', maxWidth: '420px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Link2 size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        value={urlInput}
                        onChange={e => setUrlInput(e.target.value)}
                        className="form-control"
                        style={{ paddingLeft: '2.2rem', fontSize: '0.82rem', width: '100%' }}
                      />
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: '0.8rem', padding: '0.45rem 0.9rem', whiteSpace: 'nowrap' }}
                      onClick={handleConnectCustomUrl}
                      disabled={!urlInput.trim()}
                    >
                      Connect SOW
                    </button>
                  </div>
                </div>
              ) : filteredSowItems.length === 0 ? (
                <div className="sow-empty-state">
                  <Layers size={28} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                    {searchTerm ? 'No scope items matching your search.' : 'No scope items found in this sheet tab.'}
                  </p>
                </div>
              ) : isExpanded ? (
                /* ── FULL SHEET VIEW (All columns from Google Sheet as-is + Status) ── */
                <table className="sow-data-table">
                  <thead>
                    <tr>
                      {(sowData?.headers || []).map((hdr, hIdx) => (
                        <th key={hIdx} style={{ textAlign: hIdx === 0 ? 'center' : 'left' }}>
                          {hdr || (hIdx === 0 ? 'S.No' : '')}
                        </th>
                      ))}
                      <th style={{ width: '130px', textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSowItems.map((item, idx) => {
                      const colCount = (sowData?.headers || []).length;
                      if (item.isSectionHeader) {
                        return (
                          <tr key={item.id || idx} style={{ background: 'rgba(59, 130, 246, 0.08)', borderTop: '1px solid rgba(59, 130, 246, 0.2)', borderBottom: '1px solid rgba(59, 130, 246, 0.2)' }}>
                            <td colSpan={colCount + 1} style={{ padding: '0.6rem 1rem', fontWeight: 800, color: '#3B82F6', fontSize: '0.82rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                              {item.sectionTitle}
                            </td>
                          </tr>
                        );
                      }

                      const statusVal = getSowItemStatus(item, allMonthDeliverables, manualStatusOverrides);

                      return (
                        <tr key={item.id || idx}>
                          {(sowData?.headers || []).map((_, cIdx) => {
                            let val = (item.cleanCells?.[cIdx] !== undefined && item.cleanCells[cIdx] !== null) 
                              ? item.cleanCells[cIdx].toString().trim() 
                              : '';
                            if (!val && cIdx === 0) {
                              val = item.sno || (idx + 1);
                            }
                            return (
                              <td 
                                key={cIdx} 
                                style={{ 
                                  textAlign: cIdx === 0 ? 'center' : 'left', 
                                  fontWeight: cIdx === 0 ? 700 : 400, 
                                  color: cIdx === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                                  whiteSpace: cIdx === 1 ? 'normal' : 'nowrap'
                                }}
                              >
                                {val || '—'}
                              </td>
                            );
                          })}
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => toggleItemStatus(item.id, statusVal)}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex' }}
                              title="Click to cycle status: Monthly → Done → CTR → ATR → Not Done"
                            >
                              {renderStatusBadge(statusVal)}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                /* ── 3-COLUMN VIEW (Headers same as Google Sheet: Col 1, Col 2, Col 3 + Status) ── */
                <table className="sow-data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '12%', textAlign: 'center' }}>
                        {sowData?.firstThreeHeaders?.[0] || 'S.No'}
                      </th>
                      <th style={{ width: '44%' }}>
                        {sowData?.firstThreeHeaders?.[1] || 'Deliverable / Scope of Work'}
                      </th>
                      <th style={{ width: '22%', textAlign: 'center' }}>
                        {sowData?.firstThreeHeaders?.[2] || 'Quantity / Frequency'}
                      </th>
                      <th style={{ width: '22%', textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSowItems.map((item, idx) => {
                      if (item.isSectionHeader) {
                        return (
                          <tr key={item.id || idx} style={{ background: 'rgba(59, 130, 246, 0.08)', borderTop: '1px solid rgba(59, 130, 246, 0.2)', borderBottom: '1px solid rgba(59, 130, 246, 0.2)' }}>
                            <td colSpan={4} style={{ padding: '0.6rem 1rem', fontWeight: 800, color: '#3B82F6', fontSize: '0.82rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                              {item.sectionTitle}
                            </td>
                          </tr>
                        );
                      }

                      const statusVal = getSowItemStatus(item, allMonthDeliverables, manualStatusOverrides);

                      return (
                        <tr key={item.id || idx}>
                          {/* Col 1: S.No */}
                          <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            {item.sno || item.cleanCells?.[0] || idx + 1}
                          </td>

                          {/* Col 2: Deliverable / Creative Title */}
                          <td className="sow-item-title-cell">
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                              {item.launchCreative || item.cleanCells?.[1] || '—'}
                            </div>
                            
                            {/* Extra details (Platforms, Sizes, Remarks) */}
                            {(item.platforms || item.sizes || item.remarks) && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.2rem' }}>
                                {item.platforms && (
                                  <span style={{ fontSize: '0.68rem', color: '#3B82F6', background: 'rgba(59, 130, 246, 0.1)', padding: '0.05rem 0.4rem', borderRadius: '4px' }}>
                                    {item.platforms}
                                  </span>
                                )}
                                {item.sizes && (
                                  <span style={{ fontSize: '0.68rem', color: '#10B981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.05rem 0.4rem', borderRadius: '4px' }}>
                                    {item.sizes}
                                  </span>
                                )}
                                {item.remarks && (
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                    {item.remarks}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Col 3: Quantity */}
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                              {item.numberOfCreative || item.cleanCells?.[2] || '—'}
                            </span>
                          </td>

                          {/* Col 4: Status (Done / Not Done / CTR / ATR / Monthly) */}
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => toggleItemStatus(item.id, statusVal)}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex' }}
                              title="Click to cycle status: Monthly → Done → CTR → ATR → Not Done"
                            >
                              {renderStatusBadge(statusVal)}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ════════ RIGHT SIDE: Deliverables This Month (Category Breakdown Table) ════════ */}
          {!isExpanded && (
            <div className="sow-panel right-panel">
              <div className="sow-panel-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="sow-panel-title">DELIVERABLES THIS MONTH</span>
                  <span className="sow-count-badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6' }}>
                    {allMonthDeliverables.length} Total
                  </span>
                  {doneDeliverables.length > 0 && (
                    <span className="sow-count-badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
                      {doneDeliverables.length} Closed / Done
                    </span>
                  )}
                </div>
              </div>

              {/* Scrollable Container with Category Breakdown Table */}
              <div className="sow-scroll-container">
                {filteredCategories.length === 0 ? (
                  <div className="sow-empty-state">
                    <Layers size={28} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                      {searchTerm 
                        ? 'No deliverable categories match your search query.' 
                        : `No deliverables recorded for ${monthName} ${year}.`}
                    </p>
                  </div>
                ) : (
                  <table className="sow-data-table">
                    <thead>
                      <tr>
                        <th style={{ width: '12%', textAlign: 'center' }}>S.No</th>
                        <th style={{ width: '44%' }}>Category / Deliverable Type</th>
                        <th style={{ width: '22%', textAlign: 'center' }}>Total Count</th>
                        <th style={{ width: '22%', textAlign: 'center' }}>% Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCategories.map((cat, idx) => (
                        <tr key={cat.type}>
                          {/* Col 1: S.No */}
                          <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            {idx + 1}
                          </td>

                          {/* Col 2: Category Name */}
                          <td className="sow-item-title-cell">
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                              {cat.type}
                            </div>
                            {cat.doneCount > 0 && (
                              <div style={{ fontSize: '0.7rem', color: '#10B981', marginTop: '0.15rem' }}>
                                {cat.doneCount} of {cat.count} completed
                              </div>
                            )}
                          </td>

                          {/* Col 3: Count Badge */}
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              fontSize: '0.85rem',
                              fontWeight: 800,
                              color: '#3B82F6',
                              background: 'rgba(59, 130, 246, 0.12)',
                              padding: '0.2rem 0.65rem',
                              borderRadius: '6px',
                              display: 'inline-block'
                            }}>
                              {cat.count}
                            </span>
                          </td>

                          {/* Col 4: % Share + Progress bar */}
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                {cat.pct}%
                              </span>
                              <div style={{ width: '56px', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: `${cat.pct}%`, height: '100%', background: '#3B82F6', borderRadius: '2px' }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
