/**
 * Helper to check if a cell attendance value is truthy (checked or contains a name)
 */
function isAttendeeTruthy(val) {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val > 0;
  
  const lower = val.toString().toLowerCase().trim();

  // Explicitly truthy values (Excel checkboxes, boolean strings)
  if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'y') return true;

  // Explicitly falsy values
  if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'n' || 
      lower === 'n/a' || lower === 'none' || lower === 'absent') return false;

  // Any non-empty string that's not explicitly false is considered truthy
  return lower.length > 0;
}

export const TEAM_LEADS = {
  B2B: { name: 'Khushi', aliases: ['khushi'] },
  PANASONIC: { name: 'Geetika', aliases: ['geetika', 'gitika'] },
  DEFAULT: { name: 'Deepakshi', aliases: ['deepakshi', "deepakshi ma'am", 'deepakshi maam'] }
};

export function getLeadForTeam(teamName) {
  const upperTeam = (teamName || '').toUpperCase().trim();
  if (TEAM_LEADS[upperTeam]) return TEAM_LEADS[upperTeam];
  return TEAM_LEADS.DEFAULT;
}

/**
 * Client Health Score Calculator & Insight Generator
 */
export function calculateHealthScore(dailyRows, jobRows, clientName, selectedMonth, selectedYear, teamName = 'DEFAULT', assignedPersons = []) {
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // --- 1. FILTER DAILY TRACKER ROWS BY SELECTED MONTH/YEAR ---
  const filteredDaily = dailyRows.filter(row => {
    const d = row.date;
    const matchesPeriod = d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    if (!matchesPeriod) return false;

    // For the current month/year, only evaluate days up to today
    if (selectedMonth === today.getMonth() && selectedYear === today.getFullYear()) {
      const rowMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return rowMidnight.getTime() <= todayMidnight.getTime();
    }

    return true;
  });

  // If no daily rows match the filter, it suggests a date filtering issue
  if (filteredDaily.length === 0 && dailyRows.length > 0) {
    // Try to find what months/years actually exist in the data
    const actualDates = dailyRows.slice(0, 5).map(row => ({
      month: row.date.getMonth(),
      year: row.date.getFullYear(),
      dateStr: row.date.toISOString().split('T')[0]
    }));
    
    console.warn('[scoreEngine] No rows matched filter. Selected:', {selectedMonth, selectedYear}, 'Sample data:', actualDates);
  }

  // --- 2. FILTER JOB TRACKER ROWS BY SELECTED MONTH/YEAR ---
  const isPanasonicClient = (clientName || '').toLowerCase().includes('panasonic');
  const filteredJobs = jobRows.filter(row => {
    // Collect candidate dates strictly according to priority: closingDate -> deliveryDate -> clientTimeline
    // Brief Date is completely ignored in all cases
    let candidateDates = [];

    if (row.status?.toLowerCase().trim() === 'closed' || row.status?.toLowerCase().trim() === 'completed') {
      // If JOB CLOSING DATE or DELIVERY DATE is present, map by those; otherwise fall back to CLIENT TIMELINE
      candidateDates = [row.closingDate, row.deliveryDate].filter(Boolean);
      if (candidateDates.length === 0) {
        candidateDates = [row.clientTimeline].filter(Boolean);
      }
    } else {
      // For open/pending jobs, check clientTimeline first, then deliveryDate/closingDate
      candidateDates = [row.clientTimeline, row.deliveryDate, row.closingDate].filter(Boolean);
    }

    if (candidateDates.length === 0) return false;

    // A job matches if ANY of its valid dates fall within the selected month and year
    return candidateDates.some(d => d.getMonth() === selectedMonth && d.getFullYear() === selectedYear);
  });

  // Debug: log proactiveness job types
  if (filteredJobs.length > 0) {
    console.debug('[scoreEngine] Filtered jobs for P4:', filteredJobs.length);
    const jobTypeSample = filteredJobs.slice(0, 5).map(j => ({
      type: j.jobType,
      status: j.status,
      date: j.closingDate || j.deliveryDate || j.briefDate
    }));
    console.debug('[scoreEngine] Sample job types:', jobTypeSample);
  }

  // --- PARAMETER 1: JSR Calling (Max 10 pts) ---
  const teamLead = getLeadForTeam(teamName);
  const isLead = (name) => teamLead.aliases.some(alias => (name || '').toLowerCase().trim().includes(alias));

  // Verification is always required — unverified rows score 0
  const isVerified = (row) => row.jsrVerified === true;

  // In-Person Calls split by who attended (max 5 pts)
  const inPersonRows = filteredDaily.filter(row => {
    const mode = (row.mode || '').toString().trim().toLowerCase();
    return (mode === 'in person' || mode === 'in-person') && isVerified(row);
  });

  const leadInPerson = inPersonRows.filter(row => isLead(row.jsrNameCol)).length;
  const otherInPerson = inPersonRows.filter(row => !isLead(row.jsrNameCol)).length;

  const inPersonCalls = inPersonRows.length;
  let inPersonPoints = 0;

  const lowerName = (clientName || '').toLowerCase().trim();
  const isNoInPersonBrand = lowerName.startsWith('digital connexion') ||
                            lowerName.startsWith('bpl') ||
                            lowerName.startsWith('kelvinator') ||
                            lowerName.startsWith('kalvinator');

  const isBharti = lowerName.startsWith('bharti');
  const isDigitalConnexion = lowerName.startsWith('digital connexion');
  
  if (isNoInPersonBrand) {
    inPersonPoints = 0;
  } else if (isBharti) {
    inPersonPoints = Math.min(5, inPersonCalls);
  } else {
    let leadPoints = 0;
    if (leadInPerson >= 2)       leadPoints = 2;
    else if (leadInPerson === 1) leadPoints = 1;

    let otherInPersonPoints = 0;
    if (otherInPerson >= 3)      otherInPersonPoints = 3;
    else if (otherInPerson === 2) otherInPersonPoints = 2;
    else if (otherInPerson === 1) otherInPersonPoints = 1;

    inPersonPoints = Math.min(5, leadPoints + otherInPersonPoints);
  }

  // On-Call Attendance % — only verified rows count (max 5 pts)
  const totalWorkingDays = filteredDaily.length;
  const attendanceRows   = filteredDaily.filter(row => row.jsrCall && isVerified(row)).length;

  const isRowClientUnavailable = (row) => {
    if (row.clientUnavailable === true) return true;
    const mode = (row.mode || '').toString().trim().toLowerCase();
    if (mode.includes('client unavailable') || mode.includes('unavailable') || mode.includes('client not available') || mode.includes('client leave')) {
      return true;
    }
    if (row.rawRowCells && Array.isArray(row.rawRowCells)) {
      return row.rawRowCells.some(cell => {
        const txt = (cell || '').toString().toLowerCase().trim();
        return txt === 'client unavailable' || txt === 'unavailable' || txt === 'client not available' || txt === 'client leave';
      });
    }
    return false;
  };

  const clientUnavailableCount = filteredDaily.filter(row => isRowClientUnavailable(row)).length;
  const attendedCount = filteredDaily.filter(row => (row.jsrCall || isRowClientUnavailable(row)) && isVerified(row)).length;
  const displayAttendanceRate = totalWorkingDays > 0 ? (attendedCount / totalWorkingDays) * 100 : 0;

  const attendanceRate = totalWorkingDays > 0 ? (attendanceRows / totalWorkingDays) * 100 : 0;
  let attendancePoints = 0;
  
  if (isNoInPersonBrand) {
    if (isDigitalConnexion) {
      attendancePoints = Math.round(attendanceRate) / 10;
    } else {
      if (attendanceRate >= 90)      attendancePoints = 10;
      else if (attendanceRate >= 75) attendancePoints = 8;
      else if (attendanceRate >= 60) attendancePoints = 6;
      else if (attendanceRate >= 50) attendancePoints = 4;
      else                           attendancePoints = 0;
    }
  } else {
    if (attendanceRate >= 90)      attendancePoints = 5;
    else if (attendanceRate >= 75) attendancePoints = 4;
    else if (attendanceRate >= 60) attendancePoints = 3;
    else if (attendanceRate >= 50) attendancePoints = 2;
    else                           attendancePoints = 0;
  }

  const p1Score = inPersonPoints + attendancePoints;

  // --- PARAMETER 2: Delivery Date (Max 10 pts) ---
  const closedJobs = filteredJobs.filter(row => {
    const status = (row.status || '').toString().trim().toLowerCase();
    return status === 'closed' || status === 'completed';
  });
  
  const totalClosed = closedJobs.length;
  const evalDate = (selectedYear < today.getFullYear() || (selectedYear === today.getFullYear() && selectedMonth < today.getMonth()))
    ? new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59)
    : today;

  const fmtDate = d => d ? d.toISOString().split('T')[0] : null;

  // Build per-job detail for the drawer (closed jobs)
  const p2JobDetails = closedJobs.map(row => {
    const deadline   = row.clientTimeline;
    // Primary actual completion date is closingDate or deliveryDate
    const actualDate = row.closingDate || row.deliveryDate;
    let onTime;
    let delayDays = 0;

    if (deadline && actualDate) {
      onTime = actualDate.getTime() <= deadline.getTime();
      if (!onTime) {
        const dMidnight = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
        const aMidnight = new Date(actualDate.getFullYear(), actualDate.getMonth(), actualDate.getDate());
        const diffMs = aMidnight - dMidnight;
        if (diffMs > 0) {
          delayDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        }
      }
    } else if (actualDate && !deadline) {
      // If actual completion date exists for a closed job but no client timeline is set, mark as on-time
      onTime = true;
    } else if (isPanasonicClient && !actualDate) {
      // Panasonic sheets lack delivery/closing date columns; if a job is closed it's considered on-time
      onTime = true;
    } else {
      onTime = null;
    }

    return {
      id:                row.jobId,
      deliverable:       row.deliverable || row.jobId,
      jobType:           (row.jobType || row.deliverableType || 'Others').toString().trim() || 'Others',
      deadline:          fmtDate(deadline),
      clientTimeline:    fmtDate(deadline),
      actual:            fmtDate(actualDate),
      deliveryDate:      fmtDate(actualDate),
      onTime,
      delayDays,
      priority:          (row.priority || '').toString().trim().toUpperCase(),
      clientAlterations: row.clientAlterations || 0,
    };
  });

  // All jobs in this period (both closed and in-progress/pending)
  const allMonthJobs = filteredJobs.map(row => {
    const deadline   = row.clientTimeline;
    const actualDate = row.closingDate || row.deliveryDate;
    const status     = (row.status || '').toString().trim();
    let onTime = null;
    let delayDays = 0;

    if (deadline && actualDate) {
      onTime = actualDate.getTime() <= deadline.getTime();
      if (!onTime) {
        const dMidnight = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
        const aMidnight = new Date(actualDate.getFullYear(), actualDate.getMonth(), actualDate.getDate());
        const diffMs = aMidnight - dMidnight;
        if (diffMs > 0) {
          delayDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        }
      }
    } else if (deadline && !actualDate) {
      const isClosed = status.toLowerCase() === 'closed' || status.toLowerCase() === 'completed';
      if (isClosed) {
        onTime = true;
      } else {
        const dMidnight = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
        const eMidnight = new Date(evalDate.getFullYear(), evalDate.getMonth(), evalDate.getDate());
        if (eMidnight > dMidnight) {
          onTime = false;
          const diffMs = eMidnight - dMidnight;
          delayDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        } else {
          onTime = null;
        }
      }
    } else if (actualDate && !deadline && (status.toLowerCase() === 'closed' || status.toLowerCase() === 'completed')) {
      onTime = true;
    } else if (isPanasonicClient && !actualDate && (status.toLowerCase() === 'closed' || status.toLowerCase() === 'completed')) {
      onTime = true;
    }

    return {
      id:                row.jobId,
      deliverable:       row.deliverable || row.jobId || 'Unnamed Job',
      jobType:           (row.jobType || row.deliverableType || 'Others').toString().trim() || 'Others',
      clientTimeline:    fmtDate(deadline),
      deadline:          fmtDate(deadline),
      actual:            fmtDate(actualDate),
      deliveryDate:      fmtDate(actualDate),
      status:            status || 'Pending',
      onTime,
      delayDays,
      priority:          (row.priority || '').toString().trim().toUpperCase(),
      clientAlterations: row.clientAlterations || 0,
    };
  });

  // Priority weightages for delivery scoring
  const PRIORITY_WEIGHT = { 'XXL': 5, 'XL': 4, 'L': 3, 'M': 2, 'S': 1 };

  // Weighted on-time score:
  //   Numerator   = Σ (on-time jobs of priority P × weight of P)
  //   Denominator = Σ (total jobs of priority P × weight of P)
  //   Score       = (Numerator / Denominator) × 10
  let weightedOnTime = 0;
  let weightedTotal  = 0;
  p2JobDetails.forEach(j => {
    const w = PRIORITY_WEIGHT[j.priority] ?? 1; // default weight 1 for unlabelled jobs
    weightedTotal += w;
    if (j.onTime === true) weightedOnTime += w;
  });

  const onTimeJobs = p2JobDetails.filter(j => j.onTime === true).length;
  const onTimeRate = weightedTotal > 0 ? (weightedOnTime / weightedTotal) * 100 : 0;
  const p2Score    = weightedTotal > 0 ? Math.round((weightedOnTime / weightedTotal) * 10 * 10) / 10 : 0;

  // Priority on-time rates (for card warnings)
  const priorityWarnings = ['XL', 'XXL'].reduce((acc, pri) => {
    const priJobs = p2JobDetails.filter(j => j.priority === pri);
    if (priJobs.length === 0) return acc;
    const priOnTime = priJobs.filter(j => j.onTime === true).length;
    const rate = Math.round((priOnTime / priJobs.length) * 100);
    if (rate < 90) acc.push({ priority: pri, rate, total: priJobs.length, onTime: priOnTime });
    return acc;
  }, []);

  // --- PARAMETER 3: Cross-Functional Meeting (Max 10 pts) ---
  // Determine what columns this sheet has
  const sheetHasDesignOrCreativeCol = filteredDaily.length > 0 && (
    filteredDaily[0].creativeAttendCol !== null ||
    filteredDaily[0].designAttendCol !== null
  );

  // Creative attendance: count days where Creative/Design attended
  const creativeAttendDays = filteredDaily.filter(row => {
    if (isAttendeeTruthy(row.creativeAttendCol)) return true;
    if (isAttendeeTruthy(row.designAttendCol)) return true;
    // Only fall back to content name column if there's no dedicated design/creative column
    if (!sheetHasDesignOrCreativeCol && isAttendeeTruthy(row.contentNameCol)) return true;
    return false;
  }).length;

  // Creative: max 5 pts - 3+ → 5, 2 → 4, 1 → 3, 0 → 0
  let creativePoints = 0;
  if (creativeAttendDays >= 3)      creativePoints = 5;
  else if (creativeAttendDays === 2) creativePoints = 4;
  else if (creativeAttendDays === 1) creativePoints = 3;

  // Management attendance: name-aware scoring (max 5 pts)
  const ANOOP_NAMES    = ['anoop'];
  const SENIOR_NAMES   = ['vaibhav', 'pallavi', 'pallave', 'sabu'];

  const isAnoop  = (name) => ANOOP_NAMES.some(n => (name || '').toLowerCase().trim().includes(n));
  const isSenior = (name) => SENIOR_NAMES.some(n => (name || '').toLowerCase().trim().includes(n));

  // Collect unique days where management attended, with who attended
  const mgmtAttendedRows = filteredDaily.filter(row => isAttendeeTruthy(row.managementAttendCol));

  // Track standard 3 management team members
  const STANDARD_MGMT_MEMBERS = [
    { name: 'Anoop Dixit', aliases: ['anoop'] },
    { name: 'Vaibhav Mehrotra', aliases: ['vaibhav'] },
    { name: 'Pallave Dixit', aliases: ['pallav', 'pallave', 'pallavi'] }
  ];

  const managementMembers = STANDARD_MGMT_MEMBERS.map(m => {
    const matchingRows = mgmtAttendedRows.filter(row => {
      const nameCol = (row.managementNameCol || '').toString().toLowerCase().trim();
      const rawText = (row.rawRowCells || []).join(' ').toLowerCase();
      return m.aliases.some(a => nameCol.includes(a) || rawText.includes(a));
    });

    const attendedDays = matchingRows.length;
    const attended = attendedDays > 0;

    let daysAgoText = 'Did not join';
    let lastAttendedDateStr = null;

    if (attended && matchingRows.length > 0) {
      // Find latest attendance date
      const latestRow = matchingRows.reduce((latest, r) => (!latest || r.date > latest.date ? r : latest), null);
      if (latestRow && latestRow.date) {
        lastAttendedDateStr = latestRow.date.toISOString().split('T')[0];
        const lastMid = new Date(latestRow.date.getFullYear(), latestRow.date.getMonth(), latestRow.date.getDate());
        const diffMs = todayMidnight.getTime() - lastMid.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) {
          daysAgoText = 'Joined today';
        } else if (diffDays === 1) {
          daysAgoText = 'Joined 1 day ago';
        } else {
          daysAgoText = `Joined ${diffDays} days ago`;
        }
      }
    }

    return {
      name: m.name,
      attendedDays,
      attended,
      daysAgoText,
      lastAttendedDate: lastAttendedDateStr
    };
  });

  // RULE: If ANY management team member joins even ONCE in a month -> Full Score (5 pts), otherwise 0 pts
  const managementAttendDays = mgmtAttendedRows.length;
  const anyManagementJoined = managementAttendDays > 0 || managementMembers.some(m => m.attended);
  const managementPoints = anyManagementJoined ? 5 : 0;

  const p3Score = creativePoints + managementPoints;

  // --- PARAMETER 4: Proactiveness (Max 10 pts, floor 0) ---
  let rawProactiveScore = 0;
  let proactiveDetails = {
    retainer: 0,
    paidApproved: 0,
    paidUnapproved: 0,
    initPaidApproved: 0,
    initPaidUnapproved: 0,
  };

  // Build per-job detail for the drawer
  const p4JobDetails = [];

  filteredJobs.forEach(row => {
    const jobType = (row.jobType || '').toString().trim().toLowerCase();
    const label   = (row.deliverable || row.jobId || '').toString().trim();
    let category  = 'retainer';

    if (jobType === 'retainer') {
      category = 'retainer';
      proactiveDetails.retainer++;
    } else if (jobType === 'paid (approved)' || jobType === 'paid approved' || jobType === 'paid_approved') {
      category = 'paidApproved';
      proactiveDetails.paidApproved++;
    } else if (jobType === 'paid (unapproved)' || jobType === 'paid unapproved' || jobType === 'paid_unapproved' ||
               jobType === 'paid (not approved)' || jobType === 'paid not approved') {
      category = 'paidUnapproved';
      proactiveDetails.paidUnapproved++;
    } else if (jobType === 'initiative paid approved' || jobType === 'initiative paid (approved)' ||
               jobType === 'initiative_paid_approved' || jobType === 'initiative- paid/approved' ||
               jobType === 'initiative-paid/approved' || jobType === 'initiative paid/approved' ||
               jobType === 'initiative- paid approved') {
      category = 'initPaidApproved';
      proactiveDetails.initPaidApproved++;
    } else if (jobType === 'initiative paid unapproved' || jobType === 'initiative paid (unapproved)' ||
               jobType === 'initiative_paid_unapproved' || jobType === 'initiative- unpaid/unapproved' ||
               jobType === 'initiative-unpaid/unapproved' || jobType === 'initiative unpaid/unapproved' ||
               jobType === 'initiative- unpaid unapproved' || jobType === 'initiative unpaid unapproved') {
      category = 'initPaidUnapproved';
      proactiveDetails.initPaidUnapproved++;
    } else {
      category = 'retainer';
      proactiveDetails.retainer++;
    }

    p4JobDetails.push({ label: label || jobType, category, rawType: row.jobType });
  });

  const totalJobsCount = filteredJobs.length;

  // Apply percentage-based scoring
  let initUnapprovedPts = 0;
  let initApprovedPts = 0;
  let pctUnapproved = 0;
  let pctApproved = 0;

  if (totalJobsCount > 0) {
    pctUnapproved = (proactiveDetails.initPaidUnapproved / totalJobsCount) * 100;
    pctApproved = (proactiveDetails.initPaidApproved / totalJobsCount) * 100;

    // Initiative Unapproved Points
    if (pctUnapproved > 20) initUnapprovedPts = 5;
    else if (pctUnapproved > 15) initUnapprovedPts = 4;
    else if (pctUnapproved > 10) initUnapprovedPts = 3;
    else if (pctUnapproved > 5) initUnapprovedPts = 2;
    else if (pctUnapproved > 0) initUnapprovedPts = 1;

    // Initiative Approved Points
    if (pctApproved > 20) initApprovedPts = 10;
    else if (pctApproved > 15) initApprovedPts = 8;
    else if (pctApproved > 10) initApprovedPts = 6;
    else if (pctApproved > 5) initApprovedPts = 4;
    else if (pctApproved > 0) initApprovedPts = 2;
  }

  // Combined score out of 15
  const rawScore = initUnapprovedPts + initApprovedPts;
  // Scale to 10
  rawProactiveScore = (rawScore / 15) * 10;
  const p4Score = Math.max(0, Math.min(10, Math.round(rawProactiveScore * 10) / 10));

  // --- ESCALATION COUNT & DEDUCTIONS ---
  const escalationCount = filteredJobs.filter(row => {
    const val = (row.escalation || '').toString().trim().toLowerCase();
    return val && val !== '' && val !== 'no' && val !== 'n' && val !== 'na' && val !== 'false' && val !== '0' && val !== 'none' && val !== 'n/a' && val !== '-';
  }).length;

  const escalationPercentage = totalJobsCount > 0 ? (escalationCount / totalJobsCount) * 100 : 0;
  
  let escalationDeduction = 0;
  if (escalationPercentage > 0) {
    if (escalationPercentage <= 40) {
      escalationDeduction = Math.ceil(escalationPercentage / 5) * 2.5;
    } else {
      escalationDeduction = 30;
    }
  }

  // --- TOTAL HEALTH SCORE ---
  const totalScore = p1Score + p2Score + p3Score + p4Score;
  // Calculate weighted percentage based on rules:
  // JSR Calling (p1)       - 25% weightage
  // Delivery Date (p2)     - 40% weightage
  // Cross Functional (p3)  - 25% weightage
  // Proactiveness (p4)     - 10% weightage
  const weightedPercentage = (p1Score * 2.5) + (p2Score * 4.0) + (p3Score * 2.5) + (p4Score * 1.0);
  const totalPercentage = Math.max(0, Math.round(weightedPercentage - escalationDeduction));

  // Rating and Color configurations based on percentage
  let rating = 'Critical';
  let badgeColor = '#EF4444';
  let badgeText = 'Critical';
  let ratingBand = '🔴';
  
  if (totalPercentage >= 80) {
    rating = 'Excellent';
    badgeColor = '#10B981';
    badgeText = 'Excellent';
    ratingBand = '🟢';
  } else if (totalPercentage >= 60) {
    rating = 'Good';
    badgeColor = '#F59E0B';
    badgeText = 'Good';
    ratingBand = '🟡';
  } else if (totalPercentage >= 40) {
    rating = 'Needs Attention';
    badgeColor = '#F97316';
    badgeText = 'Needs Attention';
    ratingBand = '🟠';
  }

  // --- AUTO-GENERATED INSIGHTS ---
  const insights = {
    p1: generateP1Insight(isNoInPersonBrand, inPersonCalls, attendanceRate, totalWorkingDays),
    p2: generateP2Insight(p2Score, totalClosed, onTimeRate, onTimeJobs),
    p3: generateP3Insight(creativeAttendDays, managementAttendDays, filteredDaily.length, managementMembers),
    p4: generateP4Insight(p4Score, rawScore, proactiveDetails, totalJobsCount)
  };

  const solutions = {
    p1: generateP1Solution(isBharti, isNoInPersonBrand, inPersonCalls, leadInPerson, otherInPerson, attendanceRate, teamLead.name),
    p2: generateP2Solution(p2Score, totalClosed),
    p3: generateP3Solution(creativeAttendDays, managementAttendDays),
    p4: generateP4Solution(p4Score, proactiveDetails, totalJobsCount),
  };
  const pendingLargeJobs = jobRows.filter(row => {
    const status = (row.status || '').toString().trim().toLowerCase();
    const isClosedOrCompleted = status === 'closed' || status === 'completed';
    const priority = (row.priority || '').toString().trim().toUpperCase();
    const isLarge = priority === 'XL' || priority === 'XXL';
    
    if (isClosedOrCompleted || !isLarge) return false;
    if (!(row.clientTimeline instanceof Date) || isNaN(row.clientTimeline.getTime())) return false;

    const timelineMidnight = new Date(
      row.clientTimeline.getFullYear(),
      row.clientTimeline.getMonth(),
      row.clientTimeline.getDate()
    );

    const diffTime = timelineMidnight.getTime() - todayMidnight.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Due in the next 3 days (0 to 3 days remaining)
    return daysRemaining >= 0 && daysRemaining <= 3;
  }).map(row => ({
    jobId: row.jobId,
    deliverable: row.deliverable || row.jobId,
    priority: (row.priority || '').toString().trim().toUpperCase(),
    dueDate: row.clientTimeline.toISOString().split('T')[0],
  }));

  return {
    clientName,
    month: selectedMonth,
    year: selectedYear,
    scores: {
      p1: p1Score,
      p2: p2Score,
      p3: p3Score,
      p4: p4Score,
      total: totalScore,
      percentage: totalPercentage,
      escalationPercentage,
      escalationDeduction
    },
    metrics: {
      p1: { inPersonCalls, clientUnavailableCount, attendanceRate, displayAttendanceRate, attendedCount, totalWorkingDays },
      p2: { totalClosed, onTimeJobs, onTimeRate, jobs: p2JobDetails, allMonthJobs, priorityWarnings },
      p3: { creativeAttendDays, managementAttendDays, totalWorkingDays: filteredDaily.length, managementMembers },
      p4: { rawProactiveScore, rawScore, proactiveDetails, pctApproved, pctUnapproved, totalJobsCount, jobs: p4JobDetails }
    },
    escalationCount,
    jobsList: filteredJobs.map(row => ({
      jobId: row.jobId,
      deliverable: row.deliverable,
      jobType: row.jobType,
      status: row.status,
      timelineStatus: row.timelineStatus,
      priority: row.priority,
      escalation: row.escalation,
      clientTimeline: row.clientTimeline,
      deliveryDate: row.deliveryDate || row.closingDate,
      clientAlterations: row.clientAlterations || 0,
    })),
    pendingLargeJobs,
    rating,
    badgeColor,
    badgeText,
    ratingBand,
    insights,
    solutions,
    selectedMonth,
    selectedYear,
    assignedPersons: assignedPersons || [],
  };
}

