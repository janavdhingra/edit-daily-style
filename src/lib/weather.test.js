import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWeather, weatherAtEventTime, coolestBetween, geocodeCity, reverseGeocode, WMO } from './weather';

afterEach(() => vi.unstubAllGlobals());
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

describe('fetchWeather', () => {
  const payload = {
    timezone: 'America/Vancouver',
    current: { temperature_2m: 11.6, apparent_temperature: 9.4, relative_humidity_2m: 80, weather_code: 61, wind_speed_10m: 14.7, precipitation: 0.4 },
    hourly: { time: ['2026-10-07T00:00'], temperature_2m: [10], precipitation_probability: [70], weather_code: [61] },
    daily: {
      temperature_2m_max: [13.4, 15.6], temperature_2m_min: [7.5, 8.2],
      precipitation_probability_max: [85, 20], weather_code: [61, 2],
    },
  };

  it('turns the Open-Meteo response into the app’s weather shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(payload)));
    const w = await fetchWeather(48.43, -123.37);
    expect(w).toMatchObject({
      temp: 12, feels: 9, humidity: 80, wind: 15, code: 61,
      condition: 'rain', icon: 'rain', precip: 0.4,
      todayHi: 13, todayLo: 8, tomorrowHi: 16, tomorrowLo: 8,
      rainChance: 85, variability: 6, timezone: 'America/Vancouver',
    });
    expect(w.hourly).toEqual({ time: ['2026-10-07T00:00'], temp: [10], precipChance: [70], code: [61] });
    expect(typeof w.fetchedAt).toBe('number');
  });

  it('asks for the right coordinates in Celsius and km/h', async () => {
    const fetch = vi.fn().mockResolvedValue(json(payload));
    vi.stubGlobal('fetch', fetch);
    await fetchWeather(48.43, -123.37);
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('latitude=48.43');
    expect(url).toContain('longitude=-123.37');
    expect(url).toContain('temperature_unit=celsius');
    expect(url).toContain('wind_speed_unit=kmh');
  });

  it('labels unknown weather codes instead of crashing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ...payload, current: { ...payload.current, weather_code: 42 } })));
    expect((await fetchWeather(0, 0)).condition).toBe('unknown');
  });

  it('treats a missing precipitation chance as 0%', async () => {
    const daily = { ...payload.daily, precipitation_probability_max: [null, null] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ...payload, daily })));
    expect((await fetchWeather(0, 0)).rainChance).toBe(0);
  });

  it('throws when the weather service fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 500)));
    await expect(fetchWeather(0, 0)).rejects.toThrow('weather fetch failed');
  });

  it('knows every rain code is rainy', () => {
    for (const code of [51, 53, 55, 61, 63, 65, 80, 81, 82]) expect(WMO[code].icon).toBe('rain');
  });
});

describe('weatherAtEventTime', () => {
  const base = {
    temp: 8, feels: 6, code: 0, condition: 'clear', icon: 'sun', rainChance: 10,
    hourly: {
      time: ['2026-10-07T08:00', '2026-10-07T12:00', '2026-10-07T18:00', '2026-10-08T12:00'],
      temp: [7.6, 15.4, 11.2, 20],
      precipChance: [0, 20, 80, 0],
      code: [0, 2, 61, 0],
    },
  };

  it('returns the forecast for the closest hour on that day', () => {
    const w = weatherAtEventTime(base, '2026-10-07', '17:30');
    expect(w).toMatchObject({ temp: 11, feels: 11, code: 61, condition: 'rain', rainChance: 80, _atTime: '17:30' });
  });

  it('accepts unpadded times', () => {
    expect(weatherAtEventTime(base, '2026-10-07', '8:00').temp).toBe(8);
  });

  it('only looks at hours on the requested day', () => {
    expect(weatherAtEventTime(base, '2026-10-08', '09:00').temp).toBe(20);
  });

  it('keeps the rest of the weather data', () => {
    expect(weatherAtEventTime(base, '2026-10-07', '12:00').hourly).toBe(base.hourly);
  });

  it('falls back to current weather when it cannot pin an hour', () => {
    expect(weatherAtEventTime(base, '2026-12-25', '12:00')).toBe(base);
    expect(weatherAtEventTime(base, '2026-10-07', null)).toBe(base);
    expect(weatherAtEventTime(base, '2026-10-07', 'noon')).toBe(base);
    const noHourly = { temp: 8 };
    expect(weatherAtEventTime(noHourly, '2026-10-07', '12:00')).toBe(noHourly);
    expect(weatherAtEventTime(null, '2026-10-07', '12:00')).toBeNull();
  });

  it('uses the day’s rain chance when the hour has none', () => {
    const w = { ...base, hourly: { ...base.hourly, precipChance: [null, null, null, null] } };
    expect(weatherAtEventTime(w, '2026-10-07', '12:00').rainChance).toBe(10);
  });
});

