import { parseJobTrackerRows, parseDailyTrackerRows, getCommonClientTabs, parseAssignedPersons } from './utils/sheetsParser.js';
import { calculateHealthScore } from './utils/scoreEngine.js';
import { sendPodDigestEmail } from './emailService.js';
import { getTeamsCollection, getDailyDigestSnapshotsCollection } from './db.js';
import { POD_RECIPIENTS } from './podConfig.js';
import { syncJobStatusAging } from './jobStatusTracker.js';
import crypto from 'node:crypto';

const SHEETS_REQUEST_TIMEOUT_MS = Number(process.env.SHEETS_REQUEST_TIMEOUT_MS || 30000);
const SHEETS_RETRY_COUNT = Number(process.env.SHEETS_RETRY_COUNT || 2);
const SNAPSHOT_TIMEZONE = 'Asia/Kolkata';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, label, timeoutMs = SHEETS_REQUEST_TIMEOUT_MS) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

// Standalone sheets API helpers with bounded retries and detailed labels.
async function callWithRetry(fn, { retries = SHEETS_RETRY_COUNT, delay = 2000, label = 'Google Sheets request' } = {}) {
  try {
    const startedAt = Date.now();
    const result = await withTimeout(fn(), label);
    const elapsed = Date.now() - startedAt;
    if (elapsed > 5000) {
      console.warn(`[sheets API] Slow request: ${label} completed in ${elapsed}ms.`);
    }
    return result;
  } catch (error) {
    const isRateLimit =
      error.status === 429 ||
      error.code === 429 ||
      (error.message && error.message.toLowerCase().includes('quota')) ||
      (error.message && error.message.toLowerCase().includes('rate limit')) ||
      (error.message && error.message.toLowerCase().includes('read requests'));

    if (isRateLimit && retries > 0) {
      console.warn(`[sheets API] Rate limit / quota reached for ${label}. Retrying in ${delay}ms... (${retries} retries left)`);
      await sleep(delay);
      return callWithRetry(fn, { retries: retries - 1, delay: delay * 2, label });
    }
    throw error;
  }
}

async function getSheetTabs(sheets, spreadsheetId) {
  const res = await callWithRetry(
    () => sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties.title',
    }),
    { label: `tabs:${spreadsheetId}` }
  );
  return res.data.sheets.map(s => s.properties.title);
}

async function getSheetData(sheets, spreadsheetId, tabName, knownTabs = null) {
  const actualTabs = knownTabs || await getSheetTabs(sheets, spreadsheetId);
  const targetLowerTrimmed = tabName.toLowerCase().trim();
  const matchedTab = actualTabs.find(t => t.toLowerCase().trim() === targetLowerTrimmed) || tabName;
  const safeRange = `'${matchedTab.replace(/'/g, "''")}'`;

  const valuesRes = await callWithRetry(
    () => sheets.spreadsheets.values.get({
      spreadsheetId,
      range: safeRange,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER',
    }),
    { label: `values:${spreadsheetId}:${matchedTab}` }
  );

  const rawValues = valuesRes.data.values || [];

  let hiddenRowIndices = new Set();
  try {
    const metaRes = await callWithRetry(
      () => sheets.spreadsheets.get({
        spreadsheetId,
        ranges: [safeRange],
        fields: 'sheets.data.rowMetadata.hiddenByFilter,sheets.data.rowMetadata.hiddenByUser',
      }),
      { label: `rowMetadata:${spreadsheetId}:${matchedTab}` }
    );
    const rowMetadata = metaRes.data.sheets?.[0]?.data?.[0]?.rowMetadata || [];
    rowMetadata.forEach((meta, idx) => {
      if (meta.hiddenByFilter || meta.hiddenByUser) {
        hiddenRowIndices.add(idx);
      }
    });
  } catch (err) {
    console.warn(`[dailyDigestEngine] Could not read hidden-row metadata for "${matchedTab}". Continuing with visible values only. ${err.message}`);
  }

  return rawValues.filter((_, idx) => !hiddenRowIndices.has(idx));
}

function toMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getSnapshotDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SNAPSHOT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDateKey(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultMeetingStats() {
  return { elapsedWeekdays: 0, metDays: 0, percentage: 0, unavailable: true };
}

function getScanFailureReason(error) {
  const message = (error?.message || 'Unknown error').toString();
  const normalized = message.toLowerCase();

  if (
    normalized.includes('quota') ||
    normalized.includes('rate limit') ||
    normalized.includes('read requests')
  ) {
    return 'Brand could not be scanned because Google Sheets read quota was exceeded. Please retry after the quota window resets.';
  }

  if (normalized.includes('timed out')) {
    return 'Brand could not be scanned because the Google Sheets request timed out.';
  }

  return `Brand could not be scanned: ${message.slice(0, 180)}`;
}

function getNoDeadlineReason() {
  return 'No XL/XXL jobs due today or tomorrow.';
}

function normalizeRecipients(recipients) {
  return [...new Set((recipients || []).map(email => email.toString().trim().toLowerCase()).filter(Boolean))].sort();
}

function getManagementDigestSignature(snapshot, recipients) {
  const payload = {
    dateKey: snapshot?.dateKey || '',
    recipients: normalizeRecipients(recipients),
    reports: (snapshot?.consolidatedReports || []).map(report => ({
      podName: report.podName || '',
      clientName: report.clientName || '',
      pendingJobs: (report.pendingJobs || []).map(job => ({
        jobId: job.jobId || '',
        deliverable: job.deliverable || '',
        priority: job.priority || '',
        status: job.status || '',
        dueDate: job.dueDate || '',
        dueLabel: job.dueLabel || '',
      })),
      meetingStats: report.meetingStats || null,
      noDeadlineReason: report.noDeadlineReason || '',
      scanReason: report.scanReason || '',
      attendanceReason: report.attendanceReason || '',
    })),
  };

  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function buildPendingJobs(jobs, today) {
  const todayMidnight = toMidnight(today);
  const pendingJobs = [];

  for (const job of jobs) {
    const priority = (job.priority || '').toString().trim().toUpperCase();
    if (priority !== 'XL' && priority !== 'XXL') continue;

    const status = (job.status || '').toString().trim();
    const statusLower = status.toLowerCase();
    if (statusLower === 'closed' || statusLower === 'completed') continue;
    if (
      statusLower.includes('atr') ||
      statusLower.includes('agency to revert') ||
      statusLower.includes('ctr') ||
      statusLower.includes('client to revert')
    ) continue;

    let diffDays = null;
    let dueLabel = '-';
    let dueDate = '-';
    let isDueTodayOrTomorrow = false;

    if (job.clientTimeline instanceof Date && !isNaN(job.clientTimeline.getTime())) {
      const timelineMidnight = toMidnight(job.clientTimeline);
      diffDays = Math.round((timelineMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
      dueDate = formatDateKey(job.clientTimeline);
      if (diffDays === 0) {
        dueLabel = 'Today';
        isDueTodayOrTomorrow = true;
      } else if (diffDays === 1) {
        dueLabel = 'Tomorrow';
        isDueTodayOrTomorrow = true;
      } else if (diffDays < 0) {
        dueLabel = `${Math.abs(diffDays)}d Overdue`;
      } else {
        dueLabel = `${diffDays}d left`;
      }
    }

    pendingJobs.push({
      jobId: job.jobId,
      deliverable: job.deliverable || job.jobId,
      priority,
      status,
      statusCategory: job.statusAging?.category || '',
      daysInStatus: job.statusAging?.daysInStatus ?? null,
      enteredAtFormatted: job.statusAging?.enteredAtFormatted || '',
      dueDate,
      dueLabel,
      diffDays,
      isDueTodayOrTomorrow,
      isPanasonic: false,
    });
  }

  // Sort: Today/Tomorrow first, then Overdue, then nearest upcoming
  pendingJobs.sort((a, b) => {
    if (a.isDueTodayOrTomorrow && !b.isDueTodayOrTomorrow) return -1;
    if (!a.isDueTodayOrTomorrow && b.isDueTodayOrTomorrow) return 1;
    if (a.diffDays !== null && b.diffDays !== null) return a.diffDays - b.diffDays;
    if (a.diffDays !== null) return -1;
    if (b.diffDays !== null) return 1;
    return 0;
  });

  return pendingJobs;
}

function isInCurrentMonth(date, today) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return false;
  return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
}

async function syncScoreStatusAging(label, scoreData) {
  if (!scoreData?.metrics?.p2) return scoreData;
  const targetKey = Array.isArray(scoreData.metrics.p2.allMonthJobs) && scoreData.metrics.p2.allMonthJobs.length > 0
    ? 'allMonthJobs'
    : 'jobs';
  const jobsToSync = scoreData.metrics.p2[targetKey];
  if (!Array.isArray(jobsToSync) || jobsToSync.length === 0) return scoreData;

  try {
    scoreData.metrics.p2[targetKey] = await syncJobStatusAging(label, jobsToSync);
  } catch (err) {
    console.warn(`[dailyDigestEngine] Status aging sync failed for "${label}": ${err.message}`);
  }

  return scoreData;
}

/**
 * Counts weekdays (Mon-Fri) from the 1st of the given date's month through
 * that date, inclusive, and how many of those days had an attended JSR call
 * recorded in the Daily Tracker.
 */
function computeMeetingStats(dailyRecords, today) {
  const todayMidnight = toMidnight(today);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  let elapsedWeekdays = 0;
  for (let d = new Date(monthStart); d <= todayMidnight; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) elapsedWeekdays++;
  }

  const metDays = new Set();
  for (const record of dailyRecords) {
    if (!record.date) continue;
    const recordMidnight = toMidnight(record.date);
    if (recordMidnight < monthStart || recordMidnight > todayMidnight) continue;
    const day = recordMidnight.getDay();
    if (day === 0 || day === 6) continue;
    if (record.jsrCall) metDays.add(recordMidnight.toISOString().split('T')[0]);
  }

  const percentage = elapsedWeekdays > 0 ? Math.round((metDays.size / elapsedWeekdays) * 100) : 0;

  return { elapsedWeekdays, metDays: metDays.size, percentage };
}

async function buildDailyDigestPayload(sheets, { podNames = null, source = 'manual', today = new Date() } = {}) {
  const startedAt = Date.now();
  const normalizedFilter = Array.isArray(podNames)
    ? podNames.map(n => n.trim().toUpperCase()).filter(Boolean)
    : null;

  console.log(`[dailyDigestEngine] Building daily snapshot${normalizedFilter ? ` for pods: ${normalizedFilter.join(', ')}` : ''}...`);

  const collection = await getTeamsCollection();
  const allTeams = await collection.find({}).toArray();
  const activeTeams = allTeams
    .filter(t => t.active)
    .filter(t => !normalizedFilter || normalizedFilter.includes((t.name || '').trim().toUpperCase()));

  const podEmailsToSend = [];
  const consolidatedReports = [];
  const dashboardScores = {};
  const dashboardClients = [];
  const diagnostics = [];
  const errors = [];
  let combinedCcList = [];
  let scannedClientCount = 0;

  if (activeTeams.length === 0) {
    console.log('[dailyDigestEngine] No active teams configured for snapshot.');
  }

  for (const team of activeTeams) {
    const teamStartedAt = Date.now();
    const podName = (team.name || '').trim().toUpperCase();
    const recipients = POD_RECIPIENTS[podName];
    const teamDiagnostic = {
      podName,
      teamId: team.id,
      clientsFound: 0,
      clientsScanned: 0,
      errors: [],
      durationMs: 0,
    };

    diagnostics.push(teamDiagnostic);

    if (!recipients) {
      const message = `Team "${team.name}" has no matching POD recipient config.`;
      console.warn(`[dailyDigestEngine] ${message}`);
      teamDiagnostic.errors.push(message);
      errors.push({ scope: 'team', podName, message });
      continue;
    }

    if (recipients.cc && recipients.cc.length > 0) {
      combinedCcList = [...new Set([...combinedCcList, ...recipients.cc])];
    }

    console.log(`[dailyDigestEngine] Scanning sheets for pod "${podName}"...`);
    const clientReports = [];

    try {
      const [dailyTabs, jobTabs] = await Promise.all([
        getSheetTabs(sheets, team.dailyId),
        getSheetTabs(sheets, team.jobId),
      ]);

      const commonClients = getCommonClientTabs(dailyTabs, jobTabs);
      teamDiagnostic.clientsFound = commonClients.length;

      for (const clientName of commonClients) {
        const clientStartedAt = Date.now();
        try {
          console.log(`[dailyDigestEngine] Reading "${clientName}" for pod "${podName}"...`);
          const isPanasonic = (clientName || '').toLowerCase().includes('panasonic') || podName === 'PANASONIC';
          const clientKey = `${team.id}::${clientName}`;
          const label = activeTeams.length > 1 && podName ? `${clientName} (${podName})` : clientName;

          let rawJobs = null;
          let rawDaily = null;
          let jobReadError = null;
          let dailyReadError = null;

          try {
            rawJobs = await getSheetData(sheets, team.jobId, clientName, jobTabs);
          } catch (err) {
            jobReadError = err;
          }

          try {
            rawDaily = await getSheetData(sheets, team.dailyId, clientName, dailyTabs);
          } catch (err) {
            dailyReadError = err;
          }

          let jobs = [];
          let pendingJobs = [];
          let dailyRecords = [];
          let meetingStats = getDefaultMeetingStats();
          let scanReason = null;
          let attendanceReason = null;

          if (jobReadError) {
            scanReason = getScanFailureReason(jobReadError);
            const message = `Failed to read Job Tracker for "${clientName}" on pod "${podName}": ${jobReadError.message}`;
            console.error(`[dailyDigestEngine] ${message}`);
            teamDiagnostic.errors.push(message);
            errors.push({ scope: 'client', podName, clientName, message });
          } else {
            jobs = parseJobTrackerRows(rawJobs, clientName, isPanasonic);
            try {
              jobs = await syncJobStatusAging(clientName, jobs);
            } catch (err) {
              console.warn(`[dailyDigestEngine] Status aging sync failed for "${clientName}": ${err.message}`);
            }
            pendingJobs = buildPendingJobs(jobs, today).map(job => ({ ...job, isPanasonic }));
          }

          if (dailyReadError) {
            attendanceReason = getScanFailureReason(dailyReadError);
            meetingStats = { ...getDefaultMeetingStats(), reason: attendanceReason };
            const message = `Failed to read Daily Tracker for "${clientName}" on pod "${podName}": ${dailyReadError.message}`;
            console.error(`[dailyDigestEngine] ${message}`);
            teamDiagnostic.errors.push(message);
            errors.push({ scope: 'client', podName, clientName, message });
          } else {
            try {
              dailyRecords = parseDailyTrackerRows(rawDaily, clientName);
              meetingStats = computeMeetingStats(dailyRecords, today);
            } catch (dailyErr) {
              attendanceReason = `Could not parse daily meeting tracker: ${dailyErr.message}`;
              meetingStats = { ...getDefaultMeetingStats(), reason: attendanceReason };
              console.error(`[dailyDigestEngine] Failed to parse Daily Tracker for "${clientName}":`, dailyErr.message);
            }
          }

          if (!jobReadError && !dailyReadError) {
            const assignedPersons = parseAssignedPersons(rawDaily);
            let scoreData = calculateHealthScore(
              dailyRecords,
              jobs,
              label,
              today.getMonth(),
              today.getFullYear(),
              podName,
              assignedPersons
            );
            scoreData = await syncScoreStatusAging(label, scoreData);

            const cacheKey = `${clientKey}__${today.getMonth()}__${today.getFullYear()}`;
            dashboardScores[cacheKey] = scoreData;
            dashboardClients.push({
              key: clientKey,
              label,
              tabName: clientName,
              pairId: team.id,
              dailyId: team.dailyId,
              jobId: team.jobId,
            });
          }

          clientReports.push({
            clientName,
            pendingJobs,
            meetingStats,
            noDeadlineReason: !jobReadError && pendingJobs.length === 0 ? getNoDeadlineReason() : '',
            scanReason,
            attendanceReason,
          });

          if (!jobReadError && !dailyReadError) {
            scannedClientCount++;
            teamDiagnostic.clientsScanned++;
          }
          console.log(`[dailyDigestEngine] Scanned "${clientName}" for "${podName}" in ${Date.now() - clientStartedAt}ms.`);
        } catch (clientErr) {
          const message = `Failed to scan client "${clientName}" on pod "${podName}": ${clientErr.message}`;
          console.error(`[dailyDigestEngine] ${message}`);
          teamDiagnostic.errors.push(message);
          errors.push({ scope: 'client', podName, clientName, message });
          try {
            clientReports.push({
              clientName,
              pendingJobs: [],
              meetingStats: getDefaultMeetingStats(),
              scanReason: getScanFailureReason(clientErr),
              attendanceReason: 'Daily meeting attendance could not be read because this brand scan failed.',
            });
          } catch {
            // Keep scanning the remaining brands even if adding the failure row fails.
          }
        }
      }
    } catch (teamErr) {
      const message = `Failed to scan pod "${podName}": ${teamErr.message}`;
      console.error(`[dailyDigestEngine] ${message}`);
      teamDiagnostic.errors.push(message);
      errors.push({ scope: 'team', podName, message });
      clientReports.push({
        clientName: `${podName} pod`,
        pendingJobs: [],
        meetingStats: getDefaultMeetingStats(),
        scanReason: getScanFailureReason(teamErr),
        attendanceReason: 'Daily meeting attendance could not be read because this pod could not be scanned.',
      });
    } finally {
      teamDiagnostic.durationMs = Date.now() - teamStartedAt;
    }

    if (clientReports.length > 0) {
      podEmailsToSend.push({
        podName,
        to: recipients.to,
        clientReports,
      });

      clientReports.forEach(report => {
        consolidatedReports.push({
          ...report,
          podName,
        });
      });
    }
  }

  return {
    dateKey: getSnapshotDateKey(today),
    source,
    timezone: SNAPSHOT_TIMEZONE,
    generatedAt: new Date(),
    month: today.getMonth(),
    year: today.getFullYear(),
    status: errors.length > 0 ? 'partial' : 'ready',
    podEmailsToSend,
    consolidatedReports,
    managementRecipients: combinedCcList,
    dashboardScores,
    dashboardClients,
    diagnostics,
    errors,
    summary: {
      activeTeamCount: activeTeams.length,
      scannedClientCount,
      consolidatedClientCount: consolidatedReports.length,
      dashboardScoreCount: Object.keys(dashboardScores).length,
      errorCount: errors.length,
      durationMs: Date.now() - startedAt,
    },
  };
}

export async function buildAndSaveDailyDigestSnapshot(sheets, options = {}) {
  const payload = await buildDailyDigestPayload(sheets, options);
  const snapshots = await getDailyDigestSnapshotsCollection();
  const now = new Date();
  const { dateKey } = payload;

  await snapshots.updateOne(
    { dateKey },
    {
      $set: {
        ...payload,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  const saved = await snapshots.findOne({ dateKey });
  console.log(`[dailyDigestEngine] Saved daily snapshot ${dateKey}: ${payload.summary.dashboardScoreCount} score(s), ${payload.summary.consolidatedClientCount} digest client(s), ${payload.summary.errorCount} error(s).`);
  return saved;
}

export async function getLatestDailyDigestSnapshot({ dateKey = getSnapshotDateKey(), allowLatestFallback = true } = {}) {
  const snapshots = await getDailyDigestSnapshotsCollection();
  const todaySnapshot = dateKey ? await snapshots.findOne({ dateKey }) : null;
  if (todaySnapshot || !allowLatestFallback) return todaySnapshot;
  return snapshots.find({}).sort({ generatedAt: -1 }).limit(1).next();
}

export async function sendManagementDigestFromSnapshot(snapshot, { to = null, force = false } = {}) {
  if (!snapshot) {
    console.warn('[dailyDigestEngine] No snapshot available for management digest.');
    return false;
  }

  const recipients = to
    ? (Array.isArray(to) ? to : [to])
    : (snapshot.managementRecipients || []);

  if (!recipients.length) {
    console.warn('[dailyDigestEngine] Snapshot has no management recipients. Email not sent.');
    return false;
  }

  if (!snapshot.consolidatedReports || snapshot.consolidatedReports.length === 0) {
    console.warn(`[dailyDigestEngine] Snapshot ${snapshot.dateKey} has no consolidated reports. Email not sent.`);
    return false;
  }

  const normalizedRecipients = normalizeRecipients(recipients);
  const signature = getManagementDigestSignature(snapshot, normalizedRecipients);
  const sentDigests = snapshot.sentManagementDigests || [];
  const alreadySent = sentDigests.some(item => item?.signature === signature);

  if (alreadySent && !force) {
    console.warn(`[dailyDigestEngine] Management digest ${snapshot.dateKey} already sent to ${normalizedRecipients.join(', ')} with this content. Skipping duplicate send.`);
    return { sent: false, skipped: true, reason: 'duplicate', signature };
  }

  console.log(`[dailyDigestEngine] Sending management digest from snapshot ${snapshot.dateKey} to ${normalizedRecipients.join(', ')}...`);
  const ok = await sendPodDigestEmail({
    podName: 'All Teams Summary',
    to: normalizedRecipients,
    cc: [],
    clientReports: snapshot.consolidatedReports,
  });

  if (!ok) return { sent: false, skipped: false, reason: 'email_failed', signature };

  const snapshots = await getDailyDigestSnapshotsCollection();
  await snapshots.updateOne(
    { _id: snapshot._id },
    {
      $push: {
        sentManagementDigests: {
          signature,
          recipients: normalizedRecipients,
          sentAt: new Date(),
          forced: Boolean(force),
        },
      },
      $set: { updatedAt: new Date() },
    }
  );

  return { sent: true, skipped: false, signature };
}

export async function sendManagementDigestFromLatestSnapshot(options = {}) {
  const snapshot = await getLatestDailyDigestSnapshot(options);
  return sendManagementDigestFromSnapshot(snapshot, options);
}

export async function sendPodDigestsFromSnapshot(snapshot) {
  if (!snapshot?.podEmailsToSend?.length) {
    console.log('[dailyDigestEngine] Snapshot has no POD digest emails to send.');
    return [];
  }

  const results = [];
  for (const item of snapshot.podEmailsToSend) {
    console.log(`[dailyDigestEngine] Sending individual pod digest email for pod "${item.podName}" (${item.clientReports.length} client(s))...`);
    const success = await sendPodDigestEmail({
      podName: item.podName,
      to: item.to,
      cc: [],
      clientReports: item.clientReports,
    });
    results.push({ podName: item.podName, success });
  }
  return results;
}

/**
 * Backward-compatible manual digest runner. It now builds/saves a snapshot
 * first, then sends email from that saved snapshot.
 */
export async function runDailyDigestCheck(sheets, overrideEmail = null) {
  console.log(`[dailyDigestEngine] Starting daily digest check${overrideEmail ? ` (override recipient: ${overrideEmail})` : ''}...`);
  const snapshot = await buildAndSaveDailyDigestSnapshot(sheets, { source: 'legacy-digest-check' });

  if (overrideEmail) {
    await sendManagementDigestFromSnapshot(snapshot, { to: overrideEmail });
    console.log('[dailyDigestEngine] Daily digest check completed.');
    return snapshot;
  }

  await sendPodDigestsFromSnapshot(snapshot);
  await sendManagementDigestFromSnapshot(snapshot);
  console.log('[dailyDigestEngine] Daily digest check completed.');
  return snapshot;
}

/**
 * Runs the daily digest check for a specific subset of PODs.
 * Useful for triggering B2B / POD2 emails separately without running all pods.
 *
 * @param {object} sheets    - The google.sheets API client instance
 * @param {string[]} podNames - Array of POD names to process, e.g. ['B2B', 'POD2']
 */
export async function runDigestForPods(sheets, podNames = []) {
  const normalizedFilter = podNames.map(n => n.trim().toUpperCase());
  console.log(`[dailyDigestEngine] Starting digest check for pods: ${normalizedFilter.join(', ')}...`);

  let activeTeams = [];
  try {
    const collection = await getTeamsCollection();
    const teams = await collection.find({}).toArray();
    activeTeams = teams
      .filter(t => t.active)
      .filter(t => normalizedFilter.includes((t.name || '').trim().toUpperCase()));
  } catch (dbErr) {
    console.error('[dailyDigestEngine] Failed to fetch active teams from MongoDB:', dbErr.message);
    return;
  }

  if (activeTeams.length === 0) {
    console.log(`[dailyDigestEngine] No active teams found for [${normalizedFilter.join(', ')}]. Skipping.`);
    return;
  }

  const today = new Date();
  const todayMidnight = toMidnight(today);

  const podEmailsToSend = [];
  const consolidatedReports = [];
  let combinedCcList = [];

  for (const team of activeTeams) {
    const podName = (team.name || '').trim().toUpperCase();
    const recipients = POD_RECIPIENTS[podName];
    if (!recipients) {
      console.warn(`[dailyDigestEngine] Team "${team.name}" has no matching POD recipient config. Skipping.`);
      continue;
    }

    if (recipients.cc && recipients.cc.length > 0) {
      combinedCcList = [...new Set([...combinedCcList, ...recipients.cc])];
    }

    console.log(`[dailyDigestEngine] Scanning sheets for pod "${podName}"...`);
    const clientReports = [];

    try {
      const [dailyTabs, jobTabs] = await Promise.all([
        getSheetTabs(sheets, team.dailyId),
        getSheetTabs(sheets, team.jobId),
      ]);

      const commonClients = getCommonClientTabs(dailyTabs, jobTabs);

      for (const clientName of commonClients) {
        try {
          const isPanasonic = (clientName || '').toLowerCase().includes('panasonic');

          let rawJobs = null;
          let rawDaily = null;
          let jobReadError = null;
          let dailyReadError = null;

          try {
            rawJobs = await getSheetData(sheets, team.jobId, clientName, jobTabs);
          } catch (err) {
            jobReadError = err;
          }

          try {
            rawDaily = await getSheetData(sheets, team.dailyId, clientName, dailyTabs);
          } catch (err) {
            dailyReadError = err;
          }

          let pendingJobs = [];
          let dailyRecords = [];
          let meetingStats = getDefaultMeetingStats();
          let scanReason = null;
          let attendanceReason = null;

          if (jobReadError) {
            scanReason = getScanFailureReason(jobReadError);
            console.error(`[dailyDigestEngine] Failed to read Job Tracker for "${clientName}" on pod "${podName}":`, jobReadError.message);
          } else {
            let jobs = parseJobTrackerRows(rawJobs, clientName, isPanasonic);
            try {
              jobs = await syncJobStatusAging(clientName, jobs);
            } catch (err) {
              console.warn(`[dailyDigestEngine] Status aging sync failed for "${clientName}": ${err.message}`);
            }
            pendingJobs = buildPendingJobs(jobs, today).map(job => ({ ...job, isPanasonic }));
          }

          if (dailyReadError) {
            attendanceReason = getScanFailureReason(dailyReadError);
            meetingStats = { ...getDefaultMeetingStats(), reason: attendanceReason };
            console.error(`[dailyDigestEngine] Failed to read Daily Tracker for "${clientName}" on pod "${podName}":`, dailyReadError.message);
          } else {
            try {
              dailyRecords = parseDailyTrackerRows(rawDaily, clientName);
              meetingStats = computeMeetingStats(dailyRecords, today);
            } catch (dailyErr) {
              attendanceReason = `Could not parse daily meeting tracker: ${dailyErr.message}`;
              meetingStats = { ...getDefaultMeetingStats(), reason: attendanceReason };
              console.error(`[dailyDigestEngine] Failed to parse Daily Tracker for "${clientName}":`, dailyErr.message);
            }
          }

          clientReports.push({
            clientName,
            pendingJobs,
            meetingStats,
            noDeadlineReason: !jobReadError && pendingJobs.length === 0 ? getNoDeadlineReason() : '',
            scanReason,
            attendanceReason,
          });
        } catch (clientErr) {
          console.error(`[dailyDigestEngine] Failed to scan client "${clientName}" on pod "${podName}":`, clientErr.message);
          clientReports.push({
            clientName,
            pendingJobs: [],
            meetingStats: getDefaultMeetingStats(),
            scanReason: getScanFailureReason(clientErr),
            attendanceReason: 'Daily meeting attendance could not be read because this brand scan failed.',
          });
        }
      }
    } catch (teamErr) {
      console.error(`[dailyDigestEngine] Failed to scan pod "${podName}":`, teamErr.message);
      clientReports.push({
        clientName: `${podName} pod`,
        pendingJobs: [],
        meetingStats: getDefaultMeetingStats(),
        scanReason: getScanFailureReason(teamErr),
        attendanceReason: 'Daily meeting attendance could not be read because this pod could not be scanned.',
      });
    }

    if (clientReports.length > 0) {
      podEmailsToSend.push({
        podName,
        to: recipients.to,
        clientReports,
      });

      clientReports.forEach(report => {
        consolidatedReports.push({
          ...report,
          podName,
        });
      });
    }
  }

  // 1. Send individual pod emails
  for (const item of podEmailsToSend) {
    console.log(`[dailyDigestEngine] Sending individual pod digest email for pod "${item.podName}" (${item.clientReports.length} client(s))...`);
    await sendPodDigestEmail({
      podName: item.podName,
      to: item.to,
      cc: [],
      clientReports: item.clientReports,
    });
  }

  // 2. Send consolidated email to management
  if (consolidatedReports.length > 0 && combinedCcList.length > 0) {
    console.log(`[dailyDigestEngine] Sending single consolidated daily digest email to CC list (${consolidatedReports.length} total client(s))...`);
    await sendPodDigestEmail({
      podName: 'All Teams Summary',
      to: combinedCcList,
      cc: [],
      clientReports: consolidatedReports,
    });
  } else {
    console.log('[dailyDigestEngine] No consolidated daily digest data or CC recipients found.');
  }

  console.log(`[dailyDigestEngine] Digest check for [${normalizedFilter.join(', ')}] completed.`);
}