function generateP1Insight(isNoInPersonBrand, inPerson, attendanceRate, workingDays) {
  if (workingDays === 0) {
    return 'No daily log data was found for the client in this period.';
  }
  let insight = '';
  if (isNoInPersonBrand) {
    insight += 'In-person calling is not applicable for this brand. ';
  } else {
    if (inPerson >= 3) {
      insight += `Completed ${inPerson} in-person calls this month. `;
    } else if (inPerson >= 1) {
      insight += `Logged ${inPerson} in-person call(s) this month. `;
    } else {
      insight += 'No in-person meetings logged this month. ';
    }
  }
  insight += `On-call attendance was ${Math.round(attendanceRate)}% across ${workingDays} working days.`;
  return insight;
}

function generateP1Solution(isBharti, isNoInPersonBrand, inPersonCalls, leadInPerson, others, attendanceRate, leadName) {
  if (isNoInPersonBrand) {
    if (attendanceRate < 90) return `Increase JSR on-call attendance by ${Math.ceil(90 - attendanceRate)}% to reach the 90% benchmark for full points.`;
    return null; // Full points
  }

  const tips = [];
  if (isBharti) {
    if (inPersonCalls < 5) {
      tips.push(`Schedule ${5 - inPersonCalls} more in-person meeting(s) to reach the 5-call threshold for full points.`);
    }
  } else {
    if (leadInPerson < 2) tips.push(`Schedule ${2 - leadInPerson} more in-person meeting(s) with ${leadName} to reach the 2-call threshold.`);
    if (others < 3) tips.push(`Schedule ${3 - others} more in-person meeting(s) with other team members to reach the 3-call threshold.`);
  }
  if (attendanceRate < 90) tips.push(`Improve daily JSR call attendance from ${Math.round(attendanceRate)}% to 90%+ by setting standing calendar reminders.`);
  if (attendanceRate < 50) tips.push('Attendance is critical — establish a fixed daily sync time with the client immediately.');
  if (tips.length === 0) {
    tips.push(isNoInPersonBrand 
      ? 'Daily call attendance is solid. Maintain 90%+ attendance each month.' 
      : 'Keep up the consistency. Maintain required in-person calls and 90%+ attendance each month.'
    );
  }
  return tips;
}

