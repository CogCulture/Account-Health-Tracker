/**
 * popup.js - Extension popup controller
 */
document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const meetingTitleInput = document.getElementById('meetingTitleInput');
  const lineCountElem = document.getElementById('lineCount');
  const transcriptPreview = document.getElementById('transcriptPreview');
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');
  const btnSend = document.getElementById('btnSend');
  const feedbackMessage = document.getElementById('feedbackMessage');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.includes('meet.google.com')) {
    statusText.innerText = 'Not on Google Meet';
    btnStart.disabled = true;
    showFeedback('Please open a Google Meet tab (meet.google.com) to start capturing.', 'info');
    return;
  }

  // Poll status from content script
  function updateUI() {
    chrome.tabs.sendMessage(tab.id, { action: 'GET_STATUS' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        statusText.innerText = 'Ready to Start';
        statusDot.classList.remove('active');
        btnStart.disabled = false;
        btnStop.disabled = true;
        btnSend.disabled = true;
        return;
      }

      if (response.meetingTitle && !meetingTitleInput.value) {
        meetingTitleInput.value = response.meetingTitle;
      }

      lineCountElem.innerText = response.lineCount || 0;

      if (response.transcriptText) {
        transcriptPreview.innerText = response.transcriptText.slice(-300);
      } else {
        transcriptPreview.innerText = 'Transcript preview will appear here as people speak...';
      }

      if (response.isRecording) {
        statusText.innerText = 'Live Capturing...';
        statusDot.classList.add('active');
        btnStart.disabled = true;
        btnStop.disabled = false;
        btnSend.disabled = (response.lineCount === 0);
      } else {
        statusText.innerText = response.lineCount > 0 ? 'Capture Stopped' : 'Ready to Start';
        statusDot.classList.remove('active');
        btnStart.disabled = false;
        btnStop.disabled = true;
        btnSend.disabled = (response.lineCount === 0);
      }
    });
  }

  updateUI();
  const interval = setInterval(updateUI, 1500);

  btnStart.addEventListener('click', () => {
    const title = meetingTitleInput.value.trim();
    chrome.tabs.sendMessage(tab.id, { action: 'START_CAPTURING', meetingTitle: title }, (res) => {
      if (res && res.success) {
        showFeedback('Live capture started! Speak in Google Meet.', 'success');
        updateUI();
      } else {
        showFeedback('Failed to start capture. Ensure Meet tab is focused.', 'error');
      }
    });
  });

  btnStop.addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { action: 'STOP_CAPTURING' }, (res) => {
      if (res && res.success) {
        showFeedback('Capture stopped. Ready to generate AI insights.', 'info');
        updateUI();
      }
    });
  });

  btnSend.addEventListener('click', () => {
    const title = meetingTitleInput.value.trim();
    btnSend.disabled = true;
    showFeedback('Sending to Mistral AI for insight extraction...', 'info');

    chrome.tabs.sendMessage(tab.id, { action: 'SEND_TO_DASHBOARD', meetingTitle: title }, (res) => {
      if (res && res.success) {
        showFeedback('✨ Meeting insights saved & updated on Dashboard!', 'success');
        setTimeout(() => { updateUI(); }, 2000);
      } else {
        btnSend.disabled = false;
        showFeedback(res?.error || 'Failed to send transcript to backend.', 'error');
      }
    });
  });

  function showFeedback(msg, type) {
    feedbackMessage.innerText = msg;
    feedbackMessage.className = `feedback ${type}`;
  }
});
