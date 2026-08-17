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
  // Let's use POD1 dailyId directly or fetch
  const dailyId = '1yB9eUq2VqWjO_4n0_S8P66s4L412S74mK7eO435m1'; // POD1 meeting tracker ID
  const safeRange = `'Aarize'`;
  
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: '12gX7g-yP2wHk78p97QO8lS145m58qW_n3J24-L0S-8k', // fallback or real ID
      range: safeRange,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER',
    });
    console.log('Rows:', res.data.values.slice(0, 10));
  } catch (err) {
    console.error('Error fetching:', err.message);
  }
}

main().catch(console.error);