function generateP2Insight(score, totalClosed, onTimeRate, onTimeJobs) {
  if (totalClosed === 0) {
    return 'No closed deliverables this month. Delivery score cannot be calculated.';
  }
  const roundedRate = Math.round(onTimeRate);
  const delayedJobs = totalClosed - onTimeJobs;
  if (score === 10) {
    return `All ${totalClosed} deliverable(s) closed on or before the client deadline (100% on-time).`;
  } else if (score >= 8) {
    return `${onTimeJobs} of ${totalClosed} jobs delivered on time (${roundedRate}%). ${delayedJobs} job(s) exceeded the client timeline.`;
  } else if (score >= 6) {
    return `${onTimeJobs} of ${totalClosed} jobs on time (${roundedRate}%). ${delayedJobs} delayed job(s) identified.`;
  } else {
    return `Only ${onTimeJobs} of ${totalClosed} deliverables closed before the client timeline (${roundedRate}% on-time).`;
  }
}

function generateP2Solution(score, totalClosed) {
  const tips = [];
  if (totalClosed === 0) {
    tips.push('Ensure jobs are marked Closed or Completed in the tracker once delivered.');
    return tips;
  }
  if (score < 10) tips.push('Audit delayed jobs to identify recurring bottleneck stages (brief, review, approval).');
  if (score < 8) tips.push('Introduce a mid-month delivery check-in to catch at-risk jobs before the deadline.');
  if (score < 6) tips.push('Set internal deadlines 2–3 days ahead of the client timeline to create a buffer.');
  if (score < 4) tips.push('Escalate timeline risks to the account manager immediately when a job goes off-track.');
  if (tips.length === 0) tips.push('Delivery is excellent. Continue proactive timeline management to maintain 100%.');
  return tips;
}

