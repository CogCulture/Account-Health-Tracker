import React, { useState, useCallback, useEffect } from 'react';
import {
  Mic, Upload, RefreshCw, AlertCircle, Users, Briefcase,
  FileText, Cloud, Paperclip, ChevronDown, ChevronUp,
} from 'lucide-react';
import { uploadMeetingAudio, syncFathomMeetings, fetchMeetingInsights } from '../utils/meetingsApi';

const SOURCE_LABEL = { fathom: 'Fathom', upload: 'Uploaded' };

export default function MeetingsView() {
  const [meetings, setMeetings] = useState([]);
  const [listStatus, setListStatus] = useState('loading'); // loading | loaded | error
  const [listError, setListError] = useState('');

  const [audioFile, setAudioFile] = useState(null);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle | uploading | error
  const [uploadError, setUploadError] = useState('');

  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | error
  const [syncError, setSyncError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');

  const loadMeetings = useCallback(async () => {
    setListStatus('loading');
    try {
      const data = await fetchMeetingInsights();
      setMeetings(data);
      setListStatus('loaded');
    } catch (err) {
      setListError(err.message);
      setListStatus('error');
    }
  }, []);

  useEffect(() => { loadMeetings(); }, [loadMeetings]);

  const handleUpload = useCallback(async () => {
    if (!audioFile) return;
    setUploadStatus('uploading');
    setUploadError('');
    try {
      await uploadMeetingAudio(audioFile, meetingTitle);
      setAudioFile(null);
      setMeetingTitle('');
      setUploadStatus('idle');
      await loadMeetings();
    } catch (err) {
      setUploadError(err.message);
      setUploadStatus('error');
    }
  }, [audioFile, meetingTitle, loadMeetings]);

  const handleSync = useCallback(async () => {
    setSyncStatus('syncing');
    setSyncError('');
    setSyncMessage('');
    try {
      const { newMeetingsProcessed } = await syncFathomMeetings();
      setSyncMessage(
        newMeetingsProcessed > 0
          ? `Synced ${newMeetingsProcessed} new meeting${newMeetingsProcessed !== 1 ? 's' : ''} from Fathom.`
          : 'No new Fathom meetings found.'
      );
      setSyncStatus('idle');
      await loadMeetings();
    } catch (err) {
      setSyncError(err.message);
      setSyncStatus('error');
    }
  }, [loadMeetings]);

  return (
    <div className="upload-screen" style={{ overflowY: 'auto', height: '100%', padding: '2rem' }}>
      {/* ── Ingestion: Fathom sync + manual upload ─────────────────────── */}
      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <div className="glass-card-header">
          <h2 className="glass-card-title">
            <Mic size={20} style={{ color: 'var(--accent-primary)' }} />
            Meeting Insights
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* Fathom sync */}
          <div style={{
            padding: '1.25rem',
            borderRadius: 10,
            border: '1px solid var(--card-border)',
            background: 'rgba(255,255,255,0.02)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Cloud size={16} style={{ color: 'var(--text-secondary)' }} />
              <strong style={{ fontSize: '0.9rem' }}>Sync from Fathom</strong>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Pulls meetings recorded in the last 30 days and extracts attendees, jobs discussed, and insights for any not already processed.
            </p>
            <button
              className="btn btn-secondary"
              onClick={handleSync}
              disabled={syncStatus === 'syncing'}
              style={{ width: '100%' }}
            >
              {syncStatus === 'syncing' ? (
                <><RefreshCw size={14} className="spin" /> Syncing…</>
              ) : (
                <><Cloud size={14} /> Sync Fathom Meetings</>
              )}
            </button>
            {syncMessage && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-excel)', marginTop: '0.6rem' }}>{syncMessage}</p>
            )}
            {syncStatus === 'error' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-critical)', marginTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={13} /> {syncError}
              </p>
            )}
          </div>

          {/* Manual upload */}
          <div style={{
            padding: '1.25rem',
            borderRadius: 10,
            border: '1px solid var(--card-border)',
            background: 'rgba(255,255,255,0.02)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Upload size={16} style={{ color: 'var(--text-secondary)' }} />
              <strong style={{ fontSize: '0.9rem' }}>Upload a Recording</strong>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              For in-person or any other meeting not captured by Fathom. Transcribed via Mistral Voxtral.
            </p>

            <input
              type="text"
              className="form-control"
              placeholder="Meeting title (optional)"
              value={meetingTitle}
              onChange={e => setMeetingTitle(e.target.value)}
              style={{ marginBottom: '0.6rem', fontSize: '0.85rem', padding: '0.6rem 0.8rem' }}
            />

            <label
              htmlFor="meeting-audio-input"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.6rem 0.8rem', borderRadius: 8,
                border: '1px dashed var(--card-border)',
                cursor: 'pointer', fontSize: '0.82rem',
                color: audioFile ? 'var(--text-primary)' : 'var(--text-secondary)',
                marginBottom: '0.75rem',
              }}
            >
              <Paperclip size={14} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {audioFile ? audioFile.name : 'Choose audio file…'}
              </span>
            </label>
            <input
              id="meeting-audio-input"
              type="file"
              accept="audio/*"
              onChange={e => setAudioFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />

            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={!audioFile || uploadStatus === 'uploading'}
              style={{ width: '100%' }}
            >
              {uploadStatus === 'uploading' ? (
                <><RefreshCw size={14} className="spin" /> Transcribing &amp; extracting…</>
              ) : (
                <><Upload size={14} /> Upload &amp; Extract</>
              )}
            </button>
            {uploadStatus === 'error' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-critical)', marginTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={13} /> {uploadError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Results list ─────────────────────────────────────────────── */}
      <div className="glass-card">
        <div className="glass-card-header">
          <h2 className="glass-card-title">
            <FileText size={20} style={{ color: 'var(--accent-primary)' }} />
            Extracted Insights
          </h2>
          <button className="btn btn-secondary btn-outline" onClick={loadMeetings} disabled={listStatus === 'loading'}>
            <RefreshCw size={13} className={listStatus === 'loading' ? 'spin' : ''} /> Refresh
          </button>
        </div>

        {listStatus === 'loading' && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading…</p>
        )}
        {listStatus === 'error' && (
          <p style={{ color: 'var(--color-critical)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertCircle size={14} /> {listError}
          </p>
        )}
        {listStatus === 'loaded' && meetings.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            No meetings processed yet — sync from Fathom or upload a recording above.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {meetings.map(meeting => (
            <MeetingCard key={meeting._id} meeting={meeting} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MeetingCard({ meeting }) {
  const date = meeting.meetingDate ? new Date(meeting.meetingDate) : null;
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div style={{
      padding: '1.25rem',
      borderRadius: 10,
      border: '1px solid var(--card-border)',
      background: 'rgba(255,255,255,0.02)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <strong style={{ fontSize: '0.95rem' }}>{meeting.meetingTitle || '(untitled meeting)'}</strong>
          {date && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          )}
        </div>
        <span style={{
          fontSize: '0.7rem', fontWeight: 600, padding: '0.25rem 0.6rem',
          borderRadius: 999, background: 'rgba(255,255,255,0.06)',
          color: 'var(--text-secondary)', flexShrink: 0,
        }}>
          {SOURCE_LABEL[meeting.source] || meeting.source}
        </span>
      </div>

      {meeting.summary && (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.85rem', lineHeight: 1.5 }}>
          {meeting.summary}
        </p>
      )}

      {meeting.attendees?.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Users size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '0.15rem' }} />
          <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
            {meeting.attendees.join(', ')}
          </span>
        </div>
      )}

      {meeting.jobsDiscussed?.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Briefcase size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '0.15rem' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {meeting.jobsDiscussed.map((jd, idx) => (
              <div key={idx} style={{ fontSize: '0.82rem' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{jd.job}:</strong>{' '}
                <span style={{ color: 'var(--text-secondary)' }}>{jd.insights}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {meeting.transcriptText && (
        <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--card-border)' }}>
          <button
            className="btn btn-secondary btn-outline"
            onClick={() => setShowTranscript(prev => !prev)}
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <FileText size={13} />
            {showTranscript ? 'Hide Full Transcript' : 'View Full Transcript'}
            {showTranscript ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {showTranscript && (
            <div style={{
              marginTop: '0.75rem',
              padding: '1rem',
              borderRadius: 8,
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--card-border)',
              maxHeight: '350px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {meeting.transcriptText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
