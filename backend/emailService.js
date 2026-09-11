/**
 * emailService.js
 * Sends alert emails via Gmail SMTP using Nodemailer.
 * Sender: ahtcog@cogculture.agency
 */

import nodemailer from 'nodemailer';
import { getTeamsCollection } from './db.js';

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const user = process.env.SMTP_USER || 'ahtcog@cogculture.agency';
  const pass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

  if (!pass) {
    console.warn('[emailService] SMTP_PASS / GMAIL_APP_PASSWORD not set. Skipping email delivery.');
    return null;
  }

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 465;
  const secure = process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === 'true' : port === 465;

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  return _transporter;
}

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

function formatAddressList(addresses) {
  if (!addresses) return [];
  if (typeof addresses === 'string') {
    return addresses.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (Array.isArray(addresses)) {
    return addresses.map(addr => {
      if (typeof addr === 'string') return addr.trim();
      if (addr && addr.email) {
        return addr.name ? `"${addr.name}" <${addr.email}>` : addr.email;
      }
      return null;
    }).filter(Boolean);
  }
  return [];
}

export async function sendViaSmtp({ from, fromEmail, fromName, toAddresses, ccAddresses, subject, html }) {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.ENABLE_EMAILS === 'false') {
    console.warn('[emailService] Email triggers are currently paused (DISABLE_EMAILS=true). Email not sent.');
    return false;
  }

  const transporter = getTransporter();
  if (!transporter) {
    return false;
  }

  const defaultFrom = process.env.SMTP_FROM || 'Account Health Tracker <ahtcog@cogculture.agency>';
  let fromHeader = defaultFrom;
  if (from) {
    fromHeader = from;
  } else if (fromEmail) {
    fromHeader = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;
  }

  const toList = formatAddressList(toAddresses);
  const ccList = formatAddressList(ccAddresses);

  if (toList.length === 0) {
    console.warn('[emailService] No recipient addresses provided. Email not sent.');
    return false;
  }

  const mailOptions = {
    from: fromHeader,
    to: toList.join(', '),
    ...(ccList.length > 0 ? { cc: ccList.join(', ') } : {}),
    subject,
    html,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`[emailService] Email sent successfully via Gmail SMTP. MessageId: ${info.messageId}`);
  return true;
}

/**
 * Builds a transport for sending to an explicit list of recipients
 * (as opposed to the fixed MANAGEMENT_EMAIL list used by alert emails).
 */
function buildTransportForRecipients(toEmails, ccEmails) {
  const fromEmailRaw = process.env.SMTP_FROM || 'Account Health Tracker <ahtcog@cogculture.agency>';

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
  const fromName = match ? match[1].trim() : 'Account Health Tracker';
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
    fromEmail,
    fromName,
    toAddresses: targetToEmails.map(e => (typeof e === 'string' ? { email: e } : e)),
    ccAddresses: (targetCcEmails || []).map(e => (typeof e === 'string' ? { email: e } : e)),
  };
}


/**
 * Generates the HTML template and subject for the daily executive digest:
 * 1. Open / Evening Deliverables Section (all due/overdue/upcoming for the month grouped together by brand)
 *    - Brand header displays Brand Name, POD, Health Score, and Attendance Rate.
 *    - Deliverables table displays Deliverable, Priority, Status, Timeline.
 * 2. Bottom Section: Comprehensive Brand Health & Daily Meeting Attendance Grid (All Brands)
 */
