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
  CheckCircle2
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

/**
 * Checks if a SOW item matches any deliverable closed/done this month.
 */
function isSowItemDoneThisMonth(sowItem, completedJobs = []) {
  if (!sowItem) return false;
  if (sowItem.status && (sowItem.status.toLowerCase().includes('done') || sowItem.status.toLowerCase().includes('closed') || sowItem.status.toLowerCase().includes('completed'))) {
    return true;
  }
  const normSow = normalizeText(sowItem.launchCreative || sowItem.sowItem);
  if (!normSow) return false;

  const sowWords = normSow.split(' ').filter(w => w.length > 2);

  return completedJobs.some(job => {
    const jobName = normalizeText(job.deliverable || job.jobId || '');
    if (!jobName) return false;

    // Exact or substring match
    if (jobName.includes(normSow) || normSow.includes(jobName)) return true;

    // Significant token overlap match
    if (sowWords.length > 0) {
      const matchCount = sowWords.filter(word => jobName.includes(word)).length;
      if (matchCount >= Math.min(2, sowWords.length)) return true;
    }

    return false;
  });
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
  const [deliverableFilter, setDeliverableFilter] = useState('all'); // 'all' | 'done' | 'pending'
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  // User manual status override toggle { [sowItemId]: 'Monthly' | 'Done' | 'Not Done' }
  const [manualStatusOverrides, setManualStatusOverrides] = useState({});

  useEffect(() => {
    const idToSet = propSowId || activePair?.sowId || localStorage.getItem('sow_sheet_override_id') || '';
    setSowId(idToSet);
  }, [propSowId, activePair]);

  // Extract completed / closed jobs vs in progress for the selected month
  const { allMonthDeliverables, doneDeliverables, pendingDeliverables, categoryCounts } = useMemo(() => {
    const list = Array.isArray(jobRows) ? jobRows : [];
    const done = list.filter(j => {
      const s = (j.status || '').toString().toLowerCase().trim();
      return s === 'closed' || s === 'completed' || s === 'done';
    });
    const pending = list.filter(j => {
      const s = (j.status || '').toString().toLowerCase().trim();
      return s !== 'closed' && s !== 'completed' && s !== 'done';
    });

    const countsMap = list.reduce((acc, job) => {
      const type = (job.jobType || job.deliverableType || 'Deliverables').trim() || 'Deliverables';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const sortedCats = Object.entries(countsMap).sort((a, b) => {
      if (a[0].toLowerCase() === 'others' || a[0].toLowerCase() === 'deliverables') return 1;
      if (b[0].toLowerCase() === 'others' || b[0].toLowerCase() === 'deliverables') return -1;
      return b[1] - a[1];
    });

    return {
      allMonthDeliverables: list,
      doneDeliverables: done,
      pendingDeliverables: pending,
      categoryCounts: sortedCats
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
    if (isOpen) {
      if (sowId) {
        loadSOWData(sowId);
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
    const nextVal = currentVal === 'Monthly' ? 'Done' : currentVal === 'Done' ? 'Not Done' : 'Monthly';
    setManualStatusOverrides(prev => ({
      ...prev,
      [itemId]: nextVal
    }));
  };

  if (!isOpen) return null;

  // Filter SOW items based on search
  const filteredSowItems = (sowData?.items || []).filter(item => {
    if (item.isSectionHeader) {
      return !searchTerm;
    }

    const matchesSearch = !searchTerm || 
      (item.launchCreative && item.launchCreative.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.numberOfCreative && item.numberOfCreative.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.remarks && item.remarks.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.platforms && item.platforms.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.sizes && item.sizes.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesSearch;
  });

  // Filter Deliverables based on search and status filter
  const filteredDeliverables = allMonthDeliverables.filter(job => {
    const matchesSearch = !searchTerm ||
      (job.deliverable && job.deliverable.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (job.jobType && job.jobType.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (job.jobId && job.jobId.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    const s = (job.status || '').toString().toLowerCase().trim();
    const isDone = s === 'closed' || s === 'completed' || s === 'done';

    if (deliverableFilter === 'done') return isDone;
    if (deliverableFilter === 'pending') return !isDone;

    return true;
  });

  return (
    <div className="sow-modal-backdrop" onClick={onClose}>
      <div 
        className="sow-modal-container"
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
                Extracts [S.No], Launch Creative, Number of Creative, and Monthly/Done Status
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
              placeholder="Search launch creatives or deliverables..."
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

          {/* Tab Selector if available */}
          {availableTabs.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflowX: 'auto', maxWidth: '380px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '0.2rem' }}>Tab:</span>
              {availableTabs.map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleTabChange(tab)}
                  className={`sow-filter-pill ${selectedTab.toLowerCase() === tab.toLowerCase() ? 'active' : ''}`}
                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}

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

        {/* ── Main Split View ────────────────────────────────────────────────── */}
        <div className="sow-modal-body">

          {/* ════════ LEFT SIDE: Scope of Work Table ════════ */}
          <div className="sow-panel left-panel">
            <div className="sow-panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="sow-panel-title">SCOPE OF WORK (SOW)</span>
                {sowData?.items && (
                  <span className="sow-count-badge">
                    {filteredSowItems.filter(x => !x.isSectionHeader).length} items
                  </span>
                )}
                {sowData?.tabName && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    (Tab: <strong>{sowData.tabName}</strong>)
                  </span>
                )}
              </div>
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
              ) : (
                /* Requested Table Headers: S.No | Launch Creative | Number of Creative | Status as of now */
                <table className="sow-data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '10%', textAlign: 'center' }}>S.No</th>
                      <th style={{ width: '45%' }}>Launch Creative</th>
                      <th style={{ width: '25%' }}>Number of Creative</th>
                      <th style={{ width: '20%' }}>Status as of now</th>
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

                      const isDone = isSowItemDoneThisMonth(item, doneDeliverables);
                      const statusVal = manualStatusOverrides[item.id] || (item.isMonthly ? 'Monthly' : (isDone ? 'Done' : 'Not Done'));

                      return (
                        <tr key={item.id || idx}>
                          {/* Col 1: S.No */}
                          <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            {item.sno || idx + 1}
                          </td>

                          {/* Col 2: Launch Creative */}
                          <td className="sow-item-title-cell">
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                              {item.launchCreative}
                            </div>
                            
                            {/* Extra details (Platforms, Sizes, Remarks) */}
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
                          </td>

                          {/* Col 3: Number of Creative */}
                          <td>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                              {item.numberOfCreative || '—'}
                            </span>
                          </td>

                          {/* Col 4: Status as of now (Click to toggle: Monthly / Done / Not Done) */}
                          <td>
                            <button
                              type="button"
                              onClick={() => toggleItemStatus(item.id, statusVal)}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                              title="Click to toggle status (Monthly / Done / Not Done)"
                            >
                              {statusVal === 'Monthly' ? (
                                <span className="sow-badge sow-badge-monthly">
                                  <Calendar size={11} />
                                  <span>Monthly</span>
                                </span>
                              ) : statusVal === 'Done' ? (
                                <span className="sow-badge sow-badge-done">
                                  <Check size={11} />
                                  <span>Done</span>
                                </span>
                              ) : (
                                <span className="sow-badge sow-badge-not-done">
                                  <Clock size={11} />
                                  <span>Not Done</span>
                                </span>
                              )}
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

          {/* ════════ RIGHT SIDE: Deliverables This Month (Original Data & Breakdown) ════════ */}
          <div className="sow-panel right-panel">
            <div className="sow-panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="sow-panel-title">DELIVERABLES THIS MONTH</span>
                <span className="sow-count-badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
                  {doneDeliverables.length} Closed / Done
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  ({allMonthDeliverables.length} Total)
                </span>
              </div>

              {/* Deliverable Status Filter */}
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <button 
                  className={`sow-filter-pill ${deliverableFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setDeliverableFilter('all')}
                >
                  All ({allMonthDeliverables.length})
                </button>
                <button 
                  className={`sow-filter-pill ${deliverableFilter === 'done' ? 'active' : ''}`}
                  onClick={() => setDeliverableFilter('done')}
                >
                  Done ({doneDeliverables.length})
                </button>
                <button 
                  className={`sow-filter-pill ${deliverableFilter === 'pending' ? 'active' : ''}`}
                  onClick={() => setDeliverableFilter('pending')}
                >
                  Pending ({pendingDeliverables.length})
                </button>
              </div>
            </div>

            {/* Scrollable Container with Category Breakdown & Full Deliverables List */}
            <div className="sow-scroll-container" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* 1. Category Breakdown Cards with Progress Bars */}
              {categoryCounts && categoryCounts.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
                    Category Breakdown
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: '0.75rem'
                  }}>
                    {categoryCounts.map(([type, count]) => {
                      const total = allMonthDeliverables.length || 1;
                      const pct = Math.round((count / total) * 100);
                      return (
                        <div key={type} style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid var(--card-border)',
                          borderRadius: '10px',
                          padding: '0.75rem 0.85rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.3rem'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                              {type}
                            </span>
                            <span style={{
                              fontSize: '0.82rem', fontWeight: 800,
                              color: '#3B82F6', background: 'rgba(59, 130, 246, 0.12)',
                              padding: '0.1rem 0.45rem', borderRadius: '5px'
                            }}>
                              {count}
                            </span>
                          </div>
                          <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.15rem' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: '#3B82F6', borderRadius: '2px' }} />
                          </div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {pct}% of month deliverables
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. Deliverables Table */}
              <div>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
                  Monthly Deliverables List ({filteredDeliverables.length})
                </div>

                {filteredDeliverables.length === 0 ? (
                  <div className="sow-empty-state" style={{ padding: '2rem 1rem' }}>
                    <Clock size={28} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                      {searchTerm 
                        ? 'No deliverables match your search query.'
                        : `No ${deliverableFilter !== 'all' ? deliverableFilter : ''} deliverables recorded for ${monthName} ${year}.`}
                    </p>
                  </div>
                ) : (
                  <table className="sow-data-table" style={{ background: 'var(--bg-secondary)', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--card-border)' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '50%' }}>Deliverable / Job Name</th>
                        <th style={{ width: '28%' }}>Status</th>
                        <th style={{ width: '22%' }}>Delivery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeliverables.map((job, idx) => {
                        const s = (job.status || '').toString().toLowerCase().trim();
                        const isClosed = s === 'closed' || s === 'completed' || s === 'done';
                        const isInProg = s === 'in progress' || s === 'in-progress' || s === 'ongoing';
                        const isCTR = s.includes('ctr') || s.includes('client');
                        const isATR = s.includes('atr') || s.includes('agency');

                        let statusBadgeClass = 'sow-job-status-default';
                        if (isClosed) statusBadgeClass = 'sow-job-status-closed';
                        else if (isInProg) statusBadgeClass = 'sow-job-status-inprogress';
                        else if (isCTR) statusBadgeClass = 'sow-job-status-ctr';
                        else if (isATR) statusBadgeClass = 'sow-job-status-atr';

                        return (
                          <tr key={job.jobId || idx}>
                            {/* Deliverable Name */}
                            <td className="sow-item-title-cell">
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                                {job.deliverable || job.jobId || 'Unnamed Deliverable'}
                              </div>
                              {job.jobType && job.jobType.toLowerCase() !== 'others' && job.jobType.toLowerCase() !== 'deliverables' && (
                                <div style={{ fontSize: '0.72rem', color: '#3B82F6', marginTop: '0.1rem' }}>
                                  {job.jobType}
                                </div>
                              )}
                            </td>

                            {/* Status */}
                            <td>
                              <span className={`sow-job-status ${statusBadgeClass}`}>
                                {job.status || 'Active'}
                              </span>
                            </td>

                            {/* Delivery Status */}
                            <td>
                              {isClosed ? (
                                job.timelineStatus?.toLowerCase() === 'delayed' ? (
                                  <span style={{ fontSize: '0.74rem', color: '#EF4444', fontWeight: 700 }}>
                                    Delayed
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.74rem', color: '#10B981', fontWeight: 700 }}>
                                    On-Time
                                  </span>
                                )
                              ) : (
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                  In Progress
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
