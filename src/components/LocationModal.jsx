import { useState } from 'react';
import { geocodeCity, getBrowserLocation, reverseGeocode } from '../lib/weather';

/* ============================================================
   LOCATION MODAL
============================================================ */
export function LocationModal({ onClose, onSet }) {
  const [city, setCity] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  async function tryGrant() {
    setSearching(true); setError(null);
    try {
      const coords = await getBrowserLocation();
      let place = { city: 'Your area', region: '', country: '' };
      try { place = await reverseGeocode(coords.lat, coords.lng); } catch(e) {}
      onSet({ ...coords, ...place });
    } catch (e) {
      setError('Browser denied. Type a city below.');
    }
    setSearching(false);
  }

  async function tryCity() {
    if (!city.trim()) return;
    setSearching(true); setError(null);
    try {
      const r = await geocodeCity(city.trim());
      if (r) onSet(r);
      else setError('No match — try a bigger city.');
    } catch (e) { setError('Search failed.'); }
    setSearching(false);
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle"></div>
        <div className="sheet-body">
          <div className="sheet-title">Where are you today?</div>
          <div className="form-help" style={{marginBottom: 16}}>
            We use Open-Meteo, which is free and asks no key. Coordinates only — no profile data shared.
          </div>
          <button className="btn btn-secondary" style={{width: '100%', marginBottom: 12}} onClick={tryGrant} disabled={searching}>
            {searching ? 'Asking browser…' : 'Use current location'}
          </button>
          <div style={{display:'flex', gap: 6, marginBottom: 8}}>
            <input type="text" className="form-input" placeholder="Or type a city" style={{flex: 1}}
              value={city} onChange={e => setCity(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') tryCity(); }}/>
            <button className="btn btn-primary" style={{flex: '0 0 auto', padding: '10px 16px'}} onClick={tryCity} disabled={searching || !city.trim()}>Find</button>
          </div>
          {error && <div style={{fontSize: 12, color: 'var(--danger)'}}>{error}</div>}
        </div>
      </div>
    </div>
  );
}
