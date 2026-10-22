import { coolestBetween, weatherAtEventTime } from '../lib/weather';

/* ============================================================
   CONTEXT INFERENCE — calendar event title → occasion + formality
   This replaces the old keyword check with a richer pattern map.
============================================================ */
export const TITLE_RULES = [
  // academic — keyword set + generalized "DEPT 123" course-code match
  { p: /\b(lecture|class|tutorial|seminar|professor|instructor|cmpt|csc|cs|ece|elec|mech|comp|engr|psyc|math|bio|chem|engl|hist|econ|phys|stat)\s*\d{2,}[a-z]?\b|\b(lecture|class|tutorial|seminar|midterm|final|office hours)\b/i,
    occasions: ['university', 'lectures'], formality: [2, 3] },
  { p: /\b(exam|midterm|final)\b/i, occasions: ['university'], formality: [2, 3] },
  { p: /\b(office hours)\b/i, occasions: ['university'], formality: [2, 3] },
  { p: /\b(study|library)\b/i, occasions: ['university'], formality: [1, 2] },
  // professional
  { p: /\b(presentation|present|defense|defend|pitch|demo day)\b/i,
    occasions: ['presentations'], formality: [3, 4] },
  { p: /\b(interview)\b/i, occasions: ['interviews'], formality: [4, 5] },
  { p: /\b(meeting|sync|standup|stand-up|1:1|1-1|review|retro)\b/i,
    occasions: ['office', 'meetings'], formality: [2, 4] },
  { p: /\b(office|wfo|in-office)\b/i, occasions: ['office'], formality: [2, 4] },
  { p: /\b(client|board)\b/i, occasions: ['meetings'], formality: [4, 5] },
  // formal
  { p: /\b(wedding|gala|ceremony|reception)\b/i, occasions: ['wedding', 'formal'], formality: [4, 5] },
  { p: /\b(funeral|memorial)\b/i, occasions: ['formal'], formality: [4, 5] },
  // social
  { p: /\b(date|dinner with|drinks with|valentine)\b/i, occasions: ['date'], formality: [2, 4] },
  { p: /\b(dinner|reservation)\b/i, occasions: ['date', 'going-out'], formality: [2, 4] },
  { p: /\b(brunch|lunch|coffee|cafe)\b/i, occasions: ['brunch'], formality: [1, 3] },
  { p: /\b(party|club|bar|night out)\b/i, occasions: ['going-out'], formality: [2, 4] },
  { p: /\b(birthday)\b/i, occasions: ['going-out', 'brunch'], formality: [2, 3] },
  // active
  { p: /\b(gym|workout|run|yoga|pilates|swim|spin|crossfit)\b/i, occasions: ['workout'], formality: [1, 1] },
  { p: /\b(hike|walk|park)\b/i, occasions: ['lounge'], formality: [1, 2] },
  // travel
  { p: /\b(flight|airport|travel|train)\b/i, occasions: ['travel'], formality: [1, 3] },
  // home
  { p: /\b(call|zoom|hangout)\b/i, occasions: ['lounge'], formality: [1, 2] },
];

export function inferOccasionFromTitle(title) {
  if (!title) return null;
  for (const rule of TITLE_RULES) {
    if (rule.p.test(title)) {
      return { occasions: rule.occasions, formality: rule.formality };
    }
  }
  return null;
}

// Classify an event into a "kind" so we can group same-kind events into a single
// outfit (e.g. three classes back-to-back = ONE campus-day outfit), and split
// out distinctly different kinds into their own outfit suggestions.
export const EVENT_KINDS = [
  // Campus events: explicit keywords OR any 2-4 letter department code followed
  // by a 3+ digit course number (catches ECE 569A, CSC 503, PSYC 101, etc.).
  // Excludes a few common false-positives like "MTG 100" not being meeting.
  { id: 'campus', p: /\b(class|lecture|tutorial|seminar|course|campus|university|college|school|faculty|midterm|exam|finals?|office hours|study|library|professor|prof |instructor)\b|\b(psyc|math|cs|csc|bio|chem|engl|hist|econ|phys|soc|anth|stat|ece|elec|mech|civil|comp|engr|engg|eng|stat|busi|comm|geog|geol|envs|kin|nurs|phil|poli|relig|span|fren|germ|ital|chin|japn|hind|art|musc|thtr|film|educ|hlth|cmpt|info)\s*\d{2,}/i },
  { id: 'work-formal', p: /\b(interview|client|board|presentation|defense|defend|pitch|demo day)\b/i },
  { id: 'work', p: /\b(meeting|sync|standup|stand-up|1:1|1-1|review|retro|office|wfo|in-office|call|zoom|hangout)\b/i },
  { id: 'formal', p: /\b(wedding|gala|ceremony|reception|funeral|memorial)\b/i },
  { id: 'date', p: /\b(date|dinner with|drinks with|valentine|reservation)\b/i },
  { id: 'social', p: /\b(brunch|lunch|coffee|cafe|party|club|bar|night out|birthday|dinner)\b/i },
  { id: 'active', p: /\b(gym|workout|run|yoga|pilates|swim|spin|crossfit|hike|walk|park)\b/i },
  { id: 'travel', p: /\b(flight|airport|travel|train)\b/i },
];
export function classifyEventKind(title) {
  if (!title) return 'unknown';
  for (const k of EVENT_KINDS) if (k.p.test(title)) return k.id;
  return 'unknown';
}

