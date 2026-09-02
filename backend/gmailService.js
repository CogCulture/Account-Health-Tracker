/**
 * gmailService.js
 *
 * Gmail API integration to query and extract Granola meeting notes.
 */
import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseGranolaEmail } from './granolaEmailParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = resolve(__dirname, 'gmail_tokens.json');
const CLIENT_SECRET_PATH = resolve(__dirname, 'google_oauth_client.json');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

/**
 * Loads client ID & secret from JSON file or environment variables.
 */
function getOAuthCredentials() {
  if (existsSync(CLIENT_SECRET_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(CLIENT_SECRET_PATH, 'utf8'));
      const conf = raw.web || raw.installed;
      if (conf) {
        return {
          clientId: conf.client_id,
          clientSecret: conf.client_secret,
          redirectUri: conf.redirect_uris?.[0] || 'http://localhost:3001/api/auth/google/callback',
        };
      }
    } catch (e) {
      console.warn('[gmailService] Failed to read google_oauth_client.json:', e.message);
    }
  }

  return {
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    redirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback',
  };
}

/**
 * Creates an OAuth2 client instance.
 */
export function getOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = getOAuthCredentials();
  if (!clientId || !clientSecret) {
    return null;
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generates the Google OAuth authorization URL.
 */
export function getAuthorizationUrl() {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    throw new Error('Google OAuth credentials (client_id/client_secret) are not configured.');
  }

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

/**
 * Loads saved tokens from disk or environment.
 */
export function getSavedTokens() {
  if (existsSync(TOKENS_PATH)) {
    try {
      return JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
    } catch (e) {
      console.warn('[gmailService] Error parsing saved tokens:', e.message);
    }
  }
  if (process.env.GMAIL_REFRESH_TOKEN) {
    return {
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      access_token: process.env.GMAIL_ACCESS_TOKEN || null,
    };
  }
  return null;
}

/**
 * Saves tokens to disk.
 */
export function saveTokens(tokens) {
  try {
    writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf8');
  } catch (e) {
    console.error('[gmailService] Failed to save tokens:', e.message);
  }
}

/**
 * Exchanges authorization code for tokens and saves them.
 */
export async function handleOAuthCallback(code) {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) throw new Error('OAuth client not configured');

  const { tokens } = await oauth2Client.getToken(code);
  saveTokens(tokens);
  return tokens;
}

/**
 * Returns an authenticated Gmail client or null if not authorized.
 */
export async function getAuthenticatedGmailClient() {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) return null;

  const tokens = getSavedTokens();
  if (!tokens) return null;

  oauth2Client.setCredentials(tokens);

  // Auto-persist refreshed tokens if event fires
  oauth2Client.on('tokens', (newTokens) => {
    const combined = { ...getSavedTokens(), ...newTokens };
    saveTokens(combined);
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Checks connection status.
 */
export async function getAuthStatus() {
  const tokens = getSavedTokens();
  const creds = getOAuthCredentials();
  const configured = Boolean(creds.clientId && creds.clientSecret);
  const connected = Boolean(tokens && (tokens.access_token || tokens.refresh_token));

  let userEmail = null;
  if (connected) {
    try {
      const gmail = await getAuthenticatedGmailClient();
      if (gmail) {
        const profile = await gmail.users.getProfile({ userId: 'me' });
        userEmail = profile.data.emailAddress;
      }
    } catch (e) {
      // Ignore profile fetch failure
    }
  }

  return {
    configured,
    connected,
    userEmail,
  };
}

/**
 * Helper to recursively extract body from Gmail message payload.
 */
function extractBodyFromPayload(payload) {
  let plainBody = '';
  let htmlBody = '';

  function traverse(part) {
    if (!part) return;

    if (part.mimeType === 'text/plain' && part.body?.data) {
      plainBody += Buffer.from(part.body.data, 'base64').toString('utf8');
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      htmlBody += Buffer.from(part.body.data, 'base64').toString('utf8');
    }

    if (part.parts && Array.isArray(part.parts)) {
      part.parts.forEach(traverse);
    }
  }

  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, 'base64').toString('utf8');
    if (payload.mimeType === 'text/html') htmlBody = decoded;
    else plainBody = decoded;
  }

  if (payload.parts) {
    payload.parts.forEach(traverse);
  }

  return { plainBody, htmlBody };
}

/**
 * Queries Gmail for Granola meeting emails and returns parsed meeting notes.
 */
export async function fetchGranolaMeetingEmails({ maxResults = 30, query = 'from:mail.granola.ai OR from:granola.ai OR subject:"via Granola"' } = {}) {
  const gmail = await getAuthenticatedGmailClient();
  if (!gmail) {
    throw new Error('Gmail is not authorized. Please connect your Gmail account first.');
  }

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  });

  const messages = listRes.data.messages || [];
  const parsedMeetings = [];

  for (const msg of messages) {
    try {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const data = msgRes.data;
      const headers = data.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      const subject = getHeader('Subject');
      const from = getHeader('From');
      const dateHeader = getHeader('Date');
      const date = dateHeader ? new Date(dateHeader) : (data.internalDate ? new Date(parseInt(data.internalDate, 10)) : new Date());

      const { plainBody, htmlBody } = extractBodyFromPayload(data.payload);

      const parsed = parseGranolaEmail({
        subject,
        from,
        date,
        htmlBody,
        plainBody,
        messageId: data.id,
      });

      // Filter out non-meeting marketing or welcome emails
      const isActualMeeting = (subject?.toLowerCase().includes('notes for') || parsed.sharedBy) && !subject?.toLowerCase().includes('quick things');
      if (parsed && isActualMeeting && parsed.meetingTitle !== 'Granola Meeting Note') {
        parsedMeetings.push(parsed);
      }
    } catch (err) {
      console.warn(`[gmailService] Failed to process message ${msg.id}:`, err.message);
    }
  }

  return parsedMeetings;
}
