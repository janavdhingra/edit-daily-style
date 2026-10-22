import { useState } from 'react';
import { inferOccasionFromTitle } from '../engine/context';

/* ============================================================
   EVENT EDITOR
============================================================ */
export function EventEditor({ dateKey, events, onClose, onAdd, onRemove, icalUrl, icalLast, onOpenCalendarConnect, onDisconnectIcal }) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');

  function add() {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), time: time.trim() });
    setTitle(''); setTime('');
  }

  function lastSyncLabel() {
    if (!icalLast) return 'just now';
    const min = Math.floor((Date.now() - icalLast) / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle"></div>
        <div className="sheet-body">
          <div className="sheet-title">Today's events</div>
          <div className="form-help" style={{marginBottom: 14}}>
            We'll infer formality and occasion from titles. "Pitch deck", "Lecture", "Date with M" all map differently.
          </div>

          <div style={{display:'flex', gap: 6, marginBottom: 14}}>
            <input type="text" className="form-input" placeholder="Time (e.g. 11:00)" style={{maxWidth: 100}}
              value={time} onChange={e => setTime(e.target.value)}/>
            <input type="text" className="form-input" placeholder="What's it called?" style={{flex: 1}}
              value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') add(); }}/>
            <button className="btn btn-primary" style={{flex: '0 0 auto', padding: '10px 16px'}} onClick={add} disabled={!title.trim()}>+</button>
          </div>

          <div style={{marginBottom: 8}}>
            {events.map(ev => {
              const inf = inferOccasionFromTitle(ev.title);
              return (
                <div key={ev.id} className="event-row">
                  <div className="event-time">{ev.time || '—'}</div>
                  <div className="event-content">
                    <div className="event-title">
                      {ev.title}
                      {ev.source === 'ical' && <span style={{marginLeft: 6, fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--ink-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', verticalAlign: 'middle'}}>synced</span>}
                    </div>
                    <div className="event-tag">{inf ? inf.occasions.join(' · ') + ' · formality ' + inf.formality.join('-') : 'unrecognized — defaults to relaxed'}</div>
                  </div>
                  {ev.source !== 'ical' && <button className="del-btn" onClick={() => onRemove(ev.id)}>×</button>}
                </div>
              );
            })}
            {!events.length && <div style={{fontSize: 13, color: 'var(--ink-muted)', padding: '10px 0'}}>Nothing yet.</div>}
          </div>

          <div style={{marginTop: 18, padding: '14px 0 0', borderTop: '1px solid var(--line)'}}>
            <div className="section-eyebrow" style={{marginBottom: 6}}>Calendar sync</div>
            {icalUrl ? (
              <div>
                <div style={{fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8, lineHeight: 1.5}}>
                  Connected to a public iCal feed. Last refreshed {lastSyncLabel()}.<br/>
                  <span style={{fontSize: 10, color: 'var(--ink-muted)', wordBreak: 'break-all'}}>{icalUrl.length > 50 ? icalUrl.slice(0, 50) + '…' : icalUrl}</span>
                </div>
                <div style={{display: 'flex', gap: 6}}>
                  <button className="btn btn-secondary" style={{flex: 1, fontSize: 12, padding: '10px 12px'}} onClick={onOpenCalendarConnect}>Re-sync / change</button>
                  <button className="btn btn-secondary" style={{flex: '0 0 auto', fontSize: 12, padding: '10px 14px'}} onClick={onDisconnectIcal}>Disconnect</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8, lineHeight: 1.5}}>
                  Sync your class schedule or work calendar — events show up daily so the engine reads your real plate, not what you remember to type.
                </div>
                <button className="btn btn-secondary" style={{width: '100%', fontSize: 12, padding: '10px 12px'}} onClick={onOpenCalendarConnect}>
                  Connect calendar (.ics)
                </button>
              </div>
            )}
          </div>

          <button className="btn btn-secondary" style={{width: '100%', marginTop: 12}} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
