import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import cron from 'node-cron';
import { runScheduledAlertCheck } from './alertEngine.js';
import { getTeamsCollection } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// ── CORS: allow Vite dev server ──────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',') 
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'DELETE'],
}));

app.use(express.json());


// ── Google Auth via Service Account ─────────────────────────────────────────
let auth;
try {
  let credentials;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else {
    const SERVICE_ACCOUNT_PATH = resolve(__dirname, 'service-account.json');
    credentials = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  }
  auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
} catch (err) {
  console.error('[server] Failed to load Google service account credentials:', err.message);
  process.exit(1);
}

const sheets = google.sheets({ version: 'v4', auth });

// ── Helper ───────────────────────────────────────────────────────────────────
async function getSheetTabs(spreadsheetId) {
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.sheets.map(s => s.properties.title);
}

async function getSheetData(spreadsheetId, tabName) {
  // Fetch actual tab names from the spreadsheet
  const actualTabs = await getSheetTabs(spreadsheetId);
  
  // Find a case-insensitive, trimmed match, defaulting to the original tabName if not found
  const targetLowerTrimmed = tabName.toLowerCase().trim();
  const matchedTab = actualTabs.find(t => t.toLowerCase().trim() === targetLowerTrimmed) || tabName;

  // Format the matched tabName as a valid A1 range by wrapping in single quotes
  const safeRange = `'${matchedTab.replace(/'/g, "''")}'`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: safeRange,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
  });
  return res.data.values || [];
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/sheets/tabs?sheetId=<spreadsheetId>
 * Returns the list of tab names in the spreadsheet.
 */
app.get('/api/sheets/tabs', async (req, res) => {
  const { sheetId } = req.query;
  if (!sheetId) return res.status(400).json({ error: 'sheetId query param required' });

  try {
    const tabs = await getSheetTabs(sheetId);
    res.json({ tabs });
  } catch (err) {
    console.error('[server] /api/sheets/tabs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sheets/data?sheetId=<spreadsheetId>&tab=<tabName>
 * Returns the raw 2D array of values for the given tab.
 */
app.get('/api/sheets/data', async (req, res) => {
  const { sheetId, tab } = req.query;
  if (!sheetId || !tab) return res.status(400).json({ error: 'sheetId and tab query params required' });

  try {
    const data = await getSheetData(sheetId, tab);
    res.json({ data });
  } catch (err) {
    console.error('[server] /api/sheets/data error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/health
 * Simple health check endpoint.
 */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Teams CRUD Configuration API ──────────────────────────────────────────────

/**
 * GET /api/teams
 * Returns the list of teams from MongoDB.
 */
app.get('/api/teams', async (_req, res) => {
  try {
    const collection = await getTeamsCollection();
    const teams = await collection.find({}).toArray();
    res.json({ teams });
  } catch (err) {
    console.error('[server] GET /api/teams error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve teams' });
  }
});

/**
 * POST /api/teams
 * Saves or updates a team configuration in MongoDB.
 */
app.post('/api/teams', async (req, res) => {
  const { id, name, dailyId, jobId, active } = req.body;
  if (!name || !dailyId || !jobId) {
    return res.status(400).json({ error: 'name, dailyId, and jobId are required' });
  }

  try {
    const collection = await getTeamsCollection();
    let updatedTeam;

    if (id) {
      // Edit existing team in DB
      await collection.updateOne(
        { id },
        { $set: { name, dailyId, jobId, active: active ?? false } }
      );
      updatedTeam = await collection.findOne({ id });
    } else {
      // Add new team
      const count = await collection.countDocuments({});
      const isFirst = count === 0;
      updatedTeam = {
        id: Date.now().toString(),
        name,
        dailyId,
        jobId,
        active: active ?? isFirst
      };
      await collection.insertOne(updatedTeam);
    }

    const teams = await collection.find({}).toArray();
    res.json({ team: updatedTeam, teams });
  } catch (err) {
    console.error('[server] POST /api/teams error:', err.message);
    res.status(500).json({ error: 'Failed to save team' });
  }
});

/**
 * DELETE /api/teams/:id
 * Deletes a team configuration from MongoDB.
 */
app.delete('/api/teams/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const collection = await getTeamsCollection();
    const deleteResult = await collection.deleteOne({ id });

    if (deleteResult.deletedCount === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Ensure at least one active team remains if teams exist
    let teams = await collection.find({}).toArray();
    if (teams.length > 0 && !teams.some(t => t.active)) {
      await collection.updateOne({ id: teams[0].id }, { $set: { active: true } });
      teams = await collection.find({}).toArray();
    }

    res.json({ success: true, teams });
  } catch (err) {
    console.error('[server] DELETE /api/teams error:', err.message);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

/**
 * GET /api/trigger-alerts
 * Manually triggers the scheduled daily alert check via HTTP request.
 * Useful for calling from external free cron job pinger (e.g. cron-job.org).
 */
app.get('/api/trigger-alerts', (req, res) => {
  console.log('[api] Manual alert check triggered via HTTP endpoint (asynchronous)...');
  
  // Trigger check in background (non-blocking) to prevent HTTP timeouts
  runScheduledAlertCheck(sheets)
    .then(() => {
      console.log('[api] Background alert check completed successfully.');
    })
    .catch(err => {
      console.error('[api] Background alert check failed:', err.message);
    });

  // Respond immediately to the client
  res.json({ success: true, message: 'Alert check triggered and running in the background.' });
});

// ── Background Cron Scheduler ──────────────────────────────────────────────
// Scheduled alerts check at 10:10 AM every day (IST Timezone)
cron.schedule('10 10 * * *', () => {
  console.log('[cron] Running scheduled daily 10:10 AM alert check...');
  runScheduledAlertCheck(sheets).catch(err => {
    console.error('[cron] Scheduled alert check failed:', err.message);
  });
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Account Health API running at http://localhost:${PORT}`);
});