// Group today's events into outfit slots. Same-kind events that overlap on the
// same day get merged into ONE slot — so 3 lectures = 1 campus-day outfit.
// Different-kind events stay separate. Each slot becomes its own context for
// the rec engine.
// "9:30" and "09:30" both mean half past nine, but as text "9:30" sorts after
// "13:00". Compare on a zero-padded key instead.
export function timeKey(time, fallback = '') {
  if (!time) return fallback;
  const [h, m = '00'] = String(time).split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

export function groupEventsForOutfits(todayEvents) {
  const events = (todayEvents || []).slice().sort((a, b) => timeKey(a.time, '00:00').localeCompare(timeKey(b.time, '00:00')));
  if (!events.length) return [];
  const buckets = new Map(); // kind → events[]
  for (const ev of events) {
    const kind = classifyEventKind(ev.title);
    if (!buckets.has(kind)) buckets.set(kind, []);
    buckets.get(kind).push(ev);
  }
  // If a day has campus events, those become the "primary" outfit for the day.
  // Other kinds become additional slots only if they're meaningfully different.
  const slots = [];
  for (const [kind, evs] of buckets.entries()) {
    if (kind === 'unknown' && buckets.size > 1) continue; // skip noise when other kinds exist
    slots.push({
      kind,
      events: evs,
      // Use the earliest event's time as the slot's anchor for weather targeting.
      anchorTime: evs[0].time || null,
      label: SLOT_LABEL[kind] || 'Out',
    });
  }
  // Order slots by anchor time so morning campus shows above evening dinner.
  slots.sort((a, b) => timeKey(a.anchorTime, '23:59').localeCompare(timeKey(b.anchorTime, '23:59')));
  return slots;
}
export const SLOT_LABEL = {
  'campus': 'Campus day',
  'work': 'Work',
  'work-formal': 'Work — formal',
  'formal': 'Formal event',
  'date': 'Date',
  'social': 'Social',
  'active': 'Active',
  'travel': 'Travel',
  'unknown': 'Day',
};

export function buildContextFromEvents(todayEvents, weather, profile, dateKey) {
  const occasions = new Set();
  let fMin = 1, fMax = 5;
  let fSet = false;
  let primaryEvent = null;
  let highestFormality = 0;
  for (const ev of (todayEvents || [])) {
    const inf = inferOccasionFromTitle(ev.title);
    if (inf) {
      inf.occasions.forEach(o => occasions.add(o));
      if (!fSet) { fMin = inf.formality[0]; fMax = inf.formality[1]; fSet = true; }
      else { fMin = Math.max(fMin, inf.formality[0]); fMax = Math.min(fMax, inf.formality[1]); }
      if (fMax < fMin) fMax = fMin;
      if (inf.formality[1] > highestFormality) {
        highestFormality = inf.formality[1];
        primaryEvent = { ...ev, occasions: inf.occasions };
      }
    }
  }
  if (!fSet) { fMin = 1; fMax = 3; }

  // If there's a primary event, score weather for that event's hour, not now.
  // Otherwise try the latest event of the day (you'll likely be out then).
  let weatherAt = weather;
  if (weather && dateKey) {
    const targetEvent = primaryEvent || (todayEvents || []).slice().sort((a, b) => timeKey(b.time).localeCompare(timeKey(a.time)))[0];
    if (targetEvent?.time) weatherAt = weatherAtEventTime(weather, dateKey, targetEvent.time);
  }

  // weather-derived warmth target (1-5 where 5=most warmth)
  let warmth = 3;
  if (weatherAt) {
    const t = weatherAt.feels ?? weatherAt.temp;
    if (t < -5) warmth = 5;
    else if (t < 5) warmth = 5;
    else if (t < 12) warmth = 4;
    else if (t < 18) warmth = 3;
    else if (t < 25) warmth = 2;
    else warmth = 1;
    // adjust for temp sensitivity
    if (profile?.tempSens === 'cold') warmth = Math.min(5, warmth + 1);
    if (profile?.tempSens === 'hot') warmth = Math.max(1, warmth - 1);
  }

  // Layering decisions: prefer the event-hour temp when we have one (so we don't
  // over-bundle for a noon brunch just because dawn was cold). When there's no
  // pinpoint event time, fall back to the day's low so we don't underdress for
  // an evening departure.
  const eventFeels = weatherAt?.feels;
  const hasEventTime = !!(primaryEvent && primaryEvent.time && weatherAt && weatherAt._atTime);
  const referenceFeels = hasEventTime
    ? eventFeels
    : (weather ? Math.min(eventFeels ?? weather.feels, weather.todayLo ?? weather.feels) : null);

  const layers = {
    needsOuter: referenceFeels !== null && referenceFeels < 14,
    needsRain: weatherAt ? (weatherAt.rainChance >= 50 || /rain|drizzle|shower/.test(weatherAt.condition || '')) : false,
    needsHeavyOuter: referenceFeels !== null && referenceFeels < 5,
    layeringDay: weather ? (weather.variability >= 9) : false,
    sun: weatherAt ? /clear|partly/.test(weatherAt.condition || '') : false,
    // Fine at the event's start, but cooling below coat weather within the
    // next few hours: suggest a light layer to carry, not a coat.
    carryLayer: false,
    coolsTo: null,
  };
  if (hasEventTime && !layers.needsOuter) {
    const later = coolestBetween(weather, dateKey, primaryEvent.time, 3);
    if (later !== null && later < 14 && later < referenceFeels) {
      layers.carryLayer = true;
      layers.coolsTo = later;
    }
  }

  return {
    occasions: Array.from(occasions),
    formality: [fMin, fMax],
    warmth,
    layers,
    primaryEvent,
    weather: weatherAt,
    weatherNow: weather,
  };
}
