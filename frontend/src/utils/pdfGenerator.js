import { jsPDF } from 'jspdf';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Generates and downloads a Client Health Score PDF Report
 * @param {Object} data - Result object from calculateHealthScore
 */
export function generateHealthReportPDF(data) {
  const { clientName, month, year, scores, metrics, rating, badgeColor, badgeText, ratingBand, insights } = data;
  const monthName = MONTH_NAMES[month];
  
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

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
  doc.text(`${scores.total}`, pageWidth - 70, 26);
  doc.setFontSize(12);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('/ 40', pageWidth - 70 + (scores.total.toString().length * 6) + 2, 26);

  // Status Badge inside PDF
  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.rect(pageWidth - 70, 30, 40, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`${ratingBand} ${badgeText.toUpperCase()}`, pageWidth - 67, 34);

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
        ? 'No Closed Deliverables'
        : `${metrics.p2.onTimeJobs} of ${metrics.p2.totalClosed} Deliverables On-Time (${Math.round(metrics.p2.onTimeRate)}%)`,
      score: `${scores.p2} / 10`
    },
    {
      name: '3. Cross-Functional Meeting',
      summary: `Creative: ${metrics.p3.hasCreativeAttend ? 'Attended' : 'Absent'} | Management: ${metrics.p3.hasManagementAttend ? 'Attended' : 'Absent'}`,
      score: `${scores.p3} / 10`
    },
    {
      name: '4. Proactiveness',
      summary: `Approved: ${metrics.p4.proactiveDetails.paidApproved + metrics.p4.proactiveDetails.initPaidApproved} tasks | Unapproved: ${metrics.p4.proactiveDetails.paidUnapproved + metrics.p4.proactiveDetails.initPaidUnapproved} tasks`,
      score: `${scores.p4} / 15`
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

  // --- INSIGHTS & STRATEGIC RECOMMENDATIONS ---
  const insightsStart = tableTop + 8 + (4 * rowHeight) + 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('Automated Insights & Recommendations', 10, insightsStart);

  let curY = insightsStart + 6;

  const insightsList = [
    { label: 'JSR Calling', text: insights.p1 },
    { label: 'Delivery Performance', text: insights.p2 },
    { label: 'Cross-Functional Attendance', text: insights.p3 },
    { label: 'Client Proactiveness', text: insights.p4 }
  ];

  insightsList.forEach((insight) => {
    // Check space remaining on page, if too small, draw border/background carefully
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    
    // Format paragraph text with page margin constraints
    const splitText = doc.splitTextToSize(insight.text, pageWidth - 32);
    const boxHeight = 8 + (splitText.length * 5);

    // Draw card background
    doc.rect(10, curY, pageWidth - 20, boxHeight, 'F');
    doc.rect(10, curY, pageWidth - 20, boxHeight);
    
    // Left decorative bar
    doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.rect(11, curY + 1, 1.5, boxHeight - 2, 'F');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(insight.label.toUpperCase(), 16, curY + 5.5);

    // Body text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(splitText, 16, curY + 11.5);

    curY += boxHeight + 4;
  });

  // --- FOOTER SECTION ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(`Report generated by Client Health Score Dashboard on ${new Date().toLocaleDateString()}`, 10, pageHeight - 12);
  doc.text('CONFIDENTIAL - FOR INTERNAL AGENCY USE ONLY', pageWidth - 88, pageHeight - 12);

  // Save the PDF
  const formattedClientName = clientName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  doc.save(`${formattedClientName}_health_score_${monthName.toLowerCase()}_${year}.pdf`);
}
