import { describe, it, expect, vi, afterEach } from 'vitest';
import handler from './functions/ical.mjs';

const CAL = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
const post = (body) => new Request('https://edit.example/.netlify/functions/ical', {
  method: 'POST',
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const upstream = (body, status = 200) => vi.fn().mockResolvedValue(new Response(body, { status }));

afterEach(() => vi.unstubAllGlobals());

describe('calendar relay — allowed hosts', () => {
  it.each([
    'https://calendar.google.com/calendar/ical/me%40gmail.com/private-abc/basic.ics',
    'https://p52-caldav.icloud.com/published/2/abc',
    'https://icloud.com/published/abc',
    'https://www.icloud.com/published/abc',
    'https://outlook.live.com/owa/calendar/abc/calendar.ics',
    'https://outlook.office365.com/owa/calendar/abc/reachcalendar.ics',
  ])('fetches %s', async (url) => {
    const fetch = upstream(CAL);
    vi.stubGlobal('fetch', fetch);
    const res = await handler(post({ url }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(CAL);
    expect(String(fetch.mock.calls[0][0])).toBe(url);
  });

  it('turns webcal:// links into https://', async () => {
    const fetch = upstream(CAL);
    vi.stubGlobal('fetch', fetch);
    const res = await handler(post({ url: 'webcal://p52-caldav.icloud.com/published/2/abc' }));
    expect(res.status).toBe(200);
    expect(String(fetch.mock.calls[0][0])).toBe('https://p52-caldav.icloud.com/published/2/abc');
  });

  it('returns calendar data that is never cached', async () => {
    vi.stubGlobal('fetch', upstream(CAL));
    const res = await handler(post({ url: 'https://calendar.google.com/x.ics' }));
    expect(res.headers.get('content-type')).toMatch(/^text\/calendar/);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('calendar relay — refuses to be an open proxy', () => {
  it.each([
    ['another site', 'https://example.com/cal.ics'],
    ['plain http', 'http://calendar.google.com/x.ics'],
    ['a look-alike domain', 'https://calendar.google.com.evil.example/x.ics'],
    ['a google subdomain that is not Calendar', 'https://docs.google.com/x'],
    ['a username trick', 'https://calendar.google.com@evil.example/x.ics'],
    ['a local address', 'https://localhost/x.ics'],
    ['a private IP', 'https://169.254.169.254/latest/meta-data'],
    ['a file URL', 'file:///etc/passwd'],
  ])('blocks %s', async (_, url) => {
    const fetch = upstream(CAL);
    vi.stubGlobal('fetch', fetch);
    const res = await handler(post({ url }));
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('only accepts POST, so secret links never end up in URLs or logs', async () => {
    const res = await handler(new Request('https://edit.example/.netlify/functions/ical?url=https://calendar.google.com/x'));
    expect(res.status).toBe(405);
  });

  it.each([
    ['invalid JSON', 'not json'],
    ['no url', {}],
    ['an unparseable url', { url: 'not a url' }],
  ])('rejects %s', async (_, body) => {
    const res = await handler(post(body));
    expect(res.status).toBe(400);
  });
});

describe('calendar relay — upstream problems', () => {
  const google = { url: 'https://calendar.google.com/x.ics' };

  it('reports an unreachable calendar as 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    expect((await handler(post(google))).status).toBe(502);
  });

  it('passes through "not found" so the app can say the link expired', async () => {
    vi.stubGlobal('fetch', upstream('missing', 404));
    expect((await handler(post(google))).status).toBe(404);
  });

  it('turns other upstream errors into 502', async () => {
    vi.stubGlobal('fetch', upstream('nope', 401));
    expect((await handler(post(google))).status).toBe(502);
  });

  it('refuses responses that are not calendar data', async () => {
    vi.stubGlobal('fetch', upstream('<html>Sign in</html>'));
    expect((await handler(post(google))).status).toBe(422);
  });

  it('refuses huge responses', async () => {
    vi.stubGlobal('fetch', upstream(CAL + 'X'.repeat(5 * 1024 * 1024)));
    expect((await handler(post(google))).status).toBe(422);
  });
});

describe('calendar relay — identifies itself', () => {
  it('tags every response so the app can tell the relay exists', async () => {
    vi.stubGlobal('fetch', upstream(CAL));
    const responses = [
      await handler(post({ url: 'https://calendar.google.com/x.ics' })),
      await handler(post({ url: 'https://example.com' })),
      await handler(post('bad')),
      await handler(new Request('https://edit.example/')),
    ];
    for (const r of responses) expect(r.headers.get('x-edit-relay')).toBe('1');
  });
});
