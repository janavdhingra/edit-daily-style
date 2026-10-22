import { useState, useMemo, useRef } from 'react';
import { compressImage, usePhotoUrl } from '../lib/photoStore';
import { extractDominantColors } from '../lib/colorExtraction';
import { COLORS, FABRICS, FITS, FORMALITY_LABELS, OCCASIONS, ROLES, STYLES } from '../data/options';
import { isAvailable } from '../engine/generate';

/* ============================================================
   CLOSET
============================================================ */
export function Closet({ items, readOnly, onAdd, onUpdate, onRemove }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  // Pre-compute the searchable hay once per items mutation, not on every keystroke.
  const haystacks = useMemo(() => {
    const map = new Map();
    for (const i of items) {
      map.set(i.id, [
        i.name, i.color, i.role, i.fabric, i.fit,
        ...(i.styles || []), ...(i.occasions || []), ...(i.tags || []),
      ].filter(Boolean).join(' ').toLowerCase());
    }
    return map;
  }, [items]);
  const filtered = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    return items.filter(i => {
      if (filter !== 'all' && i.role !== filter) return false;
      if (q && !(haystacks.get(i.id) || '').includes(q)) return false;
      return true;
    });
  }, [items, filter, search, haystacks]);

  return (
    <div className="closet">
      <div className="closet-header">
        <div>
          <div className="closet-title">Closet</div>
          <div className="closet-count">{items.length} {items.length === 1 ? 'piece' : 'pieces'}</div>
        </div>
      </div>
      <input type="text" className="closet-search" placeholder="Search…"
        value={search} onChange={e => setSearch(e.target.value)}/>
      <div className="filter-row">
        <button className="filter-pill" data-on={filter === 'all'} onClick={() => setFilter('all')}>All</button>
        {ROLES.map(r => (
          <button key={r.id} className="filter-pill" data-on={filter === r.id} onClick={() => setFilter(r.id)}>{r.label}</button>
        ))}
      </div>
      <div className="item-grid">
        {!readOnly && (
          <button className="add-tile" onClick={() => setAdding(true)}>
            <div className="plus">+</div>
            <span>Add a piece</span>
          </button>
        )}
        {filtered.map(it => <ClosetTile key={it.id} item={it} onClick={() => setEditing(it)}/>)}
      </div>
      {items.length === 0 && (
        <div className="closet-empty">
          {readOnly ? 'This closet is empty.' : 'Photograph clothes you own and add them here. Lay each piece flat or hang it against a plain background for the best results.'}
        </div>
      )}
      {items.length > 0 && filtered.length === 0 && (
        <div style={{padding: '20px 24px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 12}}>
          No pieces match {search ? `"${search}"` : 'this filter'}.
          {(search || filter !== 'all') && (
            <button onClick={() => { setSearch(''); setFilter('all'); }}
              style={{marginLeft: 8, color: 'var(--ink-soft)', textDecoration: 'underline', fontSize: 12}}>
              clear
            </button>
          )}
        </div>
      )}

      {adding && (
        <AddItemSheet
          onClose={() => setAdding(false)}
          onSave={async (data, blob) => { await onAdd(data, blob); setAdding(false); }}
        />
      )}
      {editing && (
        <ItemDetailSheet
          item={editing}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
          onUpdate={(patch) => { onUpdate(editing.id, patch); setEditing({ ...editing, ...patch }); }}
          onRemove={() => { onRemove(editing.id); setEditing(null); }}
        />
      )}
    </div>
  );
}

const STATE_LABEL = { recent: 'Worn recently', washing: 'In the wash', cleaners: 'At the cleaners' };

export function ClosetTile({ item, onClick }) {
  const url = usePhotoUrl(item);
  return (
    <div className={`item-tile ${!isAvailable(item) ? 'dim' : ''}`} onClick={onClick}>
      {url ? <img src={url} alt={item.name}/> : <div className="placeholder">—</div>}
      {item.state && item.state !== 'clean' && <div className="item-state" data-state={item.state}>{STATE_LABEL[item.state] || item.state}</div>}
      <div className="item-name">{item.name}</div>
    </div>
  );
}

export function AddItemSheet({ onClose, onSave }) {
  const [photo, setPhoto] = useState(null); // preview data URL
  const [photoBlob, setPhotoBlob] = useState(null); // compressed JPEG to upload
  const [photoSuggestedColors, setPhotoSuggestedColors] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [color, setColor] = useState('');
  const [formality, setFormality] = useState(2);
  const [warmth, setWarmth] = useState(3);
  const [fabric, setFabric] = useState('');
  const [fit, setFit] = useState('relaxed');
  const [stylesPicked, setStylesPicked] = useState([]);
  const [occasions, setOccasions] = useState([]);
  const [tagsRain, setTagsRain] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function onFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setAnalyzing(true);
    try {
      // Compress before upload: phone photos are often 5MB+.
      const { blob } = await compressImage(f, 1200, 0.85);
      setPhotoBlob(blob);
      // preview as data URL
      const reader = new FileReader();
      reader.onload = async () => {
        setPhoto(reader.result);
        // Background the color extraction — let the preview paint first.
        // requestIdleCallback where available, otherwise a 0ms timeout.
        const schedule = (typeof requestIdleCallback === 'function')
          ? (cb) => requestIdleCallback(cb, { timeout: 800 })
          : (cb) => setTimeout(cb, 0);
        schedule(async () => {
          try {
            const ranked = await extractDominantColors(reader.result, COLORS);
            setPhotoSuggestedColors(ranked);
            if (ranked.length && !color) setColor(ranked[0].id);
          } catch (e) {}
          setAnalyzing(false);
        });
      };
      reader.onerror = () => setAnalyzing(false);
      reader.readAsDataURL(blob);
    } catch (err) {
      setAnalyzing(false);
    }
  }

  function toggle(arr, setArr, val) {
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  }

  const canSave = !!photoBlob && !!role && !!color && !saving;
  const roleLabel = ROLES.find(r => r.id === role)?.label.toLowerCase();
  const colorLabel = COLORS.find(c => c.id === color)?.label;

  async function save() {
    setSaving(true); setError('');
    try {
      await onSave({
        name: name.trim() || `${colorLabel} ${roleLabel}`,
        role, color, formality: Number(formality), warmth: Number(warmth),
        fabric, fit, styles: stylesPicked, occasions,
        tags: tagsRain ? ['rain'] : [],
      }, photoBlob);
    } catch (e) {
      setError('Couldn’t upload that photo. Check your connection and try again.');
      setSaving(false);
    }
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle"></div>
        <div className="sheet-body">
          <div className="sheet-title">Add a piece</div>

          <div className="upload-zone" onClick={() => fileRef.current?.click()}>
            {photo ? <img src={photo} alt="preview"/> : (
              <>
                <div className="plus">+</div>
                <span>Take or choose a photo</span>
              </>
            )}
            {analyzing && <div style={{position:'absolute', bottom:8, right:8, fontSize:10, color:'var(--ink-muted)', background:'var(--surface-2)', padding:'4px 8px', borderRadius:6}}>Reading colours…</div>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={onFile}/>

          {photoSuggestedColors.length > 0 && (
            <div style={{marginBottom: 14, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 10, border: '1px dashed var(--line-strong)'}}>
              <div style={{fontSize: 10, color: 'var(--ink-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6}}>
                Colours in your photo
              </div>
              <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                {photoSuggestedColors.map((c, i) => (
                  <button key={c.id} className="pill"
                    data-on={color === c.id}
                    onClick={() => setColor(c.id)}
                    style={{borderLeft: `8px solid ${c.hex}`}}>
                    {c.label}{i === 0 ? ' ·' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="form-row">
            <label className="form-label">Type</label>
            <div className="pill-row">
              {ROLES.map(r => (
                <button key={r.id} className="pill" data-on={role === r.id} onClick={() => setRole(r.id)}>{r.label}</button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label className="form-label">Color</label>
            <div className="pill-row">
              {COLORS.map(c => (
                <button key={c.id} className="pill" data-on={color === c.id} onClick={() => setColor(c.id)} style={{borderLeft: `8px solid ${c.hex}`}}>{c.label}</button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label className="form-label">Name (optional)</label>
            <input type="text" className="form-input" placeholder={roleLabel && colorLabel ? `${colorLabel} ${roleLabel}` : 'e.g. grey wool coat'}
              value={name} maxLength={80} onChange={e => setName(e.target.value)}/>
          </div>

          <div className="form-row">
            <label className="form-label">How dressy is it?</label>
            <input type="range" min="1" max="5" value={formality} onChange={e => setFormality(e.target.value)}/>
            <div className="form-help">{FORMALITY_LABELS[formality - 1]}</div>
          </div>

          <div className="form-row">
            <label className="form-label">How warm is it?</label>
            <input type="range" min="1" max="5" value={warmth} onChange={e => setWarmth(e.target.value)}/>
            <div className="form-help">{warmth <= 2 ? 'breathable' : warmth <= 3 ? 'mid-weight' : 'warm layer'}</div>
          </div>

          <button className="more-toggle" onClick={() => setMoreOpen(o => !o)} aria-expanded={moreOpen}>
            {moreOpen ? 'Fewer details' : 'More details (optional)'}
          </button>

          {moreOpen && <>
          <div className="form-row">
            <label className="form-label">Fit</label>
            <div className="pill-row">
              {FITS.map(f => (
                <button key={f.id} className="pill" data-on={fit === f.id} onClick={() => setFit(f.id)}>{f.label}</button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label className="form-label">Fabric</label>
            <div className="pill-row">
              {FABRICS.map(f => (
                <button key={f.id} className="pill" data-on={fabric === f.id} onClick={() => setFabric(f.id)}>{f.label}</button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label className="form-label">Style</label>
            <div className="pill-row">
              {STYLES.map(s => (
                <button key={s} className="pill" data-on={stylesPicked.includes(s)} onClick={() => toggle(stylesPicked, setStylesPicked, s)}>{s}</button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label className="form-label">Good for</label>
            <div className="pill-row">
              {OCCASIONS.map(o => (
                <button key={o.id} className="pill" data-on={occasions.includes(o.id)} onClick={() => toggle(occasions, setOccasions, o.id)}>{o.label}</button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label style={{display:'flex', alignItems:'center', gap: 10, fontSize: 13, color: 'var(--ink-soft)'}}>
              <input type="checkbox" checked={tagsRain} onChange={e => setTagsRain(e.target.checked)}/>
              Waterproof (raincoat, shell)
            </label>
          </div>
          </>}

          {error && <div className="form-error" role="alert">{error}</div>}

          <div style={{display:'flex', gap: 8, marginTop: 16}}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!canSave} onClick={save}>{saving ? 'Uploading…' : 'Add to closet'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ItemDetailSheet({ item, readOnly, onClose, onUpdate, onRemove }) {
  const photoUrl = usePhotoUrl(item);
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle"></div>
        <div className="sheet-body">
          <div style={{display:'flex', gap: 16, marginBottom: 14}}>
            <div style={{width: 100, aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden', background: 'var(--surface-2)', flex: '0 0 auto'}}>
              {photoUrl ? <img src={photoUrl} alt={item.name} style={{width: '100%', height: '100%', objectFit: 'cover'}}/> : null}
            </div>
            <div style={{flex: 1, minWidth: 0}}>
              <div className="sheet-title" style={{marginTop: 0, fontSize: 22}}>{item.name}</div>
              <div style={{fontSize: 11, color: 'var(--ink-muted)', letterSpacing: '0.05em', textTransform: 'uppercase'}}>
                {ROLES.find(r => r.id === item.role)?.label} · {COLORS.find(c => c.id === item.color)?.label || item.color}
              </div>
              <div style={{display:'flex', gap: 4, marginTop: 8, flexWrap: 'wrap'}}>
                {(item.styles || []).map(s => <span key={s} className="reason-chip">{s}</span>)}
              </div>
            </div>
          </div>

          {!readOnly && (
          <div className="form-row">
            <label className="form-label">Where is it?</label>
            <div className="pill-row">
              {[['clean', 'Ready to wear'], ['washing', 'In the wash'], ['cleaners', 'At the cleaners']].map(([s, label]) => (
                <button key={s} className="pill" data-on={(item.state || 'clean') === s || (s === 'clean' && item.state === 'recent')} onClick={() => onUpdate({ state: s })}>{label}</button>
              ))}
            </div>
            <div className="form-help">Pieces in the wash or at the cleaners are left out of outfits.</div>
          </div>
          )}

          <div className="form-row">
            <label className="form-label">Last worn</label>
            <div style={{fontSize: 13, color: 'var(--ink-soft)'}}>
              {item.lastWorn ? new Date(item.lastWorn).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : 'Not yet'}
            </div>
          </div>

          {!readOnly && (
            <button className="btn btn-secondary" style={{width: '100%', color: 'var(--danger)'}}
              onClick={() => { if (confirm(`Remove “${item.name}” from your closet? Its photo is deleted too.`)) onRemove(); }}>
              Remove from closet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
