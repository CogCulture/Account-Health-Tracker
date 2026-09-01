import 'dotenv/config';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { buildAndSaveDailyDigestSnapshot } from './dailyDigestEngine.js';

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
  console.error('[trigger-daily-digest] Failed to load Google credentials:', err.message);
  process.exit(1);
}

const sheets = google.sheets({ version: 'v4', auth });

console.log('Manually triggering daily digest snapshot sync...');
try {
  const snapshot = await buildAndSaveDailyDigestSnapshot(sheets, { source: 'manual-script' });
  console.log(`Daily digest snapshot ${snapshot.dateKey} completed! No email was sent.`);
} catch (error) {
  console.error('Failed to run Daily Digest snapshot sync:', error);
}
