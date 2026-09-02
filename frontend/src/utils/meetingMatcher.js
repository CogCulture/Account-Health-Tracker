/**
 * meetingMatcher.js
 * 
 * Utilities to match meetings with specific client brands, group and deduplicate
 * multiple email notes on the same calendar day into 1 meeting day, and calculate
 * attendance metrics and attendee lists for the Internal Meeting dashboard card and drawer.
 */

/**
 * Calculates total weekdays (Mon-Fri) in a given month and year.
 * If evaluating the current month, caps up to today.
 */
export function calculateWorkingDaysInMonth(month, year) {
  const today = new Date();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
  const lastDay = isCurrentMonth
    ? today.getDate()
    : new Date(year, month + 1, 0).getDate();

  let workingDays = 0;
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month, day);
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip Sun (0) and Sat (6)
      workingDays++;
    }
  }
  return workingDays > 0 ? workingDays : 21;
}

/**
 * Checks if a meeting insight matches a given client brand name.
 * 
 * @param {object} meeting - The meeting object from backend meetingInsights
 * @param {string} clientName - Client brand label (e.g. "Reach (POD1)", "SRHU Mainline", "Bharti RET")
 * @returns {boolean}
 */
export function isMeetingForBrand(meeting, clientName) {
  if (!meeting || !clientName) return false;

  // Clean the client name by stripping POD annotations, RET/PROJ tags, and parentheses
  const cleanClient = String(clientName)
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\b(ret|proj|pod\s*\d+)\b/gi, '')
    .trim();

  if (!cleanClient) return false;

  // Extract core search tokens (ignoring generic terms)
  const brandKeywords = cleanClient
    .split(/[\s-_/]+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2 && !['mainline', 'brand', 'team', 'group', 'india', 'corp', 'the', 'and'].includes(w));

  if (brandKeywords.length === 0 && cleanClient.length >= 2) {
    brandKeywords.push(cleanClient);
  }

  const title = (meeting.meetingTitle || '').toLowerCase();
  const subject = (meeting.rawSubject || '').toLowerCase();
  const summary = (meeting.summary || '').toLowerCase();
  const notes = (meeting.notesBody || meeting.transcriptText || '').toLowerCase();
  const jobs = Array.isArray(meeting.jobsDiscussed)
    ? meeting.jobsDiscussed.map(j => `${j.job || ''} ${j.insights || ''}`).join(' ').toLowerCase()
    : '';

  const titleAndSubject = `${title} ${subject}`;
  const fullText = `${title} ${subject} ${summary} ${notes} ${jobs}`;

  // 1. Direct match with cleaned brand name
  if (cleanClient.length >= 3 && fullText.includes(cleanClient)) {
    return true;
  }

  // 2. Check title & subject for any of the brand keywords with word boundary
  for (const kw of brandKeywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(titleAndSubject)) {
      return true;
    }
  }

  // 3. If brand has multiple keywords, check if all match in full text
  if (brandKeywords.length > 1 && brandKeywords.every(kw => fullText.includes(kw))) {
    return true;
  }

  // 4. Substring check in title or subject
  if (brandKeywords.some(kw => titleAndSubject.includes(kw))) {
    return true;
  }

  return false;
}

/**
 * Computes internal meeting attendance statistics and daily aggregated logs for a brand.
 * 
 * Deduplication Rule: Multiple emails/notes logged on the same calendar day are counted
 * as ONE meeting day, while aggregating all attendees and meeting contents.
 * 
 * @param {Array<object>} allMeetings - Array of all meetings from meetingsApi
 * @param {string} clientName - Client brand name
 * @param {number} selectedMonth - 0-indexed month (0 = January)
 * @param {number} selectedYear - 4-digit year (e.g. 2026)
 * @param {number} [totalWorkingDaysProp] - Optional total working days from P1
 * @returns {object} Internal meeting metrics object
 */
export function computeInternalMeetingMetrics(allMeetings = [], clientName, selectedMonth, selectedYear, totalWorkingDaysProp) {
  if (!Array.isArray(allMeetings) || !clientName) {
    const totalWorkingDays = totalWorkingDaysProp || calculateWorkingDaysInMonth(selectedMonth, selectedYear);
    return {
      attendedDays: 0,
      totalWorkingDays,
      missedDays: totalWorkingDays,
      attendanceRate: 0,
      score: 0,
      totalNotesCount: 0,
      daysList: [],
      rawMeetings: [],
    };
  }

  // 1. Filter meetings for brand and selected month/year
  const brandMonthMeetings = allMeetings.filter(meeting => {
    if (!isMeetingForBrand(meeting, clientName)) return false;

    const rawDate = meeting.meetingDate || meeting.createdAt;
    if (!rawDate) return false;
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return false;

    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
  });

  // 2. Group meetings by calendar date (YYYY-MM-DD)
  // Deduplication: Multiple emails on the same day count as 1 meeting day!
  const dayMap = {};

  brandMonthMeetings.forEach(meeting => {
    const rawDate = meeting.meetingDate || meeting.createdAt;
    const d = new Date(rawDate);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (!dayMap[dateKey]) {
      dayMap[dateKey] = {
        dateKey,
        date: d,
        meetings: [],
        attendeesSet: new Set(),
      };
    }

    dayMap[dateKey].meetings.push(meeting);

    // Collect attendees
    if (Array.isArray(meeting.attendees)) {
      meeting.attendees.forEach(att => {
        if (typeof att === 'string' && att.trim()) {
          dayMap[dateKey].attendeesSet.add(att.trim());
        }
      });
    }

    if (meeting.sharedBy && typeof meeting.sharedBy === 'string' && meeting.sharedBy.trim()) {
      dayMap[dateKey].attendeesSet.add(meeting.sharedBy.trim());
    }
  });

  // 3. Build sorted list of meeting days (most recent first)
  const daysList = Object.values(dayMap)
    .map(item => ({
      dateKey: item.dateKey,
      date: item.date,
      meetingsCount: item.meetings.length,
      attendees: Array.from(item.attendeesSet),
      meetings: item.meetings,
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  // 4. Calculate attendance metrics
  const attendedDays = daysList.length;
  const totalWorkingDays = totalWorkingDaysProp || calculateWorkingDaysInMonth(selectedMonth, selectedYear);
  const missedDays = Math.max(0, totalWorkingDays - attendedDays);
  const attendanceRate = totalWorkingDays > 0 ? (attendedDays / totalWorkingDays) * 100 : 0;

  // Calculate score out of 10
  // Benchmark: >=90% -> 10, >=75% -> 8, >=60% -> 6, >=50% -> 4, >0 -> proportional, 0 -> 0
  let score = 0;
  if (attendanceRate >= 90) score = 10;
  else if (attendanceRate >= 75) score = 8;
  else if (attendanceRate >= 60) score = 6;
  else if (attendanceRate >= 50) score = 4;
  else if (attendanceRate > 0) score = Math.max(1, Math.round((attendanceRate / 10) * 10) / 10);

  return {
    attendedDays,
    totalWorkingDays,
    missedDays,
    attendanceRate,
    score,
    totalNotesCount: brandMonthMeetings.length,
    daysList,
    rawMeetings: brandMonthMeetings,
  };
}
