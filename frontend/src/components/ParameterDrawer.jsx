import React, { useEffect } from 'react';
import { X, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';

/* ── Shared UI helpers ───────────────────────────────────────────────── */

function SectionTitle({ children }) {
  return (
    <h4 style={{
      fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.08em', color: 'var(--text-muted)',
      marginBottom: '0.5rem', marginTop: '1.5rem',
    }}>
      {children}
    </h4>
  );
}

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{
      flex: 1, padding: '0.85rem 1rem', borderRadius: 10,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--card-border)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: color || 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{sub}</div>}
    </div>
  );
}

/* ── Parameter detail bodies ─────────────────────────────────────────── */

function P1Detail({ metrics, isNoInPersonBrand }) {
  const { inPersonCalls, attendanceRate, totalWorkingDays } = metrics.p1;
  const attended = Math.round((attendanceRate / 100) * totalWorkingDays);
  const missed   = totalWorkingDays - attended;

  const attColor  = attendanceRate >= 75 ? '#10B981' : attendanceRate >= 50 ? '#F59E0B' : '#EF4444';
  const callColor = inPersonCalls >= 3 ? '#10B981' : inPersonCalls >= 1 ? '#F59E0B' : '#EF4444';

  return (
    <>
      <SectionTitle>This month at a glance</SectionTitle>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        {!isNoInPersonBrand && <StatCard label="In-person calls" value={inPersonCalls} color={callColor} />}
        <StatCard label="Working days" value={totalWorkingDays} color="var(--text-primary)" />
      </div>

      <SectionTitle>Daily JSR Call Attendance</SectionTitle>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <StatCard label="Calls attended" value={attended} color="#10B981" />
        <StatCard label="Calls missed" value={missed} color={missed > 0 ? '#EF4444' : 'var(--text-muted)'} />
        <StatCard
          label="Attendance rate"
          value={`${Math.round(attendanceRate)}%`}
          color={attColor}
        />
      </div>

      {/* Visual attendance bar */}
      <div style={{ height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginBottom: '0.5rem' }}>
        <div style={{ height: '100%', width: `${attendanceRate}%`, background: attColor, borderRadius: 5, transition: 'width 0.6s ease' }} />
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {attended > 0
          ? `JSR attended ${attended} out of ${totalWorkingDays} scheduled calls this month.`
          : 'No JSR call attendance was recorded for this month.'}
        {!isNoInPersonBrand && (inPersonCalls > 0
          ? ` ${inPersonCalls} of those were in-person meetings.`
          : ' All calls were virtual (no in-person meetings logged).')}
      </p>
    </>
  );
}

