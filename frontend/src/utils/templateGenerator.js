import * as XLSX from 'xlsx';

/**
 * Generates and downloads a sample Daily Tracker Excel file
 */
export function downloadDailyTrackerTemplate() {
  const data = [
    { 'Date': '2026-06-01', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'Virtual', 'Creative': 'TRUE', 'Management': 'FALSE' },
    { 'Date': '2026-06-02', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'Virtual', 'Creative': 'FALSE', 'Management': 'FALSE' },
    { 'Date': '2026-06-03', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'In Person', 'Creative': 'TRUE', 'Management': 'TRUE' },
    { 'Date': '2026-06-04', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'Virtual', 'Creative': 'FALSE', 'Management': 'FALSE' },
    { 'Date': '2026-06-05', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'FALSE', 'Mode': 'N/A', 'Creative': 'FALSE', 'Management': 'FALSE' },
    { 'Date': '2026-06-08', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'Virtual', 'Creative': 'FALSE', 'Management': 'FALSE' },
    { 'Date': '2026-06-09', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'Virtual', 'Creative': 'TRUE', 'Management': 'FALSE' },
    { 'Date': '2026-06-10', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'In Person', 'Creative': 'FALSE', 'Management': 'FALSE' },
    { 'Date': '2026-06-11', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'Virtual', 'Creative': 'FALSE', 'Management': 'FALSE' },
    { 'Date': '2026-06-12', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'Virtual', 'Creative': 'FALSE', 'Management': 'FALSE' },
    { 'Date': '2026-06-15', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'Virtual', 'Creative': 'FALSE', 'Management': 'FALSE' },
    { 'Date': '2026-06-16', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'Virtual', 'Creative': 'FALSE', 'Management': 'FALSE' },
    { 'Date': '2026-06-17', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'In Person', 'Creative': 'FALSE', 'Management': 'FALSE' },
    { 'Date': '2026-06-18', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'Virtual', 'Creative': 'TRUE', 'Management': 'TRUE' },
    { 'Date': '2026-06-19', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'Virtual', 'Creative': 'FALSE', 'Management': 'FALSE' },
    { 'Date': '2026-06-22', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'Virtual', 'Creative': 'FALSE', 'Management': 'FALSE' },
    { 'Date': '2026-06-23', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'Virtual', 'Creative': 'FALSE', 'Management': 'FALSE' },
    { 'Date': '2026-06-24', 'Client Name': 'Acme Corp', 'Daily JSR Call': 'TRUE', 'Mode': 'Virtual', 'Creative': 'FALSE', 'Management': 'FALSE' },
  ];

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Daily Tracker');
  XLSX.writeFile(workbook, 'Daily_Tracker_Sample.xlsx');
}

/**
 * Generates and downloads a sample Job Tracker Excel file
 */
export function downloadJobTrackerTemplate() {
  const data = [
    { 'Date': '2026-06-02', 'Client Name': 'Acme Corp', 'Task': 'Homepage Redesign Layout', 'Status': 'Closed', 'Timeline Status': 'On-Time', 'Job Type': 'Paid (Approved)' },
    { 'Date': '2026-06-05', 'Client Name': 'Acme Corp', 'Task': 'Meta Ad Setup', 'Status': 'Closed', 'Timeline Status': 'On-Time', 'Job Type': 'Paid (Approved)' },
    { 'Date': '2026-06-08', 'Client Name': 'Acme Corp', 'Task': 'Q2 Performance Report', 'Status': 'Closed', 'Timeline Status': 'On-Time', 'Job Type': 'Paid (Approved)' },
    { 'Date': '2026-06-12', 'Client Name': 'Acme Corp', 'Task': 'Blog Post Graphics', 'Status': 'Closed', 'Timeline Status': 'Delayed', 'Job Type': 'Retainer' },
    { 'Date': '2026-06-15', 'Client Name': 'Acme Corp', 'Task': 'Brand Guideline Video', 'Status': 'Closed', 'Timeline Status': 'On-Time', 'Job Type': 'Initiative Paid Approved' },
    { 'Date': '2026-06-18', 'Client Name': 'Acme Corp', 'Task': 'Newsletter Campaign Run', 'Status': 'Closed', 'Timeline Status': 'On-Time', 'Job Type': 'Retainer' },
    { 'Date': '2026-06-20', 'Client Name': 'Acme Corp', 'Task': 'Landing Page Dev', 'Status': 'Closed', 'Timeline Status': 'Delayed', 'Job Type': 'Paid (Unapproved)' },
    { 'Date': '2026-06-22', 'Client Name': 'Acme Corp', 'Task': 'Competitor Analysis Deck', 'Status': 'Open', 'Timeline Status': 'Delayed', 'Job Type': 'Initiative Paid Approved' },
    { 'Date': '2026-06-23', 'Client Name': 'Acme Corp', 'Task': 'Copywriting Backup', 'Status': 'Closed', 'Timeline Status': 'On-Time', 'Job Type': '' },
  ];

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Job Tracker');
  XLSX.writeFile(workbook, 'Job_Tracker_Sample.xlsx');
}
