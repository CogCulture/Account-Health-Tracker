import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { parseJobTrackerRows, getCommonClientTabs } from '../frontend/src/utils/sheetsParser.js';
import { sendAlertEmail, sendClientSummaryEmail } from './emailService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEAMS_PATH = resolve(__dirname, 'teams.json');
const ALERTS_PATH = resolve(__dirname, 'sent-alerts.json');

// Standalone sheets API helpers
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

function loadJSON(path) {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8'));
    }
  } catch (err) {
    console.error(`[alertEngine] Failed to load JSON from ${path}:`, err.message);
  }
  return [];
}

function saveJSON(path, data) {
  try {
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`[alertEngine] Failed to save JSON to ${path}:`, err.message);
  }
}

/**
 * Scans all active teams for pending XL/XXL jobs due in exactly 2 days, and emails management.
 * @param {object} sheets - The google.sheets API client instance
 */
export async function runScheduledAlertCheck(sheets) {
  console.log('[alertEngine] Starting scheduled alert check...');
  
  const teams = loadJSON(TEAMS_PATH);
  const activeTeams = teams.filter(t => t.active);
  if (activeTeams.length === 0) {
    console.log('[alertEngine] No active teams configured in teams.json. Skipping check.');
    return;
  }

  const sentAlerts = new Set(loadJSON(ALERTS_PATH));
  const newAlertLog = [];
  const today = new Date();
  // Normalize today to midnight for precise date calculations
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  for (const team of activeTeams) {
    console.log(`[alertEngine] Scanning sheets for team "${team.name}"...`);
    try {
      const [dailyTabs, jobTabs] = await Promise.all([
        getSheetTabs(sheets, team.dailyId),
        getSheetTabs(sheets, team.jobId),
      ]);

      const commonClients = getCommonClientTabs(dailyTabs, jobTabs);
      console.log(`[alertEngine] Found ${commonClients.length} common client tabs for team "${team.name}"`);

      for (const clientName of commonClients) {
        try {
          const rawJobs = await getSheetData(sheets, team.jobId, clientName);
          const jobs = parseJobTrackerRows(rawJobs, clientName);
          const matchingClientJobs = [];

          for (const job of jobs) {
            const priority = (job.priority || '').toString().trim().toUpperCase();
            if (priority !== 'XL' && priority !== 'XXL') continue;

            const status = (job.status || '').toString().trim().toLowerCase();
            // Only trigger for 'in progress' or 'not started'
            if (status !== 'in progress' && status !== 'not started') continue;

            if (!job.clientTimeline || !(job.clientTimeline instanceof Date) || isNaN(job.clientTimeline.getTime())) continue;

            const timelineMidnight = new Date(
              job.clientTimeline.getFullYear(),
              job.clientTimeline.getMonth(),
              job.clientTimeline.getDate()
            );

            // Compute exact calendar days difference
            const diffTime = timelineMidnight.getTime() - todayMidnight.getTime();
            const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // Alert trigger: 2 days or less remaining (including overdue)
            if (daysRemaining <= 2) {
              const alertKey = `${team.id}::${clientName}::${job.jobId}`;
              if (!sentAlerts.has(alertKey)) {
                const dueDateStr = job.clientTimeline.toISOString().split('T')[0];
                matchingClientJobs.push({
                  jobId: job.jobId,
                  deliverable: job.deliverable || job.jobId,
                  priority,
                  dueDate: dueDateStr,
                  daysRemaining,
                  alertKey
                });
              }
            }
          }

          // If there are new alerts for this client, send a single consolidated email
          if (matchingClientJobs.length > 0) {
            console.log(`[alertEngine] Alert criteria met! Found ${matchingClientJobs.length} high-priority job(s) for "${clientName}". Sending summary email...`);
            
            const success = await sendClientSummaryEmail({
              clientName,
              jobs: matchingClientJobs
            });

            if (success) {
              for (const job of matchingClientJobs) {
                sentAlerts.add(job.alertKey);
                newAlertLog.push(job.alertKey);
              }
            }
          }
        } catch (clientErr) {
          console.error(`[alertEngine] Failed to scan client "${clientName}" on team "${team.name}":`, clientErr.message);
        }
      }
    } catch (teamErr) {
      console.error(`[alertEngine] Failed to scan team "${team.name}":`, teamErr.message);
    }
  }

  // Save updated logs if new emails were successfully sent
  if (newAlertLog.length > 0) {
    saveJSON(ALERTS_PATH, Array.from(sentAlerts));
  }
  console.log('[alertEngine] Scheduled alert check completed.');
}
