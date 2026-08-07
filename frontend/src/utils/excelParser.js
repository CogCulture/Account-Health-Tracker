import * as XLSX from 'xlsx';

/**
 * Parses an Excel file into a workbook object
 */
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        resolve(workbook);
      } catch (err) {
        reject(new Error(`Failed to parse Excel file: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Detects if a workbook is a Daily Tracker or a Job Tracker
 * @param {XLSX.Workbook} workbook 
 * @returns {'daily' | 'job' | 'unknown'}
 */
export function detectWorkbookType(workbook) {
  if (!workbook || !workbook.SheetNames.length) return 'unknown';

  let hasJobSheets = false;
  let hasDailySheets = false;

  // Check sheets for key indicators
  for (let sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    // Scan first 10 rows for header indicators
    for (let r = 0; r < Math.min(10, rows.length); r++) {
      const row = rows[r];
      if (!row) continue;
      
      const rowText = row.map(cell => cell.toString().toLowerCase().trim());
      
      if (rowText.some(cell => cell === 'job id' || cell === 'job_id')) {
        hasJobSheets = true;
      }
      if (rowText.some(cell => cell.includes('daily jsr call') || cell.includes('jsr call'))) {
        hasDailySheets = true;
      }
    }
  }

  // Prioritize job sheets classification
  if (hasJobSheets) return 'job';
  if (hasDailySheets) return 'daily';

  return 'unknown';
}

/**
 * Helper to parse Excel dates timezone-safely
 */
export function parseExcelDate(val) {
  if (val === undefined || val === null || val === '') return null;
  
  if (typeof val === 'number') {
    // Math.round is used to avoid floating point imprecisions with seconds
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    // Normalize to UTC Date representation to prevent timezone shifts
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  
  const parsed = new Date(val);
  if (isNaN(parsed.getTime())) return null;
  // Strip time for clean comparison
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

/**
 * Parses and extracts daily tracker rows for a specific client worksheet
 */
export function parseDailyTrackerRows(workbook, clientName) {
  // Find worksheet matching client name (case insensitive)
  const targetSheetName = workbook.SheetNames.find(name => 
    name.toLowerCase().trim() === clientName.toLowerCase().trim()
  );

  if (!targetSheetName) {
    throw new Error(`Worksheet for client "${clientName}" not found in uploaded Daily Tracker.`);
  }

  const sheet = workbook.Sheets[targetSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // 1. Locate header row
  let hIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.some(cell => cell.toString().toLowerCase().includes('daily jsr call'))) {
      hIdx = i;
      break;
    }
  }

  if (hIdx === -1) {
    throw new Error(`Daily Tracker format invalid. Could not find column headers (missing "Daily JSR Call") in sheet "${targetSheetName}".`);
  }

  const mainHeaders = rows[hIdx];
  const subHeaders = rows[hIdx + 1] || [];

  // Determine if there is a subheader row (contains 'Name' or 'Attend' variants)
  const isSubheader = subHeaders.some(cell => {
    const txt = cell.toString().toLowerCase().trim();
    return (
      txt === 'name' ||
      txt === 'attend' ||
      txt === 'attendance' ||
      txt === 'yes/no' ||
      txt === 'y/n' ||
      txt === 'present'
    );
  });

  const dataStartIdx = isSubheader ? hIdx + 2 : hIdx + 1;

  // Map header indices
  let colMap = {
    date: -1,
    mode: -1,
    jsrCall: -1,
    clientServicingAttend: -1,
    designAttend: -1,
    contentName: -1,
    strategyName: -1,
    creativeAttend: -1,
    managementAttend: -1,
    managementName: -1,
  };

  // Scan main headers
  // For sheets WITHOUT a subheader (isSubheader=false), some sheets use paired columns:
  //   [Design checkbox] [Design name] [Creative checkbox] [Creative name] ...
  // In this layout, the FIRST occurrence of each team header = the attendance boolean,
  // and the SECOND occurrence = the name field. We use firstSeenTeam to track this.
  const firstSeenTeam = { design: false, creative: false, management: false, clientServicing: false };

  // Helper: check if a subheader cell indicates an attendance column
  const isAttendSubheader = (cell) => {
    const txt = (cell || '').toString().toLowerCase().trim();
    return (
      txt === 'attend' ||
      txt === 'attendance' ||
      txt === 'yes/no' ||
      txt === 'y/n' ||
      txt === 'present' ||
      txt.startsWith('attend')
    );
  };

  mainHeaders.forEach((h, idx) => {
    const headerText = h.toString().toLowerCase().trim();
    if (headerText.includes('date')) colMap.date = idx;
    if (headerText.includes('mode')) colMap.mode = idx;
    if (headerText.includes('jsr call') || headerText.includes('jsr')) colMap.jsrCall = idx;

    // CS Team
    if (headerText.includes('client servicing')) {
      if (isSubheader) {
        // Main header is merged: "Client Servicing Team" spans [idx]=Name, [idx+1]=Attend
        // Find the Attend subheader within the next 2 columns
        for (let offset = 0; offset <= 2; offset++) {
          if (isAttendSubheader(subHeaders[idx + offset])) {
            colMap.clientServicingAttend = idx + offset;
            break;
          }
        }
      } else if (!firstSeenTeam.clientServicing) {
        colMap.clientServicingAttend = idx;
        firstSeenTeam.clientServicing = true;
      }
    }

    // Design Team
    if (headerText.includes('design')) {
      if (isSubheader) {
        for (let offset = 0; offset <= 2; offset++) {
          if (isAttendSubheader(subHeaders[idx + offset])) {
            colMap.designAttend = idx + offset;
            break;
          }
        }
      } else if (!firstSeenTeam.design) {
        colMap.designAttend = idx;
        firstSeenTeam.design = true;
      }
    }

    // Creative Team
    if (headerText.includes('creative')) {
      if (isSubheader) {
        for (let offset = 0; offset <= 2; offset++) {
          if (isAttendSubheader(subHeaders[idx + offset])) {
            colMap.creativeAttend = idx + offset;
            break;
          }
        }
      } else if (!firstSeenTeam.creative) {
        colMap.creativeAttend = idx;
        firstSeenTeam.creative = true;
      }
    }

    // Management Team
    if (headerText.includes('management')) {
      if (isSubheader) {
        for (let offset = 0; offset <= 2; offset++) {
          const subTxt = (subHeaders[idx + offset] || '').toString().toLowerCase().trim();
          if (isAttendSubheader(subHeaders[idx + offset])) {
            colMap.managementAttend = idx + offset;
          } else if (subTxt === 'name' || subTxt.includes('name')) {
            colMap.managementName = idx + offset;
          }
        }
      } else if (!firstSeenTeam.management) {
        colMap.managementAttend = idx;
        firstSeenTeam.management = true;
      }
    }

    // Content Team (name-only column, used for creative scoring)
    if (headerText.includes('content')) colMap.contentName = idx;

    // Strategy Team (name-only column)
    if (headerText.includes('strategy') || headerText.includes('stratergy')) colMap.strategyName = idx;
  });

  // Extract records
  const records = [];
  for (let i = dataStartIdx; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Check if it is a valid date row (a cell in date column should be present)
    const dateVal = row[colMap.date !== -1 ? colMap.date : 3]; // fallback to index 3
    if (dateVal === undefined || dateVal === '' || dateVal.toString().toLowerCase().includes('weekend')) {
      continue;
    }

    const dateParsed = parseExcelDate(dateVal);
    if (!dateParsed) {
      console.warn('[excelParser] Could not parse date:', dateVal, 'in row', i);
      continue; // Skip separator rows or notes
    }

    // Check mode
    const mode = colMap.mode !== -1 ? row[colMap.mode]?.toString().trim() : '';

    // Check JSR Call
    const jsrCell = colMap.jsrCall !== -1 ? row[colMap.jsrCall] : false;
    const jsrCall = jsrCell === true || 
                   jsrCell === 'TRUE' || 
                   jsrCell === 'True' ||
                   jsrCell === 'true' ||
                   jsrCell === 'Yes' || 
                   jsrCell === 'YES' ||
                   jsrCell === 'yes' ||
                   jsrCell === 1 || 
                   jsrCell === '1';

    // Build raw row representation for checks
    const rowCellsStr = row.map(c => c?.toString() || '');

    records.push({
      date: dateParsed,
      mode,
      jsrCall,
      creativeAttendCol: colMap.creativeAttend !== -1 ? row[colMap.creativeAttend] : null,
      managementAttendCol: colMap.managementAttend !== -1 ? row[colMap.managementAttend] : null,
      managementNameCol: colMap.managementName !== -1 ? row[colMap.managementName] : null,
      designAttendCol: colMap.designAttend !== -1 ? row[colMap.designAttend] : null,
      contentNameCol: colMap.contentName !== -1 ? row[colMap.contentName] : null,
      strategyNameCol: colMap.strategyName !== -1 ? row[colMap.strategyName] : null,
      rawRowCells: rowCellsStr
    });
  }

  return records;
}

/**
 * Parses and extracts job tracker rows for a specific client worksheet
 */
export function parseJobTrackerRows(workbook, clientName, isPanasonic = false) {
  // Find worksheet matching client name (case insensitive)
  const targetSheetName = workbook.SheetNames.find(name => 
    name.toLowerCase().trim() === clientName.toLowerCase().trim()
  );

  if (!targetSheetName) {
    throw new Error(`Worksheet for client "${clientName}" not found in uploaded Job Tracker.`);
  }

  const sheet = workbook.Sheets[targetSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const isPanasonicCheck = isPanasonic || (clientName || '').toLowerCase().includes('panasonic');

  // 1. Locate header row flexibly
  let hIdx = -1;
  const keywords = ['job id', 'deliverable', 'deliverables', 'job name', 'job type', 'brief date'];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.some(cell => {
      const txt = (cell || '').toString().toLowerCase().trim();
      return keywords.some(kw => txt.includes(kw));
    })) {
      hIdx = i;
      break;
    }
  }

  if (hIdx === -1) {
    throw new Error(`Job Tracker format invalid. Could not find column headers in sheet "${targetSheetName}".`);
  }

  const headers = rows[hIdx];
  
  // Map header indices
  let colMap = {
    jobId: -1,
    deliverable: -1,
    jobType: -1,
    status: -1,
    briefDate: -1,
    clientTimeline: -1,
    deliveryDate: -1,
    closingDate: -1,
    timelineStatus: -1,
    priority: -1
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
  });

  const records = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) {
      continue; // Skip empty rows
    }

    let jobId = '';
    if (colMap.jobId !== -1 && row[colMap.jobId]) {
      jobId = row[colMap.jobId];
    } else {
      const deliverable = colMap.deliverable !== -1 ? row[colMap.deliverable] : '';
      const jobType = colMap.jobType !== -1 ? row[colMap.jobType] : '';
      if (!deliverable && !jobType && !row[0]) continue;
      jobId = `job-${i}`;
    }

    const deliverable = colMap.deliverable !== -1 ? row[colMap.deliverable] : '';
    const jobType = colMap.jobType !== -1 ? row[colMap.jobType] : '';
    const status = colMap.status !== -1 ? row[colMap.status] : '';
    const timelineStatus = colMap.timelineStatus !== -1 ? row[colMap.timelineStatus] : '';
    const priority = colMap.priority !== -1 ? row[colMap.priority] : '';
    
    // Dates
    const briefDate = colMap.briefDate !== -1 ? parseExcelDate(row[colMap.briefDate]) : null;
    const clientTimeline = colMap.clientTimeline !== -1 ? parseExcelDate(row[colMap.clientTimeline]) : null;
    const deliveryDate = colMap.deliveryDate !== -1 ? parseExcelDate(row[colMap.deliveryDate]) : null;
    const closingDate = colMap.closingDate !== -1 ? parseExcelDate(row[colMap.closingDate]) : null;

    records.push({
      jobId,
      deliverable,
      jobType,
      status,
      timelineStatus,
      briefDate,
      clientTimeline,
      deliveryDate,
      closingDate,
      priority
    });
  }

  return records;
}
