import React from 'react';
import { useState } from 'react';

/* ============================================================
   CALENDAR CONNECT SHEET — public iCal URL or .ics file upload
============================================================ */
export function CalendarConnectSheet({ icalUrl, icalLast, onClose, onConnectUrl, onUploadFile, onDisconnect }) {
  const [url, setUrl] = useState(icalUrl || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [drag, setDrag] = useState(false);
  const [showGoogle, setShowGoogle] = useState(false);
  const fileRef = React.useRef(null);

  async function tryUrl() {
    const u = url.trim();
    if (!u) return;
    setBusy(true); setErr(null);
    const result = await onConnectUrl(u);
    setBusy(false);
    if (result?.ok) { onClose(); return; }
    if (result?.message) setErr(result.message);
    else setErr('Could not fetch — check the URL is public.');
  }

  function pickFile() {
    fileRef.current?.click();
  }

  function readFile(file) {
    if (!file) return;
    if (!/\.(ics|ical|ifb|icalendar)$/i.test(file.name)) {
      setErr('That doesn\'t look like a .ics file.');
      return;
    }
    setBusy(true); setErr(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const ok = onUploadFile(text);
      setBusy(false);
      if (ok) onClose();
      else setErr('Could not parse that file.');
    };
    reader.onerror = () => { setBusy(false); setErr('Could not read that file.'); };
    reader.readAsText(file);
  }

  function onDrop(e) {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) readFile(file);
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle"></div>
        <div className="sheet-body">
          <div className="sheet-title">Connect your calendar</div>
          <div className="form-help" style={{marginBottom: 16}}>
            Two ways. Events are parsed on your device, and only the next 7 days are saved. A link stays in sync on its own; a file is a one-time snapshot.
          </div>

          {/* Option 1 — URL */}
          <div style={{marginBottom: 18}}>
            <div className="section-eyebrow" style={{marginBottom: 8}}>Public iCal URL</div>
            <div style={{fontSize: 11, color: 'var(--ink-muted)', lineHeight: 1.5, marginBottom: 8}}>
              Apple Calendar → right-click calendar → <i>Share Calendar</i> → public, copy URL.<br/>
              <button onClick={() => setShowGoogle(s => !s)}
                style={{padding: 0, fontSize: 11, color: 'var(--ink-soft)', textDecoration: 'underline'}}>
                {showGoogle ? 'Hide' : 'Show'} Google Calendar steps
              </button><br/>
              UVic / school timetables usually expose an .ics link.
            </div>
            {showGoogle && (
              <div style={{
                background: 'var(--surface-2)', border: '1px solid var(--line)',
                borderRadius: 'var(--radius-md)', padding: 12,
                fontSize: 11, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 8,
              }}>
                <ol style={{paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 4}}>
                  <li>Open <i>calendar.google.com</i> in a browser (this only works on the web app).</li>
                  <li>In the left sidebar, hover the calendar you want to connect → click the three-dot menu → <i>Settings and sharing</i>.</li>
                  <li>Scroll down to <i>Integrate calendar</i>.</li>
                  <li>Find <i>Secret address in iCal format</i> (don't use the public address — that one's only set if you've made the calendar public).</li>
                  <li>Click the copy icon next to the URL ending in <code>basic.ics</code>.</li>
                  <li>Paste it into the box below and tap Connect.</li>
                </ol>
                <div style={{fontSize: 10, color: 'var(--ink-muted)', marginTop: 8, lineHeight: 1.5}}>
                  Treat the secret URL like a password — anyone with it can read your events. EDIT saves it on this device only. To get past Google's browser block, it passes the link through this site's own relay, which fetches the feed and forgets it. The app re-fetches every 2 hours while it's open.
                </div>
              </div>
            )}
            <div style={{display: 'flex', gap: 6}}>
              <input type="text" className="form-input" style={{flex: 1, fontSize: 12}}
                placeholder="https://… or webcal://…"
                value={url} onChange={e => setUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') tryUrl(); }}/>
              <button className="btn btn-primary" style={{flex: '0 0 auto', padding: '10px 14px', fontSize: 12}}
                onClick={tryUrl} disabled={busy || !url.trim()}>
                {busy ? '…' : 'Connect'}
              </button>
            </div>
            <div style={{fontSize: 10, color: 'var(--ink-muted)', marginTop: 6}}>
              Saved URLs auto-refresh every 2 hours when you open the app.
            </div>
          </div>

          <div style={{textAlign: 'center', fontSize: 10, color: 'var(--ink-muted)', letterSpacing: '0.18em', margin: '6px 0 14px'}}>
            — OR —
          </div>

          {/* Option 2 — File */}
          <div style={{marginBottom: 12}}>
            <div className="section-eyebrow" style={{marginBottom: 8}}>Upload .ics file</div>
            <div
              onClick={pickFile}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              style={{
                border: `1.5px dashed ${drag ? 'var(--accent)' : 'var(--line-strong)'}`,
                borderRadius: 12, padding: '22px 16px', textAlign: 'center',
                background: drag ? 'var(--surface-2)' : 'transparent',
                cursor: 'pointer', transition: 'all .2s var(--ease)'
              }}>
              <div style={{fontSize: 13, color: 'var(--ink-soft)', marginBottom: 4}}>
                {drag ? 'Drop it' : 'Drop a .ics file or tap to browse'}
              </div>
              <div style={{fontSize: 10, color: 'var(--ink-muted)'}}>
                Exports from Apple Calendar, Google Calendar, Outlook all work.
              </div>
              <input type="file" ref={fileRef} accept=".ics,.ical,.ifb,.icalendar,text/calendar"
                style={{display: 'none'}}
                onChange={e => readFile(e.target.files?.[0])}/>
            </div>
          </div>

          {err && <div style={{fontSize: 12, color: 'var(--danger)', marginTop: 8, lineHeight: 1.4}}>{err}</div>}

          {icalUrl && (
            <button className="btn btn-secondary" style={{width: '100%', marginTop: 16, fontSize: 12, color: 'var(--danger)'}}
              onClick={() => { onDisconnect(); onClose(); }}>
              Disconnect
            </button>
          )}

          <button className="btn btn-secondary" style={{width: '100%', marginTop: 8}} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
