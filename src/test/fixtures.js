// Small builders so each test only spells out the fields it cares about.

let seq = 0;

export function item(overrides = {}) {
  seq += 1;
  return {
    id: `item_${seq}`,
    name: `Item ${seq}`,
    role: 'top',
    color: 'black',
    formality: 2,
    warmth: 3,
    fabric: 'soft',
    fit: 'regular',
    styles: [],
    occasions: [],
    tags: [],
    state: 'clean',
    lastWorn: null,
    ...overrides,
  };
}

export const top = (o) => item({ role: 'top', ...o });
export const bottom = (o) => item({ role: 'bottom', ...o });
export const outer = (o) => item({ role: 'outer', warmth: 4, ...o });
export const shoes = (o) => item({ role: 'shoes', ...o });
export const dress = (o) => item({ role: 'dress', ...o });
export const accessory = (o) => item({ role: 'accessory', ...o });

// A neutral context: casual-to-smart day, mild weather, no events.
export function context(overrides = {}) {
  const { layers, ...rest } = overrides;
  return {
    occasions: [],
    formality: [2, 3],
    warmth: 3,
    layers: { needsOuter: false, needsRain: false, needsHeavyOuter: false, layeringDay: false, sun: false, ...layers },
    primaryEvent: null,
    weather: null,
    ...rest,
  };
}

// Weather object in the shape fetchWeather() returns.
export function weather(overrides = {}) {
  return {
    temp: 15, feels: 15, condition: 'clear', rainChance: 0,
    todayHi: 18, todayLo: 12, variability: 6,
    ...overrides,
  };
}

export const ids = (outfit) => Object.values(outfit).filter(Boolean).map(i => i.id).sort();
