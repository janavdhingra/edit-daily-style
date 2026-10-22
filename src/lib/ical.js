/* ============================================================
   ICAL — parses .ics calendar exports and public iCal URLs.
   Handles: SUMMARY, DTSTART (date/datetime, UTC or floating),
   RRULE FREQ=WEEKLY/DAILY with BYDAY, multi-line value folding.
============================================================ */
export function unfoldICS(text) {
  // RFC 5545: lines starting with space/tab are continuations of previous line
  return text.replace(/\r?\n[ \t]/g, '');
}
export function unescapeText(s) {
  return s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}
// Microsoft / Outlook calendars often emit TZID values that aren't IANA names
// (e.g. "Eastern Standard Time"). Map the common ones to IANA so Intl can
// resolve them. Anything not in this table just falls through and Intl will
// either accept it (real IANA name) or throw → we fall back to local time.
export const _TZ_ALIAS = {
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'Atlantic Standard Time': 'America/Halifax',
  'Newfoundland Standard Time': 'America/St_Johns',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Romance Standard Time': 'Europe/Paris',
  'Central European Standard Time': 'Europe/Warsaw',
  'E. Europe Standard Time': 'Europe/Bucharest',
  'FLE Standard Time': 'Europe/Helsinki',
  'GTB Standard Time': 'Europe/Athens',
  'Russian Standard Time': 'Europe/Moscow',
  'Turkey Standard Time': 'Europe/Istanbul',
  'Israel Standard Time': 'Asia/Jerusalem',
  'Egypt Standard Time': 'Africa/Cairo',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'Arabian Standard Time': 'Asia/Dubai',
  'Arab Standard Time': 'Asia/Riyadh',
  'India Standard Time': 'Asia/Kolkata',
  'Bangladesh Standard Time': 'Asia/Dhaka',
  'SE Asia Standard Time': 'Asia/Bangkok',
  'Singapore Standard Time': 'Asia/Singapore',
  'China Standard Time': 'Asia/Shanghai',
  'Taipei Standard Time': 'Asia/Taipei',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Korea Standard Time': 'Asia/Seoul',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'AUS Central Standard Time': 'Australia/Darwin',
  'W. Australia Standard Time': 'Australia/Perth',
  'New Zealand Standard Time': 'Pacific/Auckland',
  'UTC': 'UTC', 'UTC+12': 'Etc/GMT-12', 'UTC-11': 'Etc/GMT+11',
};
export function _resolveTZID(tzid) {
  if (!tzid) return tzid;
  // Strip surrounding quotes and a leading "/" some sources prepend.
  const cleaned = tzid.replace(/^"|"$/g, '').replace(/^\//, '').trim();
  return _TZ_ALIAS[cleaned] || cleaned;
}
// Returns offset in ms between UTC and the named IANA timezone at the moment
// `date` represents. Used to convert a TZID-tagged wallclock to UTC.
export function _tzOffsetMs(date, timeZone) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const parts = dtf.formatToParts(date);
    const o = {};
    for (const p of parts) o[p.type] = p.value;
    const hh = +o.hour === 24 ? 0 : +o.hour;
    const tzAsUtc = Date.UTC(+o.year, +o.month - 1, +o.day, hh, +o.minute, +o.second);
    return tzAsUtc - date.getTime();
  } catch (e) { return null; }
}
export function parseICalDate(value, params) {
  // YYYYMMDD or YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ. Honors TZID= param when set.
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se, z] = m;
  const yy = +y, mm = +mo - 1, dd = +d, hh = +(h || 0), mn = +(mi || 0), ss = +(se || 0);
  if (z === 'Z') return new Date(Date.UTC(yy, mm, dd, hh, mn, ss));
  const tzid = params && params.TZID;
  if (tzid) {
    // Treat the wallclock as if it were UTC, then subtract the named-tz offset
    // for that instant to get the actual UTC moment. Browsers will then render
    // it in the user's local zone. Microsoft TZ aliases are resolved via _TZ_ALIAS.
    const resolved = _resolveTZID(tzid);
    const asUtc = new Date(Date.UTC(yy, mm, dd, hh, mn, ss));
    const off = _tzOffsetMs(asUtc, resolved);
    // Unknown zone: fall back to local wall-clock time rather than UTC.
    if (off === null) return new Date(yy, mm, dd, hh, mn, ss);
    return new Date(asUtc.getTime() - off);
  }
  return new Date(yy, mm, dd, hh, mn, ss);
}
export function parseRRule(s) {
  const r = {};
  s.split(';').forEach(p => { const [k, v] = p.split('='); if (k) r[k.toUpperCase()] = v; });
  return r;
}
export function parseICS(text) {
  const out = [];
  const lines = unfoldICS(text).split(/\r?\n/);
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.title && cur._dtstart) out.push(cur);
      cur = null; continue;
    }
    if (!cur) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const left = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const [keyName, ...paramParts] = left.split(';');
    const params = {};
    paramParts.forEach(p => { const [k, v] = p.split('='); if (k) params[k.toUpperCase()] = v; });
    const key = keyName.toUpperCase();
    if (key === 'SUMMARY') cur.title = unescapeText(value);
    else if (key === 'DTSTART') cur._dtstart = parseICalDate(value, params);
    else if (key === 'DTEND') cur._dtend = parseICalDate(value, params);
    else if (key === 'RRULE') cur._rrule = parseRRule(value);
    else if (key === 'UID') cur._uid = value;
  }
  return out;
}
export const ICAL_DAY_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
export function expandICalEvents(events, fromDate, toDate) {
  const out = [];
  const fromMs = fromDate.getTime();
  const toMs = toDate.getTime();
  for (const ev of events) {
    const start = ev._dtstart;
    if (!start) continue;
    const rule = ev._rrule || null;
    const freq = rule?.FREQ || null;
    const interval = parseInt(rule?.INTERVAL || '1', 10) || 1;
    const untilStr = rule?.UNTIL;
    const until = untilStr ? parseICalDate(untilStr, {}) : null;
    const count = rule?.COUNT ? parseInt(rule.COUNT, 10) : null;
    const cap = until ? Math.min(toMs, until.getTime()) : toMs;
    const pushIfInRange = (d, occurrenceIdx) => {
      if (count != null && occurrenceIdx >= count) return false;
      if (d.getTime() > cap) return false;
      if (d.getTime() >= fromMs) out.push(makeInstance(ev, d));
      return true;
    };

    if (freq === 'WEEKLY') {
      const byday = (rule.BYDAY || '').split(',').map(d => ICAL_DAY_MAP[d.toUpperCase()]).filter(d => d !== undefined);
      const days = byday.length ? byday : [start.getDay()];
      // Walk weekly steps; for each step, fan out to BYDAY days.
      let weekStart = new Date(start); weekStart.setHours(0, 0, 0, 0);
      let occurrence = 0;
      while (weekStart.getTime() <= cap) {
        for (const dow of days) {
          const inst = new Date(weekStart);
          const offset = (dow - inst.getDay() + 7) % 7;
          inst.setDate(inst.getDate() + offset);
          inst.setHours(start.getHours(), start.getMinutes(), 0, 0);
          if (inst.getTime() < start.getTime()) continue;
          if (!pushIfInRange(inst, occurrence)) break;
          occurrence++;
        }
        // Step by calendar days, not 7×24h, so daylight-saving changes
        // don't shift the week start off midnight.
        weekStart = new Date(weekStart);
        weekStart.setDate(weekStart.getDate() + interval * 7);
      }
    } else if (freq === 'DAILY') {
      let cur = new Date(start);
      let occurrence = 0;
      while (cur.getTime() <= cap) {
        if (!pushIfInRange(cur, occurrence)) break;
        occurrence++;
        cur = new Date(cur);
        cur.setDate(cur.getDate() + interval); // keeps wall-clock time across DST
      }
    } else if (freq === 'MONTHLY') {
      // Lock to the original day-of-month. If the next month doesn't have it
      // (e.g. Jan 31 → Feb), pin to the last valid day of that month rather
      // than letting Date.setMonth roll into March.
      const targetDay = start.getDate();
      let occurrence = 0;
      let stepIdx = 0;
      while (true) {
        const probe = new Date(start.getFullYear(), start.getMonth() + stepIdx * interval, 1, start.getHours(), start.getMinutes(), start.getSeconds());
        const lastDay = new Date(probe.getFullYear(), probe.getMonth() + 1, 0).getDate();
        probe.setDate(Math.min(targetDay, lastDay));
        if (probe.getTime() > cap) break;
        if (!pushIfInRange(probe, occurrence)) break;
        occurrence++;
        stepIdx++;
      }
    } else if (freq === 'YEARLY') {
      // Same pinning logic for Feb 29 in non-leap years.
      const targetMonth = start.getMonth();
      const targetDay = start.getDate();
      let occurrence = 0;
      let stepIdx = 0;
      while (true) {
        const year = start.getFullYear() + stepIdx * interval;
        const probe = new Date(year, targetMonth, 1, start.getHours(), start.getMinutes(), start.getSeconds());
        const lastDay = new Date(year, targetMonth + 1, 0).getDate();
        probe.setDate(Math.min(targetDay, lastDay));
        if (probe.getTime() > cap) break;
        if (!pushIfInRange(probe, occurrence)) break;
        occurrence++;
        stepIdx++;
      }
    } else if (start.getTime() >= fromMs && start.getTime() <= toMs) {
      out.push(makeInstance(ev, start));
    }
  }
  return out;
}
export function makeInstance(ev, when) {
  // Zero-padded to match <input type="time"> so times sort correctly as text.
  const h = String(when.getHours()).padStart(2, '0'), m = String(when.getMinutes()).padStart(2, '0');
  const dateKey = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;
  return {
    id: 'ic_' + (ev._uid || (ev.title + when.getTime())).replace(/[^a-z0-9]/gi, '').slice(0, 40),
    title: ev.title,
    time: `${h}:${m}`,
    dateKey,
    source: 'ical',
  };
}
export async function fetchICalURL(url) {
  // Some public calendars use webcal:// — convert to https://
  let u = url.trim();
  if (u.startsWith('webcal://')) u = 'https://' + u.slice(9);
  let res;
  try {
    res = await fetch(u);
  } catch (e) {
    // Browser fetches commonly fail here for two reasons:
    //  - Network unreachable (offline)
    //  - The remote calendar lacks CORS headers, which Google's secret iCal
    //    URL and Apple's public links both do.
    // When hosted on Netlify, retry through the same-origin relay
    // (netlify/functions/ical.mjs). The secret URL goes in the POST body,
    // never the query string. If the relay isn't there (file://, other
    // hosts), fall back to recommending the file-upload path.
    try {
      res = await fetch('/.netlify/functions/ical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      });
      // The relay tags every response; without the tag we hit a host with no relay.
      if (!res.headers.get('x-edit-relay')) res = null;
    } catch (_) {
      res = null;
    }
    if (!res) {
      const err = new Error('ical_network');
      err.cause = 'cors_or_offline';
      throw err;
    }
    if (res.status === 403) {
      const err = new Error('ical_host_not_allowed');
      err.cause = 'host_not_allowed';
      throw err;
    }
  }
  if (!res.ok) {
    const err = new Error('ical_http_' + res.status);
    err.cause = 'http';
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    const err = new Error('ical_not_calendar');
    err.cause = 'not_calendar';
    throw err;
  }
  return text;
}
