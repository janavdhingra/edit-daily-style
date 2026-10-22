import { useState, useRef } from 'react';
import { requestNotificationPerm } from '../lib/notifications';
import { compressImage, usePhotoUrl } from '../lib/photoStore';
import { uploadPhoto, removePhotos, normalizeHandle, isValidHandle } from '../lib/closetApi';
import { STYLE_PROFILE_LIST } from '../data/aesthetics';
import { COLORS, FITS, OCCASIONS, SILHOUETTES, TEMP_SENS } from '../data/options';
import { LocationModal } from '../components/LocationModal';

/* ============================================================
   PROFILE — who you are, whether your closet is public, and the
   preferences the outfit engine uses.
============================================================ */
export function Profile({
  profile, items, userId, readOnly, onUpdate, onSignOut, showToast,
  theme, onTheme, location, onSetLocation, notify, onSetNotify,
  feedback, onClearSkips, onClearLearning,
}) {
  const [locModal, setLocModal] = useState(false);
  if (!profile) return null;

  const set = (patch) => onUpdate({ ...profile, ...patch });
  const toggleIn = (key, id) => set({ [key]: profile[key].includes(id) ? profile[key].filter(x => x !== id) : [...profile[key], id] });

  async function toggleNotify() {
    if (notify?.enabled) { onSetNotify({ ...notify, enabled: false }); return; }
    const perm = await requestNotificationPerm();
    onSetNotify({ enabled: perm === 'granted', perm });
  }

  return (
    <div className="profile">
      <ProfileHeader profile={profile} items={items} userId={userId} readOnly={readOnly} onUpdate={onUpdate} showToast={showToast}/>

      {readOnly ? (
        <div className="profile-section">
          <p className="profile-note">
            This is a public demo closet. Outfits are put together only from the pieces shown in the Closet tab,
            using today’s weather where you are.
          </p>
        </div>
      ) : (
        <>
          <PublicCloset profile={profile} onUpdate={onUpdate}/>

          <div className="profile-section">
            <div className="section-heading">How you dress</div>
            <SelectRow label="Usual fit" value={profile.fit} options={FITS} onChange={v => set({ fit: v })}/>
            <SelectRow label="Silhouette" value={profile.silhouette} options={SILHOUETTES} onChange={v => set({ silhouette: v })}/>
            <SelectRow label="Temperature" value={profile.tempSens} options={TEMP_SENS} onChange={v => set({ tempSens: v })}/>
          </div>

          <div className="profile-section">
            <div className="section-heading">Styles you like</div>
            <div className="ref-grid">
              {STYLE_PROFILE_LIST.map(p => (
                <button key={p.id} className="ref-card" data-on={profile.references.includes(p.id)} onClick={() => toggleIn('references', p.id)}>
                  <div className="ref-name">{p.name}</div>
                  <div className="ref-tags">{p.tagline}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="profile-section">
            <div className="section-heading">Colours you reach for</div>
            <div className="palette-grid">
              {COLORS.map(c => (
                <button key={c.id} className="swatch" data-on={profile.colors.includes(c.id)} style={{ background: c.hex }}
                  aria-pressed={profile.colors.includes(c.id)} onClick={() => toggleIn('colors', c.id)}>
                  <span className="swatch-name">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="profile-section">
            <div className="section-heading">What your week looks like</div>
            <div className="pill-row">
              {OCCASIONS.map(o => (
                <button key={o.id} className="pill" data-on={profile.occasions.includes(o.id)} onClick={() => toggleIn('occasions', o.id)}>{o.label}</button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="profile-section">
        <div className="section-heading">App</div>
        <div className="profile-row">
          <span className="label">Dark mode</span>
          <button className="switch" role="switch" aria-checked={theme === 'dark'} data-on={theme === 'dark'} onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}></button>
        </div>
        <div className="profile-row">
          <span className="label">Location</span>
          <button className="val link" onClick={() => setLocModal(true)}>
            {location ? `${location.city}${location.region ? ', ' + location.region : ''}` : 'Set location'}
          </button>
        </div>
        {!readOnly && (
          <div className="profile-row">
            <span className="label">Morning reminder for planned outfits</span>
            <button className="switch" role="switch" aria-checked={!!notify?.enabled} data-on={!!notify?.enabled} onClick={toggleNotify}></button>
          </div>
        )}
        {notify?.perm === 'denied' && (
          <div className="profile-note">Notifications are blocked in your browser settings.</div>
        )}
        {notify?.enabled && (
          <div className="profile-note">Reminders arrive at 7:30am while EDIT is open in a tab or installed to your home screen.</div>
        )}
      </div>

      {!readOnly && (
        <div className="profile-section">
          <div className="section-heading">What EDIT has learned</div>
          <div className="profile-row">
            <span className="label">Skipped outfits</span>
            <span className="val">{(feedback?.skippedSigs || []).length}</span>
          </div>
          <div className="profile-row">
            <span className="label">Style preferences learned</span>
            <span className="val">{Object.keys(feedback?.weights || {}).length}</span>
          </div>
          <div className="button-row">
            <button className="btn btn-secondary" onClick={() => { if (confirm('Let skipped outfits show up again?')) onClearSkips?.(); }}>Clear skips</button>
            <button className="btn btn-secondary" onClick={() => { if (confirm('Forget what EDIT has learned from your choices?')) onClearLearning?.(); }}>Reset learning</button>
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="profile-footer">
          <button className="btn btn-secondary" onClick={onSignOut}>Sign out</button>
        </div>
      )}

      {locModal && (
        <LocationModal onClose={() => setLocModal(false)} onSet={(l) => { onSetLocation(l); setLocModal(false); }}/>
      )}
    </div>
  );
}

function ProfileHeader({ profile, items, userId, readOnly, onUpdate, showToast }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(profile.name);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const avatarUrl = usePhotoUrl(profile.avatarPath ? { photoPath: profile.avatarPath } : null);

  async function onAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { blob } = await compressImage(file, 400, 0.85);
      const path = await uploadPhoto(userId, blob, 'avatar');
      const old = profile.avatarPath;
      if (await onUpdate({ ...profile, avatarPath: path })) removePhotos([old]).catch(() => {});
      else removePhotos([path]).catch(() => {});
    } catch {
      showToast('Couldn’t upload that photo');
    }
    setUploading(false);
  }

  async function saveName() {
    const next = name.trim();
    if (next && next !== profile.name) await onUpdate({ ...profile, name: next });
    setEditingName(false);
  }

  const initial = (profile.name || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="profile-header">
      <button className="avatar" disabled={readOnly || uploading} onClick={() => fileRef.current?.click()}
        aria-label={readOnly ? undefined : 'Change profile photo'}>
        {avatarUrl ? <img src={avatarUrl} alt=""/> : <span>{initial}</span>}
        {!readOnly && <span className="avatar-edit">{uploading ? '…' : 'Edit'}</span>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatar}/>
      <div className="profile-id">
        {editingName ? (
          <input className="form-input" autoFocus value={name} maxLength={60}
            onChange={e => setName(e.target.value)} onBlur={saveName}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setName(profile.name); setEditingName(false); } }}/>
        ) : (
          <h1 className="profile-name">
            {profile.name || 'Your name'}
            {!readOnly && <button className="link small" onClick={() => setEditingName(true)}>Edit</button>}
          </h1>
        )}
        <div className="profile-meta">
          {items.length} {items.length === 1 ? 'piece' : 'pieces'} in {readOnly ? 'this' : 'your'} closet
          {profile.isPublic && profile.handle ? ` · @${profile.handle}` : ''}
        </div>
      </div>
    </div>
  );
}

function PublicCloset({ profile, onUpdate }) {
  const [handle, setHandle] = useState(profile.handle || '');
  const link = profile.handle ? `${window.location.origin}/?closet=${profile.handle}` : '';
  const handleValid = isValidHandle(handle);

  async function setPublic(isPublic) {
    if (isPublic && !handleValid) return;
    await onUpdate({ ...profile, handle, isPublic });
  }
  async function saveHandle() {
    if (!handleValid || handle === profile.handle) return;
    if (!(await onUpdate({ ...profile, handle }))) setHandle(profile.handle || '');
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); } catch { /* the link is visible to copy by hand */ }
  }

  return (
    <div className="profile-section">
      <div className="section-heading">Public closet</div>
      <p className="profile-note">
        Share a read-only link to your closet, for example on a portfolio. Visitors see your clothes and
        today’s outfit. They can’t change anything, and your calendar and saved outfits stay private.
      </p>
      <label className="form-row">
        <span className="form-label">Link name</span>
        <input className="form-input" value={handle} placeholder="e.g. janav" maxLength={30}
          onChange={e => setHandle(normalizeHandle(e.target.value))} onBlur={saveHandle}/>
        {handle && !handleValid && <span className="form-help">Use 3–30 letters, numbers or underscores.</span>}
      </label>
      <div className="profile-row">
        <span className="label">Anyone with the link can view</span>
        <button className="switch" role="switch" aria-checked={profile.isPublic} data-on={profile.isPublic}
          disabled={!profile.isPublic && !handleValid} onClick={() => setPublic(!profile.isPublic)}></button>
      </div>
      {profile.isPublic && link && (
        <div className="share-link">
          <a href={link} target="_blank" rel="noreferrer">{link.replace(/^https?:\/\//, '')}</a>
          <button className="link small" onClick={copy}>Copy</button>
        </div>
      )}
    </div>
  );
}

function SelectRow({ label, value, options, onChange }) {
  return (
    <label className="profile-row">
      <span className="label">{label}</span>
      <select className="row-select" value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">Not set</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}
