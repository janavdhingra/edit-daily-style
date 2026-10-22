import { useState } from 'react';
import { FITS, OCCASIONS, TEMP_SENS } from '../data/options';

/* ============================================================
   PROFILE SETUP — one short screen after sign-up. Everything
   here can be changed later on the Profile tab.
============================================================ */
const WEEK_OCCASIONS = ['university', 'office', 'meetings', 'going-out', 'date', 'brunch', 'workout', 'travel', 'lounge'];

export function ProfileSetup({ profile, onDone }) {
  const [name, setName] = useState(profile?.name || '');
  const [fit, setFit] = useState(profile?.fit || '');
  const [tempSens, setTempSens] = useState(profile?.tempSens || 'neutral');
  const [occasions, setOccasions] = useState(profile?.occasions || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id) => setOccasions(o => (o.includes(id) ? o.filter(x => x !== id) : [...o, id]));

  async function save() {
    setBusy(true); setError('');
    try {
      await onDone({ name: name.trim(), fit, tempSens, occasions, setupDone: true });
    } catch (err) {
      setError(err.message || 'Could not save. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="setup">
      <h1 className="setup-title">A few things first</h1>
      <p className="setup-lede">This helps EDIT pick outfits you’ll actually wear. You can change any of it later.</p>

      <label className="form-row">
        <span className="form-label">Name</span>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} maxLength={60} autoComplete="name"/>
      </label>

      <div className="form-row">
        <span className="form-label">How do you like clothes to fit?</span>
        <div className="pill-row">
          {FITS.map(f => (
            <button key={f.id} className="pill" data-on={fit === f.id} onClick={() => setFit(fit === f.id ? '' : f.id)}>{f.label}</button>
          ))}
        </div>
      </div>

      <div className="form-row">
        <span className="form-label">Do you run warm or cold?</span>
        <div className="pill-row">
          {TEMP_SENS.map(t => (
            <button key={t.id} className="pill" data-on={tempSens === t.id} onClick={() => setTempSens(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="form-row">
        <span className="form-label">What fills most of your week?</span>
        <div className="pill-row">
          {OCCASIONS.filter(o => WEEK_OCCASIONS.includes(o.id)).map(o => (
            <button key={o.id} className="pill" data-on={occasions.includes(o.id)} onClick={() => toggle(o.id)}>{o.label}</button>
          ))}
        </div>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}

      <button className="btn btn-primary setup-submit" disabled={!name.trim() || busy} onClick={save}>
        {busy ? 'Saving…' : 'Continue to your closet'}
      </button>
    </div>
  );
}
