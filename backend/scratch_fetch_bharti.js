import fs from 'fs';
import { google } from 'googleapis';

const envText = fs.readFileSync('c:/Users/Cog/Account-Health-Tracker/backend/.env', 'utf-8');
for (const line of envText.split('\n')) {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim();
    process.env[key] = val;
  }
}

let credentials;
if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
} else if (fs.existsSync('service-account.json')) {
  credentials = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
}

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function main() {
  // POD4 / B2B jobId for Bharti
  const jobId = '1VyhrQyRLwVRBbkCihcR-bd1ERuq85J2z47DAlgqqSCk';
  const safeRange = `'Bharti'`;

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: jobId,
      range: safeRange,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER',
    });

    const rows = res.data.values || [];
    console.log('Total rows in Bharti JSR:', rows.length);
    console.log('First 10 rows:');
    rows.slice(0, 10).forEach((r, idx) => console.log(`Row ${idx}:`, JSON.stringify(r)));
  } catch (err) {
    console.error('Error fetching Bharti JSR:', err.message);
  }
}

main().catch(console.error);
