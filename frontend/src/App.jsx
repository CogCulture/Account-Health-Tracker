import React, { useState, useEffect, useCallback } from 'react';
import ClientSidebar from './components/ClientSidebar';
import ScoreScreen from './components/ScoreScreen';
import HistoryView from './components/HistoryView';
import ErrorModal from './components/ErrorModal';
import SheetSetup from './components/SheetSetup';
import { fetchSheetData, fetchSheetTabs } from './utils/sheetsApi';
import { parseDailyTrackerRows, parseJobTrackerRows, getCommonClientTabs } from './utils/sheetsParser';
import { calculateHealthScore } from './utils/scoreEngine';
import { RefreshCw, BarChart3, Settings } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export default function App() {
  const [activePairs, setActivePairs] = useState([]);

  const [showSetup, setShowSetup] = useState(false);

  // Period state (controlled here so sidebar & main area share the same values)
  const [month, setMonth] = useState(new Date().getMonth());
  const [year,  setYear]  = useState(new Date().getFullYear());

  // Selected client
  const [selectedClient, setSelectedClient] = useState(null);

  // Score data for the selected client
  const [scoreData,    setScoreData]    = useState(null);
  const [calcStatus,   setCalcStatus]   = useState('idle'); // idle | loading | error
  const [calcError,    setCalcError]    = useState('');

  // Cache: { "ClientName__month__year": { percentage, rating } }
  const [clientScores, setClientScores] = useState({});

  // Lifted client loading states
  const [clients, setClients]       = useState([]);
  const [loadStatus, setLoadStatus] = useState('loading');

  // Error modal
  const [errorMsg,    setErrorMsg]    = useState('');
  const [isErrorOpen, setIsErrorOpen] = useState(false);

  // View: 'dashboard' | 'history'
  const [view, setView] = useState('dashboard');

  // Load active teams from backend on startup
  useEffect(() => {
    const fetchActiveTeams = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/teams`);
        const data = await res.json();
        const active = data.teams.filter(t => t.active);
        
        if (active.length > 0) {
          setActivePairs(active);
        } else {
          const envDaily = import.meta.env.VITE_DAILY_SHEET_ID;
          const envJob   = import.meta.env.VITE_JOB_SHEET_ID;
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

  // ── Select a client → fetch + calculate ───────────────────────────────────
  const handleSelectClient = useCallback(async (clientKey) => {
    setSelectedClient(clientKey);
    setScoreData(null);
    setCalcError('');
    setView('dashboard');

    if (!clientKey) return;

    const clientEntry = clients.find(c => c.key === clientKey);
    if (!clientEntry) return;

    const { tabName, dailyId, jobId, label } = clientEntry;
    const cacheKey = `${clientKey}__${month}__${year}`;

    setCalcStatus('loading');

    try {
      const [dailyRaw, jobRaw] = await Promise.all([
        fetchSheetData(dailyId, tabName),
        fetchSheetData(jobId, tabName),
      ]);

      const dailyRows = parseDailyTrackerRows(dailyRaw, tabName);
      const jobRows   = parseJobTrackerRows(jobRaw, tabName);
      const result    = calculateHealthScore(dailyRows, jobRows, label, month, year);

      setScoreData(result);
      setCalcStatus('idle');

      setClientScores(prev => ({
        ...prev,
        [cacheKey]: { percentage: result.scores.percentage, rating: result.rating },
      }));
    } catch (err) {
      setCalcStatus('error');
      setCalcError(err.message);
      setErrorMsg(err.message);
      setIsErrorOpen(true);
    }
  }, [month, year, clients]);

  const handleReload = useCallback(async () => {
    setCalcStatus('loading');
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
          const dailyRows = parseDailyTrackerRows(dailyRaw, tabName);
          const jobRows   = parseJobTrackerRows(jobRaw, tabName);
          const result    = calculateHealthScore(dailyRows, jobRows, label, month, year);
          setScoreData(result);
          setCalcStatus('idle');
          const cacheKey = `${selectedClient}__${month}__${year}`;
          setClientScores(prev => ({ ...prev, [cacheKey]: { percentage: result.scores.percentage, rating: result.rating } }));
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
  }, [selectedClient, clients, loadClients, month, year]);

  // Re-calculate when month/year changes if a client is already selected
  const handleMonthChange = (m) => {
    setMonth(m);
    setScoreData(null);
    setCalcStatus('idle');
    if (selectedClient) {
      // Trigger recalculation with new month
      setTimeout(() => {}, 0); // will trigger via useEffect below
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
        onShowSettings={() => setShowSetup(true)}
        month={month}
        year={year}
        onMonthChange={handleMonthChange}
        onYearChange={handleYearChange}
        selectedClient={selectedClient}
        onSelectClient={handleSelectClient}
        clientScores={clientScores}
        clients={clients}
        loadStatus={loadStatus}
        onLoadClients={loadClients}
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
                  onReset={() => { setScoreData(null); setSelectedClient(null); }}
                  onSaveSuccess={() => window.dispatchEvent(new Event('storage'))}
                  onReload={handleReload}
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
