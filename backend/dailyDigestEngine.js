import { parseJobTrackerRows, parseDailyTrackerRows, getCommonClientTabs } from '../frontend/src/utils/sheetsParser.js';
import { sendPodDigestEmail } from './emailService.js';
import { getTeamsCollection } from './db.js';
import { POD_RECIPIENTS } from './podConfig.js';

// Standalone sheets API helpers (mirrors alertEngine.js)
async function getSheetTabs(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.sheets.map(s => s.properties.title);
}

async function getSheetData(sheets, spreadsheetId, tabName) {
  const actualTabs = await getSheetTabs(sheets, spreadsheetId);
  const targetLowerTrimmed = tabName.toLowerCase().trim();
  const matchedTab = actualTabs.find(t => t.toLowerCase().trim() === targetLowerTrimmed) || tabName;
  const safeRange = `'${matchedTab.replace(/'/g, "''")}'`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: safeRange,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
  });
  return res.data.values || [];
}

function toMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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

/**
 * Scans all active teams (named after their POD) for pending L/XL/XXL jobs
 * due today or tomorrow, along with month-to-date daily meeting attendance,
 * and emails a consolidated digest to each POD's recipients.
 * @param {object} sheets - The google.sheets API client instance
 */
export async function runDailyDigestCheck(sheets) {
  console.log('[dailyDigestEngine] Starting daily digest check...');

  let activeTeams = [];
  try {
    const collection = await getTeamsCollection();
    const teams = await collection.find({}).toArray();
    activeTeams = teams.filter(t => t.active);
  } catch (dbErr) {
    console.error('[dailyDigestEngine] Failed to fetch active teams from MongoDB:', dbErr.message);
    return;
  }

  if (activeTeams.length === 0) {
    console.log('[dailyDigestEngine] No active teams configured in MongoDB. Skipping check.');
    return;
  }

  const today = new Date();
  const todayMidnight = toMidnight(today);

  for (const team of activeTeams) {
    const podName = (team.name || '').trim().toUpperCase();
    const recipients = POD_RECIPIENTS[podName];
    if (!recipients) {
      console.warn(`[dailyDigestEngine] Team "${team.name}" has no matching POD recipient config. Skipping.`);
      continue;
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

          const [rawJobs, rawDaily] = await Promise.all([
            getSheetData(sheets, team.jobId, clientName),
            getSheetData(sheets, team.dailyId, clientName),
          ]);

          const jobs = parseJobTrackerRows(rawJobs, clientName, isPanasonic);
          const pendingJobs = [];

          for (const job of jobs) {
            const priority = (job.priority || '').toString().trim().toUpperCase();
            if (priority !== 'L' && priority !== 'XL' && priority !== 'XXL') continue;

            const status = (job.status || '').toString().trim().toLowerCase();
            if (status === 'closed' || status === 'completed') continue;

            if (!job.clientTimeline || !(job.clientTimeline instanceof Date) || isNaN(job.clientTimeline.getTime())) continue;

            const timelineMidnight = toMidnight(job.clientTimeline);
            const diffDays = Math.round((timelineMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));

            // Include jobs due today, or overdue XL/XXL jobs (exclude tomorrow/future jobs)
            const isDueToday = (diffDays === 0);
            const isOverdueXLOrXXL = (diffDays < 0 && (priority === 'XL' || priority === 'XXL') && status === 'in progress');

            if (!isDueToday && !isOverdueXLOrXXL) continue;

            const dueLabel = isDueToday ? 'Today' : `Overdue (${Math.abs(diffDays)}d)`;

            pendingJobs.push({
              jobId: job.jobId,
              deliverable: job.deliverable || job.jobId,
              priority,
              dueDate: job.clientTimeline.toISOString().split('T')[0],
              dueLabel,
              isPanasonic,
            });
          }

          let dailyRecords = [];
          try {
            dailyRecords = parseDailyTrackerRows(rawDaily, clientName);
          } catch (dailyErr) {
            console.error(`[dailyDigestEngine] Failed to parse Daily Tracker for "${clientName}":`, dailyErr.message);
          }

          const meetingStats = computeMeetingStats(dailyRecords, today);

          if (pendingJobs.length > 0 || meetingStats.elapsedWeekdays > 0) {
            clientReports.push({ clientName, pendingJobs, meetingStats });
          }
        } catch (clientErr) {
          console.error(`[dailyDigestEngine] Failed to scan client "${clientName}" on pod "${podName}":`, clientErr.message);
        }
      }
    } catch (teamErr) {
      console.error(`[dailyDigestEngine] Failed to scan pod "${podName}":`, teamErr.message);
      continue;
    }

    if (clientReports.length === 0) {
      console.log(`[dailyDigestEngine] No data to report for pod "${podName}". Skipping email.`);
      continue;
    }

    console.log(`[dailyDigestEngine] Sending digest email for pod "${podName}" (${clientReports.length} client(s))...`);
    await sendPodDigestEmail({
      podName,
      to: recipients.to,
      cc: recipients.cc,
      clientReports,
    });
  }

  console.log('[dailyDigestEngine] Daily digest check completed.');
}
