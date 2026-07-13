import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Download, Bookmark, BookmarkCheck, ChevronRight, RefreshCw, AlertTriangle, X } from 'lucide-react';
import Chart from 'chart.js/auto';
import { generateHealthReportPDF } from '../utils/pdfGenerator';
import ParameterDrawer from './ParameterDrawer';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function ScoreScreen({ scoreData, onReset, onSaveSuccess, onReload }) {
  const { clientName, month, year, scores, metrics, rating, badgeColor, badgeText, ratingBand, insights, solutions, escalationCount, pendingLargeJobs } = scoreData;
  const monthName = MONTH_NAMES[month];

  const lowerName = (clientName || '').toLowerCase().trim();
  const isNoInPersonBrand = lowerName.startsWith('digital connexion') ||
                            lowerName.startsWith('bpl') ||
                            lowerName.startsWith('kelvinator') ||
                            lowerName.startsWith('kalvinator');

  const [isSaved, setIsSaved] = useState(false);
  const [openParam, setOpenParam] = useState(null);
  const [priorityModal, setPriorityModal] = useState(null);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const [showPendingJobsModal, setShowPendingJobsModal] = useState(false);
  const [showEscalationsModal, setShowEscalationsModal] = useState(false);

  useEffect(() => {
    setIsBannerDismissed(false);
    setShowPendingJobsModal(false);
    setShowEscalationsModal(false);
  }, [clientName]);

  const statusCanvasRef = useRef(null);
  const priorityCanvasRef = useRef(null);
  const delayCanvasRef = useRef(null);

  const statusChartInstanceRef = useRef(null);
  const priorityChartInstanceRef = useRef(null);
  const delayChartInstanceRef = useRef(null);

  // Circle gauge
  const maxCircumference = 440;
  const percentage = scores.percentage || Math.round((scores.total / 40) * 100);
  const strokeDashoffset = maxCircumference - (percentage / 100) * maxCircumference;

  const handleDownloadPDF = () => generateHealthReportPDF(scoreData);

  const handleSaveToHistory = () => {
    try {
      const historyKey = 'client_health_dashboard_history';
      const rawHistory = localStorage.getItem(historyKey);
      let historyList = rawHistory ? JSON.parse(rawHistory) : [];

      const duplicateIndex = historyList.findIndex(item =>
        item.clientName.toLowerCase().trim() === clientName.toLowerCase().trim() &&
        item.month === month && item.year === year
      );

      const recordToSave = {
        id: `${clientName.replace(/\s+/g, '_')}_${month}_${year}_${Date.now()}`,
        clientName, month, year, scores, metrics, rating,
        badgeColor, badgeText, ratingBand, insights,
        savedAt: new Date().toISOString()
      };

      if (duplicateIndex >= 0) historyList[duplicateIndex] = recordToSave;
      else historyList.push(recordToSave);

      localStorage.setItem(historyKey, JSON.stringify(historyList));
      setIsSaved(true);
      if (onSaveSuccess) onSaveSuccess();
    } catch (err) {
      console.error('Failed to save assessment to history:', err);
    }
  };

  const getBadgeClass = () => {
    if (rating === 'Excellent') return 'badge-green';
    if (rating === 'Good') return 'badge-yellow';
    if (rating === 'Needs Attention') return 'badge-orange';
    return 'badge-red';
  };

  const getTextColorClass = () => {
    if (rating === 'Excellent') return 'text-green';
    if (rating === 'Good') return 'text-yellow';
    if (rating === 'Needs Attention') return 'text-orange';
    return 'text-red';
  };

  // Render Charts when scoreData changes
  useEffect(() => {
    const jobs = scoreData.jobsList || [];

    // Get active theme to stylize charts dynamically
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#94a3b8' : '#475569';

    // Inline plugin to draw data values above vertical bars
    const verticalDatalabelsPlugin = {
      id: 'verticalDatalabels',
      afterDatasetsDraw(chart) {
        const { ctx, data } = chart;
        ctx.save();
        ctx.font = 'bold 11px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        chart.getDatasetMeta(0).data.forEach((element, index) => {
          const value = data.datasets[0].data[index];
          if (value !== undefined && value !== null) {
            const { x, y } = element.tooltipPosition();
            ctx.fillStyle = '#1e293b';
            ctx.fillText(value, x, y - 6);
          }
        });
        ctx.restore();
      }
    };

    // Inline plugin to draw data values next to horizontal bars
    const horizontalDatalabelsPlugin = {
      id: 'horizontalDatalabels',
      afterDatasetsDraw(chart) {
        const { ctx, data } = chart;
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 11px Outfit, sans-serif';
        chart.getDatasetMeta(0).data.forEach((element, index) => {
          const value = data.datasets[0].data[index];
          if (value !== undefined && value !== null) {
            const { x, y } = element.tooltipPosition();
            ctx.fillStyle = '#1e293b';
            ctx.fillText(value, x + 6, y);
          }
        });
        ctx.restore();
      }
    };

    // ── 1. STATUS CHART (Vertical Bar) ──
    if (statusCanvasRef.current) {
      if (statusChartInstanceRef.current) {
        statusChartInstanceRef.current.destroy();
      }

      const statusMap = {};
      jobs.forEach(j => {
        const s = j.status || 'Unknown';
        statusMap[s] = (statusMap[s] || 0) + 1;
      });

      const STATUS_ORDER = ['Closed', 'Completed', 'CTR (Client to Revert)', 'In Progress', 'ATR (Agency to Revert)', 'Not Started', 'Hold', 'Not Required Anymore'];
      const sortedStatuses = Object.keys(statusMap).sort((a, b) => {
        let idxA = STATUS_ORDER.findIndex(s => s.toLowerCase() === a.toLowerCase());
        let idxB = STATUS_ORDER.findIndex(s => s.toLowerCase() === b.toLowerCase());
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
      });

      const labels = sortedStatuses;
      const dataPoints = sortedStatuses.map(s => statusMap[s]);

      const ctx = statusCanvasRef.current.getContext('2d');
      statusChartInstanceRef.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data: dataPoints,
            backgroundColor: labels.map(l => {
              const lower = l.toLowerCase();
              if (lower === 'closed' || lower === 'completed') return '#4a8b6f'; // dull sage green
              if (lower === 'in progress' || lower === 'wip' || lower === 'active') return '#5a7fa4'; // dull steel blue
              if (lower === 'paused' || lower === 'deferred') return '#d19a66'; // dull orange/amber
              if (lower === 'cancelled') return '#b35d5d'; // dull red
              if (lower === 'ctr (client to revert)') return '#856a9e'; // dull slate purple
              if (lower === 'not required anymore') return '#94a3b8'; // dull slate gray
              return '#707d8c'; // dull gray
            }),
            borderRadius: 6,
            borderWidth: 0,
            barThickness: 22,
          }]
        },
        plugins: [verticalDatalabelsPlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { 
                color: textColor, 
                font: { family: 'Outfit', size: 10 },
                maxRotation: 20,
                minRotation: 20
              }
            },
            y: {
              grid: { color: gridColor },
              ticks: { color: textColor, font: { family: 'Outfit', size: 11 } },
              beginAtZero: true,
              grace: '10%'
            }
          }
        }
      });
    }

    // ── 2. PRIORITY CHART (Horizontal Bar) ──
    if (priorityCanvasRef.current) {
      if (priorityChartInstanceRef.current) {
        priorityChartInstanceRef.current.destroy();
      }

      const priorityJobMap = { XXL: [], XL: [], L: [], M: [], S: [] };
      jobs.forEach(j => {
        const p = (j.priority || '').toString().trim().toUpperCase();
        if (priorityJobMap[p]) priorityJobMap[p].push(j);
      });

      const sortedPriorities = ['XXL', 'XL', 'L', 'M', 'S'];
      const labels = sortedPriorities;
      const dataPoints = sortedPriorities.map(p => priorityJobMap[p].length);

      const ctx = priorityCanvasRef.current.getContext('2d');
      priorityChartInstanceRef.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data: dataPoints,
            backgroundColor: labels.map(p => {
              if (p === 'XXL') return '#115e59';
              if (p === 'XL') return '#f59e0b';
              if (p === 'L') return '#0e7490';
              if (p === 'M') return '#475569';
              if (p === 'S') return '#94a3b8';
              return '#4b5563';
            }),
            borderRadius: 6,
            borderWidth: 0,
            barThickness: 22,
          }]
        },
        plugins: [horizontalDatalabelsPlugin],
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          onClick: (_, elements) => {
            if (!elements.length) return;
            const idx = elements[0].index;
            const priority = sortedPriorities[idx];
            const priorityJobs = priorityJobMap[priority] || [];
            if (priorityJobs.length > 0) {
              setPriorityModal({ priority, jobs: priorityJobs });
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          },
          onHover: (event, elements) => {
            event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
          },
          scales: {
            x: {
              grid: { color: gridColor },
              ticks: { color: textColor, font: { family: 'Outfit', size: 11 } },
              beginAtZero: true,
              grace: '10%'
            },
            y: {
              grid: { display: false },
              ticks: { color: textColor, font: { family: 'Outfit', size: 12, weight: 'bold' } }
            }
          }
        }
      });
    }

    // ── 3. DELAY VS ON TIME CHART (Pie) ──
    if (delayCanvasRef.current) {
      const closedJobs = jobs.filter(row => {
        const status = (row.status || '').toString().trim().toLowerCase();
        return status === 'closed' || status === 'completed';
      });

      let onTime = 0;
      let delayed = 0;
      let unEvaluated = 0;

      closedJobs.forEach(row => {
        const deadline = row.clientTimeline ? new Date(row.clientTimeline) : null;
        const actualDate = row.deliveryDate ? new Date(row.deliveryDate) : null;
        if (deadline && actualDate) {
          if (actualDate.getTime() <= deadline.getTime()) onTime++;
          else delayed++;
        } else {
          unEvaluated++;
        }
      });

      const labels = [];
      const dataPoints = [];
      const colors = [];

      if (onTime > 0) {
        labels.push(`On-Time (${onTime})`);
        dataPoints.push(onTime);
        colors.push('#eab308'); // gold
      }
      if (delayed > 0) {
        labels.push(`Delayed (${delayed})`);
        dataPoints.push(delayed);
        colors.push('#0f766e'); // dark teal
      }
      if (unEvaluated > 0) {
        labels.push(`No Date (${unEvaluated})`);
        dataPoints.push(unEvaluated);
        colors.push('#64748b'); // grey
      }

      if (closedJobs.length === 0) {
        labels.push('No Closed Jobs');
        dataPoints.push(1);
        colors.push('rgba(255,255,255,0.05)');
      }

      if (delayChartInstanceRef.current) {
        delayChartInstanceRef.current.destroy();
      }

      const ctx = delayCanvasRef.current.getContext('2d');
      delayChartInstanceRef.current = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{
            data: dataPoints,
            backgroundColor: colors,
            borderWidth: 1,
            borderColor: isDark ? '#090d16' : '#ffffff',
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: textColor,
                font: { family: 'Outfit', size: 11 },
                boxWidth: 10,
                padding: 8
              }
            },
            tooltip: { enabled: true }
          }
        }
      });
    }

    return () => {
      if (statusChartInstanceRef.current) statusChartInstanceRef.current.destroy();
      if (priorityChartInstanceRef.current) priorityChartInstanceRef.current.destroy();
      if (delayChartInstanceRef.current) delayChartInstanceRef.current.destroy();
    };
  }, [scoreData]);

  // Clickable parameter card
  const ParamCard = ({ id, title, sub, score }) => {
    const statPills = [];
    if (id === 'p1') {
      if (!isNoInPersonBrand) {
        statPills.push({ label: 'In-person calls', value: metrics.p1.inPersonCalls });
      }
      statPills.push({ label: 'On-call attendance', value: `${Math.round(metrics.p1.attendanceRate)}%` });
    }
    if (id === 'p3') {
      statPills.push({ label: 'Creative meetings', value: metrics.p3.creativeAttendDays });
      statPills.push({ label: 'Management meetings', value: metrics.p3.managementAttendDays });
    }
    if (id === 'p4') {
      statPills.push({ label: 'Initiative Approved', value: metrics.p4.proactiveDetails.initPaidApproved });
      statPills.push({ label: 'Initiative Unapproved', value: metrics.p4.proactiveDetails.initPaidUnapproved });
    }

    return (
      <div
        className="glass-card parameter-card param-card-clickable"
        onClick={() => setOpenParam(id)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setOpenParam(id)}
        title={`Click to view ${title} details`}
      >
        <div>
          <div className="parameter-top">
            <div className="parameter-info">
              <h3>{title}</h3>
              <p>{sub}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="parameter-points">
                {score}<span className="parameter-points-max">/10</span>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{ width: `${(score / 10) * 100}%`, backgroundColor: badgeColor }}
            />
          </div>
        </div>

        {/* Stat pills */}
        {statPills.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            {statPills.map((s, i) => (
              <div key={i} style={{
                flex: 1,
                padding: '0.45rem 0.75rem',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--card-border)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Priority mini-stats for Delivery Date card */}
        {id === 'p2' && (() => {
          const jobs = metrics.p2.jobs || [];
          const priMap = {};
          jobs.forEach(j => {
            const p = (j.priority || '').toString().trim().toUpperCase();
            if (p !== 'XL' && p !== 'XXL') return;
            if (!priMap[p]) priMap[p] = { total: 0, onTime: 0 };
            priMap[p].total++;
            if (j.onTime === true) priMap[p].onTime++;
          });
          const sorted = ['XXL', 'XL'].filter(p => priMap[p]);
          return (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
              {sorted.map(p => {
                const { total, onTime } = priMap[p];
                const rate = Math.round((onTime / total) * 100);
                const color = rate < 85 ? '#EF4444' : 'var(--text-primary)';
                return (
                  <div key={p} style={{
                    flex: 1,
                    padding: '0.45rem 0.75rem',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${rate < 85 ? 'rgba(239,68,68,0.3)' : 'var(--card-border)'}`,
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color, lineHeight: 1 }}>{rate}%</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{p} on-time</div>
                  </div>
                );
              })}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (escalationCount > 0) setShowEscalationsModal(true);
                }}
                disabled={escalationCount === 0}
                style={{
                  flex: 1,
                  padding: '0.45rem 0.75rem',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${escalationCount > 0 ? 'rgba(239,68,68,0.3)' : 'var(--card-border)'}`,
                  textAlign: 'center',
                  cursor: escalationCount > 0 ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                  color: 'inherit',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => { if (escalationCount > 0) { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; } }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              >
                <div style={{
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: escalationCount > 0 ? '#EF4444' : 'var(--text-primary)',
                  lineHeight: 1
                }}>{escalationCount}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Escalation{escalationCount !== 1 ? 's' : ''}
                </div>
              </button>
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="score-screen">
      {/* Pending XL/XXL Jobs Floating Notification & Modal */}
      {pendingLargeJobs && pendingLargeJobs.length > 0 && !isBannerDismissed && (
        <>
          <div 
            className="pending-jobs-floating-badge" 
            onClick={() => setShowPendingJobsModal(true)}
          >
            <div className="badge-pulse-icon">
              <AlertTriangle size={16} style={{ color: '#d97706' }} />
            </div>
            <span style={{ fontWeight: 600 }}>
              Attention: {pendingLargeJobs.length} High-Priority Job{pendingLargeJobs.length !== 1 ? 's' : ''} (XL/XXL) Pending
            </span>
            <button 
              className="badge-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsBannerDismissed(true);
              }}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>

          {showPendingJobsModal && (
            <div className="modal-overlay" onClick={() => setShowPendingJobsModal(false)}>
              <div className="premium-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <AlertTriangle style={{ color: '#d97706' }} size={20} />
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Pending High-Priority Jobs</h3>
                  </div>
                  <button className="modal-close-icon-btn" onClick={() => setShowPendingJobsModal(false)}>
                    <X size={18} />
                  </button>
                </div>
                <div className="modal-body">
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                    Below are the active XL and XXL jobs currently pending for <strong>{clientName}</strong>.
                  </p>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="premium-jobs-table">
                      <thead>
                        <tr>
                          {!((clientName || '').toLowerCase().includes('panasonic')) && <th>Job ID</th>}
                          <th>Deliverable</th>
                          <th>Priority</th>
                          <th>Due Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingLargeJobs.map(job => (
                          <tr key={job.jobId}>
                            {!((clientName || '').toLowerCase().includes('panasonic')) && <td className="job-id-cell">{job.jobId}</td>}
                            <td className="deliverable-cell">{job.deliverable}</td>
                            <td>
                              <span className={`priority-badge-${job.priority.toLowerCase()} size-badge`}>
                                {job.priority}
                              </span>
                            </td>
                            <td className="due-date-cell">{job.dueDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Results Header */}
      <div className="glass-card" style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ backgroundColor: 'var(--accent-glow)', padding: '0.75rem', borderRadius: '12px', color: 'var(--accent-primary)' }}>
            <Calendar size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{clientName}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Relationship assessment for {monthName} {year}</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button onClick={onReload} className="btn btn-secondary" title="Reload metrics data from source sheets">
            <RefreshCw size={18} /> Reload
          </button>
          <button
            onClick={handleSaveToHistory}
            className={`btn btn-secondary ${isSaved ? 'text-green' : ''}`}
            disabled={isSaved}
          >
            {isSaved ? <><BookmarkCheck size={18} /> Saved to History</> : <><Bookmark size={18} /> Save Record</>}
          </button>
          <button onClick={handleDownloadPDF} className="btn btn-secondary">
            <Download size={18} /> Export PDF Report
          </button>
        </div>
      </div>

      <div className="score-summary-grid">
        {/* Gauge */}
        <div className="glass-card radial-score-container" style={{ borderColor: badgeColor, boxShadow: `0 8px 32px 0 ${badgeColor}1a` }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1.5rem', fontWeight: 600 }}>
            Relationship Health
          </h3>
          <div className="gauge-wrapper">
            <svg className="gauge-svg" viewBox="0 0 160 160">
              <circle className="gauge-bg" cx="80" cy="80" r="70" />
              <circle
                className="gauge-fill"
                cx="80" cy="80" r="70"
                style={{ stroke: badgeColor, strokeDasharray: maxCircumference, strokeDashoffset }}
              />
            </svg>
            <div className="gauge-text">
              <span className={`gauge-score-value ${getTextColorClass()}`}>{percentage}%</span>
              <span className="gauge-score-max">HEALTH SCORE</span>
            </div>
            {scores.escalationDeduction > 0 && (
              <span 
                className="deduction-badge"
                data-tooltip={`${scores.escalationDeduction}% deducted because of ${Math.round(scores.escalationPercentage)}% escalation`}
              >
                -{scores.escalationDeduction}%
              </span>
            )}
          </div>
          <div className={`health-badge ${getBadgeClass()}`}>
            <span style={{ fontSize: '1.15rem' }}>{ratingBand}</span>
            <span>{badgeText}</span>
          </div>
          <button
            onClick={() => setSolutionsOpen(true)}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1.25rem',
              borderRadius: 20,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--card-border)',
              color: 'var(--text-secondary)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = badgeColor; e.currentTarget.style.color = badgeColor; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            View Solutions
          </button>
        </div>

        {/* 4 Parameter Cards */}
        <div className="parameters-grid">
          <ParamCard id="p1" title="JSR Calling" sub={isNoInPersonBrand ? "Daily JSR call attendance" : "In-person meetings + daily attendance"} score={scores.p1} />
          <ParamCard id="p2" title="Delivery Date" sub="Ratio of on-time closed deliverables" score={scores.p2} />
          <ParamCard id="p3" title="Cross-Functional Meeting" sub="Creative & Management attendances" score={scores.p3} />
          <ParamCard id="p4" title="Proactiveness" sub="Initiative task index" score={scores.p4} />
        </div>
      </div>

      {/* ── Charts Grid Section ───────────────────────────── */}
      <div className="charts-grid">
        {/* Status Card */}
        <div className="chart-card">
          <div className="chart-card-header">
            <h3>Status</h3>
          </div>
          <div className="chart-card-body">
            <canvas ref={statusCanvasRef} />
          </div>
        </div>

        {/* Priority Card */}
        <div className="chart-card">
          <div className="chart-card-header">
            <h3>Priority</h3>
          </div>
          <div className="chart-card-body" style={{ cursor: 'pointer' }}>
            <canvas ref={priorityCanvasRef} title="Click a bar to see tasks" />
          </div>
        </div>

        {/* Delay vs On Time Card */}
        <div className="chart-card">
          <div className="chart-card-header">
            <h3>Delay V/S On Time</h3>
          </div>
          <div className="chart-card-body">
            <canvas ref={delayCanvasRef} />
          </div>
        </div>
      </div>

      {/* Priority Drill-Down Modal */}
      {priorityModal && (
        <>
          <div
            onClick={() => setPriorityModal(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(5px)',
            }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', zIndex: 201,
            width: '90%', maxWidth: '520px', maxHeight: '80vh',
            background: 'var(--bg-primary)',
            border: '1px solid var(--card-border)',
            borderRadius: 16,
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
            transform: 'translate(-50%, -50%)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '1.1rem 1.4rem',
              borderBottom: '1px solid var(--card-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
                  Priority
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                  {priorityModal.priority} — {priorityModal.jobs.length} task{priorityModal.jobs.length !== 1 ? 's' : ''}
                </h3>
              </div>
              <button
                onClick={() => setPriorityModal(null)}
                style={{
                  background: 'var(--bg-tertiary)', border: 'none', borderRadius: 8,
                  width: 32, height: 32, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)',
                }}
              >
                ✕
              </button>
            </div>
            {/* List */}
            <div style={{ overflowY: 'auto', padding: '1rem 1.4rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {priorityModal.jobs.map((job, i) => (
                <div key={i} style={{
                  padding: '0.65rem 0.9rem', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--card-border)',
                  fontSize: '0.85rem', color: 'var(--text-primary)',
                }}>
                  <div style={{ fontWeight: 500 }}>{job.deliverable || job.jobId || '(no name)'}</div>
                  {job.status && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>
                      Status: {job.status}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Solutions Modal */}
      {solutionsOpen && solutions && (
        <>
          <div onClick={() => setSolutionsOpen(false)} style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(5px)',
          }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', zIndex: 201,
            width: '90%', maxWidth: '580px', maxHeight: '90vh',
            background: 'var(--bg-primary)',
            border: '1px solid var(--card-border)',
            borderRadius: 16,
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
            transform: 'translate(-50%, -50%)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '1.1rem 1.5rem',
              borderBottom: '1px solid var(--card-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
                  Recommendations
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>💡 Solutions for {clientName}</h3>
              </div>
              <button onClick={() => setSolutionsOpen(false)} style={{
                background: 'var(--bg-tertiary)', border: 'none', borderRadius: 8,
                width: 32, height: 32, display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)',
              }}>✕</button>
            </div>
            {/* Content */}
            <div style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {[
                { id: 'p1', title: 'JSR Calling', color: '#60a5fa' },
                { id: 'p2', title: 'Delivery Date', color: '#10B981' },
                { id: 'p3', title: 'Cross-Functional Meeting', color: '#f59e0b' },
                { id: 'p4', title: 'Proactiveness', color: '#a78bfa' },
              ].map(({ id, title, color }) => {
                const tips = solutions?.[id] || [];
                return (
                  <div key={id} style={{
                    borderRadius: 10,
                    border: `1px solid ${color}33`,
                  }}>
                    <div style={{
                      padding: '0.6rem 1rem',
                      background: `${color}18`,
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color }}>{title}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {scores[id]}/10
                      </span>
                    </div>
                    <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {tips.map((tip, i) => (
                        <div key={i} style={{ display: 'flex', gap: '0.6rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                          <span style={{ color, flexShrink: 0, marginTop: 2 }}>→</span>
                          <span>{tip}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Escalations Modal */}
      {showEscalationsModal && (
        <>
          <div onClick={() => setShowEscalationsModal(false)} style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(5px)',
          }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', zIndex: 201,
            width: '90%', maxWidth: '600px', maxHeight: '85vh',
            background: 'var(--bg-primary)',
            border: '1px solid var(--card-border)',
            borderRadius: 16,
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
            transform: 'translate(-50%, -50%)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '1.1rem 1.5rem',
              borderBottom: '1px solid var(--card-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Escalated Jobs for {clientName}</h3>
              </div>
              <button onClick={() => setShowEscalationsModal(false)} style={{
                background: 'var(--bg-tertiary)', border: 'none', borderRadius: 8,
                width: 32, height: 32, display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)',
              }}>✕</button>
            </div>
            {/* Content */}
            <div style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(scoreData?.jobsList?.filter(row => {
                const val = (row.escalation || '').toString().trim().toLowerCase();
                return val && val !== '' && val !== 'no' && val !== 'n' && val !== 'na' && val !== 'false' && val !== '0' && val !== 'none' && val !== 'n/a' && val !== '-';
              }) || []).map((job, i) => (
                <div key={i} style={{
                  padding: '1rem',
                  borderRadius: 10,
                  border: '1px solid var(--card-border)',
                  background: 'rgba(255,255,255,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {job.deliverable || job.jobId || 'Unnamed Deliverable'}
                    </div>
                    {job.jobId && (
                      <span style={{ fontSize: '0.72rem', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 4, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        {job.jobId}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.25rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <div><strong>Job Type:</strong> {job.jobType || '—'}</div>
                    <div><strong>Status:</strong> {job.status || '—'}</div>
                    <div><strong>Client Timeline:</strong> {job.clientTimeline ? new Date(job.clientTimeline).toLocaleDateString() : '—'}</div>
                    <div><strong>Delivery Date:</strong> {job.deliveryDate ? new Date(job.deliveryDate).toLocaleDateString() : '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Parameter Detail Drawer */}
      <ParameterDrawer
        param={openParam}
        scoreData={scoreData}
        onClose={() => setOpenParam(null)}
      />
    </div>
  );
}
