/**
 * granolaEmailParser.js
 *
 * Dedicated parser for Granola meeting notes emails (notifications@mail.granola.ai).
 * Extracts:
 *  - Meeting Title
 *  - Shared by (person name)
 *  - Meeting Date & Attendees info
 *  - Clean formatted notes (bullet points, sections)
 *  - View Note URL (Granola link)
 */

/**
 * Extracts and cleans the meeting title from subject or body.
 */
export function extractMeetingTitle(subject, textContent) {
  if (subject) {
    // Matches: 📝 Notes for "Meeting Title" or Notes for "Meeting Title"
    const match = subject.match(/(?:Notes for\s*["“'])(.*?)(?:["”'])/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    // Fallback: strip emojis and 'Notes for'
    const cleaned = subject.replace(/^[^\w\s]+/g, '').replace(/^Notes for\s*/i, '').trim();
    if (cleaned) return cleaned.replace(/^["'“”]+|["'“”]+$/g, '');
  }

  // Look in text content
  const headerMatch = textContent.match(/Notes for\s*["“']?(.*?)["”']?\s*\n/i);
  if (headerMatch && headerMatch[1]) {
    return headerMatch[1].trim();
  }

  return 'Granola Meeting Note';
}

/**
 * Extracts the person who shared the note from the sender header or text.
 * E.g. "Shourya Sharma via Granola" -> "Shourya Sharma"
 */
export function extractSharedBy(fromHeader, textContent) {
  if (fromHeader) {
    const match = fromHeader.match(/^(.*?)\s+via\s+Granola/i);
    if (match && match[1]) {
      return match[1].replace(/["']/g, '').trim();
    }
    // If just a name <notifications@...>, extract name
    const nameMatch = fromHeader.match(/^(.*?)\s*<.*?>$/);
    if (nameMatch && nameMatch[1] && !nameMatch[1].toLowerCase().includes('granola')) {
      return nameMatch[1].replace(/["']/g, '').trim();
    }
  }

  // Look in text e.g. "Shourya shared meeting notes with you."
  const bodyMatch = textContent.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+shared meeting notes with you/i);
  if (bodyMatch && bodyMatch[1]) {
    return bodyMatch[1].trim();
  }

  return null;
}

/**
 * Extracts the Granola web link ("View Note" URL) from HTML or text.
 */
export function extractViewNoteUrl(htmlContent, textContent) {
  if (htmlContent) {
    // Matches href="https://app.granola.ai/..." or href="https://mail.granola.ai/..." or "https://notes.granola.ai/..."
    const hrefMatch = htmlContent.match(/href=["'](https:\/\/(?:[a-zA-Z0-9.-]+\.)?granola\.ai\/[^\s"'>]+)["']/i);
    if (hrefMatch && hrefMatch[1]) {
      return hrefMatch[1];
    }
  }

  if (textContent) {
    const urlMatch = textContent.match(/https:\/\/(?:[a-zA-Z0-9.-]+\.)?granola\.ai\/[^\s)\]]+/i);
    if (urlMatch && urlMatch[0]) {
      return urlMatch[0];
    }
  }

  return null;
}

/**
 * Strips HTML tags and normalizes whitespace while preserving paragraphs and bullet lists.
 */
export function cleanHtmlToText(html) {
  if (!html) return '';

  let text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<h[1-6][^>]*>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<hr\s*[\/]?>/gi, '\n')
    .replace(/<a\s+[^>]*href=["'][^"']*["'][^>]*>(.*?)<\/a>/gi, '$1') // keep link text only
    .replace(/<[^>]+>/g, '') // remove remaining tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\*{3,}/g, '')
    .replace(/Read more in Granola[\s\S]*/gi, '')
    .replace(/The AI notepad for people in back-to-back meetings[\s\S]*/gi, '')
    .replace(/Twitter[\s\S]*/gi, '')
    .replace(/Download Granola/gi, '')
    .replace(/View Note/gi, '');

  // Normalize consecutive newlines
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

/**
 * Extracts structured notes from Granola email content.
 */
export function parseGranolaEmail({ subject, from, date, htmlBody, plainBody, messageId }) {
  // Prefer clean HTML content because HTML structures tags, headings, and bullet points cleanly
  const rawText = htmlBody ? cleanHtmlToText(htmlBody) : (plainBody || '');
  const meetingTitle = extractMeetingTitle(subject, rawText);
  const sharedBy = extractSharedBy(from, rawText);
  const viewNoteUrl = extractViewNoteUrl(htmlBody, plainBody);

  // 1. Remove URLs, dividers, and Granola boilerplate
  let text = rawText
    .replace(/\(\s*https?:\/\/[^\)]*\)/gi, '')
    .replace(/https?:\/\/[^\s\)\>]+/gi, '')
    .replace(/[\*_=-]{3,}/g, '')
    .replace(/^.*?shared meeting notes with you\.\s*/is, '')
    .replace(/Granola takes your raw meeting notes and makes them awesome\./is, '')
    .replace(/Download Granola/gi, '')
    .replace(/View Note/gi, '')
    .replace(/Read more in Granola[\s\S]*/gi, '')
    .replace(/The AI notepad for people in back-to-back meetings[\s\S]*/gi, '')
    .replace(/Twitter[\s\S]*/gi, '');

  // 2. Line-by-line cleaning: remove standalone parentheses/brackets
  let rawLines = text.split('\n').map(l => {
    let line = l.trim();
    if (/^[\(\)\[\]\s]+$/.test(line)) return '';
    line = line.replace(/^[\(\)]+\s*/, '');
    line = line.replace(/\s*[\(\)]+$/, '');
    return line;
  }).filter(Boolean);

  // Remove redundant Granola title/intro line at the very top if it matches
  if (rawLines.length > 0 && (rawLines[0].toLowerCase() === 'granola' || rawLines[0].toLowerCase().includes('shared meeting notes'))) {
    rawLines.shift();
  }
  if (meetingTitle && rawLines.length > 0 && rawLines[0].toLowerCase() === meetingTitle.toLowerCase()) {
    rawLines.shift();
  }
  if (rawLines.length > 0 && /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+[A-Za-z]+\s+\d{1,2}$/i.test(rawLines[0])) {
    rawLines.shift();
  }

  // 3. Extract attendees accurately
  let extractedAttendees = [];
  // Pattern A: "Attendees: Jishan, Aman, Ashish, Chunri | Emaar Business Square"
  const attMatch = text.match(/Attendees:\s*([^|\n\r<]+)/i);
  if (attMatch && attMatch[1]) {
    extractedAttendees = attMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  }

  // Pattern B: Team Roles section e.g. "• Sejal: CS", "• Mansi: Copywriter"
  if (extractedAttendees.length === 0) {
    const roleLines = rawLines.filter(l => l.startsWith('•') && l.includes(':') && /:(?:\s*)(?:CS|Copywriter|Designer|Head|Lead|Manager|Director|Developer|Client)/i.test(l));
    if (roleLines.length > 0) {
      extractedAttendees = roleLines.map(l => l.replace(/^•\s*/, ''));
    }
  }

  const attendees = extractedAttendees.length > 0
    ? extractedAttendees
    : (sharedBy ? [sharedBy] : []);

  // 4. Construct clean summary
  const discussionPoints = rawLines.filter(l => l.startsWith('•') && !l.includes(': CS') && !l.includes(': Copywriter') && !l.includes(': Designer'));
  let summary = '';
  if (discussionPoints.length > 0) {
    summary = discussionPoints.slice(0, 4).join('\n');
  } else {
    summary = rawLines.slice(0, 4).join('\n');
  }

  if (summary.length > 400) {
    summary = summary.slice(0, 400) + '...';
  }

  const notesBody = rawLines.join('\n\n');

  return {
    source: 'granola',
    sourceMeetingId: messageId,
    meetingTitle,
    sharedBy,
    meetingDate: date ? new Date(date) : new Date(),
    attendeeCount: attendees.length || null,
    attendees,
    summary: summary || 'Meeting notes recorded via Granola.',
    notesBody,
    transcriptText: notesBody,
    viewNoteUrl,
    rawSubject: subject,
    rawFrom: from,
    createdAt: new Date(),
  };
}
