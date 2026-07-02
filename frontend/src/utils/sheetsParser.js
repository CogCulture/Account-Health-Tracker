/**
 * sheetsParser.js
 *
 * Parses 2D arrays returned by the Google Sheets API into the same row
 * format that scoreEngine.js expects.
 *
 * Google Sheets API returns dates as Excel-style serial numbers when using
 * UNFORMATTED_VALUE + SERIAL_NUMBER render options — so we reuse the same
 * parseExcelDate helper.
 */

/**
 * Converts a Google Sheets / Excel date serial number (or date string) to
 * a UTC Date object.  Returns null on failure.
 */
export function parseExcelDate(val) {
  if (val === undefined || val === null || val === '') return null;

  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  const parsed = new Date(val);
  if (isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Find the first row index whose cells contain a specific substring.
 */
function findHeaderRow(rows, needle) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.some(cell => cell?.toString().toLowerCase().includes(needle))) {
      return i;
    }
  }
  return -1;
}

/** Check whether a subheader cell marks an attendance column. */
function isAttendSubheader(cell) {
  const txt = (cell || '').toString().toLowerCase().trim();
  return (
    txt === 'attend' ||
    txt === 'attendance' ||
    txt === 'yes/no' ||
    txt === 'y/n' ||
    txt === 'present' ||
    txt.startsWith('attend')
  );
}

/** Resolve any attendance-like cell to a boolean. */
function isAttendeeTruthy(val) {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val > 0;
  const lower = val.toString().toLowerCase().trim();
  if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'y') return true;
  if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'n' ||
      lower === 'n/a' || lower === 'none' || lower === 'absent') return false;
  return lower.length > 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List the unique tab names available in both sheet data maps.
 * Used to populate the client dropdown.
 *
 * @param {string[]} dailyTabs   - Tab names from the Daily Tracker sheet
 * @param {string[]} jobTabs     - Tab names from the Job Tracker sheet
 * @returns {string[]}           - Names present in both (case-insensitive), in Daily order
 */
export function getCommonClientTabs(dailyTabs, jobTabs) {
  const IGNORED = ['template', 'instruction', 'instructions', 'readme'];
  return dailyTabs.filter(dt => {
    const dtl = dt.toLowerCase().trim();
    if (IGNORED.includes(dtl) || dtl.startsWith('sheet')) return false;
    return jobTabs.some(jt => jt.toLowerCase().trim() === dtl);
  });
}

/**
 * Parses the Daily Tracker 2D array for a specific client tab.
 *
 * @param {any[][]} rows      - 2D array from Google Sheets API
 * @param {string} clientName - The tab name (sheet) to parse
 * @returns {object[]}        - Array of daily row records
 */
