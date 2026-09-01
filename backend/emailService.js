/**
 * emailService.js
 * Sends alert emails via Brevo (formerly Sendinblue) transactional email REST API.
 * Uses native fetch (Node 18+) — no SMTP, no domain verification needed.
 * Only requires a verified SENDER email address in the Brevo dashboard.
 */

import { getTeamsCollection } from './db.js';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Escapes HTML special characters in a string to prevent HTML/XSS injection.
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseSender(fromStr, fallbackName) {
  if (!fromStr) return { email: 'lakshbhatia134@gmail.com', name: fallbackName || 'JSR Report Alerts' };
  const match = fromStr.match(/^(?:"?([^"<]+)"?\s*)?<([^>]+)>$/);
  if (match) {
    return { name: match[1]?.trim() || fallbackName || 'JSR Report Alerts', email: match[2].trim() };
  }
  return { email: fromStr.trim(), name: fallbackName || 'JSR Report Alerts' };
}

async function sendViaBrevo({ apiKey, fromEmail, fromName, toAddresses, ccAddresses, subject, html }) {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.ENABLE_EMAILS === 'false') {
    console.warn('[emailService] Email triggers are currently paused (DISABLE_EMAILS=true). Email not sent.');
    return false;
  }
  const senderObj = parseSender(fromEmail, fromName);
  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: senderObj,
      to: toAddresses,
      ...(ccAddresses && ccAddresses.length > 0 ? { cc: ccAddresses } : {}),
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('[emailService] Brevo error response:', body);
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return true;
}

/**
 * Builds a transport for sending to an explicit list of recipients
 * (as opposed to the fixed MANAGEMENT_EMAIL list used by alert emails).
 */
function buildTransportForRecipients(toEmails, ccEmails) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmailRaw = process.env.SMTP_FROM || 'geo@cogculture.agency';

  if (!apiKey) {
    console.warn('[emailService] BREVO_API_KEY not set. Skipping email delivery.');
    return null;
  }
  let targetToEmails = toEmails || [];
  let targetCcEmails = ccEmails || [];

  if (targetToEmails.length === 0) {
    if (targetCcEmails.length > 0) {
      targetToEmails = [targetCcEmails[0]];
      targetCcEmails = targetCcEmails.slice(1);
    } else {
      console.warn('[emailService] No recipients provided. Skipping email delivery.');
      return null;
    }
  }

  // Parse fromEmailRaw which might be of the format "Name <email>"
  const match = fromEmailRaw.match(/^(.*?)\s*<([^>]+)>/);
  const fromName = match ? match[1].trim() : 'JSR Report Alerts';
  const fromEmail = match ? match[2].trim() : fromEmailRaw.trim();

  // Test mode override: send to MANAGEMENT_EMAIL instead of original recipients
  if (process.env.TEST_MODE === 'true') {
    const managementEmail = process.env.MANAGEMENT_EMAIL;
    if (managementEmail) {
      console.log(`[emailService] TEST_MODE is active. Redirecting digest to MANAGEMENT_EMAIL: ${managementEmail}`);
      targetToEmails = managementEmail.split(',').map(e => e.trim()).filter(Boolean);
      targetCcEmails = [];
    } else {
      console.warn('[emailService] TEST_MODE is active but MANAGEMENT_EMAIL is not set.');
    }
  }

  return {
    apiKey,
    fromEmail,
    fromName,
    toAddresses: targetToEmails.map(e => ({ email: e })),
    ccAddresses: (targetCcEmails || []).map(e => ({ email: e })),
  };
}

/**
 * Generates the HTML template and subject for the daily executive digest:
 * 1. Top Section: XL/XXL jobs due TODAY or TOMORROW
 * 2. Second Section: XL/XXL jobs OVERDUE from the past 7 days (1 to 7 days overdue)
 * 3. Bottom Section: Comprehensive Daily Meeting Attendance Grid (All Brands)
 */
