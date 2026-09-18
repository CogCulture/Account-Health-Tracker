import React, { useState, useEffect, useCallback, useRef } from 'react';
import ClientSidebar from './components/ClientSidebar';
import ScoreScreen from './components/ScoreScreen';
import HistoryView from './components/HistoryView';
import OverviewDashboard from './components/OverviewDashboard';
import ErrorModal from './components/ErrorModal';
import SheetSetup from './components/SheetSetup';
import MeetingsView from './components/MeetingsView';
import { fetchSheetData, fetchSheetTabs } from './utils/sheetsApi';
import { apiUrl } from './utils/apiClient';
import { parseDailyTrackerRows, parseJobTrackerRows, getCommonClientTabs, parseAssignedPersons } from './utils/sheetsParser';
import { calculateHealthScore } from './utils/scoreEngine';
import { fetchMeetingInsights } from './utils/meetingsApi';
import { RefreshCw, BarChart3, Settings } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export default function App() {
  const [activePairs, setActivePairs] = useState([]);

  const [showSetup, setShowSetup] = useState(false);

  // Period state (controlled here so sidebar & main area share the same values)
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());

  // Selected client
  const [selectedClient, setSelectedClient] = useState(null);

  // Score data for the selected client
  const [scoreData, setScoreData] = useState(null);
  const [calcStatus, setCalcStatus] = useState('idle'); // idle | loading | error
  const [calcError, setCalcError] = useState('');

  // Meetings insights for internal meetings computation
  const [meetings, setMeetings] = useState([]);

  useEffect(() => {
    // Clear any legacy score cache from localStorage to ensure strictly live data
    try {
      localStorage.removeItem('client_health_score_persistent_cache');
    } catch {
      // Ignore storage errors
    }

    fetchMeetingInsights()
      .then(data => {
        if (Array.isArray(data)) setMeetings(data);
      })
      .catch(err => console.warn('[App] Could not load meetings:', err.message));
  }, []);

  // Full result cache in-memory for the current session (populated in real-time by live sheet scans)
  const [clientFullData, setClientFullData] = useState({});
  // Cache: { "ClientName__month__year": { percentage, rating } }
  const [clientScores, setClientScores] = useState({});

  // Lifted client loading states
  const [clients, setClients] = useState([]);
  const [loadStatus, setLoadStatus] = useState('loading');
  const [loadingKeys, setLoadingKeys] = useState(new Set());
  const activeBatchRef = useRef(0);

  const updateFullDataCache = useCallback((key, data) => {
    setClientFullData(prev => ({
      ...prev,
      [key]: data,
    }));
    setClientScores(prev => ({
      ...prev,
      [key]: { percentage: data.scores.percentage, rating: data.rating, ...data }
    }));
  }, []);

  // Error modal
  const [errorMsg, setErrorMsg] = useState('');
  const [isErrorOpen, setIsErrorOpen] = useState(false);

  // View: 'dashboard' | 'history' | 'overview' | 'meetings'
  const [view, setView] = useState('overview');

  // Load active teams from backend on startup
  useEffect(() => {
    const fetchActiveTeams = async () => {
      try {
        const res = await fetch(apiUrl('/api/teams'));
        const data = await res.json();
        const active = data.teams.filter(t => t.active);

        if (active.length > 0) {
          setActivePairs(active);
        } else {
          const envDaily = import.meta.env.VITE_DAILY_SHEET_ID;
          const envJob = import.meta.env.VITE_JOB_SHEET_ID;
          if (envDaily && envJob) {
            setActivePairs([{ id: 'env', name: 'Default', dailyId: envDaily, jobId: envJob, active: true }]);
          } else {
            setLoadStatus('loaded');
            setShowSetup(true);
          }
        }
      } catch (err) {
        console.error('Failed to fetch active teams:', err);
        setLoadStatus('error');
      }
    };
    fetchActiveTeams();
  }, []);

  // ── Load client tabs list ────────────────────────────────────────────────
  const loadClients = useCallback(async () => {
    if (!activePairs.length) return;
    setLoadStatus('loading');
    try {
      // Fetch tabs from all active pairs in parallel
      const results = await Promise.all(activePairs.map(async pair => {
        const [dailyTabs, jobTabs] = await Promise.all([
          fetchSheetTabs(pair.dailyId),
          fetchSheetTabs(pair.jobId),
        ]);
        const common = getCommonClientTabs(dailyTabs, jobTabs);
        return common.map(tabName => ({
          key: `${pair.id}::${tabName}`,
          label: (activePairs.length > 1 && pair.name) ? `${tabName} (${pair.name})` : tabName,
          tabName,
          pairId: pair.id,
          dailyId: pair.dailyId,
          jobId: pair.jobId,
          sowId: pair.sowId || '',
        }));
      }));
      setClients(results.flat());
      setLoadStatus('loaded');
    } catch {
      setLoadStatus('error');
    }
  }, [activePairs]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const syncStatusAging = useCallback(async (label, result) => {
    if (!result || !result.metrics || !result.metrics.p2) {
      return result;
    }
    const targetKey = (result.metrics.p2.allMonthJobs && result.metrics.p2.allMonthJobs.length > 0)
      ? 'allMonthJobs'
      : 'jobs';
    const jobsToSync = result.metrics.p2[targetKey];

    if (!Array.isArray(jobsToSync) || jobsToSync.length === 0) {
      return result;
    }
    try {
      const res = await fetch(apiUrl('/api/job-status/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: label, jobs: jobsToSync }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.jobs)) {
          result.metrics.p2[targetKey] = data.jobs;
        }
      }
    } catch (err) {
      console.warn('[statusSync] Failed to sync status aging:', err);
    }
    return result;
  }, []);

  // ── Persistent Progressive Retry for Client Sheet Data ────────────────────
  const fetchClientWithPersistentRetry = useCallback(async (clientEntry, targetMonth, targetYear) => {
    const { key, tabName, dailyId, jobId, label } = clientEntry;
    const cacheKey = `${key}__${targetMonth}__${targetYear}`;

    // Backoff ladder: 4s -> 10s -> 20s -> 40s -> 60s (repeating 60s until successful)
    const backoffSchedule = [4000, 10000, 20000, 40000, 60000];
    let attempt = 0;

    while (true) {
      try {
        const [dailyRaw, jobRaw] = await Promise.all([
          fetchSheetData(dailyId, tabName),
          fetchSheetData(jobId, tabName),
        ]);
        const pair = activePairs.find(p => p.id === clientEntry.pairId);
        const isPanasonic = (tabName || '').toLowerCase().includes('panasonic') ||
          (label || '').toLowerCase().includes('panasonic') ||
          (pair && pair.name || '').toLowerCase().includes('panasonic');
        const dailyRows = parseDailyTrackerRows(dailyRaw, tabName);
        const jobRows = parseJobTrackerRows(jobRaw, tabName, isPanasonic);
        const assigned = parseAssignedPersons(dailyRaw);
        let result = calculateHealthScore(dailyRows, jobRows, label, targetMonth, targetYear, pair?.name, assigned);
        result = await syncStatusAging(label, result);
        updateFullDataCache(cacheKey, result);
        return result;
      } catch (err) {
        const delayMs = backoffSchedule[Math.min(attempt, backoffSchedule.length - 1)];
        attempt++;
        console.warn(`[persistentRetry] Live fetch for "${label}" failed (${err.message}). Retrying in ${delayMs / 1000}s (attempt #${attempt})...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }, [activePairs, updateFullDataCache, syncStatusAging]);

  // ── Select a client → fetch + calculate ───────────────────────────────────
  const handleSelectClient = useCallback(async (clientKey) => {
    setSelectedClient(clientKey);
    setCalcError('');
    setView('dashboard');

    if (!clientKey) return;

    const clientEntry = clients.find(c => c.key === clientKey);
    if (!clientEntry) return;

    const { tabName, dailyId, jobId, label } = clientEntry;
    const cacheKey = `${clientKey}__${month}__${year}`;

    // ── Use cached full data if already loaded live by the overview batch ──────────
    if (clientFullData[cacheKey] && Array.isArray(clientFullData[cacheKey].assignedPersons)) {
      setScoreData(clientFullData[cacheKey]);
      setCalcStatus('idle');

      // Silently revalidate against live sheet in background
      fetchClientWithPersistentRetry(clientEntry, month, year)
        .then(freshResult => {
          if (freshResult) setScoreData(freshResult);
        })
        .catch(err => console.warn('[backgroundRevalidate]', err));

      // Check if previous months are missing and fetch background rows to populate trend graph
      const missingPrev = [];
      for (let offset = -2; offset <= -1; offset++) {
        let pm = month + offset;
        let py = year;
        if (pm < 0) { pm += 12; py -= 1; }
        const pKey = `${clientKey}__${pm}__${py}`;
        if (!clientFullData[pKey]) missingPrev.push({ pm, py, pKey });
      }

      if (missingPrev.length > 0) {
        (async () => {
          try {
            const [dailyRaw, jobRaw] = await Promise.all([
              fetchSheetData(dailyId, tabName),
              fetchSheetData(jobId, tabName),
            ]);
            const pair = activePairs.find(p => p.id === clientEntry.pairId);
            const isPanasonic = (tabName || '').toLowerCase().includes('panasonic') ||
              (label || '').toLowerCase().includes('panasonic') ||
              (pair && pair.name || '').toLowerCase().includes('panasonic');
            const dailyRows = parseDailyTrackerRows(dailyRaw, tabName);
            const jobRows = parseJobTrackerRows(jobRaw, tabName, isPanasonic);

            for (const item of missingPrev) {
              let pResult = calculateHealthScore(dailyRows, jobRows, label, item.pm, item.py, pair?.name);
              pResult = await syncStatusAging(label, pResult);
              updateFullDataCache(item.pKey, pResult);
            }
          } catch (e) {
            console.warn('[trendAutoCalc] Failed to preload missing months on cache hit:', e);
          }
        })();
      }
      return;
    }

    // ── Otherwise fetch fresh from Google Sheets with Persistent Retry ─────────
    setScoreData(null);
    setCalcStatus('loading');

    try {
      const result = await fetchClientWithPersistentRetry(clientEntry, month, year);
      if (result) {
        setScoreData(result);
        setCalcStatus('idle');

        // Auto-calculate previous 2 months so trend chart populates immediately
        const [dailyRaw, jobRaw] = await Promise.all([
          fetchSheetData(dailyId, tabName),
          fetchSheetData(jobId, tabName),
        ]).catch(() => [null, null]);

        if (dailyRaw && jobRaw) {
          const pair = activePairs.find(p => p.id === clientEntry.pairId);
          const isPanasonic = (tabName || '').toLowerCase().includes('panasonic') ||
            (label || '').toLowerCase().includes('panasonic') ||
            (pair && pair.name || '').toLowerCase().includes('panasonic');
          const dailyRows = parseDailyTrackerRows(dailyRaw, tabName);
          const jobRows = parseJobTrackerRows(jobRaw, tabName, isPanasonic);

          for (let offset = -2; offset <= -1; offset++) {
            let pm = month + offset;
            let py = year;
            if (pm < 0) {
              pm += 12;
              py -= 1;
            }
            const pCacheKey = `${clientKey}__${pm}__${py}`;
            if (!clientFullData[pCacheKey]) {
              try {
                let pResult = calculateHealthScore(dailyRows, jobRows, label, pm, py, pair?.name);
                pResult = await syncStatusAging(label, pResult);
                updateFullDataCache(pCacheKey, pResult);
              } catch (e) {
                console.warn(`[trendAutoCalc] Failed for month ${pm}:`, e);
              }
            }
          }
        }
      }
    } catch (err) {
      setCalcStatus('error');
      setCalcError(err.message);
      setErrorMsg(err.message);
      setIsErrorOpen(true);
    }
  }, [month, year, clients, clientFullData, activePairs, updateFullDataCache, syncStatusAging, fetchClientWithPersistentRetry]);

  const handleReload = useCallback(async () => {
    setCalcStatus('loading');
    fetchMeetingInsights()
      .then(data => {
        if (Array.isArray(data)) setMeetings(data);
      })
      .catch(err => console.warn('[App] Could not reload meetings:', err.message));
    const clientsPromise = loadClients();
    if (selectedClient) {
      const clientEntry = clients.find(c => c.key === selectedClient);
      if (clientEntry) {
        try {
          const { tabName, dailyId, jobId, label } = clientEntry;
          const [dailyRaw, jobRaw] = await Promise.all([
            fetchSheetData(dailyId, tabName),
            fetchSheetData(jobId, tabName),
          ]);
          const pair = activePairs.find(p => p.id === clientEntry.pairId);
          const isPanasonic = (tabName || '').toLowerCase().includes('panasonic') ||
            (label || '').toLowerCase().includes('panasonic') ||
            (pair && pair.name || '').toLowerCase().includes('panasonic');
          const dailyRows = parseDailyTrackerRows(dailyRaw, tabName);
          const jobRows = parseJobTrackerRows(jobRaw, tabName, isPanasonic);
          const assigned = parseAssignedPersons(dailyRaw);
          let result = calculateHealthScore(dailyRows, jobRows, label, month, year, pair?.name, assigned);
          result = await syncStatusAging(label, result);
          setScoreData(result);
          setCalcStatus('idle');
          const cacheKey = `${selectedClient}__${month}__${year}`;
          updateFullDataCache(cacheKey, result);
        } catch (err) {
          setCalcStatus('error');
          setCalcError(err.message);
          setErrorMsg(err.message);
          setIsErrorOpen(true);
        }
      }
    } else {
      setCalcStatus('idle');
    }
    await clientsPromise;
  }, [selectedClient, clients, loadClients, month, year, activePairs, updateFullDataCache, syncStatusAging]);

  // ── Batch-load all clients for Overview Dashboard with Pacing & Retry ─────
  const batchLoadAllClients = useCallback(async (clientList, targetMonth = month, targetYear = year) => {
    if (!clientList || clientList.length === 0) return;
    
    // Mark all clients as loading in this batch
    const keys = new Set(clientList.map(c => c.key));
    setLoadingKeys(keys);

    const batchId = ++activeBatchRef.current;
    const PACING_DELAY_MS = 800;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < clientList.length; i++) {
      if (activeBatchRef.current !== batchId) {
        break; // New batch was triggered
      }

      const clientEntry = clientList[i];
      try {
        await fetchClientWithPersistentRetry(clientEntry, targetMonth, targetYear);
      } catch (err) {
        console.error(`[batchLoad] Error for ${clientEntry.label}:`, err);
      } finally {
        if (activeBatchRef.current === batchId) {
          setLoadingKeys(prev => {
            const next = new Set(prev);
            next.delete(clientEntry.key);
            return next;
          });
        }
      }

      if (i < clientList.length - 1 && activeBatchRef.current === batchId) {
        await sleep(PACING_DELAY_MS);
      }
    }
  }, [month, year, fetchClientWithPersistentRetry]);

  // Auto-sync real-time scores in background on startup and whenever clients or month/year changes
  useEffect(() => {
    if (clients.length > 0) {
      batchLoadAllClients(clients, month, year);
    }
  }, [clients, month, year, batchLoadAllClients]);

  // Re-calculate when month/year changes if a client is already selected
  const handleMonthChange = (m) => {
    setMonth(m);
    setScoreData(null);
    setCalcStatus('idle');
    if (selectedClient) {
      // Trigger recalculation with new month
      setTimeout(() => { }, 0); // will trigger via useEffect below
    }
  };

  const handleYearChange = (y) => {
    setYear(y);
    setScoreData(null);
    setCalcStatus('idle');
  };

  // When period changes and a client is selected, recalculate
  useEffect(() => {
    if (selectedClient) {
      handleSelectClient(selectedClient);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  return (
    <div className="app-layout">

      {/* ── Sheet Setup Screen ───────────────────────────────────────────── */}
      <SheetSetup
        open={showSetup}
        onClose={() => setShowSetup(false)}
        onPairsChanged={(newActivePairs) => {
          setActivePairs(newActivePairs);
          setClients([]);
          setSelectedClient(null);
          setScoreData(null);
        }}
      />

      {/* ── Left Sidebar ─────────────────────────────────────────────────── */}
      <ClientSidebar
        onShowHistory={() => setView(view === 'history' ? 'dashboard' : 'history')}
        onShowOverview={() => setView(view === 'overview' ? 'dashboard' : 'overview')}
        onShowMeetings={() => setView(view === 'meetings' ? 'dashboard' : 'meetings')}
        onShowSettings={() => setShowSetup(true)}
        month={month}
        year={year}
        onMonthChange={handleMonthChange}
        onYearChange={handleYearChange}
        selectedClient={selectedClient}
        onSelectClient={handleSelectClient}
        clientScores={clientScores}
        clients={clients}
        activePairs={activePairs}
        loadStatus={loadStatus}
        loadingKeys={loadingKeys}
        onLoadClients={loadClients}
        activeView={view}
      />

      {/* ── Main Content Area ─────────────────────────────────────────────── */}
      <main className="main-panel">
        {view === 'history' ? (
          <HistoryView
            onViewDetails={(record) => {
              setScoreData(record);
              setSelectedClient(record.clientName);
              setView('dashboard');
            }}
          />
        ) : view === 'meetings' ? (
          <MeetingsView />
        ) : view === 'overview' ? (
          <OverviewDashboard
            clients={clients}
            loadStatus={loadStatus}
            loadingKeys={loadingKeys}
            month={month}
            year={year}
            clientScores={clientFullData}
            onSelectClient={(key) => { setView('dashboard'); handleSelectClient(key); }}
            onBatchLoad={batchLoadAllClients}
            activePairs={activePairs}
          />
        ) : (
          <>
            {/* Loading state */}
            {calcStatus === 'loading' && (
              <div className="main-panel-empty">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                  <RefreshCw size={36} className="spin" style={{ color: 'var(--accent-primary)' }} />
                  <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
                    Fetching data for <strong style={{ color: 'var(--text-primary)' }}>{clients.find(c => c.key === selectedClient)?.label || selectedClient}</strong>…
                  </p>
                </div>
              </div>
            )}

            {/* Score screen */}
            {calcStatus !== 'loading' && scoreData && (
              <div style={{ padding: '2rem', overflowY: 'auto', height: '100%' }}>
                <ScoreScreen
                  scoreData={scoreData}
                  allClientScores={clientFullData}
                  onReset={() => { setScoreData(null); setSelectedClient(null); setView('overview'); }}
                  onSaveSuccess={() => window.dispatchEvent(new Event('storage'))}
                  onReload={handleReload}
                  meetings={meetings}
                  sowId={clients.find(c => c.key === selectedClient)?.sowId || activePairs.find(p => p.id === clients.find(c => c.key === selectedClient)?.pairId)?.sowId}
                  activePair={activePairs.find(p => p.id === clients.find(c => c.key === selectedClient)?.pairId)}
                  onPairsChanged={(newActivePairs) => setActivePairs(newActivePairs)}
                />
              </div>
            )}

            {/* Empty state — no client selected */}
            {calcStatus === 'idle' && !scoreData && (
              <div className="main-panel-empty">
                <div style={{ textAlign: 'center' }}>
                  <BarChart3 size={52} style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }} />
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    Select a client
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', maxWidth: '320px', lineHeight: 1.6 }}>
                    Choose a client from the sidebar to calculate and view their account health score.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <ErrorModal
        isOpen={isErrorOpen}
        errorMessage={errorMsg}
        onClose={() => setIsErrorOpen(false)}
      />
    </div>
  );
}
