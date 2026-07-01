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

/**
 * Client Health Score Calculator & Insight Generator
 */
export function calculateHealthScore(dailyRows, jobRows, clientName, selectedMonth, selectedYear) {
  // --- 1. FILTER DAILY TRACKER ROWS BY SELECTED MONTH/YEAR ---
  const filteredDaily = dailyRows.filter(row => {
    const d = row.date;
    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
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
  const filteredJobs = jobRows.filter(row => {
    // Determine the relevant date for filtering
    let dateToUse = null;
    
    if (row.status?.toLowerCase().trim() === 'closed' || row.status?.toLowerCase().trim() === 'completed') {
      dateToUse = row.closingDate || row.deliveryDate || row.briefDate;
    } else {
      dateToUse = row.briefDate;
    }
    
    if (!dateToUse) return false;
    
    return dateToUse.getMonth() === selectedMonth && dateToUse.getFullYear() === selectedYear;
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
  const DEEPAKSHI_NAMES = ['deepakshi', 'deepakshi maam', 'deepakshi ma\'am'];
  const isDeepakshi = (name) => DEEPAKSHI_NAMES.some(n => (name || '').toLowerCase().trim().includes('deepakshi'));

  // Verification is always required — unverified rows score 0
  const isVerified = (row) => row.jsrVerified === true;

  // In-Person Calls split by who attended (max 5 pts)
  const inPersonRows = filteredDaily.filter(row => {
    const mode = (row.mode || '').toString().trim().toLowerCase();
    return (mode === 'in person' || mode === 'in-person') && isVerified(row);
  });

  const deepakshiInPerson = inPersonRows.filter(row => isDeepakshi(row.jsrNameCol)).length;
  const otherInPerson     = inPersonRows.filter(row => !isDeepakshi(row.jsrNameCol)).length;

  const inPersonCalls  = inPersonRows.length;
  let inPersonPoints = 0;

  const isBharti = (clientName || '').toLowerCase().trim().startsWith('bharti');
  if (isBharti) {
    inPersonPoints = Math.min(5, inPersonCalls);
  } else {
    let deepakshiPoints = 0;
    if (deepakshiInPerson >= 2)       deepakshiPoints = 2;
    else if (deepakshiInPerson === 1) deepakshiPoints = 1;

    let otherInPersonPoints = 0;
    if (otherInPerson >= 3)      otherInPersonPoints = 3;
    else if (otherInPerson === 2) otherInPersonPoints = 2;
    else if (otherInPerson === 1) otherInPersonPoints = 1;

    inPersonPoints = Math.min(5, deepakshiPoints + otherInPersonPoints);
  }

  // On-Call Attendance % — only verified rows count (max 5 pts)
  const totalWorkingDays = filteredDaily.length;
  const attendanceRows   = filteredDaily.filter(row => row.jsrCall && isVerified(row)).length;

  const attendanceRate = totalWorkingDays > 0 ? (attendanceRows / totalWorkingDays) * 100 : 0;
  let attendancePoints = 0;
  if (attendanceRate >= 90)      attendancePoints = 5;
  else if (attendanceRate >= 75) attendancePoints = 4;
  else if (attendanceRate >= 60) attendancePoints = 3;
  else if (attendanceRate >= 50) attendancePoints = 2;
  else                           attendancePoints = 0;

  const p1Score = inPersonPoints + attendancePoints;

  // --- PARAMETER 2: Delivery Date (Max 10 pts) ---
  const closedJobs = filteredJobs.filter(row => {
    const status = (row.status || '').toString().trim().toLowerCase();
    return status === 'closed' || status === 'completed';
  });
  
  const totalClosed = closedJobs.length;

  // Build per-job detail for the drawer
  const p2JobDetails = closedJobs.map(row => {
    const deadline   = row.clientTimeline;
    const actualDate = row.deliveryDate || row.closingDate;
    const onTime     = deadline && actualDate ? actualDate.getTime() <= deadline.getTime() : null;
    const fmtDate    = d => d ? d.toISOString().split('T')[0] : null;
    return {
      id:          row.jobId,
      deliverable: row.deliverable || row.jobId,
      deadline:    fmtDate(deadline),
      actual:      fmtDate(actualDate),
      onTime,
      priority:    (row.priority || '').toString().trim().toUpperCase(),
    };
  });

  const onTimeJobs = p2JobDetails.filter(j => j.onTime === true).length;
  const onTimeRate = totalClosed > 0 ? (onTimeJobs / totalClosed) * 100 : 0;
  const p2Score    = totalClosed > 0 ? Math.round((onTimeJobs / totalClosed) * 10 * 10) / 10 : 0;

  // Priority on-time rates (for card warnings)
  const priorityWarnings = ['XL', 'XXL'].reduce((acc, pri) => {
    const priJobs = p2JobDetails.filter(j => j.priority === pri);
    if (priJobs.length === 0) return acc;
    const priOnTime = priJobs.filter(j => j.onTime === true).length;
    const rate = Math.round((priOnTime / priJobs.length) * 100);
    if (rate < 90) acc.push({ priority: pri, rate, total: priJobs.length, onTime: priOnTime });
    return acc;
  }, []);

  // --- PARAMETER 3: Cross-Functional Calling (Max 10 pts) ---
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
  const anoopAttended    = mgmtAttendedRows.some(row => isAnoop(row.managementNameCol));
  const seniorAttended   = mgmtAttendedRows.some(row => isSenior(row.managementNameCol));
  const mgmtCount        = mgmtAttendedRows.length;

  // Count distinct senior people (for 2+ rule)
  const seniorPeopleSet = new Set(
    mgmtAttendedRows
      .map(row => (row.managementNameCol || '').toLowerCase().trim())
      .filter(n => isSenior(n) || isAnoop(n))
  );

  let managementPoints = 0;
  if (anoopAttended) {
    managementPoints = 5; // Anoop alone or Anoop + anyone
  } else if (seniorPeopleSet.size >= 2 || (mgmtCount >= 2 && seniorAttended)) {
    managementPoints = 4; // 2+ people, no Anoop
  } else if (seniorAttended) {
    managementPoints = 4; // 1 senior (Vaibhav/Sabu/Pallavi), no Anoop
  } else if (mgmtCount >= 1) {
    managementPoints = 3; // anyone else attended
  } else {
    managementPoints = 0;
  }

  const managementAttendDays = mgmtAttendedRows.length;

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

  // Apply count-based scoring
  // Paid (Approved)
  if (proactiveDetails.paidApproved >= 5) {
    rawProactiveScore += 4;
  } else if (proactiveDetails.paidApproved >= 3) {
    rawProactiveScore += 2;
  } else if (proactiveDetails.paidApproved >= 1) {
    rawProactiveScore += 1;
  }

  // Paid (Not Approved) - negative
  if (proactiveDetails.paidUnapproved >= 5) {
    rawProactiveScore -= 5;
  } else if (proactiveDetails.paidUnapproved >= 3) {
    rawProactiveScore -= 3;
  } else if (proactiveDetails.paidUnapproved >= 1) {
    rawProactiveScore -= 2;
  }

  // Initiative-Paid/Approved
  if (proactiveDetails.initPaidApproved >= 5) {
    rawProactiveScore += 5;
  } else if (proactiveDetails.initPaidApproved >= 3) {
    rawProactiveScore += 3;
  } else if (proactiveDetails.initPaidApproved >= 1) {
    rawProactiveScore += 2;
  }

  // Initiative-Unpaid/Unapproved — no points awarded

  const p4Score = Math.max(0, Math.min(10, rawProactiveScore));

  // --- ESCALATION COUNT ---
  const escalationCount = filteredJobs.filter(row => {
    const val = (row.escalation || '').toString().trim().toLowerCase();
    return val && val !== '' && val !== 'no' && val !== 'n' && val !== 'false' && val !== '0' && val !== 'none' && val !== 'n/a';
  }).length;

  // --- TOTAL HEALTH SCORE ---
  const totalScore = p1Score + p2Score + p3Score + p4Score;
  // Calculate weighted percentage based on rules:
  // JSR Calling (p1) - 25% weightage
  // Delivery Date (p2) - 30% weightage
  // Cross Functional (p3) - 25% weightage
  // Proactiveness (p4) - 20% weightage
  const weightedPercentage = (p1Score * 2.5) + (p2Score * 3.0) + (p3Score * 2.5) + (p4Score * 2.0);
  const totalPercentage = Math.round(weightedPercentage);

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
    p1: generateP1Insight(inPersonCalls, attendanceRate, totalWorkingDays),
    p2: generateP2Insight(p2Score, totalClosed, onTimeRate, onTimeJobs),
    p3: generateP3Insight(creativeAttendDays, managementAttendDays, filteredDaily.length),
    p4: generateP4Insight(p4Score, rawProactiveScore, proactiveDetails)
  };

  const solutions = {
    p1: generateP1Solution(isBharti, inPersonCalls, deepakshiInPerson, otherInPerson, attendanceRate),
    p2: generateP2Solution(p2Score, totalClosed),
    p3: generateP3Solution(creativeAttendDays, managementAttendDays),
    p4: generateP4Solution(p4Score, proactiveDetails),
  };

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

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
      percentage: totalPercentage
    },
    metrics: {
      p1: { inPersonCalls, attendanceRate, totalWorkingDays },
      p2: { totalClosed, onTimeJobs, onTimeRate, jobs: p2JobDetails, priorityWarnings },
      p3: { creativeAttendDays, managementAttendDays, totalWorkingDays: filteredDaily.length },
      p4: { rawProactiveScore, proactiveDetails, jobs: p4JobDetails }
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
    })),
    pendingLargeJobs,
    rating,
    badgeColor,
    badgeText,
    ratingBand,
    insights,
    solutions,
  };
}

