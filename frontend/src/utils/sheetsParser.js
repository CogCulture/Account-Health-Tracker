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

  // 1. Locate the general header region. We search for "jsr call" in the first 10 rows.
  let hIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i] || [];
    if (row.some(cell => cell?.toString().toLowerCase().includes('jsr call'))) {
      hIdx = i;
      break;
    }
  }

  if (hIdx === -1) {
    throw new Error(
      `Daily Tracker format invalid. Could not find column headers (missing "Daily JSR Call") in tab "${clientName}".`
    );
  }

  // To be robust against row offsets (e.g. July headers in Row 7, June headers in Row 3),
  // we look at the first 10 rows for all header-matching.
  const maxHeaderRows = Math.min(10, rows.length);
  
  // Find all columns that represent a "Date" column in any of the first 10 rows
  const dateCols = [];
  const maxCols = Math.max(...rows.slice(0, maxHeaderRows).map(r => r.length));
  
  for (let c = 0; c < maxCols; c++) {
    for (let r = 0; r < maxHeaderRows; r++) {
      const val = (rows[r]?.[c] || '').toString().toLowerCase().trim();
      if (val === 'date' || val === 'date ') {
        dateCols.push(c);
        break;
      }
    }
  }

  // Fallback: if no date column is found, default to column index 3 (Column D)
  if (dateCols.length === 0) {
    dateCols.push(3);
  }

  // We check if a subheader row exists (contains "name", "attend", etc.)
  // We check Row 4 and Row 7 since they are the common subheader levels
  const isSubheader = [4, 7].some(rIdx => {
    const r = rows[rIdx] || [];
    return r.some(cell => {
      const txt = cell?.toString().toLowerCase().trim();
      return txt === 'name' || txt === 'attend' || txt === 'attendance' || txt === 'yes/no' || txt === 'y/n';
    });
  });

  // Parse each block
  const blocks = dateCols.map((dateIdx, bIdx) => {
    const startCol = Math.max(0, dateIdx - 2);
    const endCol = (bIdx < dateCols.length - 1) ? dateCols[bIdx + 1] - 1 : maxCols - 1;

    const colMap = {
      date: dateIdx, mode: -1, jsrCall: -1,
      jsrName: -1, jsrVerified: -1,
      clientServicingAttend: -1,
      designAttend: -1, contentName: -1, strategyName: -1,
      creativeAttend: -1,
      managementAttend: -1, managementName: -1,
      clientUnavailable: -1,
    };

    for (let idx = startCol; idx <= endCol; idx++) {
      // Gather all texts in this column for the first 10 rows
      const colCells = [];
      for (let r = 0; r < maxHeaderRows; r++) {
        const val = (rows[r]?.[idx] || '').toString().toLowerCase().trim();
        if (val) colCells.push(val);
      }
      const combined = colCells.join(' ');

      if (colCells.includes('mode')) colMap.mode = idx;

      if (combined.includes('client unavailable') || combined.includes('unavailable') || combined.includes('client not available')) {
        colMap.clientUnavailable = idx;
      }

      if (colCells.some(c => c.includes('jsr call') || c === 'jsr')) {
        if (colMap.jsrCall === -1) colMap.jsrCall = idx;
        // Check if there's a name sub-column in this same index
        if (colCells.includes('name')) colMap.jsrName = idx;
      }
      // If we didn't find jsrName directly, check nearby cells in subHeaders (usually the next column)
      if (colMap.jsrCall !== -1 && colMap.jsrName === -1) {
        for (let off = 0; off <= 2 && colMap.jsrCall + off <= endCol; off++) {
          const nextIdx = colMap.jsrCall + off;
          // check if "name" is in nextIdx's first 10 rows
          const nextColCells = [];
          for (let r = 0; r < maxHeaderRows; r++) {
            const val = (rows[r]?.[nextIdx] || '').toString().toLowerCase().trim();
            if (val) nextColCells.push(val);
          }
          if (nextColCells.includes('name')) {
            colMap.jsrName = nextIdx;
            break;
          }
        }
      }

      if (combined.includes('verified') || combined.includes('deepakshi')) {
        colMap.jsrVerified = idx;
      }

      if (combined.includes('client servicing')) {
        // Find the "attend" column nearby
        for (let off = 0; off <= 2 && idx + off <= endCol; off++) {
          const checkIdx = idx + off;
          const isAttend = rows.slice(0, maxHeaderRows).some(r => isAttendSubheader(r[checkIdx]));
          if (isAttend) { colMap.clientServicingAttend = checkIdx; break; }
        }
      }

      if (combined.includes('design')) {
        for (let off = 0; off <= 2 && idx + off <= endCol; off++) {
          const checkIdx = idx + off;
          const isAttend = rows.slice(0, maxHeaderRows).some(r => isAttendSubheader(r[checkIdx]));
          if (isAttend) { colMap.designAttend = checkIdx; break; }
        }
      }

      if (combined.includes('creative')) {
        for (let off = 0; off <= 2 && idx + off <= endCol; off++) {
          const targetIdx = idx + off;
          const isAttend = rows.slice(0, maxHeaderRows).some(r => isAttendSubheader(r[targetIdx]));
          if (isAttend) { colMap.creativeAttend = targetIdx; break; }
        }
      }

      if (combined.includes('management')) {
        for (let off = 0; off <= 3 && idx + off <= endCol; off++) {
          const targetIdx = idx + off;
          const colVals = rows.slice(0, maxHeaderRows).map(r => (r[targetIdx] || '').toString().toLowerCase().trim());
          if (colVals.includes('name') && colMap.managementName === -1) colMap.managementName = targetIdx;
          if (colVals.some(v => isAttendSubheader(v)) && colMap.managementAttend === -1) colMap.managementAttend = targetIdx;
        }
      }

      if (combined.includes('content')) colMap.contentName = idx;
      if (combined.includes('strategy') || combined.includes('stratergy')) {
        colMap.strategyName = idx;
      }
    }

    return colMap;
  });

  const records = [];
  // For data start index, since data starts after headers, we can just start from Row 5.
  // Any row that doesn't have a valid parsed date in the date column will be skipped automatically!
  for (let i = 5; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.length === 0) continue;

    blocks.forEach(colMap => {
      const dateVal = row[colMap.date];
      if (dateVal === undefined || dateVal === '' ||
          dateVal?.toString().toLowerCase().includes('weekend')) return;

      const dateParsed = parseExcelDate(dateVal);
      if (!dateParsed) return;

      const mode    = colMap.mode !== -1 ? (row[colMap.mode] ?? '').toString().trim() : '';
      const jsrCell = colMap.jsrCall !== -1 ? row[colMap.jsrCall] : false;
      const jsrCall = isAttendeeTruthy(jsrCell);

      const rawCells = row.map(c => c?.toString() || '');
      const clientUnavailCell = colMap.clientUnavailable !== -1 ? row[colMap.clientUnavailable] : null;
      const clientUnavailable = (
        (clientUnavailCell !== null && isAttendeeTruthy(clientUnavailCell)) ||
        mode.toLowerCase().includes('client unavailable') ||
        mode.toLowerCase().includes('unavailable') ||
        mode.toLowerCase().includes('client leave') ||
        mode.toLowerCase().includes('client off') ||
        rawCells.some(c => {
          const txt = c.toLowerCase().trim();
          return txt === 'client unavailable' || txt === 'unavailable' || txt === 'client not available' || txt === 'client leave';
        })
      );

      records.push({
        date: dateParsed,
        mode,
        jsrCall,
        clientUnavailable,
        jsrVerified:         colMap.jsrVerified      !== -1 ? isAttendeeTruthy(row[colMap.jsrVerified])  : false,
        jsrNameCol:          colMap.jsrName           !== -1 ? row[colMap.jsrName]         : null,
        creativeAttendCol:   colMap.creativeAttend   !== -1 ? row[colMap.creativeAttend]   : null,
        managementAttendCol: colMap.managementAttend !== -1 ? row[colMap.managementAttend] : null,
        managementNameCol:   colMap.managementName   !== -1 ? row[colMap.managementName]   : null,
        designAttendCol:     colMap.designAttend     !== -1 ? row[colMap.designAttend]     : null,
        contentNameCol:      colMap.contentName      !== -1 ? row[colMap.contentName]      : null,
        strategyNameCol:     colMap.strategyName     !== -1 ? row[colMap.strategyName]     : null,
        rawRowCells: rawCells,
      });
    });
  }

  // Sort records by date ascending
  records.sort((a, b) => a.date.getTime() - b.date.getTime());

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

  // 1. Locate header row flexibly (search for 'job id' first, then 'deliverable', 'deliverables', 'job name', 'job type', or 'brief date')
  let hIdx = findHeaderRow(rows, 'job id');
  if (hIdx === -1) hIdx = findHeaderRow(rows, 'deliverable');
  if (hIdx === -1) hIdx = findHeaderRow(rows, 'deliverables');
  if (hIdx === -1) hIdx = findHeaderRow(rows, 'job name');
  if (hIdx === -1) hIdx = findHeaderRow(rows, 'job type');
  if (hIdx === -1) hIdx = findHeaderRow(rows, 'brief date');

  if (hIdx === -1) {
    throw new Error(
      `Job Tracker format invalid. Could not find column headers in tab "${clientName}".`
    );
  }

  const headers = rows[hIdx] || [];

  const colMap = {
    jobId: -1, deliverable: -1, jobType: -1, status: -1,
    briefDate: -1, clientTimeline: -1, deliveryDate: -1,
    closingDate: -1, timelineStatus: -1, priority: -1, escalation: -1,
    clientAlteration: -1,
  };

  headers.forEach((h, idx) => {
    const txt = (h || '').toString().toLowerCase().trim();
    if (txt === 'job id' || txt === 'job_id') colMap.jobId = idx;
    if (txt === 'deliverable' || txt === 'deliverables' || txt.includes('deliverable') || txt === 'job name' || txt === 'task') colMap.deliverable = idx;
    if (txt === 'job type' || txt.includes('job type')) colMap.jobType = idx;
    if (txt === 'status') colMap.status = idx;
    if (txt === 'brief date' || txt.includes('brief date')) colMap.briefDate = idx;
    if (txt === 'client timeline' || txt === 'client_timeline' || txt === 'external timeline' || txt.includes('client timeline')) colMap.clientTimeline = idx;
    if (txt.includes('delivery date') || txt === 'delivery_date') colMap.deliveryDate = idx;
    if (txt.includes('closing date') || txt.includes('job closing date') || txt === 'closing_date') colMap.closingDate = idx;
    if (txt === 'timeline status') colMap.timelineStatus = idx;
    if (txt === 'priority' || txt === 'prority') colMap.priority = idx;
    if (txt === 'escalation' || txt === 'escalations' || txt === 'escalated') colMap.escalation = idx;
    if (txt.includes('client alteration') || txt.includes('client_alteration') || txt.includes('alteration') || txt.includes('client revert') || txt === 'reverts') colMap.clientAlteration = idx;
  });

  const records = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    
    let jobId = '';
    if (colMap.jobId !== -1 && row[colMap.jobId]) {
      jobId = row[colMap.jobId];
    } else {
      const deliverable = colMap.deliverable !== -1 ? row[colMap.deliverable] : '';
      const jobType = colMap.jobType !== -1 ? row[colMap.jobType] : '';
      if (!deliverable && !jobType && !row[0]) continue;
      jobId = `job-${i}`;
    }

    let clientAlterations = 0;
    if (colMap.clientAlteration !== -1 && row[colMap.clientAlteration] != null) {
      const val = row[colMap.clientAlteration];
      if (typeof val === 'number') {
        clientAlterations = val;
      } else if (typeof val === 'boolean') {
        clientAlterations = val ? 1 : 0;
      } else {
        const str = val.toString().trim();
        const num = parseInt(str, 10);
        if (!isNaN(num)) {
          clientAlterations = num;
        } else if (str.toLowerCase() === 'true' || str.toLowerCase() === 'yes' || str.toLowerCase() === 'y') {
          clientAlterations = 1;
        } else {
          clientAlterations = str ? 1 : 0;
        }
      }
    }

    records.push({
      jobId,
      deliverable:        colMap.deliverable        !== -1 ? row[colMap.deliverable]        : '',
      jobType:            colMap.jobType            !== -1 ? row[colMap.jobType]            : '',
      status:             colMap.status             !== -1 ? row[colMap.status]             : '',
      timelineStatus:     colMap.timelineStatus     !== -1 ? row[colMap.timelineStatus]     : '',
      briefDate:          parseExcelDate(colMap.briefDate      !== -1 ? row[colMap.briefDate]      : null),
      clientTimeline:     parseExcelDate(colMap.clientTimeline !== -1 ? row[colMap.clientTimeline] : null),
      deliveryDate:       parseExcelDate(colMap.deliveryDate   !== -1 ? row[colMap.deliveryDate]   : null),
      closingDate:        parseExcelDate(colMap.closingDate    !== -1 ? row[colMap.closingDate]    : null),
      priority:           colMap.priority           !== -1 ? row[colMap.priority]           : '',
      escalation:         colMap.escalation         !== -1 ? row[colMap.escalation]         : '',
      clientAlterations,
    });
  }

  return records;
}
