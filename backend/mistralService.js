/**
 * mistralService.js
 *
 * Two responsibilities on the same Mistral account/API key:
 *  1. transcribeAudio   - Voxtral speech-to-text for manually uploaded meeting recordings
 *  2. extractMeetingInsights - chat completion that turns a transcript into the
 *     three things the daily digest needs: attendees, jobs/clients discussed,
 *     and what was said about each job.
 */
import { Mistral } from '@mistralai/mistralai';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

/**
 * Transcribes an audio buffer (e.g. an uploaded meeting recording) using
 * Voxtral. Returns the plain transcript text plus diarized segments.
 *
 * @param {Buffer} fileBuffer
 * @param {string} fileName
 * @returns {Promise<{ text: string, segments: any[] }>}
 */
export async function transcribeAudio(fileBuffer, fileName) {
  const response = await client.audio.transcriptions.complete({
    model: 'voxtral-mini-latest',
    file: { fileName, content: fileBuffer },
    diarize: true,
  });
  return { text: response.text, segments: response.segments || [] };
}

const INSIGHTS_SYSTEM_PROMPT = `You are analyzing a client meeting transcript for an agency's account health tracker.
Extract exactly three things and respond with a single JSON object, no other text:
{
  "attendees": string[],           // names/roles of everyone who spoke or was addressed by name
  "jobsDiscussed": [
    { "job": string, "insights": string }  // job/deliverable/topic name, and what was decided or discussed about it
  ],
  "summary": string                // 2-3 sentence overall summary of the meeting
}
If attendees are not named explicitly, use generic labels like "Speaker 1". If no specific jobs were discussed, return an empty array for jobsDiscussed.`;

/**
 * Sends a transcript to Mistral and extracts attendees, jobs discussed, and
 * per-job insights as structured JSON.
 *
 * @param {string} transcriptText
 * @param {string} [meetingTitle]
 * @returns {Promise<{ attendees: string[], jobsDiscussed: {job: string, insights: string}[], summary: string }>}
 */
export async function extractMeetingInsights(transcriptText, meetingTitle = '') {
  if (!process.env.MISTRAL_API_KEY) {
    console.warn('[mistralService] MISTRAL_API_KEY not configured. Falling back to basic transcript parsing.');
    return buildFallbackInsights(transcriptText);
  }

  try {
    const response = await client.chat.complete({
      model: 'mistral-large-latest',
      responseFormat: { type: 'json_object' },
      messages: [
        { role: 'system', content: INSIGHTS_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Meeting title: ${meetingTitle || '(untitled)'}\n\nTranscript:\n${transcriptText}`,
        },
      ],
    });

    const content = response.choices[0].message.content;
    const raw = typeof content === 'string' ? content : content.map(c => c.text || '').join('');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[mistralService] extractMeetingInsights AI call failed:', err.message);
    return buildFallbackInsights(transcriptText);
  }
}

function buildFallbackInsights(transcriptText) {
  const lines = transcriptText.split('\n').filter(Boolean);
  const speakers = new Set();
  lines.forEach(l => {
    const match = l.match(/^\[?\d*:?\d*\]?\s*([^:]+):/);
    if (match) speakers.add(match[1].trim());
  });

  return {
    attendees: Array.from(speakers).length > 0 ? Array.from(speakers) : ['Participant'],
    jobsDiscussed: [],
    summary: transcriptText.slice(0, 300) + (transcriptText.length > 300 ? '...' : '')
  };
}
