import React, { useState, useCallback, useEffect } from 'react';
import { RefreshCw, FileSpreadsheet, AlertCircle, ChevronDown, Play } from 'lucide-react';
import { fetchSheetTabs, fetchSheetData } from '../utils/sheetsApi';
import { getCommonClientTabs, parseDailyTrackerRows, parseJobTrackerRows } from '../utils/sheetsParser';

const DAILY_SHEET_ID  = import.meta.env.VITE_DAILY_SHEET_ID;
const JOB_SHEET_ID    = import.meta.env.VITE_JOB_SHEET_ID;

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
const YEARS = Array.from({ length: 6 }, (_, i) => 2023 + i);

export default function UploadScreen({
  onCalculationComplete,
  onErrorOccurred,
  initialClientName = '',
  initialMonth = new Date().getMonth(),
  initialYear  = new Date().getFullYear(),
}) {
  const [clientOptions, setClientOptions] = useState([]);
  const [clientName, setClientName]       = useState(initialClientName);
  const [month, setMonth]                 = useState(initialMonth);
  const [year, setYear]                   = useState(initialYear);

  const [loadStatus, setLoadStatus] = useState('idle'); // idle | loading | loaded | error
  const [loadError, setLoadError]   = useState('');
  const [calcStatus, setCalcStatus] = useState('idle'); // idle | loading | error

  // Auto-load clients on mount
  useEffect(() => {
    handleLoadClients();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load clients from both sheets ─────────────────────────────────────────
  const handleLoadClients = useCallback(async () => {
    if (!DAILY_SHEET_ID || !JOB_SHEET_ID) {
      setLoadError('VITE_DAILY_SHEET_ID or VITE_JOB_SHEET_ID is not set in your .env file.');
      setLoadStatus('error');
      return;
    }

    setLoadStatus('loading');
    setLoadError('');
    setClientOptions([]);
    setClientName('');

    try {
      const [dailyTabs, jobTabs] = await Promise.all([
        fetchSheetTabs(DAILY_SHEET_ID),
        fetchSheetTabs(JOB_SHEET_ID),
      ]);

      const common = getCommonClientTabs(dailyTabs, jobTabs);

      if (common.length === 0) {
        setLoadError(
          'No matching client tabs found in both sheets. Make sure each client has a tab with the same name in both the Daily Tracker and Job Tracker sheets.'
        );
        setLoadStatus('error');
        return;
      }

      setClientOptions(common);
      setClientName(common[0]);
      setLoadStatus('loaded');
    } catch (err) {
      setLoadError(err.message || 'Failed to connect to Google Sheets. Is the backend server running?');
      setLoadStatus('error');
    }
  }, []);

  // ── Calculate score ────────────────────────────────────────────────────────
  const handleCalculate = useCallback(async () => {
    if (!clientName) return;

    setCalcStatus('loading');

    try {
      const [dailyRawRows, jobRawRows] = await Promise.all([
        fetchSheetData(DAILY_SHEET_ID, clientName),
        fetchSheetData(JOB_SHEET_ID, clientName),
      ]);

      const dailyRows = parseDailyTrackerRows(dailyRawRows, clientName);
      const jobRows   = parseJobTrackerRows(jobRawRows, clientName);

      onCalculationComplete({
        dailyRows,
        jobRows,
        clientName,
        month: parseInt(month),
        year:  parseInt(year),
      });

      setCalcStatus('idle');
    } catch (err) {
      setCalcStatus('idle');
      onErrorOccurred(err.message);
    }
  }, [clientName, month, year, onCalculationComplete, onErrorOccurred]);

  const isLoaded   = loadStatus === 'loaded';
  const isLoading  = loadStatus === 'loading';
  const isCalcing  = calcStatus === 'loading';
  const canCalc    = isLoaded && clientName !== '' && !isCalcing;

  return (
    <div className="upload-screen">
      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <div className="glass-card-header">
          <h2 className="glass-card-title">
            <FileSpreadsheet size={20} className="text-green" />
            Client Health — Load from Google Sheets
          </h2>
        </div>

        {/* ── Connection status bar ─────────────────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '2rem',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--card-border)',
        }}>
          {/* Status icon / spinner */}
          {isLoading ? (
            <RefreshCw size={15} className="spin" style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          ) : loadStatus === 'error' ? (
            <AlertCircle size={15} style={{ color: 'var(--color-critical)', flexShrink: 0 }} />
          ) : isLoaded ? (
            <span style={{ fontSize: '1rem', lineHeight: 1 }}>✓</span>
          ) : null}

          {/* Status text */}
          <span style={{ fontSize: '0.9rem', color: isLoaded ? 'var(--color-excel)' : loadStatus === 'error' ? 'var(--color-critical)' : 'var(--text-secondary)', flex: 1 }}>
            {isLoading && 'Connecting to Google Sheets…'}
            {isLoaded && `Connected — ${clientOptions.length} client${clientOptions.length !== 1 ? 's' : ''} loaded`}
            {loadStatus === 'error' && loadError}
            {loadStatus === 'idle' && 'Loading clients…'}
          </span>

          {/* Refresh button */}
          <button
            className="btn btn-secondary btn-outline"
            onClick={handleLoadClients}
            disabled={isLoading}
            title="Refresh client list"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}
          >
            <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
            Refresh
          </button>
        </div>

        {/* ── Step 2: Select Client + Period ──────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr',
            gap: '1.5rem',
            marginBottom: '2rem',
            opacity: isLoaded ? 1 : 0.4,
            pointerEvents: isLoaded ? 'auto' : 'none',
            transition: 'opacity 0.3s',
          }}
        >
          {/* Client */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="client-name-select" className="form-label">Client</label>
            <div style={{ position: 'relative' }}>
              <select
                id="client-name-select"
                className="form-control"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                disabled={!isLoaded}
                style={{ paddingRight: '2.5rem', appearance: 'none' }}
              >
                {clientOptions.length === 0 ? (
                  <option value="">— load clients first —</option>
                ) : (
                  clientOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))
                )}
              </select>
              <ChevronDown
                size={16}
                style={{
                  position: 'absolute', right: '0.75rem',
                  top: '50%', transform: 'translateY(-50%)',
                  pointerEvents: 'none', color: 'var(--text-secondary)',
                }}
              />
            </div>
          </div>

          {/* Month */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="report-month-select" className="form-label">Report Month</label>
            <select
              id="report-month-select"
              className="form-control"
              value={month}
              onChange={e => setMonth(parseInt(e.target.value))}
              disabled={!isLoaded}
            >
              {MONTHS.map((m, idx) => (
                <option key={m} value={idx}>{m}</option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="report-year-select" className="form-label">Report Year</label>
            <select
              id="report-year-select"
              className="form-control"
              value={year}
              onChange={e => setYear(parseInt(e.target.value))}
              disabled={!isLoaded}
            >
              {YEARS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Calculate Button ─────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary"
            onClick={handleCalculate}
            disabled={!canCalc}
            style={{
              width: '240px',
              padding: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
            }}
          >
            {isCalcing ? (
              <><RefreshCw size={16} className="spin" /> Fetching &amp; Calculating…</>
            ) : (
              <><Play size={16} /> Calculate Health Score</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
