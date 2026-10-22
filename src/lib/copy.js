import { VIBES } from '../data/options';

/* ============================================================
   COPY — how outfits are described on screen. Outfits are named
   after the user's own pieces; reasons are plain sentences.
============================================================ */
const WEAR_ORDER = ['outer', 'dress', 'top', 'bottom', 'shoes', 'accessory'];

export function outfitPieces(outfit) {
  return WEAR_ORDER.map(role => outfit?.[role]).filter(Boolean);
}

// "Camel coat · White tee · Black trousers · Loafers" — the user's own names,
// listed rather than forced into a sentence so their capitalisation (and
// brand names) read naturally.
export function describeOutfit(outfit) {
  return outfitPieces(outfit).map(i => i.name).filter(Boolean).join(' · ');
}

const VIBE_LABEL = Object.fromEntries(VIBES.map(v => [v.id, v.label]));

export function explainReason(reason, context) {
  if (reason.startsWith('fits ')) return 'Right level of dressy for today';
  if (VIBE_LABEL[reason]) return `Matches the “${VIBE_LABEL[reason]}” setting`;
  const temp = context?.weather?.feels ?? context?.weather?.temp;
  switch (reason) {
    case 'color harmony': return 'The colours work together';
    case 'proportion': return 'Fitted and loose pieces balance out';
    case 'weather-right': return temp != null ? `Right weight for today (feels like ${temp}°)` : 'Right weight for the weather';
    case 'rain-ready': return 'Ready for rain';
    case 'carry-layer': return context?.layers?.coolsTo != null
      ? `A light layer for later, when it drops to ${context.layers.coolsTo}°`
      : 'A light layer for later, when it cools off';
    case 'matches the day': return context?.primaryEvent?.title ? `Right for “${context.primaryEvent.title}”` : 'Suits what’s on your calendar';
    case 'on-reference': return 'Matches the styles you like';
    case 'balanced silhouette': return 'The balanced shape you prefer';
    default: return reason;
  }
}

export function explainReasons(reasons, context) {
  return (reasons || []).map(r => explainReason(r, context));
}

// "16:00" → "4:00 PM", "9:05" → "9:05 AM"
export function formatTime(time) {
  if (!time) return '';
  const [h, m = '00'] = String(time).split(':');
  const hour = Number(h);
  if (Number.isNaN(hour)) return String(time);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m.padStart(2, '0')} ${suffix}`;
}

// One sentence on how the weather changes around today's plans, or '' when
// there is nothing worth saying.
export function describeForecast(context) {
  const w = context?.weather;
  if (!w) return '';
  const at = w._atTime ? ` at ${formatTime(w._atTime)}` : '';
  const parts = [];
  if (context.layers?.carryLayer && context.layers.coolsTo != null) {
    parts.push(`It’s ${w.temp}°${at}, dropping to ${context.layers.coolsTo}° over the next few hours.`);
  } else if (context.layers?.needsHeavyOuter) {
    parts.push(`Cold out: ${w.feels ?? w.temp}°${at}.`);
  } else if (context.layers?.needsOuter) {
    parts.push(`Cool enough for a jacket: ${w.feels ?? w.temp}°${at}.`);
  }
  if (context.layers?.needsRain) parts.push(`${w.rainChance ?? 0}% chance of rain.`);
  return parts.join(' ');
}
