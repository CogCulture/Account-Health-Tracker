import 'dotenv/config';
import { getLatestDailyDigestSnapshot, sendManagementDigestFromSnapshot, sendScopedDigestEmailsFromSnapshot, sendPodDigestsFromSnapshot } from './dailyDigestEngine.js';

async function main() {
  console.log('[send-all-digests] Fetching latest daily digest snapshot from MongoDB...');
  const snapshot = await getLatestDailyDigestSnapshot({ allowLatestFallback: true });

  if (!snapshot || !snapshot.consolidatedReports || snapshot.consolidatedReports.length === 0) {
    console.error('[send-all-digests] No snapshot found in database.');
    process.exit(1);
  }

  console.log(`[send-all-digests] Using snapshot dateKey: "${snapshot.dateKey}" with ${snapshot.consolidatedReports.length} client report(s).`);

  console.log('\n--- 1. Sending Management Digest (All Teams Summary) ---');
  const mgmtRes = await sendManagementDigestFromSnapshot(snapshot, { force: true });
  console.log('[send-all-digests] Management digest result:', mgmtRes);

  console.log('\n--- 2. Sending Scoped Digest Emails ---');
  const scopedRes = await sendScopedDigestEmailsFromSnapshot(snapshot, { force: true });
  console.log('[send-all-digests] Scoped digests result:', scopedRes);

  console.log('\n--- 3. Sending Individual POD Digest Emails ---');
  const podRes = await sendPodDigestsFromSnapshot(snapshot);
  console.log('[send-all-digests] Pod digests result:', podRes);

  console.log('\n✅ [send-all-digests] All daily digest emails have been processed and dispatched!');
}

main().catch(err => {
  console.error('[send-all-digests] Error dispatching digests:', err);
  process.exit(1);
});
