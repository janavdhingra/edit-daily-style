import { useState, useEffect, useMemo, useRef } from 'react';
import { KEYS, onStorageQuota, storage } from './lib/storage';
import * as api from './lib/closetApi';
import { cancelAllScheduledReminders, scheduleMorningReminder } from './lib/notifications';
import { STYLE_PROFILES } from './data/aesthetics';
import { fetchWeather } from './lib/weather';
import { expandICalEvents, fetchICalURL, parseICS } from './lib/ical';
import { buildContextFromEvents, groupEventsForOutfits, timeKey } from './engine/context';
import { generateOutfits } from './engine/generate';
import { closetLimits } from './engine/limits';
import { Home } from './screens/Home';
import { Closet } from './screens/Closet';
import { Saved } from './screens/Saved';
import { Profile } from './screens/Profile';
import { TabBar } from './components/TabBar';
import { describeOutfit } from './lib/copy';

/* ============================================================
   APP — one signed-in closet (or the read-only demo closet).
   Profile and items come from Supabase via Root; per-device
   extras (calendar, saved outfits, learning) live in `store`,
   which is scoped to this account.
============================================================ */
export function App({ userId, initialProfile, initialItems, readOnly = false, store, onSaveProfile, onSignOut, onExitDemo }) {
  const [theme, setTheme] = useState(() => storage.get(KEYS.theme) || 'light');
  const [profile, setProfile] = useState(initialProfile);
  const [items, setItems] = useState(initialItems);
  const [events, setEvents] = useState(() => store.get(KEYS.events, {}));
  const [feedback, setFeedback] = useState(() => store.get(KEYS.feedback, {
    saved: [], skipped: [], pieces: {},
    weights: {}, // aesthetic-tag → learned preference (-1..+inf)
    recentSigs: [], // {sig, ts} of worn outfits — anti-repeat
    skippedSigs: [], // {sig, ts} — what NOT to suggest
  }));
  const [notify, setNotify] = useState(() => store.get(KEYS.notify, { enabled: false, perm: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported' }));
  const [location, setLocation] = useState(() => store.get(KEYS.location, null));
  const [weather, setWeather] = useState(() => store.get(KEYS.weather, null));
  const [history, setHistory] = useState(() => store.get(KEYS.history, []));
  const [savedOutfits, setSavedOutfits] = useState(() => store.get(KEYS.saved, []));
  const [planned, setPlanned] = useState(() => store.get(KEYS.planned, []));
  const [icalUrl, setIcalUrl] = useState(() => store.get(KEYS.icalUrl, null));
  const [icalLast, setIcalLast] = useState(() => store.get(KEYS.icalLast, null));

  const [tab, setTab] = useState('home');
  const [vibe, setVibe] = useState(null);
  const [toast, setToast] = useState(null); // string | { msg, action: { label, onClick } }
  const _toastTimer = useRef(null);

  // theme — also swap the iOS status-bar color via meta theme-color
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    storage.set(KEYS.theme, theme);
    try {
      // Remove the auto media-query metas first so our manual one wins.
      const metas = document.head.querySelectorAll('meta[name="theme-color"]');
      metas.forEach(m => m.parentNode && m.parentNode.removeChild(m));
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = theme === 'dark' ? '#111110' : '#FAFAF8';
      document.head.appendChild(meta);
    } catch (e) {}
  }, [theme]);

  // sync persistent slices
  useEffect(() => { store.set(KEYS.events, events); }, [events]);
  useEffect(() => { store.set(KEYS.feedback, feedback); }, [feedback]);
  useEffect(() => { store.set(KEYS.location, location); }, [location]);
  useEffect(() => { store.set(KEYS.weather, weather); }, [weather]);
  useEffect(() => { store.set(KEYS.history, history); }, [history]);
  useEffect(() => { store.set(KEYS.saved, savedOutfits); }, [savedOutfits]);
  useEffect(() => { store.set(KEYS.planned, planned); }, [planned]);
  useEffect(() => { store.set(KEYS.icalUrl, icalUrl); }, [icalUrl]);
  useEffect(() => { store.set(KEYS.icalLast, icalLast); }, [icalLast]);
  useEffect(() => { store.set(KEYS.notify, notify); }, [notify]);

  // Weight decay — apply once per calendar day to fade old strong signals.
  // Multiplies all aesthetic-tag weights by 0.97, drops any below 0.05 in
  // magnitude. Runs at most once per day via a local `lastDecay` marker.
  // Triggered on boot AND on visibilitychange so a long-running PWA still decays.
  useEffect(() => {
    const dayMs = 86400000;
    function maybeDecay() {
      const lastDecay = store.get(KEYS.feedbackDecay, 0);
      if (Date.now() - lastDecay < dayMs) return;
      setFeedback(prev => {
        const ws = { ...(prev.weights || {}) };
        let changed = false;
        for (const k of Object.keys(ws)) {
          const next = ws[k] * 0.97;
          if (Math.abs(next) < 0.05) { delete ws[k]; changed = true; }
          else if (next !== ws[k]) { ws[k] = next; changed = true; }
        }
        return changed ? { ...prev, weights: ws } : prev;
      });
      store.set(KEYS.feedbackDecay, Date.now());
    }
    maybeDecay();
    function onVis() { if (!document.hidden) maybeDecay(); }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // refresh weather if stale (>30 min) and we have location
  useEffect(() => {
    async function refresh() {
      if (!location) return;
      if (weather && (Date.now() - (weather.fetchedAt || 0) < 30 * 60 * 1000)) return;
      try {
        const w = await fetchWeather(location.lat, location.lng);
        setWeather(w);
      } catch (e) { /* silent */ }
    }
    refresh();
  }, [location]);

  // Re-schedule morning notifications for any planned outfits in the next 7 days.
  // setTimeout-based scheduling doesn't survive a page reload — we rebuild on boot.
  // When the user toggles reminders off, cancel any that we'd already queued.
  // Debounced so rapid `planned` mutations (e.g. bulk import) don't thrash.
  useEffect(() => {
    if (!notify?.enabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      cancelAllScheduledReminders();
      return;
    }
    const t = setTimeout(() => {
      cancelAllScheduledReminders();
      const cutoff = Date.now() + 7 * 86400000;
      for (const p of planned) {
        const [y, m, d] = (p.dateKey || '').split('-').map(Number);
        if (!y) continue;
        const when = new Date(y, m - 1, d, 7, 30).getTime();
        if (when < Date.now() || when > cutoff) continue;
        const summary = (p.items || []).map(i => i.role).join(' · ');
        scheduleMorningReminder(p.id, p.dateKey, `Today's planned fit — ${summary}`);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [notify?.enabled, planned]);

  // auto-refresh ical if URL is saved and last sync was >2hr ago
  useEffect(() => {
    async function syncIcal() {
      if (!icalUrl) return;
      if (icalLast && (Date.now() - icalLast < 2 * 60 * 60 * 1000)) return;
      try {
        const text = await fetchICalURL(icalUrl);
        importICalText(text);
        setIcalLast(Date.now());
      } catch (e) { /* silent on auto-refresh */ }
    }
    syncIcal();
  }, [icalUrl]);

  // Replaces ical-sourced events for the current 7-day window;
  // keeps user-typed events untouched.
  function importICalText(text) {
    const parsed = parseICS(text);
    const now = new Date();
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to = new Date(now); to.setDate(to.getDate() + 7); to.setHours(23, 59, 59, 999);
    const expanded = expandICalEvents(parsed, from, to);
    setEvents(prev => {
      const next = { ...prev };
      // strip prior ical-sourced events in the window
      for (let i = 0; i < 8; i++) {
        const d = new Date(from); d.setDate(d.getDate() + i);
        const k = d.toISOString().slice(0, 10);
        if (next[k]) next[k] = next[k].filter(e => e.source !== 'ical');
      }
      // add new
      for (const inst of expanded) {
        if (!next[inst.dateKey]) next[inst.dateKey] = [];
        if (!next[inst.dateKey].some(e => e.id === inst.id)) {
          next[inst.dateKey].push(inst);
        }
      }
      // sort by time
      for (const k of Object.keys(next)) {
        next[k] = next[k].sort((a, b) => timeKey(a.time).localeCompare(timeKey(b.time)));
      }
      return next;
    });
    return expanded.length;
  }

  async function connectIcalUrl(url) {
    try {
      const text = await fetchICalURL(url);
      const n = importICalText(text);
      setIcalUrl(url);
      setIcalLast(Date.now());
      showToast(`Connected — ${n} event${n === 1 ? '' : 's'} this week`);
      return { ok: true, count: n };
    } catch (e) {
      const reason = e.cause || 'unknown';
      const messages = {
        cors_or_offline: 'Browser blocked the fetch. Google & Apple calendars usually need the file upload below.',
        host_not_allowed: 'Only Google, iCloud and Outlook calendar links can sync automatically. Use the file upload below.',
        not_calendar: 'That URL didn\'t return calendar data.',
        http: `Server said ${e.status || 'no'} — link may be private or expired.`,
      };
      showToast('Could not connect');
      return { ok: false, reason, message: messages[reason] || 'Could not fetch.' };
    }
  }
  function importIcalFile(text) {
    try {
      const n = importICalText(text);
      setIcalLast(Date.now());
      showToast(`Imported ${n} event${n === 1 ? '' : 's'}`);
      return true;
    } catch (e) {
      showToast('Could not parse that file');
      return false;
    }
  }
  function disconnectIcal() {
    setIcalUrl(null);
    setIcalLast(null);
    // strip ical events
    setEvents(prev => {
      const next = {};
      for (const k of Object.keys(prev)) {
        const filtered = prev[k].filter(e => e.source !== 'ical');
        if (filtered.length) next[k] = filtered;
      }
      return next;
    });
    showToast('Disconnected');
  }

  function showToast(msg, opts) {
    if (_toastTimer.current) { clearTimeout(_toastTimer.current); _toastTimer.current = null; }
    const action = opts?.action || null;
    const duration = opts?.duration || (action ? 5000 : 1800);
    setToast(action ? { msg, action } : msg);
    _toastTimer.current = setTimeout(() => { setToast(null); _toastTimer.current = null; }, duration);
  }

  // Surface a quota-full warning the first time we see it.
  useEffect(() => onStorageQuota(() => {
    setToast('Browser storage is full, so saved outfits and calendar events may not be kept.');
    setTimeout(() => setToast(null), 6000);
  }), []);

  // Profile edits show immediately, then save; roll back if the save fails.
  async function updateProfile(next) {
    const before = profile;
    setProfile(next);
    if (readOnly) return true;
    try {
      await onSaveProfile(next);
      return true;
    } catch (e) {
      setProfile(before);
      // 23505 = unique violation: someone else already uses that link name.
      showToast(e.code === '23505' ? 'That link name is taken. Try another.' : 'Couldn’t save that change');
      return false;
    }
  }

  // derived — todayKey uses LOCAL date (not UTC) so it doesn't flip a day
  // early for users in negative-UTC zones. State so it refreshes past midnight.
  function computeTodayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const [todayKey, setTodayKey] = useState(computeTodayKey);
  useEffect(() => {
    function refresh() {
      const next = computeTodayKey();
      setTodayKey(prev => prev === next ? prev : next);
    }
    // Refresh on visibility (cheap) + a 1-minute interval (covers tab-foreground crossings of midnight).
    const onVis = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVis);
    const intervalId = setInterval(refresh, 60 * 1000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(intervalId); };
  }, []);
  const todayEvents = events[todayKey] || [];
  const context = useMemo(() => buildContextFromEvents(todayEvents, weather, profile, todayKey),
    [todayEvents, weather, profile, todayKey]);
  const outfits = useMemo(
    () => generateOutfits(items, profile, context, feedback, vibe),
    [items, profile, context, feedback, vibe]
  );

  // Slot-aware outfits — group same-kind events into one outfit, split distinctly
  // different events into their own. If you have 3 lectures + a 7pm dinner,
  // you get one "Campus day" outfit AND one "Date" outfit, not four.
  const slots = useMemo(() => groupEventsForOutfits(todayEvents), [todayEvents]);
  const slotPicks = useMemo(() => {
    if (!slots.length) return [];
    return slots.map(slot => {
      const slotContext = buildContextFromEvents(slot.events, weather, profile, todayKey);
      const slotOutfits = generateOutfits(items, profile, slotContext, feedback, vibe);
      return {
        ...slot,
        context: slotContext,
        primary: slotOutfits[0] || null,
        alternates: slotOutfits.slice(1, 3),
      };
    });
  }, [slots, items, profile, weather, feedback, vibe, todayKey]);
  const limits = useMemo(() => closetLimits(items, weather, todayEvents), [items, weather, todayEvents]);

  const learningInsight = useMemo(() => {
    const ws = feedback.weights || {};
    const ranked = Object.entries(ws).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (!ranked.length || Math.abs(ranked[0][1]) < 1.5) return null;
    const [tag, val] = ranked[0];
    const profName = STYLE_PROFILES[tag]?.name?.toLowerCase() || tag;
    if (val > 0) return `You’ve been choosing a lot of ${profName} pieces, so they’ll come up more often.`;
    return `You’ve been skipping ${profName} pieces, so they’ll come up less.`;
  }, [feedback.weights]);

  // Helper — nudge weight vector based on the items in an outfit and a delta.
  // Returns the flat tag list nudged so the caller can store it for an exact
  // inverse later (undo). nudgeWeights(items, delta) preserved as a wrapper.
  function nudgeWeightsByTags(tags, delta) {
    if (!tags || !tags.length || !delta) return;
    setFeedback(prev => {
      const ws = { ...(prev.weights || {}) };
      for (const tag of tags) ws[tag] = (ws[tag] || 0) + delta;
      return { ...prev, weights: ws };
    });
  }
  function nudgeWeights(items, delta) {
    const tags = [];
    for (const it of items) for (const tag of (it.styles || [])) tags.push(tag);
    nudgeWeightsByTags(tags, delta);
    return tags;
  }
  function pushRecentSig(items) {
    const sig = items.map(i => i.id).sort().join('|');
    setFeedback(prev => {
      const cutoff = Date.now() - 14 * 86400000;
      const rs = (prev.recentSigs || [])
        .filter(s => s.ts > cutoff && s.sig !== sig); // de-dupe; latest ts wins
      rs.push({ sig, ts: Date.now() });
      return { ...prev, recentSigs: rs.slice(-50) };
    });
  }
  function pushSkippedSig(items) {
    const sig = items.map(i => i.id).sort().join('|');
    setFeedback(prev => {
      const cutoff = Date.now() - 30 * 86400000;
      const ss = (prev.skippedSigs || [])
        .filter(s => s.ts > cutoff && s.sig !== sig);
      ss.push({ sig, ts: Date.now() });
      return { ...prev, skippedSigs: ss.slice(-50) };
    });
  }

  // ======== ACTIONS ========
  // Closet changes are saved to Supabase. In the read-only demo they stay
  // in memory, so visitors can try things without changing the real closet.
  function persistItem(id, patch) {
    if (readOnly) return;
    api.updateItem(id, patch).catch(() => showToast('Couldn’t save to your closet — check your connection'));
  }
  async function addItem(fields, photoBlob) {
    const item = await api.addItem(userId, fields, photoBlob);
    setItems(prev => [...prev, item]);
    showToast('Added to your closet');
    return item;
  }
  function updateItem(id, patch) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    persistItem(id, patch);
  }
  async function removeItem(id) {
    const target = items.find(i => i.id === id);
    if (!target) return;
    try {
      if (!readOnly) await api.deleteItem(target);
    } catch (e) {
      showToast('Couldn’t remove that piece. Try again.');
      return;
    }
    setItems(prev => prev.filter(i => i.id !== id));
    // cascade: prune from saved outfits, planned, and history so they never
    // point at a deleted piece.
    setSavedOutfits(prev => prev
      .map(s => ({ ...s, items: (s.items || []).filter(i => i.id !== id) }))
      .filter(s => (s.items || []).length > 0)
    );
    setPlanned(prev => prev
      .map(p => ({ ...p, items: (p.items || []).filter(i => i.id !== id) }))
      .filter(p => (p.items || []).length > 0)
    );
    setHistory(prev => prev
      .map(h => ({ ...h, items: (h.items || []).filter(itemId => itemId !== id) }))
      .filter(h => (h.items || []).length > 0)
    );
    setFeedback(prev => ({
      ...prev,
      pieces: Object.fromEntries(Object.entries(prev.pieces || {}).filter(([k]) => k !== id)),
    }));
  }

  function addEvent(dateKey, ev) {
    setEvents(prev => ({
      ...prev,
      [dateKey]: [...(prev[dateKey] || []), { id: 'ev_' + Date.now(), ...ev }]
    }));
  }
  function removeEvent(dateKey, evId) {
    setEvents(prev => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).filter(e => e.id !== evId)
    }));
  }

  function saveOutfit(outfit, reasons) {
    const itemList = Object.values(outfit).filter(Boolean);
    const id = 'sv_' + Date.now();
    const entry = {
      id,
      savedAt: Date.now(),
      items: itemList.map(i => ({ id: i.id, name: i.name, role: i.role, color: i.color, photoPath: i.photoPath, styles: i.styles })),
      reasons,
    };
    setSavedOutfits(prev => [entry, ...prev]);
    setFeedback(prev => ({ ...prev, saved: [...prev.saved, id] }));
    nudgeWeights(itemList, 0.5); // saving = mild positive
    showToast('Saved to your edits');
  }

  function planOutfit(outfit, dateKey) {
    const id = 'pl_' + Date.now();
    const itemList = Object.values(outfit).filter(Boolean);
    setPlanned(prev => [...prev, {
      id, dateKey, plannedAt: Date.now(),
      items: itemList.map(i => ({ id: i.id, name: i.name, role: i.role, color: i.color, photoPath: i.photoPath })),
    }]);
    // schedule a morning notification if permission granted
    const titleColor = itemList[0]?.color || '';
    const summary = itemList.map(i => i.role).join(' · ');
    scheduleMorningReminder(id, dateKey, `${titleColor} fit ready — ${summary}`);
    showToast(`Planned for ${dateKey}`);
  }

  function markWorn(outfit) {
    const now = Date.now();
    const itemList = Object.values(outfit).filter(Boolean);
    const ids = itemList.map(i => i.id);
    // Snapshot state for undo
    const priorItems = items.filter(i => ids.includes(i.id))
      .map(i => ({ id: i.id, lastWorn: i.lastWorn, state: i.state }));
    const sig = ids.slice().sort().join('|');
    const recordTs = Date.now();

    setItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, lastWorn: now, state: 'recent' } : i));
    for (const id of ids) persistItem(id, { lastWorn: now, state: 'recent' });
    // Dedupe: if today already has an entry with the same items, replace rather
    // than append. Same outfit re-wear shouldn't double up in history.
    setHistory(prev => {
      const sigKey = ids.slice().sort().join('|');
      const filtered = prev.filter(h => !(h.date === todayKey && (h.items || []).slice().sort().join('|') === sigKey));
      return [{ date: todayKey, items: ids }, ...filtered].slice(0, 30);
    });
    pushRecentSig(itemList);
    // Capture the exact tag list nudged so undo reverses precisely those tags,
    // even if the user edits an item's styles before tapping Undo.
    const nudgedTags = nudgeWeights(itemList, 0.8);

    showToast('Marked as worn', {
      action: {
        label: 'Undo',
        onClick: () => {
          // Restore each item's lastWorn / state
          setItems(prev => prev.map(i => {
            const p = priorItems.find(x => x.id === i.id);
            return p ? { ...i, lastWorn: p.lastWorn, state: p.state } : i;
          }));
          for (const p of priorItems) persistItem(p.id, { lastWorn: p.lastWorn, state: p.state });
          // Drop today's history entry that matches our ids
          setHistory(prev => prev.filter(h => !(h.date === todayKey && (h.items || []).join('|') === ids.join('|'))));
          // Reverse the recent-sig push (filter out the entry we just added)
          setFeedback(prev => ({
            ...prev,
            recentSigs: (prev.recentSigs || []).filter(s => !(s.sig === sig && Math.abs(s.ts - recordTs) < 5000)),
          }));
          // Reverse the +0.8 weight nudge against the *exact tags* we nudged.
          nudgeWeightsByTags(nudgedTags, -0.8);
          showToast('Undone');
        }
      }
    });
  }

  function skipOutfit(outfit) {
    const itemList = Object.values(outfit).filter(Boolean);
    pushSkippedSig(itemList);
    nudgeWeights(itemList, -0.4); // skipping = mild negative
    showToast('Got it — won\'t suggest this');
  }

  // Render the day's outfit as a downloadable IG-story-sized PNG. Composites
  // the 4 piece photos in a 2x2 grid + EDIT branding + outfit title + the
  // top rationale chip + weather context. Sized 1080x1920 (9:16).
  async function shareOutfitImage(outfit, reasons) {
    try {
      showToast('Building shareable image…');
      await new Promise(r => setTimeout(r, 0));
      const W = 1080, H = 1920;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      // Background gradient
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#F4EFE6');
      g.addColorStop(1, '#ECE5D7');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // Wordmark
      ctx.fillStyle = '#0F0F0F';
      ctx.font = 'italic 72px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('edit', W / 2, 180);
      ctx.font = '24px -apple-system, sans-serif';
      ctx.fillStyle = '#5C5C5C';
      ctx.fillText('today\'s pick', W / 2, 220);

      // Resolve outfit items, load their photos into Image objects
      const items = Object.values(outfit || {}).filter(Boolean).slice(0, 4);
      const photoUrls = await Promise.all(items.map(async (it) => {
        if (it.photo) return it.photo;
        try { return await api.photoUrl(it.photoPath); } catch (e) { return null; }
      }));
      const images = await Promise.all(photoUrls.map(url => new Promise(res => {
        if (!url) return res(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = url;
      })));

      // 2×2 collage in the middle
      const gridSize = 800, gap = 16;
      const cell = (gridSize - gap) / 2;
      const x0 = (W - gridSize) / 2, y0 = 320;
      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x0, y0, gridSize, gridSize);
      for (let i = 0; i < 4; i++) {
        const cx = x0 + (i % 2) * (cell + gap);
        const cy = y0 + Math.floor(i / 2) * (cell + gap);
        ctx.fillStyle = '#F7F4EE';
        ctx.fillRect(cx, cy, cell, cell);
        if (images[i]) {
          // cover-fit
          const im = images[i];
          const r = Math.max(cell / im.width, cell / im.height);
          const dw = im.width * r, dh = im.height * r;
          const dx = cx + (cell - dw) / 2, dy = cy + (cell - dh) / 2;
          ctx.save();
          ctx.beginPath();
          ctx.rect(cx, cy, cell, cell);
          ctx.clip();
          ctx.drawImage(im, dx, dy, dw, dh);
          ctx.restore();
        }
      }
      ctx.restore();

      // Title
      ctx.fillStyle = '#0F0F0F';
      ctx.font = 'italic 56px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.font = 'italic 40px Georgia, serif';
      ctx.fillText(describeOutfit(outfit), W / 2, y0 + gridSize + 110, W - 120);

      // Top reason
      const reason = (reasons && reasons[0]) || 'picked for your day';
      ctx.font = '28px -apple-system, sans-serif';
      ctx.fillStyle = '#6B5D45';
      ctx.fillText(`— ${reason} —`, W / 2, y0 + gridSize + 170);

      // Weather + date footer
      if (weather) {
        ctx.font = '24px -apple-system, sans-serif';
        ctx.fillStyle = '#5C5C5C';
        const wstr = `${weather.condition || ''} · ${Math.round(weather.temp)}°  ·  ${location?.city || ''}`;
        ctx.fillText(wstr, W / 2, H - 140);
      }
      ctx.font = '20px -apple-system, sans-serif';
      ctx.fillStyle = '#9C968C';
      ctx.fillText(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), W / 2, H - 100);
      ctx.fillText('styled with EDIT', W / 2, H - 60);

      // Download
      canvas.toBlob((blob) => {
        if (!blob) { showToast('Could not generate image'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `edit-${new Date().toISOString().slice(0,10)}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Saved to downloads');
      }, 'image/png');
      // Revoke any temporary IDB URLs we made
      for (const u of photoUrls) {
        if (u && u.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(u), 5000);
      }
    } catch (e) {
      showToast('Share failed');
    }
  }

  function ratePiece(itemId, rating) {
    setFeedback(prev => {
      const prior = prev.pieces?.[itemId] || null;
      const next = prior === rating ? null : rating;
      if (prior === next) return prev;
      const ws = { ...(prev.weights || {}) };
      const item = items.find(i => i.id === itemId);
      if (item) {
        // Reverse the prior rating's contribution before applying the new one
        // so toggling love→hate doesn't pollute weights with stale signal.
        const valueOf = (r) => r === 'love' ? 0.6 : r === 'hate' ? -0.6 : 0;
        const netDelta = valueOf(next) - valueOf(prior);
        if (netDelta !== 0) {
          for (const tag of (item.styles || [])) {
            ws[tag] = (ws[tag] || 0) + netDelta;
          }
        }
      }
      return { ...prev, pieces: { ...prev.pieces, [itemId]: next }, weights: ws };
    });
  }

  // ======== RENDER ========
  return (
    <div className="phone">
      {readOnly && (
        <div className="demo-banner">
          <span>You’re viewing {profile.name ? `${profile.name}’s` : 'a'} closet. Nothing you do here is saved.</span>
          <button onClick={onExitDemo}>Make your own</button>
        </div>
      )}
      <div className="scroll">
        {tab === 'home' && (
          <Home
            profile={profile}
            items={items}
            events={events}
            todayKey={todayKey}
            todayEvents={todayEvents}
            location={location}
            weather={weather}
            context={context}
            outfits={outfits}
            slotPicks={slotPicks}
            vibe={vibe}
            setVibe={setVibe}
            limits={limits}
            readOnly={readOnly}
            learningInsight={learningInsight}
            feedback={feedback}
            onAddItem={() => setTab('closet')}
            onAddEvent={(ev) => addEvent(todayKey, ev)}
            onRemoveEvent={(id) => removeEvent(todayKey, id)}
            onSetLocation={setLocation}
            onRefreshWeather={async () => {
              if (!location) return;
              try {
                const w = await fetchWeather(location.lat, location.lng);
                setWeather(w);
                showToast('Weather updated');
              } catch(e) { showToast('Could not refresh'); }
            }}
            onSave={saveOutfit}
            onPlan={planOutfit}
            onWorn={markWorn}
            onSkip={skipOutfit}
            onShare={shareOutfitImage}
            onRatePiece={ratePiece}
            onSwap={() => setVibe(null)}
            icalUrl={icalUrl}
            icalLast={icalLast}
            onConnectIcalUrl={connectIcalUrl}
            onImportIcalFile={importIcalFile}
            onDisconnectIcal={disconnectIcal}
          />
        )}
        {tab === 'closet' && (
          <Closet
            items={items}
            readOnly={readOnly}
            onAdd={addItem}
            onUpdate={updateItem}
            onRemove={removeItem}
          />
        )}
        {tab === 'saved' && (
          <Saved
            saved={savedOutfits}
            planned={planned}
            items={items}
            onUnsave={(id) => {
              setSavedOutfits(prev => prev.filter(s => s.id !== id));
              setFeedback(prev => ({ ...prev, saved: prev.saved.filter(x => x !== id) }));
            }}
            onWear={(itemList) => markWorn(itemList)}
          />
        )}
        {tab === 'profile' && (
          <Profile
            profile={profile}
            items={items}
            userId={userId}
            readOnly={readOnly}
            onUpdate={updateProfile}
            onSignOut={onSignOut}
            showToast={showToast}
            theme={theme}
            onTheme={setTheme}
            location={location}
            onSetLocation={setLocation}
            notify={notify}
            onSetNotify={setNotify}
            feedback={feedback}
            onClearSkips={() => {
              setFeedback(prev => ({ ...prev, skippedSigs: [] }));
              showToast('Skipped outfits can show up again');
            }}
            onClearLearning={() => {
              setFeedback(prev => ({ ...prev, weights: {}, pieces: {}, recentSigs: [], skippedSigs: [] }));
              showToast('Learning reset');
            }}
          />
        )}
      </div>
      <TabBar tab={tab} setTab={setTab} />
      {toast && (
        typeof toast === 'string'
          ? <div className="toast"><span className="mark mark-light"></span>{toast}</div>
          : <div className="toast">
              <span className="mark mark-light"></span>
              <span style={{flex: 1}}>{toast.msg}</span>
              <button className="toast-action" onClick={() => {
                if (_toastTimer.current) { clearTimeout(_toastTimer.current); _toastTimer.current = null; }
                try { toast.action.onClick(); } catch (e) {}
                setToast(null);
              }}>{toast.action.label}</button>
            </div>
      )}
    </div>
  );
}
