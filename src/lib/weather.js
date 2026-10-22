/* ============================================================
   WEATHER (Open-Meteo, no API key, browser CORS friendly)
============================================================ */
export const WMO = {
  0: { label: 'clear', icon: 'sun', warmth: 0 },
  1: { label: 'mostly clear', icon: 'sun', warmth: 0 },
  2: { label: 'partly cloudy', icon: 'cloud-sun', warmth: 0 },
  3: { label: 'cloudy', icon: 'cloud', warmth: 0 },
  45: { label: 'fog', icon: 'fog', warmth: 0 },
  48: { label: 'fog', icon: 'fog', warmth: 0 },
  51: { label: 'drizzle', icon: 'rain', warmth: 0 },
  53: { label: 'drizzle', icon: 'rain', warmth: 0 },
  55: { label: 'drizzle', icon: 'rain', warmth: 0 },
  61: { label: 'rain', icon: 'rain', warmth: 0 },
  63: { label: 'rain', icon: 'rain', warmth: 0 },
  65: { label: 'heavy rain', icon: 'rain', warmth: 0 },
  71: { label: 'snow', icon: 'snow', warmth: -1 },
  73: { label: 'snow', icon: 'snow', warmth: -1 },
  75: { label: 'heavy snow', icon: 'snow', warmth: -2 },
  80: { label: 'showers', icon: 'rain', warmth: 0 },
  81: { label: 'showers', icon: 'rain', warmth: 0 },
  82: { label: 'heavy showers', icon: 'rain', warmth: 0 },
  95: { label: 'thunderstorm', icon: 'storm', warmth: 0 },
  96: { label: 'thunderstorm', icon: 'storm', warmth: 0 },
  99: { label: 'thunderstorm', icon: 'storm', warmth: 0 },
};

