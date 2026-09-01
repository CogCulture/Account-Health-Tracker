import 'dotenv/config';
import { getLatestDailyDigestSnapshot } from './dailyDigestEngine.js';
import { buildExecutiveDigestEmailHtml } from './emailService.js';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

function parseSender(fromStr) {
  const raw = fromStr || 'Account Health Alerts <lakshbhatia134@gmail.com>';
  const match = raw.match(/^(?:"?([^"<]+)"?\s*)?<([^>]+)>$/);
  if (match) {
    return { name: (match[1] || 'Account Health Alerts').trim(), email: match[2].trim() };
  }
  return { name: 'Account Health Alerts', email: raw.trim() };
}

async function run() {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is missing');
  }

  const snapshot = await getLatestDailyDigestSnapshot({ allowLatestFallback: true });
  if (!snapshot || !snapshot.consolidatedReports) {
    throw new Error('No daily digest snapshot found in database.');
  }

  console.log(`[fresh-mail] Using snapshot dateKey="${snapshot.dateKey}" with ${snapshot.consolidatedReports.length} client report(s).`);

  const { subject: baseSubject, html } = buildExecutiveDigestEmailHtml(snapshot.consolidatedReports, 'All Teams Summary');

  const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const freshSubject = `${baseSubject} [Fresh Mail - ${timeStr} IST]`;

  const payload = {
    sender: parseSender(process.env.SMTP_FROM),
    to: [
      { email: 'apoorv@cogculture.agency', name: 'Apoorv' }
    ],
    subject: freshSubject,
    htmlContent: html,
    tags: [`fresh-mail-${Date.now()}`]
  };

  console.log(`[fresh-mail] Sending fresh independent email to apoorv@cogculture.agency...`);
  console.log(`[fresh-mail] Subject: "${freshSubject}"`);

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Brevo HTTP ${res.status}: ${body}`);
  }

  console.log(`[fresh-mail] Successfully sent fresh independent email to apoorv@cogculture.agency. Brevo response: ${body}`);
}

run().catch(err => {
  console.error('[fresh-mail] Error:', err);
  process.exit(1);
});