function P2Detail({ metrics }) {
  const { totalClosed, onTimeJobs, onTimeRate, jobs = [] } = metrics.p2;
  const delayed   = totalClosed - onTimeJobs;
  const noDate    = jobs.filter(j => j.onTime === null).length;

  // Build priority summary
  const priorityMap = {};
  jobs.forEach(j => {
    const p = (j.priority || 'Unknown').toString().trim().toUpperCase() || 'Unknown';
    if (!priorityMap[p]) priorityMap[p] = { total: 0, onTime: 0 };
    priorityMap[p].total++;
    if (j.onTime === true) priorityMap[p].onTime++;
  });
  const priorityOrder = ['XXL', 'XL', 'L'];
  const sortedPriorities = [
    ...priorityOrder.filter(p => priorityMap[p]),
    ...Object.keys(priorityMap).filter(p => !priorityOrder.includes(p)),
  ];

  return (
    <>
      <SectionTitle>This month at a glance</SectionTitle>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <StatCard label="Jobs closed" value={totalClosed} />
        <StatCard label="On time" value={onTimeJobs} color="#10B981" />
        <StatCard label="Delayed" value={delayed} color={delayed > 0 ? '#EF4444' : 'var(--text-muted)'} />
      </div>

      {noDate > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', borderRadius: 8, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', marginBottom: '0.75rem', fontSize: '0.8rem', color: '#F97316' }}>
          <AlertTriangle size={14} />
          {noDate} job(s) had missing dates and could not be evaluated.
        </div>
      )}

      {sortedPriorities.length > 0 && (
        <>
          <SectionTitle>On-time by priority</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {sortedPriorities.map(p => {
              const { total, onTime } = priorityMap[p];
              const rate = Math.round((onTime / total) * 100);
              const color = rate >= 90 ? '#10B981' : rate >= 60 ? '#F59E0B' : '#EF4444';
              return (
                <div key={p} style={{
                  padding: '0.65rem 0.9rem', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--card-border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{p}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color }}>
                      {onTime}/{total} on time
                      <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.4rem' }}>({rate}%)</span>
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${rate}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {jobs.length > 0 && (
        <>
          <SectionTitle>Job-by-job breakdown</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {jobs.map((job, i) => (
              <div key={i} style={{
                padding: '0.75rem 0.9rem', borderRadius: 8,
                background: job.onTime === true
                  ? 'rgba(16,185,129,0.06)'
                  : job.onTime === false
                  ? 'rgba(239,68,68,0.06)'
                  : 'rgba(255,255,255,0.03)',
                border: `1px solid ${job.onTime === true ? 'rgba(16,185,129,0.2)' : job.onTime === false ? 'rgba(239,68,68,0.2)' : 'var(--card-border)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>
                    {job.deliverable || (job.id && !job.id.startsWith('panasonic-') ? job.id : '—')}
                  </span>
                  {job.onTime === true && <CheckCircle2 size={16} style={{ color: '#10B981', flexShrink: 0 }} />}
                  {job.onTime === false && <XCircle size={16} style={{ color: '#EF4444', flexShrink: 0 }} />}
                  {job.onTime === null && <Clock size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Deadline: <span style={{ color: 'var(--text-secondary)' }}>{job.deadline || '—'}</span>
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Delivered: <span style={{ color: job.onTime === false ? '#EF4444' : 'var(--text-secondary)' }}>{job.actual || '—'}</span>
                  </span>
                  {job.priority && (
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700,
                      padding: '0.1rem 0.45rem', borderRadius: 4,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid var(--card-border)',
                      color: 'var(--text-secondary)',
                    }}>
                      {job.priority.toString().trim().toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {jobs.length === 0 && (
        <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          No closed/completed jobs were found for this month.
        </p>
      )}
    </>
  );
}

function P3Detail({ metrics }) {
  const { creativeAttendDays, managementAttendDays, totalWorkingDays } = metrics.p3;
  const creativeColor = creativeAttendDays >= 3 ? '#10B981' : creativeAttendDays >= 1 ? '#F59E0B' : '#EF4444';
  const mgmtColor     = managementAttendDays >= 1 ? '#10B981' : '#EF4444';

  return (
    <>
      <SectionTitle>This month at a glance</SectionTitle>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <StatCard label="Working days" value={totalWorkingDays} />
        <StatCard label="Creative attended" value={`${creativeAttendDays} days`} color={creativeColor} />
        <StatCard label="Mgmt attended" value={`${managementAttendDays} days`} color={mgmtColor} />
      </div>

      <SectionTitle>Creative / Design Team</SectionTitle>
      <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginBottom: '0.5rem' }}>
        <div style={{ height: '100%', width: totalWorkingDays > 0 ? `${(creativeAttendDays / totalWorkingDays) * 100}%` : '0%', background: creativeColor, transition: 'width 0.6s ease', borderRadius: 4 }} />
      </div>
      <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
        {creativeAttendDays > 0
          ? `The creative/design team joined ${creativeAttendDays} JSR call${creativeAttendDays !== 1 ? 's' : ''} out of ${totalWorkingDays} this month.`
          : 'The creative/design team did not attend any JSR calls this month.'}
      </p>

      <SectionTitle>Management Team</SectionTitle>
      <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginBottom: '0.5rem' }}>
        <div style={{ height: '100%', width: totalWorkingDays > 0 ? `${(managementAttendDays / totalWorkingDays) * 100}%` : '0%', background: mgmtColor, transition: 'width 0.6s ease', borderRadius: 4 }} />
      </div>
      <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {managementAttendDays > 0
          ? `Management joined ${managementAttendDays} JSR call${managementAttendDays !== 1 ? 's' : ''} this month.`
          : 'Management did not attend any JSR calls this month.'}
      </p>
    </>
  );
}

const CATEGORY_META = {
  initPaidApproved:  { label: 'Initiative Paid / Approved',      color: '#10B981' },
  paidApproved:      { label: 'Paid (Approved)',                  color: '#60a5fa' },
  initPaidUnapproved:{ label: 'Initiative Unpaid / Unapproved',   color: '#F59E0B' },
  retainer:          { label: 'Retainer',                         color: 'var(--text-muted)' },
  paidUnapproved:    { label: 'Paid (Not Approved)',              color: '#EF4444' },
};

function P4Detail({ metrics }) {
  const { rawProactiveScore, proactiveDetails, jobs = [] } = metrics.p4;

  const grouped = {};
  for (const job of jobs) {
    if (!grouped[job.category]) grouped[job.category] = [];
    grouped[job.category].push(job);
  }

  const categoryOrder = ['initPaidApproved','paidApproved','initPaidUnapproved','retainer','paidUnapproved'];

  return (
    <>
      <SectionTitle>This month at a glance</SectionTitle>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        {proactiveDetails.initPaidApproved > 0 && <StatCard label="Initiative Paid/Appr." value={proactiveDetails.initPaidApproved} color="#10B981" />}
        {proactiveDetails.paidApproved > 0      && <StatCard label="Paid (Approved)" value={proactiveDetails.paidApproved} color="#60a5fa" />}
        {proactiveDetails.initPaidUnapproved > 0 && <StatCard label="Initiative Unpaid" value={proactiveDetails.initPaidUnapproved} color="#F59E0B" />}
        {proactiveDetails.retainer > 0           && <StatCard label="Retainer" value={proactiveDetails.retainer} color="var(--text-muted)" />}
        {proactiveDetails.paidUnapproved > 0     && <StatCard label="Paid (Not Appr.)" value={proactiveDetails.paidUnapproved} color="#EF4444" />}
        {jobs.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No jobs found for this period.</p>}
      </div>



      {categoryOrder.map(cat => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;
        const { label, color } = CATEGORY_META[cat];

        // Retainer: show count only, no individual job list
        if (cat === 'retainer') {
          return (
            <div key={cat}>
              <SectionTitle>{label} ({items.length})</SectionTitle>
            </div>
          );
        }

        return (
          <div key={cat}>
            <SectionTitle>{label} ({items.length})</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {items.map((job, i) => (
                <div key={i} style={{
                  padding: '0.6rem 0.85rem', borderRadius: 7,
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid var(--card-border)',
                  fontSize: '0.83rem', color: 'var(--text-primary)',
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  {job.label || '(no name)'}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ── Main drawer ─────────────────────────────────────────────────────── */

const PARAMS = {
  p1: { title: 'JSR Calling',              sub: 'In-person meetings + daily attendance',  weight: '25%', color: '#60a5fa' },
  p2: { title: 'Delivery Date',            sub: 'On-time closed deliverable ratio',        weight: '40%', color: '#10B981' },
  p3: { title: 'Cross-Functional Meeting', sub: 'Creative & Management attendance',        weight: '25%', color: '#f59e0b' },
  p4: { title: 'Proactiveness',            sub: 'Incremental paid task index',             weight: '10%', color: '#a78bfa' },
};

export default function ParameterDrawer({ param, scoreData, onClose }) {
  const isOpen = !!param;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const lowerName = (scoreData?.clientName || '').toLowerCase().trim();
  const isNoInPersonBrand = lowerName.startsWith('digital connexion') ||
                            lowerName.startsWith('bpl') ||
                            lowerName.startsWith('kelvinator') ||
                            lowerName.startsWith('kalvinator');

  const metaRaw = param ? PARAMS[param] : null;
  const meta = metaRaw ? {
    ...metaRaw,
    sub: (param === 'p1' && isNoInPersonBrand) ? 'Daily JSR call attendance' : metaRaw.sub
  } : null;

  const score   = param ? scoreData.scores[param] : 0;
  const insight = param ? scoreData.insights[param] : '';

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(5px)',
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? 'auto' : 'none',
        transition: 'opacity 0.25s ease',
      }} />

      {/* Centered Modal Card */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        zIndex: 201,
        width: '90%',
        maxWidth: '560px',
        maxHeight: '85vh',
        background: 'var(--bg-primary)',
        border: '1px solid var(--card-border)',
        borderRadius: '16px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        transform: isOpen ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.95)',
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? 'auto' : 'none',
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {meta && (
          <>
            {/* Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--card-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              background: 'var(--bg-primary)', zIndex: 1,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: meta.color }} />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {meta.weight} weight
                  </span>
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{meta.title}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{meta.sub}</p>
              </div>
              <button onClick={onClose} style={{
                background: 'var(--bg-tertiary)', border: 'none', borderRadius: 8,
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0,
              }}>
                <X size={16} />
              </button>
            </div>

            {/* Score pill */}
            <div style={{
              margin: '1.25rem 1.5rem 0.5rem',
              padding: '0.85rem 1rem',
              borderRadius: 10, background: 'var(--card-bg)',
              border: `1px solid ${meta.color}33`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Score this month</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: meta.color, lineHeight: 1 }}>
                {score}<span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--text-muted)' }}>/10</span>
              </span>
            </div>

            {/* Content */}
            <div style={{ padding: '0 1.5rem 1.5rem', overflowY: 'auto', flex: 1 }}>
              {param === 'p1' && <P1Detail metrics={scoreData.metrics} isNoInPersonBrand={isNoInPersonBrand} />}
              {param === 'p2' && <P2Detail metrics={scoreData.metrics} />}
              {param === 'p3' && <P3Detail metrics={scoreData.metrics} />}
              {param === 'p4' && <P4Detail metrics={scoreData.metrics} />}

              {/* Assessment Insight */}
              <SectionTitle>Summary</SectionTitle>
              <div style={{
                padding: '0.85rem 1rem', borderRadius: 8,
                background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-secondary)',
              }}>
                {insight}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
