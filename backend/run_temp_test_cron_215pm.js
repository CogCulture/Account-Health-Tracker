import 'dotenv/config';
import cron from 'node-cron';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { 
  getLatestDailyDigestSnapshot, 
  buildAndSaveDailyDigestSnapshot, 
  sendManagementDigestFromSnapshot, 
  recordCronAuditLog 
} from './dailyDigestEngine.js';

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
  console.error('[temp-cron-215pm] Failed to load Google credentials:', err.message);
  process.exit(1);
}

const sheets = google.sheets({ version: 'v4', auth });
const TARGET_RECIPIENT = 'tanushree@cogculture.agency';

console.log(`[temp-cron-215pm] Initialized. Scheduling automated test cron for 2:15 PM IST today (${new Date().toLocaleDateString()})...`);
console.log(`[temp-cron-215pm] Destination recipient: ${TARGET_RECIPIENT} ONLY.`);

cron.schedule('15 14 * * *', async () => {
  const startedAt = Date.now();
  console.log('\n======================================================');
  console.log(`[temp-cron-215pm] ⏰ CRON TRIGGERED AT 2:15 PM IST!`);
  console.log('======================================================');

  await recordCronAuditLog({
    job: 'temporary-test-cron-215pm',
    stage: 'started',
    status: 'started',
    details: { target: TARGET_RECIPIENT, scheduledTime: '14:15 IST' }
  });

  try {
    let snapshot = await getLatestDailyDigestSnapshot({ allowLatestFallback: true, digestType: 'morning', isEvening: false });
    if (!snapshot) {
      console.log('[temp-cron-215pm] Snapshot not found in DB. Building fresh snapshot now...');
      snapshot = await buildAndSaveDailyDigestSnapshot(sheets, { source: 'cron-215pm-test-build', today: new Date(), digestType: 'morning', isEvening: false });
    }

    console.log(`[temp-cron-215pm] Sending test digest email for snapshot: "${snapshot.dateKey}" to ${TARGET_RECIPIENT}...`);
    const result = await sendManagementDigestFromSnapshot(snapshot, {
      to: [TARGET_RECIPIENT],
      force: true
    });
    console.log('[temp-cron-215pm] Email dispatch result:', result);

    await recordCronAuditLog({
      job: 'temporary-test-cron-215pm',
      stage: 'completed',
      status: result?.sent ? 'success' : 'failed',
      dateKey: snapshot.dateKey,
      durationMs: Date.now() - startedAt,
      details: { result, target: TARGET_RECIPIENT },
    });
    console.log('[temp-cron-215pm] ✅ Test cron run finished successfully.');
  } catch (err) {
    console.error('[temp-cron-215pm] ❌ Test cron execution failed:', err);
    await recordCronAuditLog({
      job: 'temporary-test-cron-215pm',
      stage: 'execution_failed',
      status: 'failed',
      durationMs: Date.now() - startedAt,
      error: err,
      details: { target: TARGET_RECIPIENT }
    });
  }
}, {
  scheduled: true,
  timezone: 'Asia/Kolkata'
});

console.log('[temp-cron-215pm] Waiting for 2:15 PM IST (14:15 IST)... Process will remain active.');
