# Google Meet AI Notetaker Chrome Extension (Zero Audio Storage)

This Chrome Extension captures **live text-only speech** during your Google Meet calls and sends the transcript directly to your **Account Health Tracker Backend**, where **Mistral AI** extracts meeting insights (attendees, job updates, decisions) and updates your Dashboard automatically.

---

## Features
- **0 Audio Bytes Stored or Sent**: No audio recording files are saved or uploaded.
- **Ultra Lightweight**: Captures live speech using Web Speech Recognition & native Meet live captions, sending only ~10 KB of plain text.
- **Mistral AI Insights**: Extracts structured attendees, project updates, action items, and executive summaries directly to your MongoDB Dashboard.

---

## How to Install in Chrome

1. Open Google Chrome and navigate to:
   ```text
   chrome://extensions
   ```
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `extension` folder in this repository:
   ```text
   c:\Users\Cog\Account-Health-Tracker\extension
   ```
5. Pin the **Google Meet AI Notetaker** icon to your Chrome toolbar.

---

## How to Use

1. Start your backend server (`npm run dev` in `backend/`).
2. Join any Google Meet call on [meet.google.com](https://meet.google.com).
3. Click the extension icon in your Chrome toolbar.
4. Enter the **Meeting Title / Client Name** (e.g. `Acme Corp Weekly`).
5. Click **Start Live Capture**.
6. Conduct your meeting as usual. Speech entries will be captured in real-time.
7. Click **Stop Capture** → **Generate AI Insights & Send to Dashboard**.
8. Refresh or check your React Dashboard (`http://localhost:5173`) to view your newly generated meeting insights!
