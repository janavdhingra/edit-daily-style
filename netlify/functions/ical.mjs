// Same-origin relay for calendar subscription feeds.
// Google / Apple / Outlook iCal URLs don't send CORS headers, so the
// browser can't read them directly. The app POSTs the feed URL here
// (in the body, never the query string — the URL is a secret) and we
// fetch it server-side. Only known calendar hosts are allowed so this
// can't be used as an open proxy.

const ALLOWED_HOSTS = [
  /^calendar\.google\.com$/,
  /^p\d+-caldav\.icloud\.com$/,
  /^(www\.)?icloud\.com$/,
  /^outlook\.(live|office|office365)\.com$/,
];

const MAX_BYTES = 5 * 1024 * 1024;

// The app checks for this header to know the relay exists on this host.
const reply = (body, status, headers = {}) =>
  new Response(body, { status, headers: { 'X-Edit-Relay': '1', ...headers } });

export default async (req) => {
  if (req.method !== 'POST') return reply('Method not allowed', 405);

  let url;
  try {
    ({ url } = await req.json());
    url = new URL(String(url).trim().replace(/^webcal:\/\//i, 'https://'));
  } catch {
    return reply('Bad request', 400);
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.some(re => re.test(url.hostname))) {
    return reply('Calendar host not allowed', 403);
  }

  let upstream;
  try {
    upstream = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'EDIT-calendar-relay' } });
  } catch {
    return reply('Upstream unreachable', 502);
  }
  if (!upstream.ok) return reply('Upstream error', upstream.status === 404 ? 404 : 502);

  const text = await upstream.text();
  if (text.length > MAX_BYTES || !/BEGIN:VCALENDAR/i.test(text)) {
    return reply('Not a calendar', 422);
  }
  return reply(text, 200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' });
};