export function buildExecutiveDigestEmailHtml(clientReports, podName = 'All Teams Summary', options = {}) {
  const isEvening = typeof options === 'boolean' ? options : Boolean(options?.isEvening);
  const todayStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const escapedPodName = escapeHTML(podName);

  // Collect all jobs across all client reports
  const allOpenJobs = [];
  for (const report of clientReports || []) {
    for (const job of report.pendingJobs || []) {
      allOpenJobs.push({
        ...job,
        clientName: report.clientName,
        podName: report.podName || '',
        healthScore: report.healthScore ?? (report.scoreData?.scores?.percentage ?? null),
        rating: report.rating || (report.scoreData?.rating ?? ''),
        meetingStats: report.meetingStats || null,
      });
    }
  }

  // Count stats
  const totalOpenCount = allOpenJobs.length;
  const completedCount = allOpenJobs.filter(j => {
    const s = (j.status || '').toLowerCase();
    return s.includes('closed') || s.includes('completed') || s.includes('done') || s.includes('delivered') || j.isCompleted;
  }).length;
  const overdueCount = allOpenJobs.filter(j => !j.isCompleted && j.diffDays !== null && j.diffDays < 0).length;
  const dueTodayTomorrowCount = allOpenJobs.filter(j => !j.isCompleted && (j.diffDays === 0 || j.diffDays === 1 || j.dueLabel === 'Today' || j.dueLabel === 'Tomorrow')).length;
  const activeCount = totalOpenCount - completedCount;

  const subject = isEvening
    ? `[JSR Evening Digest] ${escapedPodName} - ${totalOpenCount} Deliverables & Brand Health (${todayStr})`
    : `[JSR Report] ${escapedPodName} - ${totalOpenCount} Open XL/XXL Deliverables & Brand Health (${todayStr})`;

  const priorityBadge = (priority) => {
    const p = (priority || '').toString().trim().toUpperCase();
    if (!p || p === '-') {
      return `<span style="background-color: #f1f5f9; color: #64748b; padding: 2px 7px; border-radius: 4px; font-weight: 600; font-size: 10px; display: inline-block;">-</span>`;
    }
    const isXXL = p === 'XXL';
    const isXL = p === 'XL';
    let bg = '#475569';
    if (isXXL) bg = '#0d9488';
    else if (isXL) bg = '#d97706';
    else if (p === 'L') bg = '#2563eb';
    return `<span style="background-color: ${bg}; color: #ffffff; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 10.5px; letter-spacing: 0.3px; display: inline-block;">${escapeHTML(p)}</span>`;
  };

  const statusBadge = (status, category) => {
    const raw = (status || category || '').toString().trim();
    const normalized = raw.toUpperCase();
    let bg = '#475569';
    if (normalized.includes('CLOSED') || normalized.includes('COMPLETED') || normalized.includes('DONE') || normalized.includes('DELIVERED')) {
      bg = '#059669';
    } else if (normalized.includes('PROGRESS') || normalized.includes('WIP') || normalized.includes('ACTIVE')) {
      bg = '#d97706';
    } else if (normalized.includes('CTR') || normalized.includes('CLIENT TO REVERT')) {
      bg = '#2563eb';
    } else if (normalized.includes('ATR') || normalized.includes('AGENCY TO REVERT')) {
      bg = '#7c3aed';
    }
    return `<span style="background-color: ${bg}; color: #ffffff; padding: 2px 7px; border-radius: 4px; font-weight: 600; font-size: 10.5px; display: inline-block;">${escapeHTML(raw || 'In Progress')}</span>`;
  };

  const healthScoreBadge = (healthScore, rating = '') => {
    if (healthScore === null || healthScore === undefined) {
      return `<span style="background: #f1f5f9; color: #64748b; padding: 2px 7px; border-radius: 4px; font-weight: 600; font-size: 11px; display: inline-block;">Health: N/A</span>`;
    }
    let bg = '#fee2e2';
    let text = '#b91c1c';
    if (healthScore >= 80) {
      bg = '#dcfce7';
      text = '#15803d';
    } else if (healthScore >= 60) {
      bg = '#fef3c7';
      text = '#b45309';
    }
    return `<span style="background-color: ${bg}; color: ${text}; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; display: inline-block;">Health: ${healthScore}%</span>`;
  };

  const attendanceBadge = (meetingStats) => {
    if (!meetingStats || meetingStats.unavailable || meetingStats.percentage === undefined || meetingStats.reason) {
      return `<span style="background: #f1f5f9; color: #64748b; padding: 2px 7px; border-radius: 4px; font-weight: 600; font-size: 11px; display: inline-block;">Attendance: N/A</span>`;
    }
    const pct = meetingStats.percentage;
    let bg = '#fee2e2';
    let text = '#b91c1c';
    if (pct >= 90) {
      bg = '#dcfce7';
      text = '#15803d';
    } else if (pct >= 70) {
      bg = '#fef3c7';
      text = '#b45309';
    }
    return `<span style="background-color: ${bg}; color: ${text}; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; display: inline-block;">Attendance: ${pct}% (${meetingStats.metDays ?? 0}/${meetingStats.elapsedWeekdays ?? 0}d)</span>`;
  };

  // Helper to render all open/evening jobs grouped by brand
  const renderOpenJobsByBrand = (reports) => {
    // Filter reports that have pending open jobs
    const activeReportsWithJobs = (reports || []).filter(r => Array.isArray(r.pendingJobs) && r.pendingJobs.length > 0);

    if (activeReportsWithJobs.length === 0) {
      return `
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; text-align: center;">
          <p style="margin: 0; font-size: 14px; color: #166534; font-weight: 600;">
            ✅ ${isEvening ? 'No active deliverables due (excluding CTR & Not Required).' : 'No open XL / XXL deliverables due for this month.'}
          </p>
        </div>
      `;
    }

    return activeReportsWithJobs.map(report => {
      const escapedClient = escapeHTML(report.clientName);
      const escapedPod = report.podName ? ` <span style="font-size: 11px; font-weight: 600; color: #475569; background: #e2e8f0; padding: 2px 7px; border-radius: 4px; margin-left: 6px;">${escapeHTML(report.podName)}</span>` : '';
      const hBadge = healthScoreBadge(report.healthScore, report.rating);
      const jobCount = report.pendingJobs.length;

      return `
        <div style="margin-bottom: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <!-- Brand Header -->
          <table style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <tr>
              <td style="padding: 10px 14px; vertical-align: middle; text-align: left;">
                <span style="font-size: 14px; font-weight: 700; color: #0f172a;">${escapedClient}</span>${escapedPod}
                <span style="margin-left: 10px;">${hBadge}</span>
              </td>
              <td style="padding: 10px 14px; vertical-align: middle; text-align: right; white-space: nowrap;">
                <span style="font-size: 11.5px; color: #64748b; font-weight: 600; background: #ffffff; border: 1px solid #e2e8f0; padding: 3px 8px; border-radius: 12px;">
                  ${jobCount} task${jobCount > 1 ? 's' : ''}
                </span>
              </td>
            </tr>
          </table>

          <!-- Deliverables Table -->
          <table style="width: 100%; border-collapse: collapse; font-size: 12.5px; line-height: 1.4;">
            <thead>
              <tr style="background-color: #ffffff; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left;">
                <th style="padding: 8px 12px; font-weight: 600;">Deliverable</th>
                <th style="padding: 8px 10px; font-weight: 600; width: 60px;">Priority</th>
                <th style="padding: 8px 10px; font-weight: 600; width: 95px;">Status</th>
                <th style="padding: 8px 10px; font-weight: 600; width: 105px; text-align: center;">Delivery Date</th>
                <th style="padding: 8px 12px; font-weight: 600; width: 145px; text-align: right;">Timeline</th>
              </tr>
            </thead>
            <tbody>
              ${report.pendingJobs.map((j, idx) => {
                const isToday = j.dueLabel === 'Today';
                const isTomorrow = j.dueLabel === 'Tomorrow';
                const isOverdue = !j.isCompleted && j.diffDays !== null && j.diffDays < 0;
                const isCompleted = j.isCompleted || (j.status || '').toLowerCase().includes('closed') || (j.status || '').toLowerCase().includes('completed');

                let dueColor = '#1e40af';
                let dueBadgeBg = '#eff6ff';
                if (isCompleted) {
                  dueColor = '#15803d';
                  dueBadgeBg = '#dcfce7';
                } else if (isToday) {
                  dueColor = '#991b1b';
                  dueBadgeBg = '#fee2e2';
                } else if (isTomorrow) {
                  dueColor = '#9a3412';
                  dueBadgeBg = '#ffedd5';
                } else if (isOverdue) {
                  dueColor = '#b91c1c';
                  dueBadgeBg = '#fef2f2';
                }

                let dueText = '-';
                if (j.dueDate && j.dueDate !== '-') {
                  if (j.dueLabel && j.dueLabel !== '-') {
                    dueText = `${j.dueLabel} (${j.dueDate})`;
                  } else {
                    dueText = j.dueDate;
                  }
                } else if (j.dueLabel && j.dueLabel !== '-') {
                  dueText = j.dueLabel;
                }

                const deliveryDateText = j.deliveryDate || '-';
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
                    <td style="padding: 9px 10px; color: #475569; font-size: 11.5px; font-weight: 500; text-align: center; vertical-align: middle; white-space: nowrap;">
                      ${escapeHTML(deliveryDateText)}
                    </td>
                    <td style="padding: 9px 12px; text-align: right; vertical-align: middle;">
                      <span style="background-color: ${dueBadgeBg}; color: ${dueColor}; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; display: inline-block;">
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

  // Section 1: Deliverables
  const sectionTitle = isEvening 
    ? '📌 Active & Completed Deliverables (Excl. CTR & Not Required)' 
    : '📌 Open XL & XXL Deliverables';

  const deliverablesSectionHtml = `
    <div style="margin-bottom: 36px;">
      <div style="background: linear-gradient(90deg, #eff6ff 0%, #ffffff 100%); border-left: 4px solid #3b82f6; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 15px; color: #1e40af; font-weight: 700; display: flex; align-items: center;">
          ${sectionTitle}
          <span style="margin-left: 8px; background: #dbeafe; color: #1e40af; padding: 1px 8px; border-radius: 12px; font-size: 12px; font-weight: 700;">
            ${totalOpenCount}
          </span>
        </h3>
      </div>
      ${renderOpenJobsByBrand(clientReports)}
    </div>
  `;

  // Section 2: Comprehensive Brand Health & Daily Meeting Attendance Grid (All Brands)
  const attendanceGridHtml = `
    <div style="margin-top: 36px; border-top: 2px solid #e2e8f0; padding-top: 24px;">
      <div style="background: linear-gradient(90deg, #f8fafc 0%, #ffffff 100%); border-left: 4px solid #64748b; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 15px; color: #334155; font-weight: 700;">
          📊 Brand Health & Daily Meeting Attendance Grid (Month-to-Date)
        </h3>
      </div>
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left;">
              <th style="padding: 10px 12px; font-weight: 700;">Brand</th>
              <th style="padding: 10px 10px; font-weight: 700;">POD</th>
              <th style="padding: 10px 10px; font-weight: 700; text-align: center;">Health Score</th>
              <th style="padding: 10px 10px; font-weight: 700; text-align: center;">Meeting Days</th>
              <th style="padding: 10px 12px; font-weight: 700; text-align: right;">Attendance Rate</th>
              <th style="padding: 10px 12px; font-weight: 700; text-align: center; width: 100px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${(clientReports || []).map((report, idx) => {
              const { clientName, podName: rPodName = '', meetingStats = {}, attendanceReason = '', healthScore = null, rating = '' } = report;
              const isUnavail = meetingStats.unavailable || Boolean(attendanceReason) || Boolean(meetingStats.reason);
              const pct = meetingStats.percentage ?? 0;

              let healthScoreText = '-';
              let healthScoreColor = '#64748b';
              if (healthScore !== null && healthScore !== undefined) {
                healthScoreText = `${healthScore}%`;
                if (healthScore >= 80) healthScoreColor = '#15803d';
                else if (healthScore >= 60) healthScoreColor = '#b45309';
                else healthScoreColor = '#b91c1c';
              }

              let statusBadgeHtml = '';
              if (rating) {
                let badgeBg = '#fee2e2';
                let badgeColor = '#b91c1c';
                if (rating === 'Excellent' || rating === 'Good') {
                  badgeBg = '#dcfce7';
                  badgeColor = '#15803d';
                } else if (rating === 'Average' || rating === 'Needs Attention') {
                  badgeBg = '#fef3c7';
                  badgeColor = '#b45309';
                }
                statusBadgeHtml = `<span style="background: ${badgeBg}; color: ${badgeColor}; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 10.5px;">${escapeHTML(rating)}</span>`;
              } else if (isUnavail) {
                statusBadgeHtml = `<span style="background: #f1f5f9; color: #64748b; padding: 2px 7px; border-radius: 4px; font-weight: 600; font-size: 10.5px;">Unavailable</span>`;
              } else if (pct >= 90) {
                statusBadgeHtml = `<span style="background: #dcfce7; color: #15803d; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 10.5px;">Good</span>`;
              } else if (pct >= 70) {
                statusBadgeHtml = `<span style="background: #fef3c7; color: #b45309; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 10.5px;">Average</span>`;
              } else {
                statusBadgeHtml = `<span style="background: #fee2e2; color: #b91c1c; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 10.5px;">Attention</span>`;
              }

              let pctColor = '#0f172a';
              if (isUnavail) pctColor = '#64748b';
              else if (pct >= 90) pctColor = '#15803d';
              else if (pct >= 70) pctColor = '#b45309';
              else pctColor = '#b91c1c';

              const rowBg = idx % 2 === 1 ? '#fafafa' : '#ffffff';
              const escapedClient = escapeHTML(clientName);
              const escapedPod = rPodName ? escapeHTML(rPodName) : '-';

              return `
                <tr style="background-color: ${rowBg}; border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 12px; color: #0f172a; font-weight: 600;">
                    ${escapedClient}
                  </td>
                  <td style="padding: 10px 10px; color: #475569; font-weight: 500;">
                    ${escapedPod}
                  </td>
                  <td style="padding: 10px 10px; font-weight: 700; color: ${healthScoreColor}; text-align: center;">
                    ${healthScoreText}
                  </td>
                  <td style="padding: 10px 10px; color: #475569; text-align: center;">
                    ${isUnavail ? '-' : `${meetingStats.metDays ?? 0} / ${meetingStats.elapsedWeekdays ?? 0}d`}
                  </td>
                  <td style="padding: 10px 12px; font-weight: 700; color: ${pctColor}; text-align: right;">
                    ${isUnavail ? '-' : `${pct}%`}
                  </td>
                  <td style="padding: 10px 12px; text-align: center;">
                    ${statusBadgeHtml}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const headerTitle = isEvening
    ? `JSR Evening Digest &bull; ${escapedPodName}`
    : `JSR Executive Digest &bull; ${escapedPodName}`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHTML(subject)}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased; color: #1e293b;">
      
      <div style="max-width: 780px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px; color: #ffffff;">
          <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <div style="background: ${isEvening ? '#8b5cf6' : '#3b82f6'}; width: 4px; height: 22px; border-radius: 2px; margin-right: 10px;"></div>
            <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.3px;">
              ${headerTitle}
            </h1>
          </div>
          
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px;">
            <span style="background: rgba(59, 130, 246, 0.25); border: 1px solid rgba(59, 130, 246, 0.5); color: #bfdbfe; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">
              📌 ${totalOpenCount} ${isEvening ? 'Active Deliverables' : 'Open Tasks'}
            </span>
            ${overdueCount > 0 ? `
              <span style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                ⚠️ ${overdueCount} Overdue
              </span>
            ` : ''}
            ${dueTodayTomorrowCount > 0 ? `
              <span style="background: rgba(249, 115, 22, 0.2); border: 1px solid rgba(249, 115, 22, 0.4); color: #fdba74; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                ⚡ ${dueTodayTomorrowCount} Due Soon
              </span>
            ` : ''}
            ${completedCount > 0 ? `
              <span style="background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #a7f3d0; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                ✅ ${completedCount} Completed
              </span>
            ` : ''}
            <span style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.15); color: #cbd5e1; padding: 4px 10px; border-radius: 20px; font-size: 12px;">
              📅 ${todayStr}
            </span>
          </div>
        </div>

        <!-- Body -->
        <div style="padding: 24px;">
          ${deliverablesSectionHtml}
          ${attendanceGridHtml}
        </div>

        <!-- Footer -->
        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
          <p style="margin: 0; font-size: 11.5px; color: #94a3b8; line-height: 1.5;">
            Account Health Tracker Dashboard &bull; Automated ${isEvening ? 'Evening' : 'Management'} Digest<br/>
            Delivered exclusively for leadership reviews.
          </p>
        </div>

      </div>
    </body>
    </html>
  `;

  return { subject, html };
}

/**
 * Sends the daily digest email for a POD or All Teams summary.
 */
export async function sendPodDigestEmail({ podName, to, cc, clientReports, isEvening = false }) {
  const transport = buildTransportForRecipients(to, cc);
  if (!transport) return false;

  const { subject, html } = buildExecutiveDigestEmailHtml(clientReports, podName, { isEvening });

  try {
    const ok = await sendViaSmtp({ ...transport, subject, html });
    if (ok) {
      console.log(`[emailService] ${isEvening ? 'Evening' : 'Daily'} digest email sent for pod "${podName}" to ${transport.toAddresses.map(a => a.email || a).join(', ')}.`);
    }
    return ok;
  } catch (err) {
    console.error(`[emailService] Failed to send ${isEvening ? 'evening' : 'daily'} digest email for pod "${podName}":`, err.message);
    return false;
  }
}

export async function sendDailyReminderEmail() {
  const fromEmail = process.env.SMTP_FROM || 'Account Health Tracker <ahtcog@cogculture.agency>';

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
    const ok = await sendViaSmtp({
      fromEmail,
      fromName: 'JSR & Meeting Reminder',
      toAddresses: [{ email: 'apoorv@cogculture.agency', name: 'Apoorv' }],
      subject: 'Daily Reminder: Update JSR and Meeting Tracker',
      html
    });
    if (ok) {
      console.log('[emailService] Daily 11:30 AM reminder email sent successfully to apoorv@cogculture.agency.');
    }
    return ok;
  } catch (err) {
    console.error('[emailService] Failed to send reminder email:', err.message);
    return false;
  }
}
