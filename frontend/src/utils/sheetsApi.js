/**
 * sheetsApi.js
 * Thin client that talks to the local Express backend.
 * No credentials are ever exposed to the browser.
 */

import { apiUrl } from './apiClient';

/**
 * Fetches all tab names from a spreadsheet.
 * @param {string} sheetId - Google Spreadsheet ID
 * @returns {Promise<string[]>}
 */
export async function fetchSheetTabs(sheetId) {
  const res = await fetch(apiUrl(`/api/sheets/tabs?sheetId=${encodeURIComponent(sheetId)}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Failed to fetch tabs (HTTP ${res.status})`);
  }
  const { tabs } = await res.json();
  return tabs;
}

/**
 * Fetches the raw 2D array of values from a specific sheet tab.
 * @param {string} sheetId - Google Spreadsheet ID
 * @param {string} tabName - The tab/worksheet name
 * @returns {Promise<any[][]>} 2D array of cell values
 */
export async function fetchSheetData(sheetId, tabName) {
  const res = await fetch(
    apiUrl(`/api/sheets/data?sheetId=${encodeURIComponent(sheetId)}&tab=${encodeURIComponent(tabName)}`)
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Failed to fetch sheet data (HTTP ${res.status})`);
  }
  const { data } = await res.json();
  return data;
}

/**
 * Fetches the latest saved daily digest snapshot from MongoDB-backed API.
 * This lets the dashboard hydrate from the 11:00 AM sync instead of
 * recalculating every score from Google Sheets on page load.
 */
export async function fetchDailyDigestSnapshot({ fallback = true } = {}) {
  const res = await fetch(apiUrl(`/api/daily-digest-snapshot?fallback=${fallback ? 'true' : 'false'}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Failed to fetch daily digest snapshot (HTTP ${res.status})`);
  }
  const { snapshot } = await res.json();
  return snapshot;
}
