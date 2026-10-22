import { inferOccasionFromTitle } from './context';
import { isAvailable } from './generate';

/* ============================================================
   CLOSET LIMITS — honest notes about what today's pick can't cover.
   EDIT only styles what you own, so this never suggests buying
   anything; it says what the closet is short on and what the pick
   does about it.
============================================================ */
export function closetLimits(items, weather, todayEvents) {
  const notes = [];
  const available = items.filter(isAvailable);
  if (!available.length) return notes;

  const away = items.length - available.length;
  if (away > 0) {
    notes.push({ kind: 'away', text: `${away} ${away === 1 ? 'piece is' : 'pieces are'} in the wash or at the cleaners, so ${away === 1 ? 'it’s' : 'they’re'} left out today.` });
  }

  if (weather && weather.feels < 5 && !available.some(i => i.role === 'outer' && (i.warmth || 3) >= 4)) {
    notes.push({ kind: 'cold', text: `Nothing you own is rated warm enough for ${weather.feels}°, so today’s pick layers your warmest pieces.` });
  }

  const raining = weather && (weather.rainChance >= 50 || /rain|shower|drizzle/i.test(weather.condition || ''));
  if (raining && !available.some(i => i.tags?.includes('rain') || i.fabric === 'tech')) {
    notes.push({ kind: 'rain', text: 'None of your pieces are marked rain-ready. Bring an umbrella.' });
  }

  const formalEvent = (todayEvents || []).find(e => (inferOccasionFromTitle(e.title)?.formality[1] || 0) >= 4);
  if (formalEvent && !available.some(i => (i.formality || 2) >= 4)) {
    notes.push({ kind: 'formal', text: `Nothing in your closet is marked formal for “${formalEvent.title}”, so this is the sharpest option you have.` });
  }
  return notes;
}