function generateP3Insight(creativeAttendDays, managementAttendDays, totalDays, managementMembers = []) {
  if (totalDays === 0) {
    return 'No daily data available to assess cross-functional attendance.';
  }
  let insight = '';
  if (creativeAttendDays > 0 && managementAttendDays > 0) {
    insight = `Creative attended ${creativeAttendDays} day(s) and Management attended ${managementAttendDays} day(s) on JSR calls this month.`;
  } else if (creativeAttendDays > 0) {
    insight = `Creative team attended ${creativeAttendDays} day(s). Management was absent from all calls this month.`;
  } else if (managementAttendDays > 0) {
    insight = `Management attended ${managementAttendDays} day(s). Creative team was absent from all calls this month.`;
  } else {
    insight = 'No cross-functional attendance logged this month.';
  }

  const attended = managementMembers.filter(m => m.attended);
  const absent = managementMembers.filter(m => !m.attended);

  if (attended.length > 0) {
    const joinedStr = attended.map(m => `${m.name} (${m.daysAgoText})`).join(', ');
    insight += ` Joined: ${joinedStr}.`;
  }
  if (absent.length > 0) {
    const absentStr = absent.map(m => m.name).join(', ');
    insight += ` Did not join: ${absentStr}.`;
  }

  return insight;
}