function generateP1Insight(inPerson, attendanceRate, workingDays) {
  if (workingDays === 0) {
    return 'No daily log data was found for the client in this period.';
  }
  let insight = '';
  if (inPerson >= 3) {
    insight += `Completed ${inPerson} in-person calls this month. `;
  } else if (inPerson >= 1) {
    insight += `Logged ${inPerson} in-person call(s) this month. `;
  } else {
    insight += 'No in-person meetings logged this month. ';
  }
  insight += `On-call attendance was ${Math.round(attendanceRate)}% across ${workingDays} working days.`;
  return insight;
}

function generateP1Solution(isBharti, inPersonCalls, deepakshi, others, attendanceRate) {
  const tips = [];
  if (isBharti) {
    if (inPersonCalls < 5) {
      tips.push(`Schedule ${5 - inPersonCalls} more in-person meeting(s) to reach the 5-call threshold for full points.`);
    }
  } else {
    if (deepakshi < 2) tips.push(`Schedule ${2 - deepakshi} more in-person meeting(s) with Deepakshi to reach the 2-call threshold.`);
    if (others < 3) tips.push(`Schedule ${3 - others} more in-person meeting(s) with other team members to reach the 3-call threshold.`);
  }
  if (attendanceRate < 90) tips.push(`Improve daily JSR call attendance from ${Math.round(attendanceRate)}% to 90%+ by setting standing calendar reminders.`);
  if (attendanceRate < 50) tips.push('Attendance is critical — establish a fixed daily sync time with the client immediately.');
  if (tips.length === 0) tips.push('Keep up the consistency. Maintain required in-person calls and 90%+ attendance each month.');
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

function generateP3Insight(creativeAttendDays, managementAttendDays, totalDays) {
  if (totalDays === 0) {
    return 'No daily data available to assess cross-functional attendance.';
  }
  if (creativeAttendDays > 0 && managementAttendDays > 0) {
    return `Creative attended ${creativeAttendDays} day(s) and Management attended ${managementAttendDays} day(s) on JSR calls this month.`;
  } else if (creativeAttendDays > 0) {
    return `Creative team attended ${creativeAttendDays} day(s). Management was absent from all calls this month.`;
  } else if (managementAttendDays > 0) {
    return `Management attended ${managementAttendDays} day(s). Creative team was absent from all calls this month.`;
  } else {
    return 'No cross-functional attendance logged this month.';
  }
}

function generateP3Solution(creativeAttendDays, managementAttendDays) {
  const tips = [];
  if (creativeAttendDays < 3) tips.push(`Invite the Creative/Design lead to ${Math.max(1, 3 - creativeAttendDays)} more JSR call(s) to reach the 3-session threshold.`);
  if (managementAttendDays === 0) tips.push('Schedule at least one Management attendance on a JSR call — even a brief check-in counts.');
  if (creativeAttendDays === 0 && managementAttendDays === 0) tips.push('Set recurring calendar invites for both Creative and Management for monthly JSR participation.');
  if (tips.length === 0) tips.push('Cross-functional attendance is solid. Keep both teams looped in regularly.');
  return tips;
}

function generateP4Insight(score, rawScore, details) {
  const { paidApproved, paidUnapproved, initPaidApproved, initPaidUnapproved, retainer } = details;
  const totalProactive = paidApproved + paidUnapproved + initPaidApproved + initPaidUnapproved;
  if (totalProactive === 0) {
    return 'No paid or initiative tasks were logged this month.';
  }
  let parts = [];
  if (initPaidApproved > 0) {
    let pts = initPaidApproved >= 5 ? 5 : initPaidApproved >= 3 ? 3 : 2;
    parts.push(`${initPaidApproved} Initiative-Paid/Approved (+${pts} pts)`);
  }
  if (paidApproved > 0) {
    let pts = paidApproved >= 5 ? 4 : paidApproved >= 3 ? 2 : 1;
    parts.push(`${paidApproved} Paid (Approved) (+${pts} pts)`);
  }
  if (paidUnapproved > 0) {
    let pts = paidUnapproved >= 5 ? -5 : paidUnapproved >= 3 ? -3 : -2;
    parts.push(`${paidUnapproved} Paid (Not Approved) (${pts} pts)`);
  }
  if (initPaidUnapproved > 0) parts.push(`${initPaidUnapproved} Initiative-Unpaid/Unapproved (0 pts)`);
  if (retainer > 0) parts.push(`${retainer} Retainer (0 pts)`);
  return `Logged ${parts.join(', ')}.`;
}

function generateP4Solution(score, details) {
  const { paidUnapproved, initPaidApproved } = details;
  const tips = [];
  if (paidUnapproved > 0) tips.push(`${paidUnapproved} job(s) were started without client approval — always get sign-off before commencing paid work.`);
  if (initPaidApproved < 3) tips.push('Pitch more Initiative-Paid/Approved projects to the client — these contribute the highest points.');
  if (score < 5) tips.push('Present at least one new initiative idea per month and secure written client approval before beginning.');
  if (score >= 8 && paidUnapproved === 0) tips.push('Strong proactiveness. Keep generating approved initiatives to sustain top scores.');
  if (tips.length === 0) tips.push('Continue converting retainer work into initiative-led proposals for maximum score impact.');
  return tips;
}
