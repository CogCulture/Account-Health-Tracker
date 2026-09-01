import 'dotenv/config';
import { getLatestDailyDigestSnapshot, sendManagementDigestFromSnapshot } from './dailyDigestEngine.js';
import { sendPodDigestEmail } from './emailService.js';

async function testSend() {
  const recipients = ['shourya@cogculture.agency', 'apoorv@cogculture.agency'];
  console.log('[test-email] Attempting to send test management digest to:', recipients);

  const snapshot = await getLatestDailyDigestSnapshot({ allowLatestFallback: true });

  if (snapshot && snapshot.consolidatedReports && snapshot.consolidatedReports.length > 0) {
    console.log(`[test-email] Found existing snapshot (${snapshot.dateKey}) with ${snapshot.consolidatedReports.length} client report(s).`);
    const res = await sendManagementDigestFromSnapshot(snapshot, { to: recipients, force: true });
    console.log('[test-email] Result:', res);
  } else {
    console.log('[test-email] No snapshot found in DB. Constructing sample executive digest report...');
    const sampleReports = [
      {
        clientName: 'Panasonic Mainline',
        podName: 'PANASONIC',
        pendingJobs: [
          {
            deliverable: 'Panasonic Festive Campaign KV & TVC Adaptations',
            priority: 'XXL',
            status: 'IN PROGRESS',
            statusCategory: 'In Progress',
            daysInStatus: 3,
            dueLabel: 'Today',
            dueDate: new Date().toISOString().split('T')[0],
            diffDays: 0
          },
          {
            deliverable: 'OLED TV Product Catalogue Redesign',
            priority: 'XL',
            status: 'CLIENT TO REVERT',
            statusCategory: 'CTR',
            daysInStatus: 2,
            dueLabel: 'Tomorrow',
            dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
            diffDays: 1
          }
        ],
        meetingStats: { elapsedWeekdays: 18, metDays: 16, percentage: 89, unavailable: false }
      },
      {
        clientName: 'Bharti',
        podName: 'POD 1',
        pendingJobs: [
          {
            deliverable: 'Bharti Corporate Deck & Investor Presentation',
            priority: 'XXL',
            status: 'AGENCY TO REVERT',
            statusCategory: 'ATR',
            daysInStatus: 1,
            dueLabel: '1d Overdue',
            dueDate: new Date(Date.now() - 86400000).toISOString().split('T')[0],
            diffDays: -1
          }
        ],
        meetingStats: { elapsedWeekdays: 18, metDays: 18, percentage: 100, unavailable: false }
      }
    ];

    const ok = await sendPodDigestEmail({
      podName: 'All Teams Summary (Test Run)',
      to: recipients,
      cc: [],
      clientReports: sampleReports
    });
    console.log('[test-email] Direct send result:', ok ? 'SUCCESS' : 'FAILED');
  }
}

testSend().catch(err => {
  console.error('[test-email] Error sending email:', err);
  process.exit(1);
});