export async function fetchWeather(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation,apparent_temperature` +
    `&hourly=temperature_2m,precipitation_probability,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
    `&temperature_unit=celsius&wind_speed_unit=kmh&forecast_days=2&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('weather fetch failed');
  return parseWeather(await res.json());
}

// Open-Meteo forecast JSON → the app's weather shape.
export function parseWeather(data) {
  const cur = data.current;
  const hourly = data.hourly;
  const todayHi = data.daily.temperature_2m_max[0];
  const todayLo = data.daily.temperature_2m_min[0];
  const tomorrowHi = data.daily.temperature_2m_max[1];
  const tomorrowLo = data.daily.temperature_2m_min[1];
  const todayPrecip = data.daily.precipitation_probability_max[0];
  const variability = todayHi - todayLo;
  const wmo = WMO[cur.weather_code] || { label: 'unknown', icon: 'cloud', warmth: 0 };
  return {
    fetchedAt: Date.now(),
    temp: Math.round(cur.temperature_2m),
    feels: Math.round(cur.apparent_temperature),
    humidity: cur.relative_humidity_2m,
    wind: Math.round(cur.wind_speed_10m),
    code: cur.weather_code,
    condition: wmo.label,
    icon: wmo.icon,
    precip: cur.precipitation || 0,
    todayHi: Math.round(todayHi),
    todayLo: Math.round(todayLo),
    tomorrowHi: Math.round(tomorrowHi),
    tomorrowLo: Math.round(tomorrowLo),
    rainChance: todayPrecip || 0,
    variability: Math.round(variability),
    timezone: data.timezone,
    // hourly trajectory — used to score for the actual event hour, not "now"
    hourly: {
      time: hourly.time,
      temp: hourly.temperature_2m,
      precipChance: hourly.precipitation_probability,
      code: hourly.weather_code,
    },
  };
}

// Returns a synthetic weather snapshot at a given event time string ("HH:MM"),
// or null if no hourly trajectory is available. Falls back to current weather.
export function weatherAtEventTime(weather, dateKey, timeStr) {
  if (!weather?.hourly?.time?.length) return weather;
  if (!timeStr) return weather;
  const [hh, mm] = timeStr.split(':').map(Number);
  if (Number.isNaN(hh)) return weather;
  // hourly.time entries from Open-Meteo are local-time naive ISO strings
  // ("YYYY-MM-DDTHH:MM"). Find the closest hour to (dateKey, hh) — this
  // tolerates DST gaps and minor format drift across timezones.
  const targetMs = new Date(`${dateKey}T${String(hh).padStart(2,'0')}:${String(mm||0).padStart(2,'0')}:00`).getTime();
  let idx = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < weather.hourly.time.length; i++) {
    const t = weather.hourly.time[i];
    if (typeof t !== 'string' || !t.startsWith(dateKey)) continue;
    const ms = new Date(t.length === 16 ? `${t}:00` : t).getTime();
    if (Number.isNaN(ms)) continue;
    const diff = Math.abs(ms - targetMs);
    if (diff < bestDiff) { bestDiff = diff; idx = i; }
  }
  if (idx < 0) return weather;
  const t = weather.hourly.temp[idx];
  const code = weather.hourly.code[idx];
  const wmo = WMO[code] || { label: 'unknown', icon: 'cloud', warmth: 0 };
  return {
    ...weather,
    temp: Math.round(t),
    feels: Math.round(t),
    code,
    condition: wmo.label,
    icon: wmo.icon,
    rainChance: weather.hourly.precipChance[idx] ?? weather.rainChance,
    _atTime: timeStr,
  };
}

// Coldest forecast temperature from `timeStr` to `hours` later on that day,
// or null without hourly data. Used to spot afternoons that cool off fast.
export function coolestBetween(weather, dateKey, timeStr, hours) {
  const h = weather?.hourly;
  if (!h?.time?.length || !timeStr) return null;
  const [hh, mm] = timeStr.split(':').map(Number);
  if (Number.isNaN(hh)) return null;
  const start = new Date(`${dateKey}T${String(hh).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')}:00`).getTime();
  const end = start + hours * 3600000;
  let coolest = null;
  for (let i = 0; i < h.time.length; i++) {
    const t = h.time[i];
    if (typeof t !== 'string' || !t.startsWith(dateKey)) continue;
    const ms = new Date(t.length === 16 ? `${t}:00` : t).getTime();
    if (ms < start - 1800000 || ms > end) continue;
    const temp = h.temp[i];
    if (typeof temp === 'number' && (coolest === null || temp < coolest)) coolest = temp;
  }
  return coolest === null ? null : Math.round(coolest);
}

export async function reverseGeocode(lat, lng) {
  // BigDataCloud free reverse geocode (no key, browser CORS ok)
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('reverse geo failed');
  const d = await res.json();
  return {
    city: d.city || d.locality || d.principalSubdivision || 'Unknown',
    region: d.principalSubdivision || '',
    country: d.countryName || '',
  };
}

// US state + Canadian province codes, so "Paris, TX" / "Victoria, BC" resolve.
export const REGION_CODES = Object.fromEntries(('al alabama|ak alaska|az arizona|ar arkansas|ca california|co colorado|ct connecticut|de delaware|fl florida|ga georgia|hi hawaii|id idaho|il illinois|in indiana|ia iowa|ks kansas|ky kentucky|la louisiana|me maine|md maryland|ma massachusetts|mi michigan|mn minnesota|ms mississippi|mo missouri|mt montana|ne nebraska|nv nevada|nh new hampshire|nj new jersey|nm new mexico|ny new york|nc north carolina|nd north dakota|oh ohio|ok oklahoma|or oregon|pa pennsylvania|ri rhode island|sc south carolina|sd south dakota|tn tennessee|tx texas|ut utah|vt vermont|va virginia|wa washington|wv west virginia|wi wisconsin|wy wyoming|dc district of columbia|' +
  'ab alberta|bc british columbia|mb manitoba|nb new brunswick|nl newfoundland and labrador|ns nova scotia|on ontario|pe prince edward island|qc quebec|sk saskatchewan|nt northwest territories|nu nunavut|yt yukon')
  .split('|').map(e => [e.slice(0, 2), e.slice(3)]));

// "Victoria" alone ranks Vitória, Brazil first. Accept "City, Region/Country"
// (full name, code or initials, e.g. "Victoria, BC"), otherwise prefer a match
// in the user's own timezone, then an exact name match, then the API's order.
export async function geocodeCity(query) {
  const [name, ...rest] = query.split(',').map(s => s.trim());
  const qualifier = rest.join(' ').toLowerCase();
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('geocode failed');
  const d = await res.json();
  if (!d.results || !d.results.length) return null;
  const initials = s => (s || '').split(/\s+/).map(w => w[0] || '').join('').toLowerCase();
  const q = REGION_CODES[qualifier] || qualifier;
  const qCode = q.replace(/[^a-z]/g, '');
  const matchesQualifier = r => [r.admin1, r.country, r.country_code].some(v => {
    if (!v) return false;
    const lv = v.toLowerCase();
    return lv.includes(q) || initials(v) === qCode || lv === initials(q);
  });
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {}
  const pool = qualifier ? d.results.filter(matchesQualifier) : d.results;
  const r = (qualifier && pool[0])
    || pool.find(x => tz && x.timezone === tz)
    || pool.find(x => x.name.toLowerCase() === name.toLowerCase())
    || d.results[0];
  return { lat: r.latitude, lng: r.longitude, city: r.name, region: r.admin1 || '', country: r.country || '' };
}

export function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { timeout: 10000, maximumAge: 60 * 60 * 1000 }
    );
  });
}