export function buildExecutiveDigestEmailHtml(clientReports, podName = 'All Teams Summary') {
  const todayStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const escapedPodName = escapeHTML(podName);

  // 1. Filter jobs for Section 1: Due Today or Tomorrow
  const dueTodayTomorrowJobs = [];
  // 2. Filter jobs for Section 2: Overdue past 7 days (diffDays >= -7 && diffDays < 0)
  const overdue7DaysJobs = [];

  for (const report of clientReports || []) {
    for (const job of report.pendingJobs || []) {
      const item = {
        ...job,
        clientName: report.clientName,
        podName: report.podName || '',
      };
      if (job.diffDays === 0 || job.diffDays === 1 || job.dueLabel === 'Today' || job.dueLabel === 'Tomorrow') {
        dueTodayTomorrowJobs.push(item);
      } else if (job.diffDays !== null && job.diffDays >= -7 && job.diffDays < 0) {
        overdue7DaysJobs.push(item);
      }
    }
  }

  // Sort dueTodayTomorrowJobs: Today first, then Tomorrow
  dueTodayTomorrowJobs.sort((a, b) => (a.diffDays ?? 0) - (b.diffDays ?? 0));

  // Sort overdue7DaysJobs: Most severely overdue first (e.g. -7, -6, ... -1)
  overdue7DaysJobs.sort((a, b) => (a.diffDays ?? 0) - (b.diffDays ?? 0));

  const totalDueCount = dueTodayTomorrowJobs.length;
  const totalOverdueCount = overdue7DaysJobs.length;

  const subject = `[JSR Report] ${escapedPodName} - ${totalDueCount} Due Today/Tomorrow & ${totalOverdueCount} Overdue (7d) (${todayStr})`;

  const priorityBadge = (priority) => {
    const isXXL = priority === 'XXL';
    const bg = isXXL ? '#0d9488' : '#d97706';
    return `<span style="background-color: ${bg}; color: #ffffff; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 10.5px; letter-spacing: 0.3px; display: inline-block;">${escapeHTML(priority)}</span>`;
  };

  const statusBadge = (status, category) => {
    const raw = (status || category || '').toString().trim();
    const normalized = raw.toUpperCase();
    let bg = '#475569';
    if (normalized.includes('CLOSED') || normalized.includes('COMPLETED')) {
      bg = '#059669';
    } else if (normalized.includes('PROGRESS') || normalized.includes('WIP')) {
      bg = '#d97706';
    } else if (normalized.includes('CTR') || normalized.includes('CLIENT TO REVERT')) {
      bg = '#2563eb';
    } else if (normalized.includes('ATR') || normalized.includes('AGENCY TO REVERT')) {
      bg = '#7c3aed';
    }
    return `<span style="background-color: ${bg}; color: #ffffff; padding: 2px 7px; border-radius: 4px; font-weight: 600; font-size: 10.5px; display: inline-block;">${escapeHTML(raw || 'In Progress')}</span>`;
  };

  // Helper to render grouped jobs table by brand
  const renderJobsByBrand = (jobsList, type = 'due') => {
    if (jobsList.length === 0) {
      if (type === 'due') {
        return `
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px; text-align: center;">
            <p style="margin: 0; font-size: 13.5px; color: #166534; font-weight: 600;">
              ✅ No XL / XXL deliverables due today or tomorrow.
            </p>
          </div>
        `;
      } else {
        return `
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px; text-align: center;">
            <p style="margin: 0; font-size: 13.5px; color: #166534; font-weight: 600;">
              ✅ No XL / XXL deliverables overdue from the past 7 days.
            </p>
          </div>
        `;
      }
    }

    // Group jobs by brand
    const grouped = {};
    for (const job of jobsList) {
      const key = job.clientName;
      if (!grouped[key]) {
        grouped[key] = {
          clientName: job.clientName,
          podName: job.podName,
          jobs: [],
        };
      }
      grouped[key].jobs.push(job);
    }

    return Object.values(grouped).map(group => {
      const escapedClient = escapeHTML(group.clientName);
      const escapedPod = group.podName ? ` <span style="font-size: 11px; font-weight: 500; color: #475569; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">${escapeHTML(group.podName)}</span>` : '';

      return `
        <div style="margin-bottom: 20px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
          <div style="background: #f8fafc; padding: 9px 14px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center;">
            <strong style="font-size: 14px; color: #0f172a;">${escapedClient}</strong>${escapedPod}
            <span style="margin-left: auto; font-size: 11.5px; color: #64748b; font-weight: 600;">
              ${group.jobs.length} task${group.jobs.length > 1 ? 's' : ''}
            </span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12.5px; line-height: 1.4;">
            <thead>
              <tr style="background-color: #ffffff; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left;">
                <th style="padding: 8px 12px; font-weight: 600;">Deliverable</th>
                <th style="padding: 8px 10px; font-weight: 600; width: 60px;">Priority</th>
                <th style="padding: 8px 10px; font-weight: 600; width: 95px;">Status</th>
                <th style="padding: 8px 10px; font-weight: 600; width: 85px;">Age</th>
                <th style="padding: 8px 12px; font-weight: 600; width: 120px; text-align: right;">Timeline</th>
              </tr>
            </thead>
            <tbody>
              ${group.jobs.map((j, idx) => {
                const isToday = j.dueLabel === 'Today';
                const isTomorrow = j.dueLabel === 'Tomorrow';
                const isOverdue = j.dueLabel && j.dueLabel.includes('Overdue');

                let dueColor = '#475569';
                let dueBadgeBg = '#f1f5f9';
                if (isToday) {
                  dueColor = '#991b1b';
                  dueBadgeBg = '#fee2e2';
                } else if (isTomorrow) {
                  dueColor = '#9a3412';
                  dueBadgeBg = '#ffedd5';
                } else if (isOverdue) {
                  dueColor = '#b91c1c';
                  dueBadgeBg = '#fef2f2';
                }

                const dueText = j.dueLabel && j.dueDate && j.dueDate !== '-'
                  ? `${j.dueLabel} (${j.dueDate})`
                  : (j.dueLabel || j.dueDate || '-');

                const rowBg = idx % 2 === 1 ? '#fafafa' : '#ffffff';

                return `
                  <tr style="background-color: ${rowBg}; border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 9px 12px; color: #0f172a; font-weight: 500; vertical-align: middle;">
                      ${escapeHTML(j.deliverable)}
                    </td>
                    <td style="padding: 9px 10px; vertical-align: middle;">
                      ${priorityBadge(j.priority)}
                    </td>
                    <td style="padding: 9px 10px; vertical-align: middle;">
                      ${statusBadge(j.status, j.statusCategory)}
                    </td>
                    <td style="padding: 9px 10px; color: #64748b; font-size: 11.5px; vertical-align: middle;">
                      ${j.daysInStatus !== null && j.daysInStatus !== undefined ? `${escapeHTML(j.daysInStatus)}d` : '-'}
                    </td>
                    <td style="padding: 9px 12px; text-align: right; vertical-align: middle;">
                      <span style="background-color: ${dueBadgeBg}; color: ${dueColor}; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 11px; display: inline-block;">
                        ${escapeHTML(dueText)}
                      </span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }).join('');
  };

  // Section 1: Due Today / Tomorrow
  const section1Html = `
    <div style="margin-bottom: 32px;">
      <div style="background: linear-gradient(90deg, #fef2f2 0%, #ffffff 100%); border-left: 4px solid #ef4444; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 15px; color: #991b1b; font-weight: 700; display: flex; align-items: center;">
          ⚡ XL & XXL Deliverables Due Today / Tomorrow
          <span style="margin-left: 8px; background: #fee2e2; color: #991b1b; padding: 1px 8px; border-radius: 12px; font-size: 12px; font-weight: 700;">
            ${totalDueCount}
          </span>
        </h3>
      </div>
      ${renderJobsByBrand(dueTodayTomorrowJobs, 'due')}
    </div>
  `;

  // Section 2: Overdue past 7 days
  const section2Html = `
    <div style="margin-bottom: 36px;">
      <div style="background: linear-gradient(90deg, #fff7ed 0%, #ffffff 100%); border-left: 4px solid #f97316; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 15px; color: #9a3412; font-weight: 700; display: flex; align-items: center;">
          ⚠️ Overdue XL & XXL Deliverables (Past 7 Days)
          <span style="margin-left: 8px; background: #ffedd5; color: #9a3412; padding: 1px 8px; border-radius: 12px; font-size: 12px; font-weight: 700;">
            ${totalOverdueCount}
          </span>
        </h3>
      </div>
      ${renderJobsByBrand(overdue7DaysJobs, 'overdue')}
    </div>
  `;

  // Section 3: Daily Meeting Attendance Grid (All Brands)
  const attendanceGridHtml = `
    <div style="margin-top: 36px; border-top: 2px solid #e2e8f0; padding-top: 24px;">
      <div style="background: linear-gradient(90deg, #eff6ff 0%, #ffffff 100%); border-left: 4px solid #3b82f6; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 15px; color: #1e40af; font-weight: 700;">
          📊 Daily Meeting Attendance Grid (Month-to-Date)
        </h3>
      </div>
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left;">
              <th style="padding: 10px 12px; font-weight: 700;">Brand</th>
              <th style="padding: 10px 10px; font-weight: 700;">POD</th>
              <th style="padding: 10px 10px; font-weight: 700; text-align: center;">Meeting Days</th>
              <th style="padding: 10px 12px; font-weight: 700; text-align: right;">Attendance Rate</th>
              <th style="padding: 10px 12px; font-weight: 700; text-align: center; width: 90px;">Health</th>
            </tr>
          </thead>
          <tbody>
            ${clientReports.map((report, idx) => {
              const { clientName, podName: rPodName = '', meetingStats = {}, attendanceReason = '' } = report;
              const isUnavail = meetingStats.unavailable || Boolean(attendanceReason) || Boolean(meetingStats.reason);
              const pct = meetingStats.percentage ?? 0;

              let healthBadge = '';
              let pctColor = '#0f172a';

              if (isUnavail) {
                healthBadge = `<span style="background: #f1f5f9; color: #64748b; padding: 2px 7px; border-radius: 4px; font-weight: 600; font-size: 10.5px;">Unavailable</span>`;
                pctColor = '#64748b';
              } else if (pct >= 90) {
                healthBadge = `<span style="background: #dcfce7; color: #15803d; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 10.5px;">Good</span>`;
                pctColor = '#15803d';
              } else if (pct >= 70) {
                healthBadge = `<span style="background: #fef3c7; color: #b45309; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 10.5px;">Average</span>`;
                pctColor = '#b45309';
              } else {
                healthBadge = `<span style="background: #fee2e2; color: #b91c1c; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 10.5px;">Attention</span>`;
                pctColor = '#b91c1c';
              }

              const rowBg = idx % 2 === 1 ? '#fafafa' : '#ffffff';

              return `
                <tr style="background-color: ${rowBg}; border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 8px 12px; font-weight: 600; color: #0f172a;">${escapeHTML(clientName)}</td>
                  <td style="padding: 8px 10px; color: #64748b; font-size: 11.5px;">${escapeHTML(rPodName || '-')}</td>
                  <td style="padding: 8px 10px; text-align: center; color: #334155;">
                    ${isUnavail ? '-' : `<strong>${meetingStats.metDays || 0}</strong> / ${meetingStats.elapsedWeekdays || 0}d`}
                  </td>
                  <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: ${pctColor};">
                    ${isUnavail ? '-' : `${pct}%`}
                  </td>
                  <td style="padding: 8px 12px; text-align: center;">
                    ${healthBadge}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const html = `
    <div style="background-color: #f1f5f9; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 720px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px; color: #ffffff;">
          <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <div style="background: #3b82f6; width: 4px; height: 22px; border-radius: 2px; margin-right: 10px;"></div>
            <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.3px;">
              JSR Executive Digest &bull; ${escapedPodName}
            </h1>
          </div>
          
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px;">
            <span style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">
              🚨 ${totalDueCount} Due Today/Tomorrow
            </span>
            <span style="background: rgba(249, 115, 22, 0.2); border: 1px solid rgba(249, 115, 22, 0.4); color: #fdba74; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">
              ⚠️ ${totalOverdueCount} Overdue (Past 7d)
            </span>
            <span style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.15); color: #cbd5e1; padding: 4px 10px; border-radius: 20px; font-size: 12px;">
              📅 ${todayStr}
            </span>
          </div>
        </div>

        <!-- Body -->
        <div style="padding: 24px;">
          ${section1Html}
          ${section2Html}
          ${attendanceGridHtml}
        </div>

        <!-- Footer -->
        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
          <p style="margin: 0; font-size: 11.5px; color: #94a3b8; line-height: 1.5;">
            Account Health Tracker Dashboard &bull; Automated Management Digest<br/>
            Delivered exclusively for leadership reviews.
          </p>
        </div>

      </div>
    </div>
  `;

  return { subject, html };
}