export function parseDailyTrackerRows(rows, clientName) {
  if (!rows || rows.length === 0) {
    throw new Error(`Daily Tracker tab "${clientName}" is empty.`);
  }

  // 1. Locate header row
  const hIdx = findHeaderRow(rows, 'jsr call');
  if (hIdx === -1) {
    throw new Error(
      `Daily Tracker format invalid. Could not find column headers (missing "Daily JSR Call") in tab "${clientName}".`
    );
  }

  const mainHeaders = rows[hIdx] || [];
  const subHeaders  = rows[hIdx + 1] || [];

  // Detect subheader row
  const isSubheader = subHeaders.some(cell => {
    const txt = cell?.toString().toLowerCase().trim();
    return (
      txt === 'name' || txt === 'attend' || txt === 'attendance' ||
      txt === 'yes/no' || txt === 'y/n' || txt === 'present'
    );
  });

  const dataStartIdx = isSubheader ? hIdx + 2 : hIdx + 1;

  // 2. Map column indices
  const colMap = {
    date: -1, mode: -1, jsrCall: -1,
    jsrName: -1, jsrVerified: -1,
    clientServicingAttend: -1,
    designAttend: -1, contentName: -1, strategyName: -1,
    creativeAttend: -1,
    managementAttend: -1, managementName: -1,
  };

  const firstSeen = { design: false, creative: false, management: false, clientServicing: false };

  mainHeaders.forEach((h, idx) => {
    const ht = (h || '').toString().toLowerCase().trim();

    if (ht.includes('date')) colMap.date = idx;
    if (ht.includes('mode')) colMap.mode = idx;

    if (ht.includes('jsr call') || ht === 'jsr') {
      colMap.jsrCall = idx;
      // look for a name sub-column nearby
      if (isSubheader) {
        for (let off = 0; off <= 2; off++) {
          const sub = (subHeaders[idx + off] || '').toString().toLowerCase().trim();
          if (sub === 'name') { colMap.jsrName = idx + off; break; }
        }
      }
    }

    // Deepakshi verification column
    if (ht.includes('verified') || ht.includes('deepakshi')) {
      colMap.jsrVerified = idx;
    }

    if (ht.includes('client servicing')) {
      if (isSubheader) {
        for (let off = 0; off <= 2; off++) {
          if (isAttendSubheader(subHeaders[idx + off])) { colMap.clientServicingAttend = idx + off; break; }
        }
      } else if (!firstSeen.clientServicing) {
        colMap.clientServicingAttend = idx; firstSeen.clientServicing = true;
      }
    }

    if (ht.includes('design')) {
      if (isSubheader) {
        for (let off = 0; off <= 2; off++) {
          if (isAttendSubheader(subHeaders[idx + off])) { colMap.designAttend = idx + off; break; }
        }
      } else if (!firstSeen.design) {
        colMap.designAttend = idx; firstSeen.design = true;
      }
    }

    if (ht.includes('creative')) {
      if (isSubheader) {
        for (let off = 0; off <= 2; off++) {
          if (isAttendSubheader(subHeaders[idx + off])) { colMap.creativeAttend = idx + off; break; }
        }
      } else if (!firstSeen.creative) {
        colMap.creativeAttend = idx; firstSeen.creative = true;
      }
    }

    if (ht.includes('management')) {
      if (isSubheader) {
        for (let off = 0; off <= 3; off++) {
          const sub = (subHeaders[idx + off] || '').toString().toLowerCase().trim();
          if (sub === 'name' && colMap.managementName === -1) colMap.managementName = idx + off;
          if (isAttendSubheader(subHeaders[idx + off]) && colMap.managementAttend === -1) colMap.managementAttend = idx + off;
        }
      } else if (!firstSeen.management) {
        colMap.managementAttend = idx; firstSeen.management = true;
      }
    }

    if (ht.includes('content')) colMap.contentName = idx;
    if (ht.includes('strategy') || ht.includes('stratergy')) colMap.strategyName = idx;
  });

  const sheetHasDesignOrCreativeCol =
    colMap.creativeAttend !== -1 || colMap.designAttend !== -1;

  // 3. Extract records
  const records = [];
  for (let i = dataStartIdx; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.length === 0) continue;

    const dateVal = row[colMap.date !== -1 ? colMap.date : 3];
    if (dateVal === undefined || dateVal === '' ||
        dateVal?.toString().toLowerCase().includes('weekend')) continue;

    const dateParsed = parseExcelDate(dateVal);
    if (!dateParsed) continue;

    const mode    = colMap.mode !== -1 ? (row[colMap.mode] ?? '').toString().trim() : '';
    const jsrCell = colMap.jsrCall !== -1 ? row[colMap.jsrCall] : false;
    const jsrCall = isAttendeeTruthy(jsrCell);

    records.push({
      date: dateParsed,
      mode,
      jsrCall,
      jsrVerified:         colMap.jsrVerified      !== -1 ? isAttendeeTruthy(row[colMap.jsrVerified])  : false,
      jsrNameCol:          colMap.jsrName           !== -1 ? row[colMap.jsrName]         : null,
      creativeAttendCol:   colMap.creativeAttend   !== -1 ? row[colMap.creativeAttend]   : null,
      managementAttendCol: colMap.managementAttend !== -1 ? row[colMap.managementAttend] : null,
      managementNameCol:   colMap.managementName   !== -1 ? row[colMap.managementName]   : null,
      designAttendCol:     colMap.designAttend     !== -1 ? row[colMap.designAttend]     : null,
      contentNameCol:      colMap.contentName      !== -1 ? row[colMap.contentName]      : null,
      strategyNameCol:     colMap.strategyName     !== -1 ? row[colMap.strategyName]     : null,
      rawRowCells: row.map(c => c?.toString() || ''),
    });
  }

  return records;
}

