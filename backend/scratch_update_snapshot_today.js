import 'dotenv/config';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { buildAndSaveDailyDigestSnapshot, sendManagementDigestFromSnapshot } from './dailyDigestEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('[snapshot-updater] Initializing Google Auth & Sheets API client...');
  
  let credentials;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else {
    const SERVICE_ACCOUNT_PATH = resolve(__dirname, 'service-account.json');
    credentials = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  }
  
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`[snapshot-updater] Scanning live Google Sheets & building fresh MongoDB snapshot for TODAY (${new Date().toLocaleDateString()})...`);
  const snapshot = await buildAndSaveDailyDigestSnapshot(sheets, { source: 'manual-update-script', today: new Date() });

  console.log(`\n✅ [snapshot-updater] Successfully updated MongoDB snapshot for dateKey: "${snapshot.dateKey}"!`);
  console.log(`   - Total Brands Scanned: ${snapshot.consolidatedReports?.length || 0}`);
  console.log(`   - Scores Processed: ${Object.keys(snapshot.dashboardScores || {}).length}`);
  console.log(`   - Status: ${snapshot.status}`);

  console.log('\n[snapshot-updater] Now triggering executive digest email to shourya@cogculture.agency & apoorv@cogculture.agency with updated 25th Aug data...');
  const recipients = ['shourya@cogculture.agency', 'apoorv@cogculture.agency'];
  const emailRes = await sendManagementDigestFromSnapshot(snapshot, { to: recipients, force: true });
  console.log('[snapshot-updater] Email send result:', emailRes);
}

main().catch(err => {
  console.error('[snapshot-updater] Failed to update snapshot:', err);
  process.exit(1);
});
