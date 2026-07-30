/**
 * meetingsApi.js
 * Thin client for the meeting-insights backend routes (Fathom sync +
 * manual audio upload, both feeding the same Mistral extraction).
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

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

  const res = await fetch(`${API_BASE}/api/meetings/upload`, {
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
  const res = await fetch(`${API_BASE}/api/meetings/fathom/sync`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Fathom sync failed (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Fetches all stored meeting insights (both sources), most recent first.
 * @returns {Promise<object[]>}
 */
export async function fetchMeetingInsights() {
  const res = await fetch(`${API_BASE}/api/meetings/insights`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Failed to fetch meeting insights (HTTP ${res.status})`);
  }
  const { meetings } = await res.json();
  return meetings;
}
