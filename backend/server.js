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
import multer from 'multer';
import { runDailyDigestCheck } from './dailyDigestEngine.js';
import { syncJobStatusAging } from './jobStatusTracker.js';
import { getTeamsCollection, getMeetingInsightsCollection } from './db.js';
import { ALLOWED_TEAM_NAMES } from './podConfig.js';
import { transcribeAudio, extractMeetingInsights } from './mistralService.js';
import { listRecentMeetings, meetingTranscriptToText } from './fathomService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// Trust the first proxy (e.g. Render's load balancer) to ensure express-rate-limit 
// correctly identifies client IPs instead of using the load balancer IP.
app.set('trust proxy', 1);

// Helper function to check if the request should bypass rate limiting via a cron secret token
const isCronBypass = (req) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const token = req.headers['x-cron-secret'] || req.query.secret;
  return token === cronSecret;
};

// ── Security Headers (Helmet) ────────────────────────────────────────────────
app.use(helmet());

// ── Rate Limiting ────────────────────────────────────────────────────────────
// Generous general rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000, // Limit each IP to 1000 requests per 15 minutes
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: isCronBypass,
  message: { error: 'Too many requests from this IP, please try again later.' },
});

// Stricter rate limit for triggering alert checks manually
const alertTriggerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 60, // Limit each IP to 60 alert trigger requests per hour
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: isCronBypass,
  message: { error: 'Too many alert trigger requests from this IP, please try again later.' },
});

// Apply global rate limiting to all requests
app.use(generalLimiter);

// ── CORS: allow Vite dev server ──────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.split(',').includes(origin))) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive for local dev
    }
  },
  methods: ['GET', 'POST', 'DELETE'],
}));

app.use(express.json());

// ── Multer (in-memory, for meeting audio uploads) ────────────────────────────
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB, generous for an hour-long meeting recording
});

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

// ── Helper with In-Memory Caching ───────────────────────────────────────────
const tabsCache = new Map(); // { sheetId: { tabs: [...], timestamp: number } }
const TABS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getSheetTabs(spreadsheetId) {
  const cached = tabsCache.get(spreadsheetId);
  if (cached && (Date.now() - cached.timestamp < TABS_CACHE_TTL_MS)) {
    return cached.tabs;
  }
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const tabs = res.data.sheets.map(s => s.properties.title);
  tabsCache.set(spreadsheetId, { tabs, timestamp: Date.now() });
  return tabs;
}

async function getSheetData(spreadsheetId, tabName) {
  // Fetch actual tab names from the spreadsheet (uses 5-min cache)
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
    const msg = err.message || '';
    console.error('[server] /api/sheets/tabs error:', msg || err);
    if (msg.includes('permission') || msg.includes('caller does not have permission')) {
      return res.status(403).json({ error: 'Access denied: Please share your Google Sheet with account-health-tracker@accounthealth-500505.iam.gserviceaccount.com (Viewer access).' });
    }
    res.status(500).json({ error: msg || 'Failed to retrieve spreadsheet tabs' });
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
    const msg = err.message || '';
    console.error(`[server] /api/sheets/data error (tab: ${tab}):`, msg || err);
    if (msg.includes('permission') || msg.includes('caller does not have permission')) {
      return res.status(403).json({ error: 'Access denied: Please share your Google Sheet with account-health-tracker@accounthealth-500505.iam.gserviceaccount.com (Viewer access).' });
    }
    res.status(500).json({ error: msg || 'Failed to retrieve spreadsheet data' });
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
 * POST /api/job-status/sync
 * Syncs ATR/CTR job status duration/aging records in MongoDB.
 */
app.post('/api/job-status/sync', express.json(), async (req, res) => {
  const { brandName, jobs } = req.body || {};
  if (!brandName || !Array.isArray(jobs)) {
    return res.status(400).json({ error: 'brandName and jobs array are required.' });
  }
  try {
    const updatedJobs = await syncJobStatusAging(brandName, jobs);
    res.json({ success: true, jobs: updatedJobs });
  } catch (err) {
    console.error('[server] /api/job-status/sync error:', err);
    res.status(500).json({ error: 'Failed to sync job status aging.' });
  }
});

/**
 * GET /api/trigger-daily-digest
 * Manually triggers the 11:30 AM daily pod digest email via HTTP request.
 * Useful for calling from external free cron job pinger (e.g. cron-job.org).
 * Rate limit applied to protect against spamming API and resources.
 */
app.get('/api/trigger-daily-digest', alertTriggerLimiter, (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const token = req.headers['x-cron-secret'] || req.query.secret;
    if (token !== cronSecret) {
      console.warn('[api] Unauthorized attempt to trigger daily digest (invalid or missing secret).');
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing cron secret.' });
    }
  } else {
    console.warn('[api] Daily digest triggered without CRON_SECRET verification. It is recommended to set CRON_SECRET in production.');
  }

  // Extract optional recipient override from query string (e.g. ?to=user@example.com)
  const recipientOverride = (typeof req.query.to === 'string' && req.query.to.trim()) 
    ? req.query.to.trim() 
    : ((typeof req.query.email === 'string' && req.query.email.trim()) ? req.query.email.trim() : null);

  console.log(`[api] Manual daily digest triggered via HTTP endpoint${recipientOverride ? ` for single recipient (${recipientOverride})` : ''}...`);

  // Trigger check in background (non-blocking) to prevent HTTP timeouts
  runDailyDigestCheck(sheets, recipientOverride)
    .then(() => {
      console.log('[api] Background daily digest completed successfully.');
    })
    .catch(err => {
      console.error('[api] Background daily digest failed:', err);
    });

  // Respond immediately to the client
  res.json({ 
    success: true, 
    message: recipientOverride 
      ? `Daily digest triggered and sending to ${recipientOverride}.` 
      : 'Daily digest triggered and running in the background.' 
  });
});