/**
 * Sends the daily 11:30 AM digest email for a POD or All Teams summary.
 */
export async function sendPodDigestEmail({ podName, to, cc, clientReports }) {
  const transport = buildTransportForRecipients(to, cc);
  if (!transport) return false;

  const { subject, html } = buildExecutiveDigestEmailHtml(clientReports, podName);

  try {
    await sendViaBrevo({ ...transport, subject, html });
    console.log(`[emailService] Daily digest email sent for pod "${podName}" to ${transport.toAddresses.map(a => a.email).join(', ')}.`);
    return true;
  } catch (err) {
    console.error(`[emailService] Failed to send daily digest email for pod "${podName}":`, err.message);
    return false;
  }
}

export async function sendDailyReminderEmail() {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.SMTP_FROM || 'geo@cogculture.agency';

  if (!apiKey) {
    console.warn('[emailService] BREVO_API_KEY not set. Skipping reminder email.');
    return false;
  }

  let teams = [];
  try {
    const teamsCollection = await getTeamsCollection();
    teams = await teamsCollection.find({ active: true }).toArray();
  } catch (dbErr) {
    console.warn('[emailService] Could not fetch teams from MongoDB:', dbErr.message);
  }

  const getSheetUrl = (team, type) => {
    const id = type === 'job' ? team?.jobId : team?.dailyId;
    if (!id || id.trim() === '') return '#';
    if (id.startsWith('http')) return id;
    return `https://docs.google.com/spreadsheets/d/${id}`;
  };

  const getTeam = (name) => teams.find(t => (t.name || '').toUpperCase().replace(/\s+/g, '') === name.toUpperCase().replace(/\s+/g, ''));

  const pods = [
    { name: 'POD 1', teamKey: 'POD1' },
    { name: 'POD 2', teamKey: 'POD2' },
    { name: 'POD 4', teamKey: 'POD4' },
    { name: 'B2B', teamKey: 'B2B' },
    { name: 'PANASONIC', teamKey: 'PANASONIC' },
    { name: 'SRHU', teamKey: 'SRHU' },
  ];

  const podListHtml = pods.map(p => {
    const team = getTeam(p.teamKey);
    const jsrUrl = getSheetUrl(team, 'job');
    const meetingUrl = getSheetUrl(team, 'daily');

    const jsrLinkHtml = jsrUrl !== '#' 
      ? `<a href="${jsrUrl}" style="color: #0284c7; text-decoration: underline; font-weight: 600;" target="_blank">Open JSR Tracker</a>`
      : `<span style="color: #94a3b8; font-style: italic;">[Not Configured]</span>`;

    const meetingLinkHtml = meetingUrl !== '#' 
      ? `<a href="${meetingUrl}" style="color: #0284c7; text-decoration: underline; font-weight: 600;" target="_blank">Open Meeting Tracker</a>`
      : `<span style="color: #94a3b8; font-style: italic;">[Not Configured]</span>`;

    return `
      <div style="margin-bottom: 16px; padding: 14px 18px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <strong style="font-size: 15px; color: #0f172a; display: block; margin-bottom: 6px;">${p.name}</strong>
        <div style="font-size: 14px; color: #334155; line-height: 1.6;">
          JSR : ${jsrLinkHtml}<br/>
          Meeting Tracker : ${meetingLinkHtml}
        </div>
      </div>
    `;
  }).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
      <p style="font-size: 15px; margin-top: 0;">Hi Team,</p>
      <p style="font-size: 14px; color: #334155; margin-bottom: 20px;">
        This is your daily reminder to update your JSR and Meeting Tracker.<br/>
        Please update the pending tasks.
      </p>

      ${podListHtml}

      <p style="font-size: 14px; margin-top: 24px;">Thank you,</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0 12px 0;" />
      <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
        Automated Daily Reminder · Account Health Tracker
      </p>
    </div>
  `;

  try {
    await sendViaBrevo({
      apiKey,
      fromEmail,
      fromName: 'JSR & Meeting Reminder',
      toAddresses: [{ email: 'apoorv@cogculture.agency', name: 'Apoorv' }],
      subject: 'Daily Reminder: Update JSR and Meeting Tracker',
      html
    });
    console.log('[emailService] Daily 11:30 AM reminder email sent successfully to apoorv@cogculture.agency.');
    return true;
  } catch (err) {
    console.error('[emailService] Failed to send reminder email:', err.message);
    return false;
  }
}
