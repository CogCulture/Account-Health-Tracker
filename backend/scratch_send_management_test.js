import 'dotenv/config';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { buildAndSaveDailyDigestSnapshot, getLatestDailyDigestSnapshot, sendEveningDigestFromSnapshot } from './dailyDigestEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let auth;
try {
  let credentials;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else {
    const SERVICE_ACCOUNT_PATH = resolve(__dirname, 'service-account.json');
    credentials = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  }
  auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
} catch (err) {
  console.error('[live-evening-email] Failed to load Google credentials:', err.message);
  process.exit(1);
}

const sheets = google.sheets({ version: 'v4', auth });

async function runLiveEveningDigest() {
  const recipients = [
    'ashok@cogculture.agency',
    'pallave@cogculture.agency',
    'shourya@cogculture.agency',
    'tanushree@cogculture.agency',
    'vaibhav@cogculture.agency',
  ];
  console.log('[live-evening-email] Sending Evening Digest to recipients:', recipients);

  // 1. Get latest evening snapshot (or build if not present)
  let snapshot = await getLatestDailyDigestSnapshot({
    digestType: 'evening',
    isEvening: true,
    allowLatestFallback: true,
  });

  if (!snapshot || !snapshot.consolidatedReports || snapshot.consolidatedReports.length === 0) {
    console.log('[live-evening-email] No cached snapshot found, building fresh snapshot from Google Sheets...');
    snapshot = await buildAndSaveDailyDigestSnapshot(sheets, {
      source: 'live-evening-send',
      today: new Date(),
      isEvening: true,
      digestType: 'evening',
    });
  }

  if (!snapshot || !snapshot.consolidatedReports || snapshot.consolidatedReports.length === 0) {
    console.error('[live-evening-email] Failed to obtain snapshot.');
    process.exit(1);
  }

  console.log(`[live-evening-email] Using snapshot (${snapshot.dateKey}) with ${snapshot.consolidatedReports.length} brand reports.`);
  
  let totalDeliverables = 0;
  snapshot.consolidatedReports.forEach(r => {
    const count = r.pendingJobs?.length || 0;
    totalDeliverables += count;
    console.log(`  - Brand: "${r.clientName}" (${r.podName}) -> ${count} deliverable(s) (Health: ${r.healthScore ?? 'N/A'}%)`);
  });
  console.log(`[live-evening-email] Total deliverables across all brands (excluding CTR & Not Required): ${totalDeliverables}`);

  // 2. Send real evening digest email to recipients
  console.log(`[live-evening-email] Sending evening digest email to ${recipients.join(', ')}...`);
  const result = await sendEveningDigestFromSnapshot(snapshot, {
    to: recipients,
    force: true,
  });

  console.log('[live-evening-email] Email send result:', result);
  process.exit(0);
}

runLiveEveningDigest().catch(err => {
  console.error('[live-evening-email] Fatal error:', err);
  process.exit(1);
});
