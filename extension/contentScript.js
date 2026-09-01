/**
 * contentScript.js - Live text transcript capture for Google Meet (0 Audio Storage)
 */
let recognition = null;
let isRecording = false;
let transcriptLines = [];
let meetingTitle = '';

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('[Meet AI Notetaker] Web Speech API not supported in this browser context.');
    return null;
  }

  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';

  rec.onresult = (event) => {
    let finalChunk = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalChunk += event.results[i][0].transcript + ' ';
      }
    }
    if (finalChunk.trim()) {
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const entry = `[${timestamp}] Speaker: ${finalChunk.trim()}`;
      transcriptLines.push(entry);
      console.log('[Meet AI Notetaker] Capturing:', entry);
      saveState();
    }
  };

  rec.onerror = (event) => {
    console.warn('[Meet AI Notetaker] Speech recognition error:', event.error);
    if (event.error === 'no-speech' && isRecording) {
      try { rec.start(); } catch (e) {}
    }
  };

  rec.onend = () => {
    if (isRecording) {
      try { rec.start(); } catch (e) {}
    }
  };

  return rec;
}

function saveState() {
  chrome.storage.local.set({
    isRecording,
    transcriptText: transcriptLines.join('\n'),
    lineCount: transcriptLines.length,
    meetingTitle: meetingTitle || getGoogleMeetTitle()
  });
}

function getGoogleMeetTitle() {
  // 1. Try clean meeting title element if present
  const titleElem = document.querySelector('[data-meeting-title]') || document.querySelector('.JAP2fc');
  if (titleElem && titleElem.innerText.trim()) {
    return titleElem.innerText.trim();
  }

  // 2. Clean document title
  const docTitle = document.title.replace(/\s*-\s*Google Meet/i, '').replace(/^Meet\s*-\s*/i, '').trim();
  if (docTitle && !docTitle.includes('Audio settings') && !docTitle.includes('Meeting details') && !docTitle.includes('Turn on camera')) {
    return docTitle;
  }

  // 3. Fallback to URL path meeting code (e.g. meet.google.com/fiv-dztj-afh -> fiv-dztj-afh)
  const path = window.location.pathname.replace('/', '').trim();
  if (path && /^[a-z0-9-]+$/i.test(path)) {
    return `Google Meet (${path})`;
  }

  return 'Google Meet Call';
}

// Observe Google Meet Native Captions DOM as a rich fallback if captions are enabled
function observeMeetCaptions() {
  const targetNode = document.body;
  const config = { childList: true, subtree: true };

  const callback = (mutationsList) => {
    if (!isRecording) return;
    const captionContainer = document.querySelector('.a4bIc') || document.querySelector('[jsname="YSvvab"]');
    if (captionContainer) {
      const speakerElem = captionContainer.closest('[jsmodel]')?.querySelector('.zsV38d') || captionContainer.previousElementSibling;
      const speakerName = speakerElem?.innerText || 'Participant';
      const text = captionContainer.innerText;
      if (text && text.length > 5) {
        const lastEntry = transcriptLines[transcriptLines.length - 1];
        const newEntry = `${speakerName}: ${text}`;
        if (lastEntry !== newEntry) {
          transcriptLines.push(newEntry);
          saveState();
        }
      }
    }
  };

  const observer = new MutationObserver(callback);
  observer.observe(targetNode, config);
}

// Handle control messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_CAPTURING') {
    isRecording = true;
    meetingTitle = request.meetingTitle || getGoogleMeetTitle();
    transcriptLines = [];
    
    if (!recognition) {
      recognition = initSpeechRecognition();
    }
    
    if (recognition) {
      try {
        recognition.start();
      } catch (e) {
        console.log('[Meet AI Notetaker] Recognition already active');
      }
    }
    
    observeMeetCaptions();
    saveState();
    sendResponse({ success: true, isRecording: true });
    return true;
  }

  if (request.action === 'STOP_CAPTURING') {
    isRecording = false;
    if (recognition) {
      try { recognition.stop(); } catch (e) {}
    }
    saveState();
    sendResponse({ success: true, isRecording: false, transcriptText: transcriptLines.join('\n') });
    return true;
  }

  if (request.action === 'GET_STATUS') {
    sendResponse({
      isRecording,
      meetingTitle: meetingTitle || getGoogleMeetTitle(),
      lineCount: transcriptLines.length,
      transcriptText: transcriptLines.join('\n')
    });
    return true;
  }

  if (request.action === 'SEND_TO_DASHBOARD') {
    const fullTranscript = transcriptLines.join('\n');
    const title = request.meetingTitle || meetingTitle || getGoogleMeetTitle();

    if (!fullTranscript.trim()) {
      sendResponse({ success: false, error: 'No transcript captured yet.' });
      return true;
    }

    const sendRequest = async (url) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingTitle: title,
          transcriptText: fullTranscript
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    };

    chrome.storage.local.get(['customBackendUrl'], (stored) => {
      const primaryUrl = stored.customBackendUrl || 'http://localhost:3001/api/meetings/transcript';
      const fallbackUrl = 'https://account-health-backend.onrender.com/api/meetings/transcript';

      sendRequest(primaryUrl)
        .catch(err => {
          if (primaryUrl !== fallbackUrl) {
            console.warn('[Meet AI Notetaker] Local backend failed, trying production server...', err.message);
            return sendRequest(fallbackUrl);
          }
          throw err;
        })
        .then(data => {
          if (data.success) {
            isRecording = false;
            if (recognition) try { recognition.stop(); } catch (e) {}
            transcriptLines = [];
            saveState();
            sendResponse({ success: true, meeting: data.meeting });
          } else {
            sendResponse({ success: false, error: data.error || 'Failed to process transcript.' });
          }
        })
        .catch(err => {
          sendResponse({ success: false, error: `Cannot connect to backend server (${err.message})` });
        });
    });

    return true; // Keep channel open for async response
  }
});
