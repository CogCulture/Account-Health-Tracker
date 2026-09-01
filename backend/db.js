import dns from 'node:dns';
import { MongoClient } from 'mongodb';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // ignore if custom DNS cannot be set
}

const uri = process.env.MONGODB_URI;
let client;
let db;

/**
 * Connects to MongoDB and returns the database instance.
 * Caches the connection for reuse across requests and the cron job.
 */
export async function connectToDatabase() {
  if (db) return db;
  if (!uri) {
    console.error('[db] MONGODB_URI is not configured in environment variables.');
    throw new Error('MONGODB_URI is required.');
  }
  client = new MongoClient(uri);
  await client.connect();
  db = client.db('account_health');
  console.log('[db] Successfully connected to MongoDB Atlas.');
  return db;
}

/**
 * Returns the teams collection instance.
 */
export async function getTeamsCollection() {
  const database = await connectToDatabase();
  return database.collection('teams');
}

/**
 * Returns the meetingInsights collection instance (Fathom-synced and
 * manually-uploaded meeting transcripts run through Mistral extraction).
 */
export async function getMeetingInsightsCollection() {
  const database = await connectToDatabase();
  return database.collection('meetingInsights');
}

/**
 * Returns the dailyDigestSnapshots collection instance. Each document stores
 * the morning sheet sync output used by dashboard hydration and management mail.
 */
export async function getDailyDigestSnapshotsCollection() {
  const database = await connectToDatabase();
  return database.collection('dailyDigestSnapshots');
}
