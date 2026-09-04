import React, { useState, useEffect } from 'react';
import { Link2, HeartPulse, Plus, Trash2, Check, Pencil, ChevronDown, RefreshCw, AlertCircle } from 'lucide-react';
import { apiUrl } from '../utils/apiClient';

const TEAM_NAMES = ['POD1', 'POD2', 'PANASONIC', 'B2B', 'POD4', 'SRHU'];

function extractSheetId(input) {
  const trimmed = (input || '').trim();
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

function formatSheetUrl(idOrUrl) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('http://') || idOrUrl.startsWith('https://')) return idOrUrl;
  return `https://docs.google.com/spreadsheets/d/${idOrUrl}`;
}

// ── Pair form ─────────────────────────────────────────────────────────────────

function PairForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || TEAM_NAMES[0]);
  const [dailyUrl, setDailyUrl] = useState(formatSheetUrl(initial?.dailyId));
  const [jobUrl, setJobUrl] = useState(formatSheetUrl(initial?.jobId));
  const [sowUrl, setSowUrl] = useState(formatSheetUrl(initial?.sowId));
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handle = async () => {
    setError('');
    const dailyId = extractSheetId(dailyUrl);
    const jobId = extractSheetId(jobUrl);
    const sowId = sowUrl.trim() ? extractSheetId(sowUrl) : '';

    if (!dailyId) { 
      setError('Could not extract a valid ID from the Daily Tracker URL.'); 
      return; 
    }
    if (!jobId) { 
      setError('Could not extract a valid ID from the Job Tracker URL.'); 
      return; 
    }
    if (sowUrl.trim() && !sowId) { 
      setError('Could not extract a valid ID from the Scope of Work (SOW) URL.'); 
      return; 
    }

    setIsSaving(true);
    try {
      await onSave({ 
        name, 
        dailyId, 
        jobId, 
        sowId, 
        active: initial?.active ?? true 
      });
    } catch (err) {
      setError(err.message || 'Failed to save configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  const iconStyle = { position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div>
        <label className="form-label" style={{ fontSize: '0.75rem' }}>Team Name (POD)</label>
        <div style={{ position: 'relative' }}>
          <select className="form-control" style={{ fontSize: '0.88rem', paddingRight: '2.5rem', appearance: 'none' }}
            value={name} onChange={e => { setName(e.target.value); setError(''); }}>
            {TEAM_NAMES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          <ChevronDown size={16} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
        </div>
      </div>
      <div>
        <label className="form-label" style={{ fontSize: '0.75rem' }}>Daily Tracker URL</label>
        <div style={{ position: 'relative' }}>
          <Link2 size={14} style={iconStyle} />
          <input className="form-control" style={{ paddingLeft: '2.2rem', fontSize: '0.88rem' }}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={dailyUrl} onChange={e => { setDailyUrl(e.target.value); setError(''); }} />
        </div>
      </div>
      <div>
        <label className="form-label" style={{ fontSize: '0.75rem' }}>Job Tracker URL</label>
        <div style={{ position: 'relative' }}>
          <Link2 size={14} style={iconStyle} />
          <input className="form-control" style={{ paddingLeft: '2.2rem', fontSize: '0.88rem' }}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={jobUrl} onChange={e => { setJobUrl(e.target.value); setError(''); }} />
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="form-label" style={{ fontSize: '0.75rem' }}>Scope of Work (SOW) Sheet URL</label>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Optional</span>
        </div>
        <div style={{ position: 'relative' }}>
          <Link2 size={14} style={iconStyle} />
          <input className="form-control" style={{ paddingLeft: '2.2rem', fontSize: '0.88rem' }}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={sowUrl} onChange={e => { setSowUrl(e.target.value); setError(''); }} />
        </div>
      </div>
      {error && (
        <div style={{ fontSize: '0.82rem', color: '#EF4444', padding: '0.55rem 0.85rem', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button 
          type="button"
          className="btn btn-primary" 
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }} 
          onClick={handle}
          disabled={isSaving || !dailyUrl.trim() || !jobUrl.trim()}
        >
          {isSaving && <RefreshCw size={14} className="spin" />}
          <span>{isSaving ? 'Saving…' : 'Save Team Sheets'}</span>
        </button>
        {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isSaving}>Cancel</button>}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SheetSetup({ open, onClose, onPairsChanged }) {
  const [pairs, setPairs] = useState([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTeams = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/teams'));
      const data = await res.json();
      setPairs(data.teams || []);
    } catch (err) {
      console.error('Failed to fetch teams:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchTeams();
    }
  }, [open]);

  const handleAdd = async ({ name, dailyId, jobId, sowId, active }) => {
    try {
      const res = await fetch(apiUrl('/api/teams'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, dailyId, jobId, sowId, active }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add team');
      }
      setPairs(data.teams);
      onPairsChanged(data.teams.filter(t => t.active));
      setAdding(false);
    } catch (err) {
      console.error('Failed to add team:', err);
      throw err;
    }
  };

  const handleEdit = async (id, { name, dailyId, jobId, sowId, active }) => {
    try {
      const res = await fetch(apiUrl('/api/teams'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, dailyId, jobId, sowId, active }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update team');
      }
      setPairs(data.teams);
      onPairsChanged(data.teams.filter(t => t.active));
      setEditingId(null);
    } catch (err) {
      console.error('Failed to edit team:', err);
      throw err;
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(apiUrl(`/api/teams/${id}`), {
        method: 'DELETE',
      });
      const data = await res.json();
      setPairs(data.teams);
      onPairsChanged(data.teams.filter(t => t.active));
    } catch (err) {
      console.error('Failed to delete team:', err);
    }
  };

  const handleToggleActive = async (id) => {
    const target = pairs.find(p => p.id === id);
    if (!target) return;
    const activeCount = pairs.filter(p => p.active).length;
    if (target.active && activeCount === 1) return;

    try {
      const res = await fetch(apiUrl('/api/teams'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, active: !target.active }),
      });
      const data = await res.json();
      setPairs(data.teams);
      onPairsChanged(data.teams.filter(t => t.active));
    } catch (err) {
      console.error('Failed to toggle active state:', err);
    }
  };

  const handleClose = () => { setAdding(false); setEditingId(null); onClose(); };

  if (!open) return null;

  return (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', zIndex: 301,
        transform: 'translate(-50%, -50%)',
        width: '90%', maxWidth: '500px', maxHeight: '90vh',
        background: 'var(--bg-primary)', border: '1px solid var(--card-border)',
        borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Configuration</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Team Sheets</h3>
          </div>
          <button onClick={handleClose} style={{ background: 'var(--bg-tertiary)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1rem' }}>✕</button>
        </div>

        {/* List + form */}
        <div style={{ overflowY: 'auto', padding: '1.1rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              <RefreshCw size={24} className="spin" style={{ color: 'var(--accent-primary)', marginBottom: '0.5rem' }} />
              <p style={{ fontSize: '0.85rem' }}>Loading teams…</p>
            </div>
          ) : pairs.map(pair => (
            <div key={pair.id}>
              {editingId === pair.id ? (
                <div style={{ padding: '1rem', borderRadius: 10, border: '1px solid var(--accent-primary)', background: 'var(--card-bg)' }}>
                  <PairForm initial={pair} onSave={(data) => handleEdit(pair.id, data)} onCancel={() => setEditingId(null)} />
                </div>
              ) : (
                <div style={{
                  padding: '0.75rem 1rem', borderRadius: 10,
                  background: pair.active ? 'var(--accent-glow)' : 'var(--card-bg)',
                  border: `1px solid ${pair.active ? 'var(--accent-primary)' : 'var(--card-border)'}`,
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                }}>
                  <button onClick={() => handleToggleActive(pair.id)} title={pair.active ? 'Deactivate' : 'Activate'} style={{
                    width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                    background: pair.active ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    border: `2px solid ${pair.active ? 'var(--accent-primary)' : 'var(--card-border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}>
                    {pair.active && <Check size={12} color="#fff" />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{pair.name}</span>
                      {pair.sowId ? (
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                          SOW Linked
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)' }}>
                          No SOW
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: pair.active ? 'var(--accent-primary)' : 'var(--text-muted)', marginTop: 2 }}>
                      {pair.active ? 'Active' : 'Inactive — click to enable'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button onClick={() => setEditingId(pair.id)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--card-border)', borderRadius: 7, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDelete(pair.id)} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#EF4444' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {adding ? (
            <div style={{ padding: '1rem', borderRadius: 10, border: '1px dashed var(--card-border)', background: 'var(--card-bg)', marginTop: '0.25rem' }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>New Team Sheets</p>
              <PairForm onSave={handleAdd} onCancel={() => setAdding(false)} />
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{
              width: '100%', padding: '0.65rem', borderRadius: 10,
              background: 'transparent', border: '1px dashed var(--card-border)',
              color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
              transition: 'border-color 0.2s, color 0.2s', marginTop: '0.25rem',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.color = 'var(--accent-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <Plus size={15} /> Add Team Sheets
            </button>
          )}
        </div>
      </div>
    </>
  );
}
