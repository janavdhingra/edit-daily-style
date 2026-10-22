/* ============================================================
   NOTIFICATION SCHEDULER — best-effort morning reminders for
   planned outfits. Uses Notification API + setTimeout (works while
   the tab is open / PWA running).
============================================================ */
export async function requestNotificationPerm() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try { return await Notification.requestPermission(); }
  catch (e) { return 'denied'; }
}
export const _scheduledNotes = new Map(); // id -> timeoutId
export function cancelAllScheduledReminders() {
  for (const t of _scheduledNotes.values()) {
    try { clearTimeout(t); } catch (e) {}
  }
  _scheduledNotes.clear();
}
export function scheduleMorningReminder(planId, dateKey, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  // schedule for 7:30am of dateKey
  const [y, m, d] = dateKey.split('-').map(Number);
  const when = new Date(y, m - 1, d, 7, 30, 0, 0).getTime();
  const ms = when - Date.now();
  if (ms < 0 || ms > 24 * 3600 * 1000 * 7) return; // only schedule within a week
  if (_scheduledNotes.has(planId)) clearTimeout(_scheduledNotes.get(planId));
  const t = setTimeout(() => {
    try { new Notification('EDIT — your fit is ready', { body, tag: 'edit-' + planId, silent: false }); } catch (e) {}
  }, ms);
  _scheduledNotes.set(planId, t);
}
