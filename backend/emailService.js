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
 * Sends the daily 11:30 AM digest email for a POD: pending L/XL/XXL jobs due
 * today or tomorrow across the pod's clients, plus each client's month-to-date
 * daily meeting attendance percentage.
 */
export async function sendPodDigestEmail({ podName, to, cc, clientReports }) {
  const transport = buildTransportForRecipients(to, cc);
  if (!transport) return false;

  const totalPendingJobs = clientReports.reduce((sum, c) => sum + c.pendingJobs.length, 0);
  const todayStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const escapedPodName = escapeHTML(podName);

  const subject = `[JSR Report] ${escapedPodName} — ${totalPendingJobs} Pending L/XL/XXL Job${totalPendingJobs !== 1 ? 's' : ''} (${todayStr})`;

  const priorityBadge = (priority) => {
    const colors = { XXL: '#0d9488', XL: '#d97706', L: '#2563eb' };
    return `<span style="background-color: ${colors[priority] || '#64748b'}; color: white; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">${escapeHTML(priority)}</span>`;
  };

  const clientSectionsHtml = clientReports.map((report) => {
    const { clientName, pendingJobs, meetingStats, podName: reportPodName } = report;
    const escapedClientName = escapeHTML(clientName);
    const podLabel = reportPodName
      ? ` <span style="font-size: 11px; background-color: #e2e8f0; color: #475569; padding: 2px 6px; border-radius: 4px; margin-left: 6px; vertical-align: middle; font-weight: normal;">${escapeHTML(reportPodName)}</span>`
      : '';

    const jobsTableHtml = pendingJobs.length === 0
      ? `<p style="font-size: 13px; color: #64748b; margin: 8px 0;">No pending L/XL/XXL jobs due today.</p>`
      : `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; margin-top: 8px;">
          <thead>
            <tr style="background-color: #f1f5f9; text-align: left;">
              ${pendingJobs.some(j => !j.isPanasonic) ? `<th style="padding: 8px; color: #64748b; font-weight: 600; border-bottom: 2px solid #e2e8f0;">Job ID</th>` : ''}
              <th style="padding: 8px; color: #64748b; font-weight: 600; border-bottom: 2px solid #e2e8f0;">Deliverable</th>
              <th style="padding: 8px; color: #64748b; font-weight: 600; border-bottom: 2px solid #e2e8f0;">Priority</th>
              <th style="padding: 8px; color: #64748b; font-weight: 600; border-bottom: 2px solid #e2e8f0;">Due</th>
            </tr>
          </thead>
          <tbody>
            ${pendingJobs.map(job => `
              <tr>
                ${job.isPanasonic ? '' : `<td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-size: 12px; color: #475569;">${escapeHTML(job.jobId)}</td>`}
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: 500; color: #0f172a;">${escapeHTML(job.deliverable)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${priorityBadge(job.priority)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: ${job.dueLabel === 'Today' || job.dueLabel.startsWith('Overdue') ? '#ef4444' : '#d97706'}; font-weight: 600;">${escapeHTML(job.dueLabel)} (${escapeHTML(job.dueDate)})</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

    return `
      <div style="margin-bottom: 24px;">
        <h3 style="font-size: 15px; color: #0f172a; margin: 0 0 4px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">${escapedClientName}${podLabel}</h3>
        ${jobsTableHtml}
        <p style="font-size: 12px; color: #475569; margin: 8px 0 0 0;">
          Daily meeting attendance: <strong>${meetingStats.metDays}/${meetingStats.elapsedWeekdays} days</strong>
          (<strong style="color: ${meetingStats.percentage >= 90 ? '#0d9488' : meetingStats.percentage >= 70 ? '#d97706' : '#ef4444'};">${meetingStats.percentage}%</strong>)
        </p>
      </div>
    `;
  }).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
      <h2 style="color: #2563eb; margin-top: 0; font-size: 20px;">📋 JSR Report — ${escapedPodName}</h2>
      <p style="font-size: 14px; color: #334155; line-height: 1.5; margin-bottom: 20px;">
        Pending high-priority (L/XL/XXL) jobs due today, and daily meeting attendance, as of ${todayStr}.
      </p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 0 0 20px 0;" />
      ${clientSectionsHtml}
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
        This is an automated report generated by the Account Health Tracker Dashboard.
      </p>
    </div>
  `;

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