function generateP3Solution(creativeAttendDays, managementAttendDays) {
  const tips = [];
  if (creativeAttendDays < 3) tips.push(`Invite the Creative/Design lead to ${Math.max(1, 3 - creativeAttendDays)} more JSR call(s) to reach the 3-session threshold.`);
  if (managementAttendDays === 0) tips.push('Schedule at least one Management attendance on a JSR call — even a brief check-in counts.');
  if (creativeAttendDays === 0 && managementAttendDays === 0) tips.push('Set recurring calendar invites for both Creative and Management for monthly JSR participation.');
  if (tips.length === 0) tips.push('Cross-functional attendance is solid. Keep both teams looped in regularly.');
  return tips;
}

function generateP4Insight(score, rawScore, details, totalJobs) {
  const { initPaidApproved, initPaidUnapproved } = details;
  const totalInitiatives = initPaidApproved + initPaidUnapproved;
  if (totalJobs === 0) {
    return 'No jobs were logged this month.';
  }
  if (totalInitiatives === 0) {
    return 'No initiative tasks were logged this month.';
  }
  const pctUnapproved = Math.round((initPaidUnapproved / totalJobs) * 100 * 10) / 10;
  const pctApproved = Math.round((initPaidApproved / totalJobs) * 100 * 10) / 10;

  let parts = [];
  if (initPaidApproved > 0) {
    parts.push(`${initPaidApproved} Initiative Approved (${pctApproved}%)`);
  }
  if (initPaidUnapproved > 0) {
    parts.push(`${initPaidUnapproved} Initiative Unapproved (${pctUnapproved}%)`);
  }
  return `Logged ${parts.join(', ')} out of ${totalJobs} total jobs.`;
}

function generateP4Solution(score, details, totalJobs) {
  const { initPaidApproved, initPaidUnapproved } = details;
  const tips = [];
  if (totalJobs === 0) {
    tips.push('Ensure jobs are logged in the tracker to assess proactiveness.');
    return tips;
  }
  const pctUnapproved = (initPaidUnapproved / totalJobs) * 100;
  const pctApproved = (initPaidApproved / totalJobs) * 100;

  if (pctApproved <= 20) {
    tips.push('Increase the percentage of approved initiatives to above 20% of total jobs for full points.');
  }
  if (pctUnapproved <= 20) {
    tips.push('Pitch more proactive initiatives to the client to increase the initiative rate.');
  }
  if (score < 6) {
    tips.push('Present new initiative ideas and secure written client approval to boost approved initiative percentage.');
  }
  if (score >= 8) {
    tips.push('Strong proactiveness with high initiative rate. Keep generating approved initiatives.');
  }
  if (tips.length === 0) {
    tips.push('Continue converting standard retainer work into initiative-led proposals.');
  }
  return tips;
}
