import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// ── CORS: allow Vite dev server ──────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',') 
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET'],
}));


// ── Google Auth via Service Account ─────────────────────────────────────────
const SERVICE_ACCOUNT_PATH = resolve(__dirname, 'service-account.json');

let auth;
try {
  const keyFile = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  auth = new google.auth.GoogleAuth({
    credentials: keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
} catch (err) {
  console.error('[server] Failed to load service-account.json:', err.message);
  process.exit(1);
}

const sheets = google.sheets({ version: 'v4', auth });

// ── Helper ───────────────────────────────────────────────────────────────────
async function getSheetTabs(spreadsheetId) {
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.sheets.map(s => s.properties.title);
}

async function getSheetData(spreadsheetId, tabName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: tabName,
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

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Account Health API running at http://localhost:${PORT}`);
});
