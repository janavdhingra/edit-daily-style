import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  unfoldICS, unescapeText, parseICalDate, parseRRule, parseICS,
  expandICalEvents, makeInstance, fetchICalURL, _resolveTZID,
} from './ical';

// Tests run with TZ=America/Vancouver (see vite.config.js).
const local = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi);
const iso = (d) => d.toISOString();
const vevent = (lines) => `BEGIN:VEVENT\r\n${lines.join('\r\n')}\r\nEND:VEVENT`;
const calendar = (...events) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join('\r\n')}\r\nEND:VCALENDAR\r\n`;
const event = (rrule, start = '20261005T090000') => ({
  title: 'Class', _uid: 'u1', _dtstart: parseICalDate(start, {}), _rrule: rrule ? parseRRule(rrule) : undefined,
});
const expand = (ev, from, to) => expandICalEvents([ev], from, to);
const keys = (instances) => instances.map(i => `${i.dateKey} ${i.time}`);

describe('text helpers', () => {
  it('unfolds lines continued with a space or tab (RFC 5545)', () => {
    expect(unfoldICS('SUMMARY:Data Sci\r\n ence\r\n\tfor SE')).toBe('SUMMARY:Data Sciencefor SE');
    expect(unfoldICS('A\nB')).toBe('A\nB');
  });

  it('unescapes commas, semicolons, backslashes and newlines', () => {
    expect(unescapeText('Room 125\\, Building B\\; Main\\nCampus')).toBe('Room 125, Building B; Main Campus');
    expect(unescapeText('C:\\\\path')).toBe('C:\\path');
    expect(unescapeText('  padded  ')).toBe('padded');
  });

  it('parses RRULE key/value pairs', () => {
    expect(parseRRule('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4')).toEqual({ FREQ: 'WEEKLY', BYDAY: 'MO,WE', COUNT: '4' });
    expect(parseRRule('freq=daily')).toEqual({ FREQ: 'daily' });
  });

  it('maps Outlook timezone names to IANA names', () => {
    expect(_resolveTZID('Pacific Standard Time')).toBe('America/Los_Angeles');
    expect(_resolveTZID('"America/Vancouver"')).toBe('America/Vancouver');
    expect(_resolveTZID('/Europe/London')).toBe('Europe/London');
    expect(_resolveTZID(undefined)).toBeUndefined();
  });
});

describe('parseICalDate', () => {
  it('reads UTC timestamps', () => {
    expect(iso(parseICalDate('20260602T193000Z'))).toBe('2026-06-02T19:30:00.000Z');
  });

  it('converts a TZID wall-clock time to the right instant', () => {
    // 12:30 in Vancouver in June is PDT (UTC-7).
    expect(iso(parseICalDate('20260602T123000', { TZID: 'America/Vancouver' }))).toBe('2026-06-02T19:30:00.000Z');
    // 09:00 in New York in January is EST (UTC-5).
    expect(iso(parseICalDate('20260115T090000', { TZID: 'America/New_York' }))).toBe('2026-01-15T14:00:00.000Z');
  });

  it('understands Outlook-style timezone names', () => {
    expect(iso(parseICalDate('20260602T123000', { TZID: 'Pacific Standard Time' }))).toBe('2026-06-02T19:30:00.000Z');
  });

  it('treats a time without zone as local time', () => {
    expect(parseICalDate('20261007T090000', {})).toEqual(local(2026, 10, 7, 9));
  });

  it('treats a date-only value as local midnight', () => {
    expect(parseICalDate('20261007', {})).toEqual(local(2026, 10, 7));
  });

  it('falls back to local time for an unknown timezone instead of crashing', () => {
    expect(parseICalDate('20261007T090000', { TZID: 'Not/AZone' })).toEqual(local(2026, 10, 7, 9));
  });

  it('returns null for malformed values', () => {
    expect(parseICalDate('2026-10-07', {})).toBeNull();
    expect(parseICalDate('', {})).toBeNull();
    expect(parseICalDate('20261007T0900', {})).toBeNull();
  });
});

describe('parseICS', () => {
  it('reads events in the shape Google Calendar exports', () => {
    const text = calendar(
      vevent([
        'UID:abc123_20260602T193000Z',
        'SUMMARY:SELECTED TOPICS COMP ENGINEER: Artificial Intelligence ECE 569A A02',
        'DTSTART;TZID=America/Vancouver:20260602T123000',
        'DTEND;TZID=America/Vancouver:20260602T132000',
        'LOCATION:Engineering Comp Science Bldg Room: 125',
        'STATUS:CONFIRMED',
      ]),
      vevent([
        'UID:def456',
        'SUMMARY:Data Mining CSC 503 B01',
        'DTSTART:20260603T203000Z',
        'RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=10',
      ]),
    );
    const events = parseICS(text);
    expect(events).toHaveLength(2);
    expect(events[0].title).toBe('SELECTED TOPICS COMP ENGINEER: Artificial Intelligence ECE 569A A02');
    expect(iso(events[0]._dtstart)).toBe('2026-06-02T19:30:00.000Z');
    expect(iso(events[0]._dtend)).toBe('2026-06-02T20:20:00.000Z');
    expect(events[0]._uid).toBe('abc123_20260602T193000Z');
    expect(events[1]._rrule).toEqual({ FREQ: 'WEEKLY', BYDAY: 'WE', COUNT: '10' });
  });

  it('joins folded summaries and unescapes them', () => {
    const [ev] = parseICS(calendar(vevent(['SUMMARY:Coffee\\, then', '  library', 'DTSTART:20261007T170000Z'])));
    expect(ev.title).toBe('Coffee, then library');
  });

  it('skips events with no title or no start', () => {
    const events = parseICS(calendar(
      vevent(['DTSTART:20261007T170000Z']),
      vevent(['SUMMARY:No start']),
      vevent(['SUMMARY:Kept', 'DTSTART:20261007T170000Z']),
    ));
    expect(events.map(e => e.title)).toEqual(['Kept']);
  });

  it('ignores properties outside events and lines without a colon', () => {
    const events = parseICS('BEGIN:VCALENDAR\nSUMMARY:Calendar name\nBEGIN:VEVENT\nGARBAGE LINE\nSUMMARY:Real\nDTSTART:20261007T170000Z\nEND:VEVENT\nEND:VCALENDAR');
    expect(events.map(e => e.title)).toEqual(['Real']);
  });

  it('accepts Unix line endings', () => {
    expect(parseICS('BEGIN:VEVENT\nSUMMARY:Gym\nDTSTART:20261007T170000Z\nEND:VEVENT')).toHaveLength(1);
  });

  it('returns an empty list for empty or non-calendar text', () => {
    expect(parseICS('')).toEqual([]);
    expect(parseICS('<html>not a calendar</html>')).toEqual([]);
  });
});

describe('expandICalEvents', () => {
  const oct = (d, h = 0) => local(2026, 10, d, h);

  it('includes a one-off event inside the window', () => {
    expect(keys(expand(event(null, '20261007T090000'), oct(5), oct(12)))).toEqual(['2026-10-07 09:00']);
  });

  it('excludes a one-off event outside the window', () => {
    expect(expand(event(null, '20261020T090000'), oct(5), oct(12))).toEqual([]);
  });

  it('expands weekly classes on several weekdays', () => {
    const out = expand(event('FREQ=WEEKLY;BYDAY=MO,WE,FR'), oct(5), oct(18, 23));
    expect(keys(out)).toEqual([
      '2026-10-05 09:00', '2026-10-07 09:00', '2026-10-09 09:00',
      '2026-10-12 09:00', '2026-10-14 09:00', '2026-10-16 09:00',
    ]);
  });

  it('defaults a weekly rule to the start date’s weekday', () => {
    expect(keys(expand(event('FREQ=WEEKLY'), oct(1), oct(20)))).toEqual(['2026-10-05 09:00', '2026-10-12 09:00', '2026-10-19 09:00']);
  });

  it('respects INTERVAL for every-other-week events', () => {
    expect(keys(expand(event('FREQ=WEEKLY;INTERVAL=2'), oct(1), oct(31)))).toEqual(['2026-10-05 09:00', '2026-10-19 09:00']);
  });

  it('stops after COUNT occurrences', () => {
    expect(expand(event('FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=3'), oct(1), oct(31))).toHaveLength(3);
  });

  it('stops at UNTIL', () => {
    const out = expand(event('FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261014T235959Z'), oct(1), oct(31));
    expect(keys(out)).toEqual(['2026-10-05 09:00', '2026-10-07 09:00', '2026-10-12 09:00', '2026-10-14 09:00']);
  });

  it('only returns occurrences inside the window, not earlier ones', () => {
    const out = expand(event('FREQ=WEEKLY;BYDAY=MO'), oct(12), oct(13));
    expect(keys(out)).toEqual(['2026-10-12 09:00']);
  });

  it('expands daily events with an interval', () => {
    const ev = event('FREQ=DAILY;INTERVAL=2', '20261001T090000');
    expect(keys(expand(ev, oct(1), oct(10)))).toEqual([
      '2026-10-01 09:00', '2026-10-03 09:00', '2026-10-05 09:00', '2026-10-07 09:00', '2026-10-09 09:00',
    ]);
  });

  it('keeps daily events at the same wall-clock time across the clocks going back', () => {
    // Daylight saving ends in Vancouver on Sunday 1 November 2026.
    const ev = event('FREQ=DAILY', '20261030T090000');
    expect(keys(expand(ev, local(2026, 10, 30), local(2026, 11, 3)))).toEqual([
      '2026-10-30 09:00', '2026-10-31 09:00', '2026-11-01 09:00', '2026-11-02 09:00',
    ]);
  });

  it('keeps weekly events on the right days across the clocks going back', () => {
    const ev = event('FREQ=WEEKLY;BYDAY=MO,SU', '20261026T090000');
    expect(keys(expand(ev, local(2026, 10, 26), local(2026, 11, 16)))).toEqual([
      '2026-10-26 09:00', '2026-11-01 09:00', '2026-11-02 09:00', '2026-11-08 09:00', '2026-11-09 09:00', '2026-11-15 09:00',
    ]);
  });

  it('keeps weekly events at the same time across the clocks going forward', () => {
    // Daylight saving starts on Sunday 8 March 2026.
    const ev = event('FREQ=WEEKLY;BYDAY=TU', '20260303T093000');
    expect(keys(expand(ev, local(2026, 3, 1), local(2026, 3, 18)))).toEqual(['2026-03-03 09:30', '2026-03-10 09:30', '2026-03-17 09:30']);
  });

  it('pins monthly events on the 31st to the last day of shorter months', () => {
    const ev = event('FREQ=MONTHLY;COUNT=4', '20270131T180000');
    expect(keys(expand(ev, local(2027, 1, 1), local(2027, 12, 31)))).toEqual([
      '2027-01-31 18:00', '2027-02-28 18:00', '2027-03-31 18:00', '2027-04-30 18:00',
    ]);
  });

  it('pins yearly leap-day events to 28 February in other years', () => {
    const ev = event('FREQ=YEARLY', '20280229T120000');
    expect(keys(expand(ev, local(2028, 1, 1), local(2030, 12, 31)))).toEqual([
      '2028-02-29 12:00', '2029-02-28 12:00', '2030-02-28 12:00',
    ]);
  });

  it('skips events that failed to parse a start date', () => {
    expect(expandICalEvents([{ title: 'Broken', _dtstart: null }], oct(1), oct(31))).toEqual([]);
  });
});

describe('makeInstance', () => {
  it('builds a zero-padded date key and 24-hour time', () => {
    const inst = makeInstance({ title: 'Gym', _uid: 'x' }, local(2026, 3, 4, 7, 5));
    expect(inst).toMatchObject({ title: 'Gym', dateKey: '2026-03-04', time: '07:05', source: 'ical' });
  });

  it('produces times that sort correctly as text', () => {
    const morning = makeInstance({ title: 'A', _uid: 'a' }, local(2026, 10, 7, 9, 30)).time;
    const afternoon = makeInstance({ title: 'B', _uid: 'b' }, local(2026, 10, 7, 13, 0)).time;
    expect([afternoon, morning].sort()).toEqual([morning, afternoon]);
  });

  it('makes a short, safe id from the UID', () => {
    const inst = makeInstance({ title: 'X', _uid: 'abc-123@google.com' + 'z'.repeat(60) }, local(2026, 10, 7, 9));
    expect(inst.id).toMatch(/^ic_[a-z0-9]+$/i);
    expect(inst.id.length).toBeLessThanOrEqual(43);
  });

  it('falls back to title + time when there is no UID', () => {
    const a = makeInstance({ title: 'Gym' }, local(2026, 10, 7, 9));
    const b = makeInstance({ title: 'Gym' }, local(2026, 10, 8, 9));
    expect(a.id).not.toBe(b.id);
  });
});

describe('fetchICalURL', () => {
  const CAL = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR';
  const response = (body, { status = 200, relay = false } = {}) => new Response(body, {
    status, headers: relay ? { 'X-Edit-Relay': '1' } : {},
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetches a calendar directly when the browser allows it', async () => {
    const fetch = vi.fn().mockResolvedValue(response(CAL));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchICalURL('  https://example.org/cal.ics ')).resolves.toBe(CAL);
    expect(fetch).toHaveBeenCalledWith('https://example.org/cal.ics');
  });

  it('turns webcal:// links into https://', async () => {
    const fetch = vi.fn().mockResolvedValue(response(CAL));
    vi.stubGlobal('fetch', fetch);
    await fetchICalURL('webcal://p52-caldav.icloud.com/published/2/abc');
    expect(fetch).toHaveBeenCalledWith('https://p52-caldav.icloud.com/published/2/abc');
  });

  it('falls back to the relay when the browser blocks the request', async () => {
    const secret = 'https://calendar.google.com/calendar/ical/me/private-secret/basic.ics';
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(response(CAL, { relay: true }));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchICalURL(secret)).resolves.toBe(CAL);
    const [url, init] = fetch.mock.calls[1];
    expect(url).toBe('/.netlify/functions/ical');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ url: secret });
  });

  it('never puts the secret calendar link in the relay URL', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(response(CAL, { relay: true }));
    vi.stubGlobal('fetch', fetch);
    await fetchICalURL('https://calendar.google.com/secret');
    expect(fetch.mock.calls[1][0]).not.toContain('secret');
  });

  it('reports a CORS/offline problem when there is no relay on this host', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(response('<html>404</html>', { status: 404 })));
    await expect(fetchICalURL('https://calendar.google.com/x')).rejects.toMatchObject({ cause: 'cors_or_offline' });
  });

  it('reports a CORS/offline problem when the relay is unreachable too', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchICalURL('https://calendar.google.com/x')).rejects.toMatchObject({ cause: 'cors_or_offline' });
  });

  it('explains when the relay refuses a non-calendar host', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(response('nope', { status: 403, relay: true })));
    await expect(fetchICalURL('https://example.com/x.ics')).rejects.toMatchObject({ cause: 'host_not_allowed' });
  });

  it('reports HTTP errors with their status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('gone', { status: 404 })));
    await expect(fetchICalURL('https://example.org/cal.ics')).rejects.toMatchObject({ cause: 'http', status: 404 });
  });

  it('rejects responses that are not calendar data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('<html>login page</html>')));
    await expect(fetchICalURL('https://example.org/cal.ics')).rejects.toMatchObject({ cause: 'not_calendar' });
  });
});
