import React, { useState } from 'react';
import { Link2, HeartPulse, Plus, Trash2, Check, Pencil } from 'lucide-react';

const STORAGE_KEY = 'client_health_sheet_pairs';

function extractSheetId(input) {
  const trimmed = (input || '').trim();
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

export function loadPairs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    // Migrate from old single-pair format
    const oldRaw = localStorage.getItem('client_health_sheet_ids');
    if (oldRaw) {
      const old = JSON.parse(oldRaw);
      const migrated = [{ id: '1', name: 'Default', dailyId: old.dailyId, jobId: old.jobId, active: true }];
      savePairs(migrated);
      return migrated;
    }
    return [];
  } catch { return []; }
}

export function savePairs(pairs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pairs));
}

export function getActivePair() {
  const pairs = loadPairs();
  return pairs.find(p => p.active) || pairs[0] || null;
}

export function getActivePairs() {
  const pairs = loadPairs();
  const active = pairs.filter(p => p.active);
  return active.length > 0 ? active : (pairs[0] ? [pairs[0]] : []);
}

// ── Pair form ─────────────────────────────────────────────────────────────────

function PairForm({ initial, onSave, onCancel }) {
  const [name,     setName]     = useState(initial?.name    || '');
  const [dailyUrl, setDailyUrl] = useState(initial?.dailyId || '');
  const [jobUrl,   setJobUrl]   = useState(initial?.jobId   || '');
  const [error,    setError]    = useState('');

  const handle = () => {
    const dailyId = extractSheetId(dailyUrl);
    const jobId   = extractSheetId(jobUrl);
    if (!dailyId) { setError('Could not extract a valid ID from the Daily Tracker URL.'); return; }
    if (!jobId)   { setError('Could not extract a valid ID from the Job Tracker URL.'); return; }
    onSave({ name: name.trim(), dailyId, jobId });
  };

  const iconStyle = { position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div>
        <label className="form-label" style={{ fontSize: '0.75rem' }}>Pair Name</label>
        <input className="form-control" style={{ fontSize: '0.88rem' }} placeholder="e.g. Team A" value={name}
          onChange={e => { setName(e.target.value); setError(''); }} />
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
      {error && (
        <div style={{ fontSize: '0.82rem', color: '#EF4444', padding: '0.55rem 0.85rem', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={handle}
          disabled={!dailyUrl.trim() || !jobUrl.trim()}>
          Save Pair
        </button>
        {onCancel && <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SheetSetup({ open, onClose, onPairsChanged }) {
  const [pairs,     setPairs]     = useState(loadPairs);
  const [adding,    setAdding]    = useState(false);
  const [editingId, setEditingId] = useState(null);

  const persist = (updated) => { savePairs(updated); setPairs(updated); onPairsChanged(updated.filter(p => p.active)); };

  const handleAdd = ({ name, dailyId, jobId }) => {
    const id      = Date.now().toString();
    const isFirst = pairs.length === 0;
    const updated = [...pairs, { id, name, dailyId, jobId, active: isFirst }];
    persist(updated);
    setAdding(false);
  };

  const handleEdit = (id, { name, dailyId, jobId }) => {
    const updated = pairs.map(p => p.id === id ? { ...p, name, dailyId, jobId } : p);
    persist(updated);
    setEditingId(null);
  };

  const handleDelete = (id) => {
    let updated = pairs.filter(p => p.id !== id);
    // ensure at least one active if possible
    if (updated.length > 0 && !updated.find(p => p.active)) {
      updated[0] = { ...updated[0], active: true };
    }
    persist(updated);
  };

  const handleToggleActive = (id) => {
    const target  = pairs.find(p => p.id === id);
    const activeCount = pairs.filter(p => p.active).length;
    // Prevent deactivating last active pair
    if (target.active && activeCount === 1) return;
    const updated = pairs.map(p => p.id === id ? { ...p, active: !p.active } : p);
    persist(updated);
  };

  const handleClose = () => { setAdding(false); setEditingId(null); onClose(); };

  // First-run: no pairs at all → full-screen onboarding
  if (pairs.length === 0) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <div style={{ width: '100%', maxWidth: '480px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 16, padding: '2rem', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.75rem' }}>
            <HeartPulse size={22} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontSize: '1rem', fontWeight: 700 }}>Account Health Dashboard</span>
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.3rem' }}>Connect your Google Sheets</h2>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            Add your first sheet pair. You can add more pairs later from the sidebar.
          </p>
          <PairForm onSave={(data) => {
            const id = Date.now().toString();
            const updated = [{ id, ...data, active: true }];
            savePairs(updated);
            setPairs(updated);
            onPairsChanged(updated);
          }} />
        </div>
      </div>
    );
  }

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
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Sheet Pairs</h3>
          </div>
          <button onClick={handleClose} style={{ background: 'var(--bg-tertiary)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1rem' }}>✕</button>
        </div>

        {/* List + form */}
        <div style={{ overflowY: 'auto', padding: '1.1rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>

          {pairs.map(pair => (
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
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{pair.name}</div>
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
              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>New Sheet Pair</p>
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
              <Plus size={15} /> Add Sheet Pair
            </button>
          )}
        </div>
      </div>
    </>
  );
}
