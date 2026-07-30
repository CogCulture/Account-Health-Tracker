import React, { useState, useEffect, useRef } from 'react';
import { Search, Trash2, Download, Eye, TrendingUp, Info } from 'lucide-react';
import Chart from 'chart.js/auto';
import { generateHealthReportPDF } from '../utils/pdfGenerator';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function HistoryView({ onViewDetails }) {
  const [history, setHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientForTrend, setSelectedClientForTrend] = useState('');

  const canvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

  // Load history from localStorage
  const loadHistory = () => {
    try {
      const raw = localStorage.getItem('client_health_dashboard_history');
      if (raw) {
        setHistory(JSON.parse(raw));
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  useEffect(() => {
    loadHistory();
    
    // Add event listener to refresh history when tabs change or save occurs
    window.addEventListener('storage', loadHistory);
    return () => window.removeEventListener('storage', loadHistory);
  }, []);

  // Filter history
  const filteredHistory = history.filter(item => 
    item.clientName.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  // Get list of unique client names for trend selection
  const uniqueClients = Array.from(new Set(history.map(h => h.clientName.trim())));

  // Auto-select first client for trend if none is selected
  useEffect(() => {
    if (uniqueClients.length > 0 && !selectedClientForTrend) {
      setSelectedClientForTrend(uniqueClients[0]);
    }
  }, [uniqueClients, selectedClientForTrend]);

  // Render chart
  useEffect(() => {
    if (!canvasRef.current || !selectedClientForTrend) return;

    // Filter and sort historical records for selected client
    const clientRecords = history
      .filter(h => h.clientName.toLowerCase().trim() === selectedClientForTrend.toLowerCase().trim())
      .sort((a, b) => {
        const indexA = a.year * 12 + a.month;
        const indexB = b.year * 12 + b.month;
        return indexA - indexB;
      });

    const labels = clientRecords.map(r => `${MONTH_NAMES[r.month].substring(0, 3)} ${r.year}`);
    const dataPoints = clientRecords.map(r => r.scores.total);

    // Context colors for light theme
    const gridColor = 'rgba(0, 0, 0, 0.06)';
    const textColor = '#475569';
    const lineColor = '#2563eb';
    const pointColor = '#16a34a';

    // Destroy old instance
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const ctx = canvasRef.current.getContext('2d');
    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: `${selectedClientForTrend} Health Score Trend`,
          data: dataPoints,
          borderColor: lineColor,
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          fill: true,
          tension: 0.3,
          borderWidth: 3,
          pointBackgroundColor: pointColor,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: textColor,
              font: {
                family: 'Outfit',
                size: 13,
                weight: 500
              }
            }
          },
          tooltip: {
            backgroundColor: '#ffffff',
            titleColor: '#0f172a',
            bodyColor: '#475569',
            borderColor: 'rgba(0,0,0,0.1)',
            borderWidth: 1,
            titleFont: { family: 'Outfit', weight: 'bold' },
            bodyFont: { family: 'Outfit' },
            padding: 12,
            callbacks: {
              label: function(context) {
                const record = clientRecords[context.dataIndex];
                return ` Score: ${context.parsed.y}/40 (${record.badgeText})`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Outfit' } }
          },
          y: {
            min: 0,
            max: 40,
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Outfit' }, stepSize: 5 }
          }
        }
      }
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [history, selectedClientForTrend]);

  const handleDeleteRecord = (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this historical health scorecard?')) return;

    try {
      const updated = history.filter(item => item.id !== id);
      localStorage.setItem('client_health_dashboard_history', JSON.stringify(updated));
      setHistory(updated);
      
      // If we deleted the currently selected trend client and they are no longer in list, clear selection
      const remainingUnique = Array.from(new Set(updated.map(h => h.clientName.trim())));
      if (!remainingUnique.includes(selectedClientForTrend)) {
        setSelectedClientForTrend(remainingUnique[0] || '');
      }
    } catch (err) {
      console.error('Failed to delete history record:', err);
    }
  };

  const getBadgeClass = (rating) => {
    if (rating === 'Excellent') return 'badge-green';
    if (rating === 'Good') return 'badge-yellow';
    if (rating === 'Needs Attention') return 'badge-orange';
    return 'badge-red';
  };

  return (
    <div className="history-view">
      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <div className="history-header">
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Historical Relationships Index
          </h2>
          <div className="history-filter-container">
            <div style={{ position: 'relative', flex: 1 }}>
              <label htmlFor="history-search-input" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Search clients</label>
              <input 
                id="history-search-input"
                type="text" 
                className="form-control" 
                placeholder="Search clients..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                style={{ paddingLeft: '2.5rem' }}
              />
              <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <Info size={36} style={{ marginBottom: '1rem', opacity: 0.5 }} />
            <p>No historical scorecards match your search criteria.</p>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Generate and save a health score from the Workspace tab to get started.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Assessment Month</th>
                  <th style={{ textAlign: 'center' }}>JSR Calling (/10)</th>
                  <th style={{ textAlign: 'center' }}>Delivery (/10)</th>
                  <th style={{ textAlign: 'center' }}>Cross-Func (/10)</th>
                  <th style={{ textAlign: 'center' }}>Proactive (/10)</th>
                  <th style={{ textAlign: 'center' }}>Total Score (/40)</th>
                  <th>Rating Band</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>{item.clientName}</td>
                    <td>{MONTH_NAMES[item.month]} {item.year}</td>
                    <td style={{ textAlign: 'center' }}>{item.scores.p1}</td>
                    <td style={{ textAlign: 'center' }}>{item.scores.p2}</td>
                    <td style={{ textAlign: 'center' }}>{item.scores.p3}</td>
                    <td style={{ textAlign: 'center' }}>{item.scores.p4}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{item.scores.total}</td>
                    <td>
                      <span className={`health-badge ${getBadgeClass(item.rating)}`} style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}>
                        {item.ratingBand} {item.badgeText}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          onClick={() => onViewDetails(item)} 
                          className="btn btn-secondary" 
                          style={{ padding: '0.4rem', borderRadius: '6px' }}
                          title="View Score Details"
                        >
                          <Eye size={14} />
                        </button>
                        <button 
                          onClick={() => generateHealthReportPDF(item)} 
                          className="btn btn-secondary" 
                          style={{ padding: '0.4rem', borderRadius: '6px' }}
                          title="Download PDF"
                        >
                          <Download size={14} />
                        </button>
                        <button 
                          onClick={(e) => handleDeleteRecord(item.id, e)} 
                          className="btn btn-secondary text-red" 
                          style={{ padding: '0.4rem', borderRadius: '6px', borderColor: 'rgba(239, 68, 68, 0.15)' }}
                          title="Delete Record"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {uniqueClients.length > 0 && (
        <div className="glass-card chart-card">
          <div className="history-header" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={18} className="text-green" /> Client Health Score Trend Analysis
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <label htmlFor="trend-client-select" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Select Client:</label>
              <select 
                id="trend-client-select"
                className="form-control" 
                value={selectedClientForTrend} 
                onChange={(e) => setSelectedClientForTrend(e.target.value)}
                style={{ width: '200px', padding: '0.4rem 0.75rem' }}
              >
                {uniqueClients.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {selectedClientForTrend && history.filter(h => h.clientName.toLowerCase().trim() === selectedClientForTrend.toLowerCase().trim()).length < 2 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              <Info size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
              <p>Add at least 2 monthly records for <strong>{selectedClientForTrend}</strong> to visualize historical trend lines.</p>
            </div>
          ) : (
            <div className="chart-wrapper">
              <canvas ref={canvasRef}></canvas>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
