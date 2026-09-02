import 'dotenv/config';
import { getLatestDailyDigestSnapshot } from './dailyDigestEngine.js';
import { buildExecutiveDigestEmailHtml, sendViaSmtp } from './emailService.js';

async function run() {
  const snapshot = await getLatestDailyDigestSnapshot({ allowLatestFallback: true });
  if (!snapshot || !snapshot.consolidatedReports) {
    throw new Error('No daily digest snapshot found in database.');
  }

  console.log(`[fresh-mail] Using snapshot dateKey="${snapshot.dateKey}" with ${snapshot.consolidatedReports.length} client report(s).`);

  const { subject: baseSubject, html } = buildExecutiveDigestEmailHtml(snapshot.consolidatedReports, 'All Teams Summary');

  const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const freshSubject = `${baseSubject} [Fresh Mail - ${timeStr} IST]`;

  console.log(`[fresh-mail] Sending fresh independent email to apoorv@cogculture.agency...`);
  console.log(`[fresh-mail] Subject: "${freshSubject}"`);

  const ok = await sendViaSmtp({
    toAddresses: [{ email: 'apoorv@cogculture.agency', name: 'Apoorv' }],
    subject: freshSubject,
    html,
  });

  if (ok) {
    console.log(`[fresh-mail] Successfully sent fresh independent email to apoorv@cogculture.agency.`);
  } else {
    throw new Error('Failed to send email via SMTP.');
  }
}

run().catch(err => {
  console.error('[fresh-mail] Error:', err);
  process.exit(1);
});
