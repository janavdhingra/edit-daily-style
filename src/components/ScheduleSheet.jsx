import { useState, useMemo } from 'react';

/* ============================================================
   SCHEDULE SHEET
============================================================ */
export function ScheduleSheet({ outfit, onClose, onPlan }) {
  const [picked, setPicked] = useState(null);
  const days = useMemo(() => {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      out.push({ key: d.toISOString().slice(0, 10), dow: d.toLocaleDateString('en-US', { weekday: 'short' }), num: d.getDate() });
    }
    return out;
  }, []);
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle"></div>
        <div className="sheet-body">
          <div className="sheet-title">Wear it later</div>
          <div className="form-help" style={{marginBottom: 14}}>
            Pick a day. We'll put it in your Planned tab and remind you that morning.
          </div>
          <div className="day-row">
            {days.map(d => (
              <button key={d.key} className="day-pill" data-on={picked === d.key} onClick={() => setPicked(d.key)}>
                <span className="dow">{d.dow}</span>
                <span className="num">{d.num}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-primary" style={{width: '100%', marginTop: 8}} disabled={!picked} onClick={() => onPlan(picked)}>
            Plan it
          </button>
        </div>
      </div>
    </div>
  );
}
