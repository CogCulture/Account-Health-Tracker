/**
 * fathomService.js
 *
 * Plain REST client for Fathom's meetings API (free-tier eligible, per
 * fathom-test.js verification). No SDK, no OAuth — just an API key header.
 */
const FATHOM_API_BASE = 'https://api.fathom.ai/external/v1';

/**
 * Lists meetings (with transcript + summary included) recorded since
 * `sinceDate`.
 *
 * @param {Date} sinceDate
 * @returns {Promise<any[]>} raw meeting objects as returned by Fathom
 */
export async function listRecentMeetings(sinceDate) {
  const apiKey = process.env.FATHOM_API_KEY;
  if (!apiKey) {
    throw new Error('FATHOM_API_KEY is not configured.');
  }

  const params = new URLSearchParams({
    include_transcript: 'true',
    created_after: sinceDate.toISOString(),
  });

  const res = await fetch(`${FATHOM_API_BASE}/meetings?${params.toString()}`, {
    headers: { 'X-Api-Key': apiKey },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Fathom API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  // Field name for the meeting array was unconfirmed at write time (docs
  // were ambiguous between `items` and `meetings`) — fall back across both.
  return data?.items || data?.meetings || [];
}

/**
 * Flattens a raw Fathom meeting object's transcript into a single string
 * suitable for feeding to the Mistral insights extraction step.
 */
export function meetingTranscriptToText(meeting) {
  if (typeof meeting.transcript === 'string') return meeting.transcript;
  if (Array.isArray(meeting.transcript)) {
    return meeting.transcript
      .map(entry => {
        const speakerName = (typeof entry.speaker === 'object' && entry.speaker?.display_name)
          ? entry.speaker.display_name
          : (typeof entry.speaker === 'string' ? entry.speaker : (entry.speaker_name || 'Speaker'));
        return `${speakerName}: ${entry.text || ''}`;
      })
      .join('\n');
  }
  return '';
}
