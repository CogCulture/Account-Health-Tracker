import 'dotenv/config';
import { getLatestDailyDigestSnapshot, sendManagementDigestFromSnapshot } from './dailyDigestEngine.js';

async function sendToAllManagement() {
  const managementRecipients = [
    'vaibhav@cogculture.agency',
    'ashok@cogculture.agency',
    'shourya@cogculture.agency',
    'pallave@cogculture.agency',
    'apoorv@cogculture.agency'
  ];

  console.log('[trigger-management] Triggering executive digest email to ALL management recipients:', managementRecipients);

  const snapshot = await getLatestDailyDigestSnapshot({ allowLatestFallback: true });

  if (!snapshot || !snapshot.consolidatedReports || snapshot.consolidatedReports.length === 0) {
    console.error('[trigger-management] No valid snapshot found in MongoDB.');
    process.exit(1);
  }

  console.log(`[trigger-management] Using snapshot dateKey "${snapshot.dateKey}" with ${snapshot.consolidatedReports.length} client report(s).`);

  const res = await sendManagementDigestFromSnapshot(snapshot, {
    to: managementRecipients,
    force: true
  });

  console.log('[trigger-management] Email send result:', res);
}

sendToAllManagement().catch(err => {
  console.error('[trigger-management] Error triggering email:', err);
  process.exit(1);
});
