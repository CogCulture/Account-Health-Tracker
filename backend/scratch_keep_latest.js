import 'dotenv/config';
import { getMeetingInsightsCollection } from './db.js';

async function main() {
  const col = await getMeetingInsightsCollection();
  const all = await col.find({}).sort({ meetingDate: -1 }).toArray();

  if (all.length <= 1) {
    console.log(`Only ${all.length} meeting insight(s) exist. Nothing to delete.`);
    process.exit(0);
  }

  const latest = all[0];
  const idsToDelete = all.slice(1).map(doc => doc._id);

  const res = await col.deleteMany({ _id: { $in: idsToDelete } });

  console.log(`✅ Kept most recent meeting: "${latest.meetingTitle || latest.sourceMeetingId}" (${latest.meetingDate})`);
  console.log(`🗑️ Deleted ${res.deletedCount} older meeting insight(s).`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
