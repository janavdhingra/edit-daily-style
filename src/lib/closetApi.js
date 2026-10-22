import { supabase } from './supabase';

/* ============================================================
   CLOSET API — profiles, items and photos in Supabase.
   The rest of the app works with the same item shape the outfit
   engine always used; these helpers translate to and from rows.
============================================================ */

const BUCKET = 'closet';
const PHOTO_URL_TTL = 60 * 60; // seconds

// Preference fields that live in profiles.prefs.
export const PREF_DEFAULTS = {
  fit: '', silhouette: '', tempSens: 'neutral',
  references: [], colors: [], occasions: [],
  setupDone: false,
};

export function rowToItem(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    color: row.color,
    formality: row.formality,
    warmth: row.warmth,
    fabric: row.fabric || '',
    fit: row.fit || '',
    styles: row.styles || [],
    occasions: row.occasions || [],
    tags: row.tags || [],
    photoPath: row.photo_path,
    state: row.state || 'clean',
    lastWorn: row.last_worn ? Date.parse(row.last_worn) : null,
  };
}

const ITEM_FIELDS = {
  name: 'name', role: 'role', color: 'color', formality: 'formality', warmth: 'warmth',
  fabric: 'fabric', fit: 'fit', styles: 'styles', occasions: 'occasions', tags: 'tags',
  photoPath: 'photo_path', state: 'state',
};

// Only known fields are sent; lastWorn is converted to an ISO timestamp.
export function itemToRow(patch) {
  const row = {};
  for (const [key, col] of Object.entries(ITEM_FIELDS)) {
    if (patch[key] !== undefined) row[col] = patch[key];
  }
  if (patch.lastWorn !== undefined) {
    row.last_worn = patch.lastWorn ? new Date(patch.lastWorn).toISOString() : null;
  }
  return row;
}

export function rowToProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.display_name || '',
    handle: row.handle || '',
    avatarPath: row.avatar_path || null,
    isPublic: !!row.is_public,
    ...PREF_DEFAULTS,
    ...(row.prefs || {}),
  };
}

export function profileToRow(profile) {
  const row = {};
  if (profile.name !== undefined) row.display_name = profile.name.trim() || null;
  if (profile.handle !== undefined) row.handle = profile.handle.trim().toLowerCase() || null;
  if (profile.avatarPath !== undefined) row.avatar_path = profile.avatarPath;
  if (profile.isPublic !== undefined) row.is_public = profile.isPublic;
  const prefs = {};
  for (const key of Object.keys(PREF_DEFAULTS)) {
    if (profile[key] !== undefined) prefs[key] = profile[key];
  }
  if (Object.keys(prefs).length) row.prefs = prefs;
  return row;
}

// Handles become part of a public link, so keep them simple.
export function normalizeHandle(raw) {
  return (raw || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
}
export const isValidHandle = (h) => /^[a-z0-9_]{3,30}$/.test(h || '');

function check({ data, error }) {
  if (error) throw error;
  return data;
}

// ── Auth ───────────────────────────────────────────────────────────────────
export async function signUp(email, password, displayName) {
  return check(await supabase.auth.signUp({
    email, password, options: { data: { display_name: displayName } },
  }));
}
export async function signIn(email, password) {
  return check(await supabase.auth.signInWithPassword({ email, password }));
}
export async function signOut() {
  photoUrlCache.clear();
  return check(await supabase.auth.signOut());
}

// ── Profiles ───────────────────────────────────────────────────────────────
export async function loadProfile(userId) {
  return rowToProfile(check(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()));
}

// prefs is one JSON column, so always save the whole profile: a partial
// patch would overwrite the preferences it leaves out.
export async function saveProfile(userId, current, patch) {
  const row = profileToRow({ ...current, ...patch });
  return rowToProfile(check(await supabase.from('profiles').update(row).eq('id', userId).select().single()));
}

export async function loadPublicCloset(handle) {
  const profile = rowToProfile(check(await supabase.from('profiles')
    .select('*').eq('handle', normalizeHandle(handle)).eq('is_public', true).maybeSingle()));
  if (!profile) return null;
  return { profile, items: await listItems(profile.id) };
}

// ── Items ──────────────────────────────────────────────────────────────────
export async function listItems(userId) {
  const rows = check(await supabase.from('items').select('*')
    .eq('user_id', userId).order('created_at', { ascending: true }));
  const items = rows.map(rowToItem);
  await warmPhotoUrls(items.map(i => i.photoPath));
  return items;
}

const extFor = (blob) => (blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg');

export async function uploadPhoto(userId, blob, prefix = 'item') {
  const path = `${userId}/${prefix}-${crypto.randomUUID()}.${extFor(blob)}`;
  check(await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg' }));
  return path;
}

export async function removePhotos(paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  list.forEach(p => photoUrlCache.delete(p));
  check(await supabase.storage.from(BUCKET).remove(list));
}

export async function addItem(userId, fields, photoBlob) {
  const photoPath = await uploadPhoto(userId, photoBlob);
  try {
    const row = check(await supabase.from('items')
      .insert({ ...itemToRow(fields), photo_path: photoPath }).select().single());
    return rowToItem(row);
  } catch (err) {
    await removePhotos([photoPath]).catch(() => {});
    throw err;
  }
}

export async function updateItem(id, patch) {
  const row = itemToRow(patch);
  if (!Object.keys(row).length) return;
  check(await supabase.from('items').update(row).eq('id', id));
}

export async function deleteItem(item) {
  check(await supabase.from('items').delete().eq('id', item.id));
  await removePhotos([item.photoPath]).catch(() => {});
}

// ── Photo URLs ─────────────────────────────────────────────────────────────
// Photos live in a private bucket, so the browser gets short-lived signed URLs.
const photoUrlCache = new Map(); // path → { url, expires }

function cached(path) {
  const hit = photoUrlCache.get(path);
  return hit && hit.expires > Date.now() + 60_000 ? hit.url : null;
}

export async function warmPhotoUrls(paths) {
  const missing = [...new Set(paths.filter(p => p && !cached(p)))];
  if (!missing.length || !supabase) return;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(missing, PHOTO_URL_TTL);
  const expires = Date.now() + PHOTO_URL_TTL * 1000;
  for (const entry of data || []) {
    if (entry.signedUrl) photoUrlCache.set(entry.path, { url: entry.signedUrl, expires });
  }
}

export async function photoUrl(path) {
  if (!path) return null;
  const hit = cached(path);
  if (hit) return hit;
  await warmPhotoUrls([path]);
  return cached(path);
}