// ── Meeting Insights (Fathom sync + manual upload → Mistral extraction) ─────

/**
 * POST /api/meetings/upload
 * Accepts a meeting audio recording (multipart/form-data, field name "audio"),
 * transcribes it via Mistral Voxtral, then extracts attendees, jobs discussed,
 * and per-job insights via Mistral chat completion. Saves and returns the result.
 */
app.post('/api/meetings/upload', alertTriggerLimiter, audioUpload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided (expected multipart field "audio").' });
  }
  const meetingTitle = typeof req.body?.meetingTitle === 'string' ? req.body.meetingTitle.trim() : '';

  try {
    const { text: transcriptText } = await transcribeAudio(req.file.buffer, req.file.originalname);
    if (!transcriptText || !transcriptText.trim()) {
      return res.status(422).json({ error: 'Transcription produced no text — check the audio file.' });
    }

    const insights = await extractMeetingInsights(transcriptText, meetingTitle);

    const collection = await getMeetingInsightsCollection();
    const doc = {
      source: 'upload',
      sourceMeetingId: null,
      meetingTitle: meetingTitle || null,
      meetingDate: new Date(),
      transcriptText,
      ...insights,
      createdAt: new Date(),
    };
    const result = await collection.insertOne(doc);

    res.json({ success: true, meeting: { ...doc, _id: result.insertedId } });
  } catch (err) {
    console.error('[server] POST /api/meetings/upload error:', err);
    res.status(500).json({ error: 'Failed to process uploaded meeting audio.' });
  }
});

/**
 * POST /api/meetings/fathom/sync
 * Pulls meetings from Fathom recorded in the last 30 days, runs any not
 * already processed through Mistral extraction, and stores the results.
 */
app.post('/api/meetings/fathom/sync', alertTriggerLimiter, async (req, res) => {
  try {
    const collection = await getMeetingInsightsCollection();
    const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const meetings = await listRecentMeetings(sinceDate);

    const processed = [];
    for (const meeting of meetings) {
      const sourceMeetingId = meeting.id || meeting.recording_id;
      if (!sourceMeetingId) continue;

      const existing = await collection.findOne({ source: 'fathom', sourceMeetingId });
      if (existing) continue;

      const transcriptText = meetingTranscriptToText(meeting);
      if (!transcriptText.trim()) continue;

      const meetingTitle = meeting.title || meeting.meeting_title || '';
      const insights = await extractMeetingInsights(transcriptText, meetingTitle);

      const doc = {
        source: 'fathom',
        sourceMeetingId,
        meetingTitle: meetingTitle || null,
        meetingDate: meeting.created_at ? new Date(meeting.created_at) : new Date(),
        transcriptText,
        fathomSummary: meeting.default_summary?.markdown_formatted || null,
        ...insights,
        createdAt: new Date(),
      };
      const result = await collection.insertOne(doc);
      processed.push({ ...doc, _id: result.insertedId });
    }

    res.json({ success: true, newMeetingsProcessed: processed.length, meetings: processed });
  } catch (err) {
    console.error('[server] POST /api/meetings/fathom/sync error:', err);
    res.status(500).json({ error: 'Failed to sync meetings from Fathom.' });
  }
});

/**
 * GET /api/meetings/insights
 * Returns stored meeting insights (both Fathom-synced and manually uploaded),
 * most recent first.
 */
app.get('/api/meetings/insights', async (_req, res) => {
  try {
    const collection = await getMeetingInsightsCollection();
    const meetings = await collection.find({}).sort({ meetingDate: -1 }).toArray();
    res.json({ meetings });
  } catch (err) {
    console.error('[server] GET /api/meetings/insights error:', err);
    res.status(500).json({ error: 'Failed to retrieve meeting insights.' });
  }
});

// ── Background Cron Scheduler ──────────────────────────────────────────────
// Scheduled daily pod digest (pending L/XL/XXL jobs + meeting attendance % + status aging sync) at 11:00 AM every day (IST Timezone)
cron.schedule('0 11 * * *', () => {
  console.log('[cron] Running scheduled daily 11:00 AM digest and status aging check...');
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
