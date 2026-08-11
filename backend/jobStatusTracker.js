import { connectToDatabase } from './db.js';

/**
 * Returns the jobStatusHistory MongoDB collection instance.
 */
async function getJobStatusCollection() {
  const db = await connectToDatabase();
  return db.collection('jobStatusHistory');
}

/**
 * Normalizes status string to determine if it is ATR, CTR, or other.
 */
export function normalizeStatusCategory(statusRaw) {
  if (!statusRaw) return 'OTHER';
  const str = String(statusRaw).toLowerCase().trim();
  if (str.includes('atr') || str.includes('agency to revert')) {
    return 'ATR';
  }
  if (str.includes('ctr') || str.includes('client to revert')) {
    return 'CTR';
  }
  return 'OTHER';
}

/**
 * Processes a list of jobs for a given brand, tracks enteredAt dates for ATR/CTR,
 * and returns each job augmented with `statusAging` metadata:
 * {
 *   category: 'ATR' | 'CTR' | 'OTHER',
 *   daysInStatus: number,
 *   enteredAtFormatted: string, // e.g. "7 Aug"
 *   enteredAtIso: string
 * }
 */
export async function syncJobStatusAging(brandName, jobs = []) {
  if (!brandName || !Array.isArray(jobs)) return jobs;

  try {
    const collection = await getJobStatusCollection();
    const cleanBrand = String(brandName).split('(')[0].toLowerCase().trim();

    // Fetch existing records for this brand
    const existingRecords = await collection.find({ brandKey: cleanBrand }).toArray();
    const recordMap = new Map();
    existingRecords.forEach(r => recordMap.set(r.jobKey, r));

    const now = new Date();
    const updatedJobs = [];
    const bulkOps = [];

    for (const job of jobs) {
      const jobIdentifier = (job.jobCode || job.jobName || job.task || '').toLowerCase().trim();
      if (!jobIdentifier) {
        updatedJobs.push(job);
        continue;
      }

      const jobKey = `${cleanBrand}::${jobIdentifier}`;
      const statusCategory = normalizeStatusCategory(job.status);
      const existing = recordMap.get(jobKey);

      if (statusCategory === 'ATR' || statusCategory === 'CTR') {
        let enteredAt;
        if (existing && existing.statusCategory === statusCategory && existing.enteredAt) {
          // Preserve initial entry timestamp if category hasn't changed
          enteredAt = new Date(existing.enteredAt);
        } else {
          // Brand new entry or transitioned into ATR/CTR
          enteredAt = now;
        }

        const diffTime = Math.abs(now - enteredAt);
        const daysInStatus = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        const dayNum = enteredAt.getDate();
        const monthShort = enteredAt.toLocaleString('en-US', { month: 'short' });
        const enteredAtFormatted = `${dayNum} ${monthShort}`;

        const statusAging = {
          category: statusCategory,
          daysInStatus,
          enteredAtFormatted,
          enteredAtIso: enteredAt.toISOString(),
        };

        updatedJobs.push({
          ...job,
          statusAging,
        });

        bulkOps.push({
          updateOne: {
            filter: { jobKey },
            update: {
              $set: {
                jobKey,
                brandKey: cleanBrand,
                jobName: job.jobName || job.task || jobIdentifier,
                statusCategory,
                rawStatus: job.status,
                enteredAt,
                lastUpdated: now,
              }
            },
            upsert: true,
          }
        });
      } else {
        // Status is Closed, In Progress, etc. -> Clear tracker if exists
        updatedJobs.push({
          ...job,
          statusAging: null,
        });

        if (existing) {
          bulkOps.push({
            deleteOne: {
              filter: { jobKey }
            }
          });
        }
      }
    }

    if (bulkOps.length > 0) {
      await collection.bulkWrite(bulkOps);
    }

    return updatedJobs;
  } catch (err) {
    console.error('[jobStatusTracker] Failed to sync status aging:', err);
    return jobs;
  }
}
