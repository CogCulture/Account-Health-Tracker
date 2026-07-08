import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import cron from 'node-cron';
import { runDailyDigestCheck } from './dailyDigestEngine.js';
import { getTeamsCollection } from './db.js';
import { ALLOWED_TEAM_NAMES } from './podConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security Headers (Helmet) ────────────────────────────────────────────────
app.use(helmet());

// ── Rate Limiting ────────────────────────────────────────────────────────────
// Generous general rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000, // Limit each IP to 1000 requests per 15 minutes
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' },
});

// Stricter rate limit for triggering alert checks manually
const alertTriggerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 60, // Limit each IP to 60 alert trigger requests per hour
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many alert trigger requests from this IP, please try again later.' },
});

// Apply global rate limiting to all requests
app.use(generalLimiter);

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
  if (typeof sheetId !== 'string' || !sheetId.trim()) {
    return res.status(400).json({ error: 'sheetId query param must be a valid non-empty string' });
  }

  try {
    const tabs = await getSheetTabs(sheetId);
    res.json({ tabs });
  } catch (err) {
    console.error('[server] /api/sheets/tabs error:', err);
    res.status(500).json({ error: 'Failed to retrieve spreadsheet tabs due to an internal server error' });
  }
});

/**
 * GET /api/sheets/data?sheetId=<spreadsheetId>&tab=<tabName>
 * Returns the raw 2D array of values for the given tab.
 */
app.get('/api/sheets/data', async (req, res) => {
  const { sheetId, tab } = req.query;
  if (typeof sheetId !== 'string' || !sheetId.trim() || typeof tab !== 'string' || !tab.trim()) {
    return res.status(400).json({ error: 'sheetId and tab query params must be valid non-empty strings' });
  }

  try {
    const data = await getSheetData(sheetId, tab);
    res.json({ data });
  } catch (err) {
    console.error('[server] /api/sheets/data error:', err);
    res.status(500).json({ error: 'Failed to retrieve spreadsheet data due to an internal server error' });
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
    console.error('[server] GET /api/teams error:', err);
    res.status(500).json({ error: 'Failed to retrieve teams' });
  }
});

/**
 * POST /api/teams
 * Saves or updates a team configuration in MongoDB.
 */
app.post('/api/teams', async (req, res) => {
  const { id, name, dailyId, jobId, active } = req.body;

  // Strict type checks to prevent MongoDB query/NoSQL injection
  if (id !== undefined && (typeof id !== 'string' || !id.trim())) {
    return res.status(400).json({ error: 'id must be a valid non-empty string if provided' });
  }
  if (typeof name !== 'string' || !ALLOWED_TEAM_NAMES.includes(name.trim().toUpperCase())) {
    return res.status(400).json({ error: `name must be one of: ${ALLOWED_TEAM_NAMES.join(', ')}` });
  }
  const normalizedName = name.trim().toUpperCase();
  if (typeof dailyId !== 'string' || !dailyId.trim()) {
    return res.status(400).json({ error: 'dailyId must be a valid non-empty string' });
  }
  if (typeof jobId !== 'string' || !jobId.trim()) {
    return res.status(400).json({ error: 'jobId must be a valid non-empty string' });
  }
  if (active !== undefined && typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active must be a boolean' });
  }

  try {
    const collection = await getTeamsCollection();
    let updatedTeam;

    if (id) {
      // Edit existing team in DB
      await collection.updateOne(
        { id },
        { $set: { name: normalizedName, dailyId, jobId, active: active ?? false } }
      );
      updatedTeam = await collection.findOne({ id });
    } else {
      // Add new team
      const count = await collection.countDocuments({});
      const isFirst = count === 0;
      updatedTeam = {
        id: Date.now().toString(),
        name: normalizedName,
        dailyId,
        jobId,
        active: active ?? isFirst
      };
      await collection.insertOne(updatedTeam);
    }

    const teams = await collection.find({}).toArray();
    res.json({ team: updatedTeam, teams });
  } catch (err) {
    console.error('[server] POST /api/teams error:', err);
    res.status(500).json({ error: 'Failed to save team' });
  }
});

/**
 * DELETE /api/teams/:id
 * Deletes a team configuration from MongoDB.
 */
app.delete('/api/teams/:id', async (req, res) => {
  const { id } = req.params;
  if (typeof id !== 'string' || !id.trim()) {
    return res.status(400).json({ error: 'id parameter must be a valid non-empty string' });
  }

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
    console.error('[server] DELETE /api/teams error:', err);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

/**
 * GET /api/trigger-daily-digest
 * Manually triggers the 11:30 AM daily pod digest email via HTTP request.
 * Useful for calling from external free cron job pinger (e.g. cron-job.org).
 * Rate limit applied to protect against spamming API and resources.
 */
app.get('/api/trigger-daily-digest', alertTriggerLimiter, (req, res) => {
  console.log('[api] Manual daily digest triggered via HTTP endpoint (asynchronous)...');

  // Trigger check in background (non-blocking) to prevent HTTP timeouts
  runDailyDigestCheck(sheets)
    .then(() => {
      console.log('[api] Background daily digest completed successfully.');
    })
    .catch(err => {
      console.error('[api] Background daily digest failed:', err);
    });

  // Respond immediately to the client
  res.json({ success: true, message: 'Daily digest triggered and running in the background.' });
});

// ── Background Cron Scheduler ──────────────────────────────────────────────
// Scheduled daily pod digest (pending L/XL/XXL jobs + meeting attendance %) at 11:30 AM every day (IST Timezone)
cron.schedule('30 11 * * *', () => {
  console.log('[cron] Running scheduled daily 11:30 AM digest check...');
  runDailyDigestCheck(sheets).catch(err => {
    console.error('[cron] Scheduled daily digest check failed:', err.message);
  });
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Account Health API running at http://localhost:${PORT}`);
});
