import React, { useEffect } from 'react';
import { X, Users, Calendar } from 'lucide-react';

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
  const {
    inPersonCalls,
    clientUnavailableCount = 0,
    attendanceRate,
    displayAttendanceRate,
    attendedCount,
    totalWorkingDays
  } = metrics.p1;

  const attended = attendedCount !== undefined ? attendedCount : Math.round((attendanceRate / 100) * totalWorkingDays);
  const missed   = Math.max(0, totalWorkingDays - attended);
  const rateToDisplay = displayAttendanceRate !== undefined ? displayAttendanceRate : attendanceRate;

  const attColor  = rateToDisplay >= 75 ? '#10B981' : rateToDisplay >= 50 ? '#F59E0B' : '#EF4444';
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
          value={`${Math.round(rateToDisplay)}%`}
          color={attColor}
        />
      </div>

      {/* Visual attendance bar */}
      <div style={{ height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginBottom: '0.5rem' }}>
        <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, rateToDisplay))}%`, background: attColor, borderRadius: 5, transition: 'width 0.6s ease' }} />
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {attended > 0
          ? `JSR attended ${attended} out of ${totalWorkingDays} scheduled calls this month${clientUnavailableCount > 0 ? ` (including ${clientUnavailableCount} client unavailable)` : ''}.`
          : 'No JSR call attendance was recorded for this month.'}
        {!isNoInPersonBrand && (inPersonCalls > 0
          ? ` ${inPersonCalls} of those were in-person meetings.`
          : ' All calls were virtual (no in-person meetings logged).')}
      </p>
    </>
  );
}

function getStatusBadge(statusStr, statusAging, item = {}, selectedMonth, selectedYear) {
  const s = (statusStr || '').toString().trim();
  const sl = s.toLowerCase();

  let bg = 'rgba(255, 255, 255, 0.08)';
  let color = 'var(--text-secondary)';
  let border = 'rgba(255, 255, 255, 0.15)';

  if (sl === 'closed' || sl === 'completed') {
    bg = 'rgba(16, 185, 129, 0.12)';
    color = '#10B981';
    border = 'rgba(16, 185, 129, 0.3)';
  } else if (sl === 'in progress' || sl === 'in-progress' || sl === 'ongoing') {
    bg = 'rgba(59, 130, 246, 0.12)';
    color = '#3B82F6';
    border = 'rgba(59, 130, 246, 0.3)';
  } else if (sl.includes('ctr') || sl.includes('client to revert')) {
    bg = 'rgba(245, 158, 11, 0.14)';
    color = '#F59E0B';
    border = 'rgba(245, 158, 11, 0.4)';
  } else if (sl === 'on hold' || sl === 'paused') {
    bg = 'rgba(245, 158, 11, 0.12)';
    color = '#F59E0B';
    border = 'rgba(245, 158, 11, 0.3)';
  } else if (sl.includes('atr') || sl.includes('agency to revert') || sl.includes('review')) {
    bg = 'rgba(239, 68, 68, 0.14)';
    color = '#EF4444';
    border = 'rgba(239, 68, 68, 0.4)';
  }

  // Calculate cut-off date: if selected month is historical, cap evaluation at end of that month!
  const now = new Date();
  let evalDate = now;
  if (selectedMonth !== undefined && selectedYear !== undefined) {
    if (selectedYear < now.getFullYear() || (selectedYear === now.getFullYear() && selectedMonth < now.getMonth())) {
      evalDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
    }
  }

  let daysText = null;
  if (statusAging && statusAging.enteredAtIso) {
    const enteredAt = new Date(statusAging.enteredAtIso);
    if (!isNaN(enteredAt.getTime())) {
      const diffDays = Math.max(0, Math.floor((evalDate - enteredAt) / (1000 * 60 * 60 * 24)));
      daysText = `${diffDays}d in ${statusAging.category}${statusAging.enteredAtFormatted ? ` (since ${statusAging.enteredAtFormatted})` : ''}`;
    }
  } else if (statusAging && statusAging.daysInStatus !== undefined) {
    daysText = `${statusAging.daysInStatus}d in ${statusAging.category}${statusAging.enteredAtFormatted ? ` (since ${statusAging.enteredAtFormatted})` : ''}`;
  } else if (sl.includes('ctr') || sl.includes('client to revert') || sl.includes('atr') || sl.includes('agency to revert') || sl.includes('review')) {
    const cat = (sl.includes('ctr') || sl.includes('client to revert')) ? 'CTR' : 'ATR';
    const refDate = item?.briefDate || item?.deliveryDate;
    if (refDate) {
      const d = new Date(refDate);
      if (!isNaN(d.getTime())) {
        const diffDays = Math.max(0, Math.floor((evalDate - d) / (1000 * 60 * 60 * 24)));
        const dayNum = d.getDate();
        const monthShort = d.toLocaleString('en-US', { month: 'short' });
        daysText = `${diffDays}d in ${cat} (since ${dayNum} ${monthShort})`;
      }
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
      <span style={{
        fontSize: '0.72rem', fontWeight: 600,
        padding: '0.22rem 0.6rem', borderRadius: 6,
        background: bg, color, border: `1px solid ${border}`,
        whiteSpace: 'nowrap', display: 'inline-block'
      }}>
        {s || 'Pending'}
      </span>
      {daysText && (
        <span style={{
          fontSize: '0.68rem',
          fontWeight: 600,
          color,
          opacity: 0.95,
          whiteSpace: 'nowrap'
        }}>
          {daysText}
        </span>
      )}
    </div>
  );
}

function P2Detail({ metrics, selectedMonth, selectedYear }) {
  const { totalClosed, onTimeJobs, jobs = [], allMonthJobs = [] } = metrics.p2;
  const delayed = totalClosed - onTimeJobs;
  const displayJobs = allMonthJobs.length > 0 ? allMonthJobs : jobs;

  const [filter, setFilter] = React.useState('all');

  const delayedCount = displayJobs.filter(j => j.onTime === false || (j.delayDays && j.delayDays > 0)).length;
  const onTimeCount = displayJobs.filter(j => j.onTime === true && (!j.delayDays || j.delayDays === 0)).length;

  const visibleJobs = displayJobs.filter(item => {
    const isDelayed = item.onTime === false || (item.delayDays && item.delayDays > 0);
    if (filter === 'delayed') return isDelayed;
    if (filter === 'ontime') return item.onTime === true && !isDelayed;
    return true;
  });

  return (
    <>
      <SectionTitle>This month at a glance</SectionTitle>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <StatCard label="Jobs closed" value={totalClosed} />
        <StatCard label="On time" value={onTimeJobs} color="#10B981" />
        <StatCard label="Delayed" value={delayedCount > 0 ? delayedCount : delayed} color={delayedCount > 0 ? '#EF4444' : 'var(--text-muted)'} />
      </div>

      {delayedCount > 0 && (
        <div style={{
          padding: '0.65rem 0.85rem',
          borderRadius: 8,
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          marginBottom: '1rem',
          fontSize: '0.78rem',
          color: '#EF4444',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span style={{ fontWeight: 700 }}>⚠️ Alert:</span>
          <span>{delayedCount} deliverable{delayedCount !== 1 ? 's have' : ' has'} exceeded the client timeline target.</span>
        </div>
      )}

      {displayJobs.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <SectionTitle>Deliverables List</SectionTitle>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '1rem' }}>
              <button onClick={() => setFilter('all')} style={{
                padding: '0.25rem 0.6rem', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
                border: filter === 'all' ? '1px solid #3B82F6' : '1px solid var(--card-border)',
                background: filter === 'all' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                color: filter === 'all' ? '#3B82F6' : 'var(--text-secondary)', cursor: 'pointer'
              }}>
                All ({displayJobs.length})
              </button>
              <button onClick={() => setFilter('delayed')} style={{
                padding: '0.25rem 0.6rem', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
                border: filter === 'delayed' ? '1px solid #EF4444' : '1px solid var(--card-border)',
                background: filter === 'delayed' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.03)',
                color: filter === 'delayed' ? '#EF4444' : 'var(--text-secondary)', cursor: 'pointer'
              }}>
                Delayed ({delayedCount})
              </button>
              <button onClick={() => setFilter('ontime')} style={{
                padding: '0.25rem 0.6rem', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
                border: filter === 'ontime' ? '1px solid #10B981' : '1px solid var(--card-border)',
                background: filter === 'ontime' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.03)',
                color: filter === 'ontime' ? '#10B981' : 'var(--text-secondary)', cursor: 'pointer'
              }}>
                On Time ({onTimeCount})
              </button>
            </div>
          </div>

          <div style={{
            display: 'flex', flexDirection: 'column', gap: '0.5rem',
            marginBottom: '0.75rem'
          }}>
            {/* Table Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 140px 140px',
              padding: '0.4rem 0.8rem', fontSize: '0.72rem', fontWeight: 700,
              color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
              <span>Job Name (Deliverable)</span>
              <span>Timeline / Delivery</span>
              <span style={{ textAlign: 'right' }}>Status & Delay</span>
            </div>

            {/* List Rows */}
            {visibleJobs.map((item, idx) => {
              const isDelayed = item.onTime === false || (item.delayDays && item.delayDays > 0);
              const timelineDate = item.clientTimeline || item.deadline || '—';
              const deliveredDate = item.deliveryDate || item.actual || (item.status?.toLowerCase() === 'closed' || item.status?.toLowerCase() === 'completed' ? '—' : 'Not delivered yet');

              return (
                <div key={idx} style={{
                  display: 'grid', gridTemplateColumns: '1fr 140px 140px',
                  alignItems: 'center', padding: '0.75rem 0.85rem', borderRadius: 8,
                  background: isDelayed ? 'rgba(239, 68, 68, 0.04)' : 'rgba(255,255,255,0.03)',
                  border: isDelayed ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid var(--card-border)',
                  gap: '0.5rem'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                      {item.deliverable || item.id || 'Unnamed Deliverable'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {item.id && !item.id.startsWith('job-') && !item.id.startsWith('panasonic-') && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          ID: {item.id}
                        </span>
                      )}
                      {item.clientAlterations > 0 ? (
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          padding: '0.12rem 0.45rem',
                          borderRadius: 6,
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#F59E0B',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          whiteSpace: 'nowrap'
                        }}>
                          {item.clientAlterations} Client Alteration{item.clientAlterations > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          padding: '0.12rem 0.45rem',
                          borderRadius: 6,
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#10B981',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          whiteSpace: 'nowrap'
                        }}>
                          NO CLIENT ALTERATION
                        </span>
                      )}
                      {isDelayed && (
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '0.12rem 0.45rem',
                          borderRadius: 6,
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#EF4444',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          whiteSpace: 'nowrap'
                        }}>
                          DELAYED
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.75rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Client Target: </span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{timelineDate}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Delivered: </span>
                      <span style={{ color: deliveredDate === 'Not delivered yet' ? '#F59E0B' : (isDelayed ? '#EF4444' : 'var(--text-secondary)'), fontWeight: isDelayed ? 600 : 400 }}>
                        {deliveredDate}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                    {getStatusBadge(item.status, item.statusAging, item, selectedMonth, selectedYear)}
                    {isDelayed && (
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        color: '#EF4444',
                        background: 'rgba(239, 68, 68, 0.12)',
                        padding: '0.12rem 0.45rem',
                        borderRadius: 4,
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        whiteSpace: 'nowrap'
                      }}>
                        {item.delayDays ? `${item.delayDays} day${item.delayDays > 1 ? 's' : ''} delayed` : 'Delayed'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {visibleJobs.length === 0 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '1rem 0', textAlign: 'center' }}>
                No {filter} deliverables found.
              </p>
            )}
          </div>
        </>
      )}

      {displayJobs.length === 0 && (
        <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          No deliverables were found for this month.
        </p>
      )}
    </>
  );
}

function P3Detail({ metrics }) {
  const { creativeAttendDays, managementAttendDays, totalWorkingDays, managementMembers = [] } = metrics.p3;
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
      <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.75rem' }}>
        {managementAttendDays > 0
          ? `Management joined ${managementAttendDays} JSR call${managementAttendDays !== 1 ? 's' : ''} this month.`
          : 'Management did not attend any JSR calls this month.'}
      </p>

      {managementMembers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
          {managementMembers.map((member, idx) => (
            <div key={idx} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.65rem 0.85rem', borderRadius: 8,
              background: member.attended ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
              border: `1px solid ${member.attended ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: member.attended ? '#10B981' : '#EF4444'
                  }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {member.name}
                  </span>
                </div>
                {member.attended && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: '1rem', marginTop: '0.15rem' }}>
                    Attended {member.attendedDays} call{member.attendedDays !== 1 ? 's' : ''} this month
                  </div>
                )}
              </div>
              <span style={{
                fontSize: '0.78rem', fontWeight: 700,
                padding: '0.2rem 0.5rem', borderRadius: 6,
                background: member.attended ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                color: member.attended ? '#10B981' : '#EF4444'
              }}>
                {member.attended
                  ? (member.daysAgoText?.startsWith('Joined') ? member.daysAgoText : `Joined (${member.daysAgoText})`)
                  : 'Did not join'}
              </span>
            </div>
          ))}
        </div>
      )}
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
  const { rawProactiveScore, proactiveDetails, pctApproved = 0, pctUnapproved = 0, totalJobsCount = 0, jobs = [] } = metrics.p4;

  const grouped = {};
  for (const job of jobs) {
    if (!grouped[job.category]) grouped[job.category] = [];
    grouped[job.category].push(job);
  }

  const categoryOrder = ['initPaidApproved','paidApproved','initPaidUnapproved','retainer','paidUnapproved'];

  return (
    <>
      <SectionTitle>This month at a glance</SectionTitle>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <StatCard label="Total Jobs" value={totalJobsCount} color="var(--text-color)" />
        <StatCard label="Initiative Approved" value={`${proactiveDetails.initPaidApproved} (${Math.round(pctApproved)}%)`} color="#10B981" />
        <StatCard label="Initiative Unapproved" value={`${proactiveDetails.initPaidUnapproved} (${Math.round(pctUnapproved)}%)`} color="#F59E0B" />
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        {proactiveDetails.paidApproved > 0      && <StatCard label="Paid (Approved)" value={proactiveDetails.paidApproved} color="#60a5fa" />}
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

function InternalMeetingDetail({ metrics, clientName, selectedMonth, selectedYear }) {
  const im = metrics?.internalMeeting || {
    attendedDays: 0,
    totalWorkingDays: 21,
    missedDays: 21,
    attendanceRate: 0,
    daysList: [],
  };

  const { attendedDays = 0, totalWorkingDays = 21, missedDays = 21, attendanceRate = 0, daysList = [] } = im;
  const rateToDisplay = Math.round(attendanceRate);
  const attColor = rateToDisplay >= 75 ? '#10B981' : rateToDisplay >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <>
      {/* Box 1: Daily Attendance Stats (matching snapshot) */}
      <SectionTitle>Daily Internal Meeting Attendance</SectionTitle>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <StatCard label="Calls attended" value={attendedDays} color="#10B981" />
        <StatCard label="Calls missed" value={missedDays} color={missedDays > 0 ? '#EF4444' : 'var(--text-muted)'} />
        <StatCard
          label="Attendance rate"
          value={`${rateToDisplay}%`}
          color={attColor}
        />
      </div>

      {/* Visual attendance bar */}
      <div style={{ height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginBottom: '0.5rem' }}>
        <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, rateToDisplay))}%`, background: attColor, borderRadius: 5, transition: 'width 0.6s ease' }} />
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
        {attendedDays > 0
          ? `Internal meetings were conducted on ${attendedDays} out of ${totalWorkingDays} scheduled working days this month for ${clientName}.`
          : `No internal meetings were logged for ${clientName} this month.`}
      </p>

      {/* Box 2: Meeting breakdown with Brand Name, Date, Attendees */}
      <SectionTitle>Internal Meetings Conducted ({daysList.length})</SectionTitle>
      {daysList.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
          {daysList.map((dayItem, idx) => {
            const formattedDate = dayItem.date
              ? new Date(dayItem.date).toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
              : dayItem.dateKey;

            return (
              <div key={idx} style={{
                padding: '1rem',
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--card-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}>
                {/* Brand name & Date Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      padding: '0.2rem 0.6rem',
                      borderRadius: 6,
                    }}>
                      {clientName}
                    </span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      📅 {formattedDate}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '0.15rem 0.5rem',
                    borderRadius: 4,
                  }}>
                    {dayItem.meetingsCount} note{dayItem.meetingsCount !== 1 ? 's' : ''} logged
                  </span>
                </div>

                {/* Attendees list */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <Users size={14} style={{ color: '#38bdf8', flexShrink: 0, marginTop: '0.2rem' }} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: '0.2rem' }}>
                      Attendees:
                    </span>
                    {dayItem.attendees.length > 0 ? (
                      dayItem.attendees.map((att, aIdx) => (
                        <span key={aIdx} style={{
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          padding: '0.15rem 0.5rem',
                          borderRadius: 6,
                          background: 'rgba(56, 189, 248, 0.08)',
                          border: '1px solid rgba(56, 189, 248, 0.2)',
                          color: 'var(--text-primary)',
                        }}>
                          {att}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        No specific attendees listed
                      </span>
                    )}
                  </div>
                </div>

                {/* Meeting notes/titles list for this day */}
                {dayItem.meetings.map((m, mIdx) => (
                  <div key={mIdx} style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: 6,
                    background: 'rgba(255, 255, 255, 0.015)',
                    border: '1px dashed var(--card-border)',
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)',
                  }}>
                    {m.meetingTitle && (
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                        {m.meetingTitle}
                      </div>
                    )}
                    {m.summary && (
                      <div style={{ lineHeight: 1.4, color: 'var(--text-secondary)' }}>
                        {m.summary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '2rem 1rem',
          borderRadius: 10,
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px dashed var(--card-border)',
          color: 'var(--text-secondary)',
          fontSize: '0.85rem',
          marginBottom: '1rem',
        }}>
          No internal meeting emails/notes found for <strong>{clientName}</strong> in this month.
        </div>
      )}
    </>
  );
}

/* ── Main drawer ─────────────────────────────────────────────────────── */

const PARAMS = {
  p1: { title: 'JSR Calling',              sub: 'In-person meetings + daily attendance',  weight: '25%', color: '#60a5fa' },
  p2: { title: 'Delivery Date',            sub: 'On-time closed deliverable ratio',        weight: '40%', color: '#10B981' },
  p3: { title: 'Cross-Functional Meeting', sub: 'Creative & Management attendance',        weight: '25%', color: '#f59e0b' },
  p4: { title: 'Proactiveness',            sub: 'Initiative task index',             weight: '10%', color: '#a78bfa' },
  internal_meeting: { title: 'Internal Meeting', sub: 'Daily internal syncs & attendees', weight: 'Logged', color: '#38bdf8' },
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

  const score = param === 'internal_meeting'
    ? (scoreData?.metrics?.internalMeeting?.score ?? 0)
    : (param ? (scoreData?.scores?.[param] ?? 0) : 0);

  const insight = param === 'internal_meeting'
    ? (scoreData?.metrics?.internalMeeting?.attendedDays > 0
        ? `Internal meetings conducted on ${scoreData.metrics.internalMeeting.attendedDays} day(s) with ${Math.round(scoreData.metrics.internalMeeting.attendanceRate)}% attendance.`
        : 'No internal meetings recorded for this brand in the selected month.')
    : (param ? scoreData?.insights?.[param] || '' : '');

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
              {param === 'p2' && <P2Detail metrics={scoreData.metrics} selectedMonth={scoreData.selectedMonth} selectedYear={scoreData.selectedYear} />}
              {param === 'p3' && <P3Detail metrics={scoreData.metrics} />}
              {param === 'p4' && <P4Detail metrics={scoreData.metrics} />}
              {param === 'internal_meeting' && (
                <InternalMeetingDetail
                  metrics={scoreData.metrics}
                  clientName={scoreData.clientName}
                  selectedMonth={scoreData.month !== undefined ? scoreData.month : scoreData.selectedMonth}
                  selectedYear={scoreData.year !== undefined ? scoreData.year : scoreData.selectedYear}
                />
              )}

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
