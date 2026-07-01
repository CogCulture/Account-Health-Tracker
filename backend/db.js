import { MongoClient } from 'mongodb';

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