describe('geocodeCity', () => {
  // Real results for "Victoria" come back with Brazil first.
  const victoria = { results: [
    { name: 'Vitória', admin1: 'Espírito Santo', country: 'Brazil', country_code: 'BR', timezone: 'America/Sao_Paulo', latitude: -20.3, longitude: -40.3 },
    { name: 'Victoria', admin1: 'British Columbia', country: 'Canada', country_code: 'CA', timezone: 'America/Vancouver', latitude: 48.43, longitude: -123.37 },
    { name: 'Victoria', admin1: 'Central and Western', country_code: 'HK', timezone: 'Asia/Hong_Kong', latitude: 22.28, longitude: 114.15 },
    { name: 'Victoria', admin1: 'Texas', country: 'United States', country_code: 'US', timezone: 'America/Chicago', latitude: 28.8, longitude: -97 },
  ] };
  const paris = { results: [
    { name: 'Paris', admin1: 'Île-de-France', country: 'France', country_code: 'FR', timezone: 'Europe/Paris', latitude: 48.85, longitude: 2.35 },
    { name: 'Paris', admin1: 'Texas', country: 'United States', country_code: 'US', timezone: 'America/Chicago', latitude: 33.66, longitude: -95.55 },
    { name: 'Paris', admin1: 'Ontario', country: 'Canada', country_code: 'CA', timezone: 'America/Toronto', latitude: 43.2, longitude: -80.38 },
  ] };
  const stub = (data) => { const f = vi.fn().mockResolvedValue(json(data)); vi.stubGlobal('fetch', f); return f; };

  it('prefers a city in the user’s own timezone', async () => {
    stub(victoria);
    expect(await geocodeCity('Victoria')).toMatchObject({ city: 'Victoria', region: 'British Columbia', country: 'Canada', lat: 48.43, lng: -123.37 });
  });

  it.each([
    ['Victoria, BC', 'British Columbia'],
    ['Victoria, British Columbia', 'British Columbia'],
    ['Victoria, Texas', 'Texas'],
    ['Victoria, TX', 'Texas'],
    ['Victoria, Hong Kong', 'Central and Western'],
    ['Victoria, HK', 'Central and Western'],
    ['Victoria, Brazil', 'Espírito Santo'],
  ])('understands "%s"', async (query, region) => {
    stub(victoria);
    expect((await geocodeCity(query)).region).toBe(region);
  });

  it.each([
    ['Paris', 'Île-de-France'],
    ['Paris, TX', 'Texas'],
    ['Paris, ON', 'Ontario'],
    ['Paris, Canada', 'Ontario'],
    ['Paris, France', 'Île-de-France'],
  ])('resolves "%s"', async (query, region) => {
    stub(paris);
    expect((await geocodeCity(query)).region).toBe(region);
  });

  it('only sends the city name to the search API', async () => {
    const fetch = stub(victoria);
    await geocodeCity('Victoria, BC');
    expect(fetch.mock.calls[0][0]).toContain('name=Victoria&');
  });

  it('falls back to the top result when the qualifier matches nothing', async () => {
    stub(paris);
    expect((await geocodeCity('Paris, Narnia')).region).toBe('Île-de-France');
  });

  it('returns null when nothing is found', async () => {
    stub({});
    expect(await geocodeCity('Nowhereville')).toBeNull();
    stub({ results: [] });
    expect(await geocodeCity('Nowhereville')).toBeNull();
  });

  it('throws when the search service fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 503)));
    await expect(geocodeCity('Victoria')).rejects.toThrow('geocode failed');
  });

  it('copes with a missing region or country', async () => {
    stub({ results: [{ name: 'Atlantis', latitude: 1, longitude: 2 }] });
    expect(await geocodeCity('Atlantis')).toEqual({ lat: 1, lng: 2, city: 'Atlantis', region: '', country: '' });
  });
});

describe('reverseGeocode', () => {
  it('names the city for a coordinate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ city: 'Victoria', principalSubdivision: 'British Columbia', countryName: 'Canada' })));
    expect(await reverseGeocode(48.4, -123.4)).toEqual({ city: 'Victoria', region: 'British Columbia', country: 'Canada' });
  });

  it('falls back through locality and region when there is no city', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ locality: 'Saanich' })));
    expect((await reverseGeocode(0, 0)).city).toBe('Saanich');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({})));
    expect((await reverseGeocode(0, 0)).city).toBe('Unknown');
  });
});

describe('coolestBetween', () => {
  // Victoria, Saturday 10 October 2026: 14° at 4pm, 11° by 7pm.
  const w = { hourly: {
    time: ['2026-10-10T15:00', '2026-10-10T16:00', '2026-10-10T17:00', '2026-10-10T18:00', '2026-10-10T19:00', '2026-10-10T20:00', '2026-10-11T16:00'],
    temp: [14.2, 14.1, 13.6, 12.8, 11.2, 10.4, 5],
    precipChance: [], code: [],
  } };

  it('finds the coolest hour from the event time onwards', () => {
    expect(coolestBetween(w, '2026-10-10', '16:00', 3)).toBe(11);
  });

  it('only looks the given number of hours ahead', () => {
    expect(coolestBetween(w, '2026-10-10', '16:00', 1)).toBe(14);
  });

  it('ignores other days', () => {
    expect(coolestBetween(w, '2026-10-10', '19:00', 24)).toBe(10);
  });

  it('returns null without hourly data or a time', () => {
    expect(coolestBetween({}, '2026-10-10', '16:00', 3)).toBeNull();
    expect(coolestBetween(w, '2026-10-10', null, 3)).toBeNull();
    expect(coolestBetween(w, '2026-10-10', 'later', 3)).toBeNull();
    expect(coolestBetween(w, '2026-12-25', '16:00', 3)).toBeNull();
  });
});
