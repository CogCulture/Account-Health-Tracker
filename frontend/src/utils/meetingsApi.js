/**
 * meetingsApi.js
 * Thin client for the meeting-insights backend routes (Fathom sync +
 * manual audio upload, both feeding the same Mistral extraction).
 */

import { apiUrl } from './apiClient';

/**
 * Uploads a meeting audio recording for transcription + insight extraction.
 * @param {File} audioFile
 * @param {string} [meetingTitle]
 * @returns {Promise<object>} the saved meeting insight record
 */
export async function uploadMeetingAudio(audioFile, meetingTitle = '') {
  const formData = new FormData();
  formData.append('audio', audioFile);
  if (meetingTitle) formData.append('meetingTitle', meetingTitle);

  const res = await fetch(apiUrl('/api/meetings/upload'), {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Upload failed (HTTP ${res.status})`);
  }
  const { meeting } = await res.json();
  return meeting;
}

/**
 * Triggers a sync of recent meetings from Fathom, extracting insights for
 * any not already processed.
 * @returns {Promise<{ newMeetingsProcessed: number, meetings: object[] }>}
 */
export async function syncFathomMeetings() {
  const res = await fetch(apiUrl('/api/meetings/fathom/sync'), { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Fathom sync failed (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Triggers a sync of Granola meeting notes from Gmail.
 * @returns {Promise<{ newMeetingsProcessed: number, meetings: object[] }>}
 */
export async function syncGmailMeetings() {
  const res = await fetch(apiUrl('/api/meetings/gmail/sync'), { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Granola sync failed (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Checks Gmail connection status.
 * @returns {Promise<{ configured: boolean, connected: boolean, userEmail: string|null }>}
 */
export async function fetchGmailStatus() {
  const res = await fetch(apiUrl('/api/meetings/gmail/status'));
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Failed to fetch Gmail status (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Fetches all stored meeting insights (all sources), most recent first.
 * @returns {Promise<object[]>}
 */
export async function fetchMeetingInsights() {
  const res = await fetch(apiUrl('/api/meetings/insights'));
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Failed to fetch meeting insights (HTTP ${res.status})`);
  }
  const { meetings } = await res.json();
  return meetings;
}
