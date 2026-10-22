/* ============================================================
   STORAGE
============================================================ */
// Profile and closet live in Supabase. These keys hold per-device extras.
export const KEYS = {
  events: 'edit.events.v3',
  feedback: 'edit.feedback.v3',
  location: 'edit.location.v3',
  weather: 'edit.weather.v3',
  theme: 'edit.theme.v3',
  history: 'edit.history.v3',
  saved: 'edit.saved.v3',
  planned: 'edit.planned.v3',
  icalUrl: 'edit.ical.url.v3',
  icalLast: 'edit.ical.last.v3',
  notify: 'edit.notify.v3',
  feedbackDecay: 'edit.feedback.lastDecay.v3',
};
// Subscribers fire when storage is full so the UI can prompt the user.
export const _quotaListeners = new Set();
export let _quotaWarned = false;
export function onStorageQuota(fn) { _quotaListeners.add(fn); return () => _quotaListeners.delete(fn); }
export function _fireQuota() {
  if (_quotaWarned) return; _quotaWarned = true;
  for (const fn of _quotaListeners) { try { fn(); } catch (e) {} }
}
export const storage = {
  get(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) {
      // QuotaExceededError (22) on Chrome/FF, NS_ERROR_DOM_QUOTA_REACHED (1014) on Safari
      const isQuota = e && (e.code === 22 || e.code === 1014 || /quota/i.test(e.name || '') || /quota/i.test(e.message || ''));
      if (isQuota) _fireQuota();
    }
  },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};

// Same API, but every key is scoped to one account so two people sharing a
// browser never see each other's saved outfits, calendar or learning.
export function userStorage(userId) {
  const scoped = (k) => `u:${userId}:${k}`;
  return {
    get: (k, fallback) => storage.get(scoped(k), fallback),
    set: (k, v) => storage.set(scoped(k), v),
    del: (k) => storage.del(scoped(k)),
  };
}

// Throwaway storage for the read-only demo: nothing a visitor does persists.
export function memoryStorage() {
  const map = new Map();
  return {
    get: (k, fallback) => (map.has(k) ? map.get(k) : fallback),
    set: (k, v) => { map.set(k, v); },
    del: (k) => { map.delete(k); },
  };
}
