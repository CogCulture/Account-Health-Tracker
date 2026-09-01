import 'dotenv/config';
import { getDailyDigestSnapshotsCollection } from './db.js';
import { sendPodDigestEmail } from './emailService.js';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

async function run() {
  const targetEmail = process.argv[2] || 'apoorv@cogculture.agency';
  const targetName = process.argv[3] || 'Apoorv';

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is missing');
  }

  const snapshots = await getDailyDigestSnapshotsCollection();
  const snapshot = await snapshots.find({}).sort({ generatedAt: -1 }).limit(1).next();

  if (!snapshot) {
    throw new Error('No daily digest snapshot found in database.');
  }

  console.log(`Found snapshot: dateKey=${snapshot.dateKey}, generatedAt=${snapshot.generatedAt}`);
  console.log(`Consolidated reports count: ${snapshot.consolidatedReports?.length || 0}`);

  if (!snapshot.consolidatedReports || snapshot.consolidatedReports.length === 0) {
    throw new Error('Snapshot has no consolidated reports.');
  }

  console.log(`Sending Management Digest EXCLUSIVELY to ${targetEmail}...`);

  // Temporarily ensure DISABLE_EMAILS does not block test send to this specific recipient
  const prevDisable = process.env.DISABLE_EMAILS;
  process.env.DISABLE_EMAILS = 'false';

  const ok = await sendPodDigestEmail({
    podName: 'All Teams Summary',
    to: [targetEmail],
    cc: [],
    clientReports: snapshot.consolidatedReports,
  });

  process.env.DISABLE_EMAILS = prevDisable;

  if (ok) {
    console.log(`Successfully sent management digest email to ${targetEmail}.`);
  } else {
    console.error(`Failed to send management digest email to ${targetEmail}.`);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Error sending email:', err);
  process.exit(1);
});