/**
 * Parses the Job Tracker 2D array for a specific client tab.
 *
 * @param {any[][]} rows      - 2D array from Google Sheets API
 * @param {string} clientName - The tab name (sheet) to parse
 * @returns {object[]}        - Array of job row records
 */
export function parseJobTrackerRows(rows, clientName, isPanasonic = false) {
  if (!rows || rows.length === 0) {
    throw new Error(`Job Tracker tab "${clientName}" is empty.`);
  }

  const isPanasonicCheck = isPanasonic || (clientName || '').toLowerCase().includes('panasonic');
  const needle = isPanasonicCheck ? 'deliverable' : 'job id';

  // 1. Locate header row
  const hIdx = findHeaderRow(rows, needle);
  if (hIdx === -1) {
    throw new Error(
      `Job Tracker format invalid. Could not find column headers (missing "${needle.toUpperCase()}") in tab "${clientName}".`
    );
  }

  const headers = rows[hIdx] || [];

  const colMap = {
    jobId: -1, deliverable: -1, jobType: -1, status: -1,
    briefDate: -1, clientTimeline: -1, deliveryDate: -1,
    closingDate: -1, timelineStatus: -1, priority: -1, escalation: -1,
  };

  headers.forEach((h, idx) => {
    const txt = (h || '').toString().toLowerCase().trim();
    if (txt === 'job id' || txt === 'job_id') colMap.jobId = idx;
    // 'deliverables' (plural) is Panasonic's column name
    if (txt === 'deliverable' || (isPanasonicCheck && txt === 'deliverables')) colMap.deliverable = idx;
    if (txt === 'job type')                   colMap.jobType = idx;
    if (txt === 'status')                     colMap.status = idx;
    if (txt === 'brief date')                 colMap.briefDate = idx;
    // Panasonic uses 'External Timeline' for the client-facing deadline
    if (txt === 'client timeline' || txt === 'client_timeline' || (isPanasonicCheck && txt === 'external timeline')) colMap.clientTimeline = idx;
    if (txt.includes('delivery date') || txt === 'delivery_date') colMap.deliveryDate = idx;
    if (txt.includes('job closing date') || txt === 'closing_date') colMap.closingDate = idx;
    if (txt === 'timeline status')            colMap.timelineStatus = idx;
    // 'prority' (sic) is Panasonic's misspelled column name
    if (txt === 'priority' || (isPanasonicCheck && txt === 'prority')) colMap.priority = idx;
    if (txt === 'escalation' || txt === 'escalations' || txt === 'escalated') colMap.escalation = idx;
  });

  const records = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    
    let jobId = '';
    if (isPanasonicCheck) {
      const deliverable = colMap.deliverable !== -1 ? row[colMap.deliverable] : '';
      if (!deliverable) continue;
      jobId = `panasonic-job-${i}`;
    } else {
      jobId = row[colMap.jobId !== -1 ? colMap.jobId : 0];
      if (!jobId) continue;
    }

    records.push({
      jobId,
      deliverable:    colMap.deliverable    !== -1 ? row[colMap.deliverable]    : '',
      jobType:        colMap.jobType        !== -1 ? row[colMap.jobType]        : '',
      status:         colMap.status         !== -1 ? row[colMap.status]         : '',
      timelineStatus: colMap.timelineStatus !== -1 ? row[colMap.timelineStatus] : '',
      briefDate:      parseExcelDate(colMap.briefDate      !== -1 ? row[colMap.briefDate]      : null),
      clientTimeline: parseExcelDate(colMap.clientTimeline !== -1 ? row[colMap.clientTimeline] : null),
      deliveryDate:   parseExcelDate(colMap.deliveryDate   !== -1 ? row[colMap.deliveryDate]   : null),
      closingDate:    parseExcelDate(colMap.closingDate    !== -1 ? row[colMap.closingDate]    : null),
      priority:       colMap.priority       !== -1 ? row[colMap.priority]       : '',
      escalation:     colMap.escalation     !== -1 ? row[colMap.escalation]     : '',
    });
  }

  return records;
}
