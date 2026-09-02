import { jsPDF } from 'jspdf';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Helper to draw a pie slice (arc) using triangles for vanilla jsPDF
function drawPieSlice(doc, x, y, radius, startAngle, endAngle, color) {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setDrawColor(color[0], color[1], color[2]);
  
  const steps = Math.max(10, Math.ceil(Math.abs(endAngle - startAngle) * 15));
  const angleStep = (endAngle - startAngle) / steps;
  
  const points = [[x, y]];
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (i * angleStep);
    points.push([
      x + radius * Math.cos(angle),
      y + radius * Math.sin(angle)
    ]);
  }
  
  for (let i = 1; i < points.length - 1; i++) {
    doc.triangle(points[0][0], points[0][1], points[i][0], points[i][1], points[i+1][0], points[i+1][1], 'F');
  }
}

// Helper to draw a single client scorecard on the current page of a jsPDF doc
function drawClientScorecardPage(doc, data) {
  const { clientName, month, year, scores, metrics, rating, badgeColor, badgeText, ratingBand, insights } = data;
  const monthName = MONTH_NAMES[month];
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Theme colors
  const primaryColor = [15, 23, 42]; // Slate 900
  const secondaryColor = [71, 85, 105]; // Slate 600
  const lightBg = [248, 250, 252]; // Slate 50
  const borderColor = [226, 232, 240]; // Slate 200
  
  // Convert hex badgeColor to RGB
  const hexToRgb = (hex) => {
    const bigint = parseInt(hex.replace('#', ''), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return [r, g, b];
  };
  
  const statusColor = hexToRgb(badgeColor);

  // Helper: Draw page border
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.rect(5, 5, pageWidth - 10, pageHeight - 10);

  // --- HEADER SECTION ---
  // Glowing status accent strip on the left side of the header
  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.rect(8, 8, 4, 32, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('CLIENT HEALTH SCORECARD', 16, 18);

  // Meta subtitle (Client & Month)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(`Agency-Client Relationship Assessment   |   Client: ${clientName.toUpperCase()}`, 16, 25);
  doc.text(`Assessment Period: ${monthName} ${year}`, 16, 31);

  // Score Highlight Banner (Right Aligned in Header)
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.rect(pageWidth - 75, 8, 67, 32, 'F');
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.rect(pageWidth - 75, 8, 67, 32);

  // Total Score Label
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('OVERALL HEALTH SCORE', pageWidth - 70, 14);

  // Score Large Value
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.text(`${scores.percentage}%`, pageWidth - 70, 26);

  // Status Badge inside PDF
  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.rect(pageWidth - 70, 30, 40, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`${badgeText.toUpperCase()}`, pageWidth - 67, 34);

  // --- HORIZONTAL SEPARATOR ---
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.line(8, 46, pageWidth - 8, 46);

  // --- PARAMETERS TABLE ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('Parameter Breakdown', 10, 54);

  // Table Headers
  const tableTop = 60;
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(10, tableTop, pageWidth - 20, 8, 'F');
  doc.rect(10, tableTop, pageWidth - 20, 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('PARAMETER', 14, tableTop + 5.5);
  doc.text('METRICS SUMMARY', 65, tableTop + 5.5);
  doc.text('POINTS EARNED', pageWidth - 42, tableTop + 5.5);

  // Draw table rows
  const rowHeight = 12;
  const rows = [
    {
      name: '1. JSR Calling',
      summary: `${metrics.p1.inPersonCalls} In-Person Call(s) | ${Math.round(metrics.p1.attendanceRate)}% On-Call Attendance`,
      score: `${scores.p1} / 10`
    },
    {
      name: '2. Delivery Date',
      summary: metrics.p2.totalClosed === 0 
        ? ((metrics.p2.delayedJobs || 0) > 0 ? `${metrics.p2.delayedJobs} Delayed deliverable(s)` : 'No Closed Deliverables')
        : `${metrics.p2.onTimeJobs} of ${metrics.p2.totalClosed} Deliverables On-Time (${Math.round(metrics.p2.onTimeRate)}%)${(metrics.p2.delayedJobs || 0) > 0 ? ` | ${metrics.p2.delayedJobs} Delayed` : ''}`,
      score: `${scores.p2} / 10`
    },
    {
      name: '3. Cross-Functional Meeting',
      summary: `Creative: ${metrics.p3.creativeAttendDays > 0 ? 'Attended' : 'Absent'} | Management: ${metrics.p3.managementAttendDays > 0 ? 'Attended' : 'Absent'}`,
      score: `${scores.p3} / 10`
    },
    {
      name: '4. Proactiveness',
      summary: `Initiative Approved: ${metrics.p4.proactiveDetails.initPaidApproved} tasks | Initiative Unapproved: ${metrics.p4.proactiveDetails.initPaidUnapproved} tasks`,
      score: `${scores.p4} / 10`
    }
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);

  rows.forEach((row, i) => {
    const y = tableTop + 8 + (i * rowHeight);
    doc.rect(10, y, pageWidth - 20, rowHeight);
    
    // Alt row background
    if (i % 2 === 1) {
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.rect(10.5, y + 0.5, pageWidth - 21, rowHeight - 1, 'F');
    }
    
    doc.setFont('helvetica', 'bold');
    doc.text(row.name, 14, y + 7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(row.summary, 65, y + 7.5);
    
    doc.setFont('helvetica', 'bold');
    doc.text(row.score, pageWidth - 35, y + 7.5);
  });

  // --- ESCALATION PENALTY WARNING ---
  let penaltyOffset = 0;
  if (scores.escalationDeduction > 0) {
    penaltyOffset = 15;
    const penaltyY = tableTop + 8 + (4 * rowHeight) + 4;
    doc.setFillColor(254, 242, 242); // light red background
    doc.setDrawColor(248, 113, 113); // red border
    doc.rect(10, penaltyY, pageWidth - 20, 10, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(220, 38, 38); // red text
    doc.text(`WARNING: -${scores.escalationDeduction}% Escalation Penalty applied. ${data.escalationCount} of ${metrics.p4.totalJobsCount} tasks (${Math.round(scores.escalationPercentage)}%) were escalated.`, 14, penaltyY + 6.5);
  }


  // --- DELIVERY DATE BREAKDOWN (PAGE 1) ---
  let curY = tableTop + 8 + (4 * rowHeight) + 4 + penaltyOffset + 10;
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('DELIVERY DATE BREAKDOWN', 10, curY);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.line(10, curY + 4, pageWidth - 10, curY + 4);
  
  curY += 10;

  const closedJobs = metrics.p2.jobs || [];
  const allMonthJobsList = (metrics.p2.allMonthJobs && metrics.p2.allMonthJobs.length > 0)
    ? metrics.p2.allMonthJobs
    : (data.jobsList && data.jobsList.length > 0)
      ? data.jobsList
      : closedJobs;

  const delayedCount = metrics.p2.delayedJobs !== undefined
    ? metrics.p2.delayedJobs
    : allMonthJobsList.filter(j => j.onTime === false || (j.delayDays && j.delayDays > 0)).length;

  // Score this month box
  doc.setDrawColor(16, 185, 129); // emerald border
  doc.setFillColor(248, 250, 252);
  doc.rect(10, curY, pageWidth - 20, 12, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('Score this month', 14, curY + 8);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(16, 185, 129);
  doc.text(`${scores.p2}`, pageWidth - 25, curY + 8.5);
  doc.setFontSize(10);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('/10', pageWidth - 17, curY + 8.5);
  
  curY += 20;

  // THIS MONTH AT A GLANCE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('THIS MONTH AT A GLANCE', 10, curY);
  
  curY += 4;
  const boxW = (pageWidth - 24) / 3;
  
  // Jobs closed box
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.rect(10, curY, boxW, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(`${metrics.p2.totalClosed}`, 10 + boxW/2, curY + 9, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('Jobs closed', 10 + boxW/2, curY + 14, { align: 'center' });

  // On time box
  doc.rect(10 + boxW + 2, curY, boxW, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(16, 185, 129); // green
  doc.text(`${metrics.p2.onTimeJobs}`, 10 + boxW + 2 + boxW/2, curY + 9, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('On time', 10 + boxW + 2 + boxW/2, curY + 14, { align: 'center' });

  // Delayed box (Aligned with UI Parameter Drawer)
  doc.rect(10 + (boxW + 2)*2, curY, boxW, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  if (delayedCount > 0) {
    doc.setTextColor(239, 68, 68); // red
  } else {
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  }
  doc.text(`${delayedCount}`, 10 + (boxW + 2)*2 + boxW/2, curY + 9, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('Delayed', 10 + (boxW + 2)*2 + boxW/2, curY + 14, { align: 'center' });

  curY += 24;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('ON-TIME BY PRIORITY', 10, curY);
  
  curY += 6;
  const priOrder = ['XXL', 'XL', 'L', 'M', 'S'];
  
  priOrder.forEach(pri => {
    const pJobs = closedJobs.filter(j => j.priority === pri);
    if (pJobs.length > 0) {
      const onTimeP = pJobs.filter(j => j.onTime).length;
      const pct = Math.round((onTimeP / pJobs.length) * 100);
      
      // Draw label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(pri, 10, curY);
      
      // Draw fraction
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`${onTimeP}/${pJobs.length} on time (${pct}%)`, pageWidth - 45, curY);
      
      // Draw progress bar background
      curY += 3;
      doc.setFillColor(241, 245, 249);
      doc.rect(10, curY, pageWidth - 20, 3, 'F');
      
      // Draw progress bar foreground
      if (pct > 0) {
        let barColor = [16, 185, 129]; // green
        if (pct < 75) barColor = [245, 158, 11]; // orange
        if (pct < 50) barColor = [239, 68, 68]; // red
        doc.setFillColor(barColor[0], barColor[1], barColor[2]);
        doc.rect(10, curY, (pageWidth - 20) * (pct / 100), 3, 'F');
      }
      
      curY += 10;
    }
  });

  // --- PAGE 2: DELIVERABLES TABLE (XXL, XL, L, M, S) ---
  doc.addPage();
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.rect(5, 5, pageWidth - 10, pageHeight - 10);
  
  // Jobs Table Header Title
  let tableY = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('Monthly Deliverables Breakdown', 10, tableY);

  tableY += 5;
  doc.setFillColor(241, 245, 249);
  doc.rect(10, tableY, pageWidth - 20, 8, 'F');
  doc.rect(10, tableY, pageWidth - 20, 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('DELIVERABLE', 12, tableY + 5.5);
  doc.text('PRIORITY', 69, tableY + 5.5);
  doc.text('STATUS', 86, tableY + 5.5);
  doc.text('CLIENT TARGET', 114, tableY + 5.5);
  doc.text('DELIVERED', 142, tableY + 5.5);
  doc.text('CTR / ATR', 170, tableY + 5.5);

  tableY += 8;
  
  // Include all priorities (XXL, XL, L, M, S)
  const priWeight = { 'XXL': 5, 'XL': 4, 'L': 3, 'M': 2, 'S': 1 };
  const sortedJobs = [...allMonthJobsList].sort((a, b) => {
    const wa = priWeight[(a.priority || '').toUpperCase()] || 0;
    const wb = priWeight[(b.priority || '').toUpperCase()] || 0;
    if (wb !== wa) return wb - wa;
    const da = a.clientTimeline || a.deadline || '';
    const db = b.clientTimeline || b.deadline || '';
    return da.localeCompare(db);
  });
  
  let currentRowsOnPage = 0;
  if (sortedJobs.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.text('No deliverables recorded for this period.', 12, tableY + 6);
    currentRowsOnPage = 1;
  } else {
    doc.setFont('helvetica', 'normal');
    
    let maxRowsForCurrentPage = 29; // first table page
    
    sortedJobs.forEach((job) => {
      if (currentRowsOnPage >= maxRowsForCurrentPage) {
        // Create a new page for continuation
        doc.addPage();
        doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
        doc.rect(5, 5, pageWidth - 10, pageHeight - 10);
        
        tableY = 14;
        doc.setFillColor(241, 245, 249);
        doc.rect(10, tableY, pageWidth - 20, 8, 'F');
        doc.rect(10, tableY, pageWidth - 20, 8);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
        doc.text('DELIVERABLE (CONT.)', 12, tableY + 5.5);
        doc.text('PRIORITY', 69, tableY + 5.5);
        doc.text('STATUS', 86, tableY + 5.5);
        doc.text('CLIENT TARGET', 114, tableY + 5.5);
        doc.text('DELIVERED', 142, tableY + 5.5);
        doc.text('CTR / ATR', 170, tableY + 5.5);
        
        tableY += 8;
        currentRowsOnPage = 0;
        maxRowsForCurrentPage = 32; // continuation page
        doc.setFont('helvetica', 'normal');
      }

      const rowY = tableY + (currentRowsOnPage * 7.5);
      doc.rect(10, rowY, pageWidth - 20, 7.5);
      if (currentRowsOnPage % 2 === 1) {
        doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
        doc.rect(10.5, rowY + 0.5, pageWidth - 21, 6.5, 'F');
      }

      let deliverable = (job.deliverable || job.jobId || '-').toString().trim();
      if (deliverable.length > 30) deliverable = deliverable.substring(0, 28) + '...';
      
      const priority = (job.priority || '-').toString().toUpperCase();
      let status = (job.status || 'Pending').toString().trim();
      if (status.length > 13) status = status.substring(0, 12) + '..';
      
      // Client Target Date
      let clientTarget = '-';
      if (job.clientTimeline) {
        clientTarget = (job.clientTimeline instanceof Date) ? job.clientTimeline.toISOString().split('T')[0] : job.clientTimeline.toString();
      } else if (job.deadline) {
        clientTarget = (job.deadline instanceof Date) ? job.deadline.toISOString().split('T')[0] : job.deadline.toString();
      }

      // Delivered Date
      let delivered = '-';
      if (job.deliveryDate) {
        delivered = (job.deliveryDate instanceof Date) ? job.deliveryDate.toISOString().split('T')[0] : job.deliveryDate.toString();
      } else if (job.actual) {
        delivered = (job.actual instanceof Date) ? job.actual.toISOString().split('T')[0] : job.actual.toString();
      } else if (status.toLowerCase() === 'closed' || status.toLowerCase() === 'completed') {
        delivered = clientTarget !== '-' ? clientTarget : 'Closed';
      } else {
        delivered = 'Pending';
      }

      // CTR / ATR / Delay status
      const isDelayed = job.onTime === false || (job.delayDays && job.delayDays > 0);
      let ctrAtr = '';
      const ctrCount = job.clientAlterations || 0;
      const atrCount = job.agencyAlterations || 0;
      if (ctrCount > 0 || atrCount > 0) {
        ctrAtr = `${ctrCount} CTR${atrCount > 0 ? ` | ${atrCount} ATR` : ''}`;
      } else if (isDelayed && job.delayDays > 0) {
        ctrAtr = `+${job.delayDays}d delay`;
      } else {
        ctrAtr = '0 CTR';
      }

      // Print Deliverable
      doc.setFontSize(7.5);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(deliverable, 12, rowY + 5.2);
      
      // Print Priority
      doc.setFont('helvetica', 'bold');
      if (['XXL', 'XL'].includes(priority)) doc.setTextColor(220, 38, 38);
      else if (priority === 'L') doc.setTextColor(234, 88, 12);
      else if (priority === 'M') doc.setTextColor(59, 130, 246);
      else doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text(priority, 69, rowY + 5.2);
      
      // Print Status
      if (isDelayed) doc.setTextColor(220, 38, 38);
      else if (status.toLowerCase().includes('closed') || status.toLowerCase().includes('completed')) doc.setTextColor(16, 185, 129);
      else doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFont('helvetica', 'normal');
      doc.text(status, 86, rowY + 5.2);
      
      // Print Client Target
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text(clientTarget, 114, rowY + 5.2);

      // Print Delivered
      if (isDelayed && delivered !== 'Pending') doc.setTextColor(220, 38, 38);
      else doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(delivered, 142, rowY + 5.2);

      // Print CTR / ATR
      if (isDelayed) doc.setTextColor(220, 38, 38);
      else if (ctrCount > 0) doc.setTextColor(245, 158, 11);
      else doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text(ctrAtr, 170, rowY + 5.2);
      
      currentRowsOnPage++;
    });
  }

  // --- ACTIONABLE INSIGHTS (END OF BRAND SCORECARD) ---
  if (insights.p1 || insights.p3) {
    let finalTableY = tableY + (currentRowsOnPage * 8) + 15;
    
    // Check if we need a new page for insights
    if (finalTableY > pageHeight - 40) {
      doc.addPage();
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.rect(5, 5, pageWidth - 10, pageHeight - 10);
      finalTableY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('Actionable Insights', 10, finalTableY);
    
    finalTableY += 6;
    
    const drawInsight = (label, text, y) => {
      if (!text) return y;
      
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      
      const cleanText = text.replace(/[^\x20-\x7E]/g, '');
      const splitText = doc.splitTextToSize(`-> ${cleanText}`, pageWidth - 32);
      const boxHeight = 8 + (splitText.length * 5);
      
      if (y + boxHeight > pageHeight - 15) {
         doc.addPage();
         doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
         doc.rect(5, 5, pageWidth - 10, pageHeight - 10);
         y = 20;
      }

      doc.rect(10, y, pageWidth - 20, boxHeight, 'F');
      doc.rect(10, y, pageWidth - 20, boxHeight);
      
      doc.setFillColor(59, 130, 246); // blue decorative bar
      doc.rect(11, y + 1, 1.5, boxHeight - 2, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(59, 130, 246); // blue text
      doc.text(label.toUpperCase(), 16, y + 5.5);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text(splitText, 16, y + 11.5);
      
      return y + boxHeight + 4;
    };

    finalTableY = drawInsight('JSR Calling', insights.p1, finalTableY);
    finalTableY = drawInsight('Cross-Functional Meeting', insights.p3, finalTableY);
  }

}

/**
 * Generates and downloads a Client Health Score PDF Report
 * @param {Object} data - Result object from calculateHealthScore
 */
export function generateHealthReportPDF(data) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  drawClientScorecardPage(doc, data);
  const formattedClientName = data.clientName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const monthName = MONTH_NAMES[data.month];
  doc.save(`${formattedClientName}_health_score_${monthName.toLowerCase()}_${data.year}.pdf`);
}

/**
 * Generates and downloads a multi-page Category PDF Report
 * Cover page has category average summary, followed by individual client scorecards.
 */
export function generateCategoryReportPDF(teamName, month, year, clientsData) {
  if (!clientsData || clientsData.length === 0) return;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const monthName = MONTH_NAMES[month];

  // Theme colors
  const primaryColor = [15, 23, 42]; 
  const secondaryColor = [71, 85, 105]; 
  const borderColor = [226, 232, 240]; 

  // --- COVER PAGE ---
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.rect(5, 5, pageWidth - 10, pageHeight - 10);

  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(8, 8, pageWidth - 16, 40, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  doc.text(`${teamName.toUpperCase()} REPORT`, 16, 24);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`${monthName} ${year}`, 16, 36);

  // Calculate Averages
  const numClients = clientsData.length;
  let totalScore = 0;
  let ratingCounts = { 'Excellent': 0, 'Good': 0, 'Needs Attention': 0, 'Critical': 0 };

  clientsData.forEach(c => {
    totalScore += c.scores.percentage || 0;
    if (ratingCounts[c.rating] !== undefined) {
      ratingCounts[c.rating]++;
    } else {
      ratingCounts[c.rating] = 1;
    }
  });

  const avgScore = numClients > 0 ? Math.round(totalScore / numClients) : 0;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('CATEGORY SUMMARY', 16, 65);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(`Total Brands in Category: ${numClients}`, 16, 75);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(`Report generated by Client Health Score Dashboard on ${new Date().toLocaleDateString()}`, 10, pageHeight - 12);

  // --- CLIENT PAGES ---
  clientsData.forEach(clientData => {
    doc.addPage();
    drawClientScorecardPage(doc, clientData);
  });

  // Save the PDF
  const formattedTeamName = teamName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  doc.save(`${formattedTeamName}_category_report_${monthName.toLowerCase()}_${year}.pdf`);
}
