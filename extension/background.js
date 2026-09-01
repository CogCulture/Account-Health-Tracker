/**
 * background.js - Service worker for Google Meet AI Notetaker extension
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Meet AI Notetaker] Extension installed successfully.');
});

// Relays messages between popup and content script if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_TAB_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] });
    });
    return true;
  }
});
