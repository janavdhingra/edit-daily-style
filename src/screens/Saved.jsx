import { useState } from 'react';
import { AltCollageCell } from '../components/Collage';

/* ============================================================
   SAVED
============================================================ */
export function Saved({ saved, planned, items, onUnsave, onWear }) {
  const [tab, setTab] = useState('saved');
  // Re-resolve a saved/planned item against the live closet so renames and
  // color-tag fixes flow through. If the underlying item was deleted, we keep
  // the snapshot so the card still renders something coherent.
  const resolve = (snap) => {
    if (!snap) return null;
    const live = items.find(i => i.id === snap.id);
    return live ? { ...snap, ...live } : snap;
  };
  const resolveAll = (arr) => (arr || []).map(resolve).filter(Boolean);

  return (
    <div className="saved">
      <div className="closet-header">
        <div>
          <div className="closet-title">Saved</div>
          <div className="closet-count">Outfits you saved or planned</div>
        </div>
      </div>
      <div className="saved-tabs">
        <button data-on={tab === 'saved'} onClick={() => setTab('saved')}>Saved · {saved.length}</button>
        <button data-on={tab === 'planned'} onClick={() => setTab('planned')}>Planned · {planned.length}</button>
      </div>
      {tab === 'saved' && (
        saved.length ? (
          <div className="saved-grid">
            {saved.map(s => {
              const live = resolveAll(s.items);
              return (
                <div key={s.id} className="saved-card">
                  <div className="alt-collage">
                    {[0,1,2,3].map(i => <AltCollageCell key={i} item={live[i]}/>)}
                  </div>
                  <button className="saved-x"
                    aria-label="Remove save"
                    onClick={() => { if (confirm('Remove this save?')) onUnsave(s.id); }}>
                    ×
                  </button>
                  <div className="meta">
                    <div className="title">{(s.reasons || [])[0] || 'edit'}</div>
                    <div className="sub">{new Date(s.savedAt).toLocaleDateString()}</div>
                  </div>
                  {onWear && live.length > 0 && (
                    <button className="saved-wear" onClick={() => onWear(live)}>
                      Wear today
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-card"><h3>Nothing saved yet</h3><p>Tap Save on an outfit you like and it will be kept here.</p></div>
        )
      )}
      {tab === 'planned' && (
        planned.length ? (
          <div className="saved-grid">
            {planned.map(p => {
              const live = resolveAll(p.items);
              return (
                <div key={p.id} className="saved-card">
                  <div className="alt-collage">
                    {[0,1,2,3].map(i => <AltCollageCell key={i} item={live[i]}/>)}
                  </div>
                  <div className="meta">
                    <div className="title">For {new Date(p.dateKey).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-card"><h3>No planned looks.</h3><p>Hit "Plan" on any outfit to schedule it for a specific day.</p></div>
        )
      )}
    </div>
  );
}
