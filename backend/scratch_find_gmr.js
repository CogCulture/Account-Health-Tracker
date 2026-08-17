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
  const pods = [
    { name: 'POD1', dailyId: '18_p9ykqJUgeRZnxOrS7XS-qNB8hYtHOwIkanlvSrePw' },
    { name: 'POD2', dailyId: '1X_fHR5xGGtMSn9M4rLj14f82vsBzw4rOwQB1GKLPIZ0' },
    { name: 'PANASONIC', dailyId: '1ykx_fdwTtUy2aSe63PDUV8kIFCUTsXGOb8kX6yE3Pp4' },
    { name: 'POD4', dailyId: '1X_fHR5xGGtMSn9M4rLj14f82vsBzw4rOwQB1GKLPIZ0' },
    { name: 'B2B', dailyId: '1x60eOn92GWq3l8Xlu-DhtqTNHF4_coMVxrNfqYH2mpc' },
    { name: 'SRHU', dailyId: '1OjMGcDnz_0d2EdV5xHQQfsX1hgIe_9ZFH4r40zc_wP8' },
  ];

  for (const pod of pods) {
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: pod.dailyId });
      const titles = meta.data.sheets.map(s => s.properties.title);
      const match = titles.find(t => t.toLowerCase().includes('gmr') || t.toLowerCase().includes('aerocity'));
      if (match) {
        console.log(`Found GMR in ${pod.name} (dailyId: ${pod.dailyId}) under tab: "${match}"`);
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: pod.dailyId,
          range: `'${match}'`,
        });
        const rows = res.data.values || [];
        console.log(`Total rows in "${match}":`, rows.length);
        console.log('First 20 rows:');
        rows.slice(0, 20).forEach((r, idx) => console.log(`Row ${idx}:`, JSON.stringify(r)));
      }
    } catch (e) {
      console.log(`Error checking ${pod.name}:`, e.message);
    }
  }
}

main().catch(console.error);
