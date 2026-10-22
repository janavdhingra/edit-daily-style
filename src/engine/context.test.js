import { describe, it, expect } from 'vitest';
import {
  inferOccasionFromTitle, classifyEventKind, groupEventsForOutfits,
  buildContextFromEvents,
} from './context';
import { weather } from '../test/fixtures';

describe('inferOccasionFromTitle', () => {
  it.each([
    ['Lecture: Data Mining', ['university', 'lectures'], [2, 3]],
    ['CSC 503', ['university', 'lectures'], [2, 3]],
    ['Data Mining CSC 503 B01', ['university', 'lectures'], [2, 3]],
    ['Artificial Intelligence ECE 569A A02', ['university', 'lectures'], [2, 3]],
    ['MATH101', ['university', 'lectures'], [2, 3]],
    ['Midterm exam', ['university', 'lectures'], [2, 3]],
    ['Library study session', ['university'], [1, 2]],
    ['Capstone presentation', ['presentations'], [3, 4]],
    ['Job interview at Shopify', ['interviews'], [4, 5]],
    ['Team standup', ['office', 'meetings'], [2, 4]],
    ['Wedding — Priya & Sam', ['wedding', 'formal'], [4, 5]],
    ['Dinner with Alex', ['date'], [2, 4]],
    ['Dinner reservation', ['date', 'going-out'], [2, 4]],
    ['Coffee with Mo', ['brunch'], [1, 3]],
    ['Late Lunch with boys', ['brunch'], [1, 3]],
    ['Client lunch', ['meetings'], [4, 5]],
    ['Birthday party', ['going-out'], [2, 4]],
    ['Gym', ['workout'], [1, 1]],
    ['Hike at Mount Doug', ['lounge'], [1, 2]],
    ['Flight to Toronto', ['travel'], [1, 3]],
    ['Zoom call with mum', ['lounge'], [1, 2]],
  ])('reads "%s" as %j', (title, occasions, formality) => {
    expect(inferOccasionFromTitle(title)).toEqual({ occasions, formality });
  });

  it('is case-insensitive', () => {
    expect(inferOccasionFromTitle('INTERVIEW')).toEqual(inferOccasionFromTitle('interview'));
  });

  it('returns null for titles it cannot read', () => {
    expect(inferOccasionFromTitle('Dentist')).toBeNull();
    expect(inferOccasionFromTitle('')).toBeNull();
    expect(inferOccasionFromTitle(null)).toBeNull();
    expect(inferOccasionFromTitle(undefined)).toBeNull();
  });

  it('does not mistake words that merely contain a keyword', () => {
    expect(inferOccasionFromTitle('Barber appointment')).toBeNull(); // not "bar"
    expect(inferOccasionFromTitle('Classical concert')).toBeNull();  // not "class"
  });
});

describe('classifyEventKind', () => {
  it.each([
    ['ECE 535 A02', 'campus'],
    ['Artificial Intelligence ECE 569A A02', 'campus'],
    ['Office hours', 'campus'],
    ['Client pitch', 'work-formal'],
    ['Interview', 'work-formal'],
    ['Weekly sync', 'work'],
    ['Zoom', 'work'],
    ['Gala', 'formal'],
    ['Dinner with Alex', 'date'],
    ['Team dinner', 'social'],
    ['Brunch', 'social'],
    ['Late Lunch with boys', 'social'],
    ['Yoga', 'active'],
    ['Train to Vancouver', 'travel'],
    ['Dentist', 'unknown'],
  ])('classifies "%s" as %s', (title, kind) => {
    expect(classifyEventKind(title)).toBe(kind);
  });

  it('returns "unknown" for an empty title', () => {
    expect(classifyEventKind('')).toBe('unknown');
    expect(classifyEventKind(null)).toBe('unknown');
  });
});

describe('groupEventsForOutfits', () => {
  it('returns no slots for an empty day', () => {
    expect(groupEventsForOutfits([])).toEqual([]);
    expect(groupEventsForOutfits(null)).toEqual([]);
  });

  it('merges back-to-back classes into one campus-day outfit', () => {
    const slots = groupEventsForOutfits([
      { title: 'CSC 503', time: '09:30' },
      { title: 'ECE 535', time: '11:00' },
      { title: 'Library study', time: '15:00' },
    ]);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ kind: 'campus', label: 'Campus day', anchorTime: '09:30' });
    expect(slots[0].events).toHaveLength(3);
  });

  it('keeps a date night separate from a campus day, morning first', () => {
    const slots = groupEventsForOutfits([
      { title: 'Dinner with Alex', time: '19:00' },
      { title: 'CSC 503', time: '09:30' },
    ]);
    expect(slots.map(s => s.kind)).toEqual(['campus', 'date']);
  });

  it('orders slots by real time even when hours are not zero-padded', () => {
    // Calendar imports used to produce "9:30"; as text that sorts after "13:00".
    const slots = groupEventsForOutfits([
      { title: 'Weekly sync', time: '13:00' },
      { title: 'CSC 503', time: '9:30' },
    ]);
    expect(slots.map(s => s.kind)).toEqual(['campus', 'work']);
  });

  it('drops unreadable events when the day has other plans', () => {
    const slots = groupEventsForOutfits([
      { title: 'Dentist', time: '08:00' },
      { title: 'Gym', time: '18:00' },
    ]);
    expect(slots.map(s => s.kind)).toEqual(['active']);
  });

  it('still gives a "Day" slot when nothing is recognisable', () => {
    const slots = groupEventsForOutfits([{ title: 'Dentist', time: '08:00' }]);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ kind: 'unknown', label: 'Day' });
  });

  it('puts untimed (all-day) events after timed ones', () => {
    const slots = groupEventsForOutfits([{ title: 'Gym' }, { title: 'CSC 503', time: '10:00' }]);
    expect(slots.map(s => s.kind)).toEqual(['campus', 'active']);
  });
});

describe('buildContextFromEvents', () => {
  it('defaults to an easy, open day with no events or weather', () => {
    const ctx = buildContextFromEvents([], null, null, null);
    expect(ctx.occasions).toEqual([]);
    expect(ctx.formality).toEqual([1, 3]);
    expect(ctx.warmth).toBe(3);
    expect(ctx.layers).toMatchObject({ needsOuter: false, needsRain: false, needsHeavyOuter: false });
    expect(ctx.primaryEvent).toBeNull();
  });

  it.each([
    [-10, 5], [2, 5], [8, 4], [15, 3], [20, 2], [30, 1],
  ])('maps a feels-like of %i°C to warmth %i', (feels, warmth) => {
    expect(buildContextFromEvents([], weather({ feels, todayLo: feels }), null, null).warmth).toBe(warmth);
  });

  it('adds warmth for people who run cold and removes it for people who run hot', () => {
    const w = weather({ feels: 15, todayLo: 15 });
    expect(buildContextFromEvents([], w, { tempSens: 'cold' }, null).warmth).toBe(4);
    expect(buildContextFromEvents([], w, { tempSens: 'hot' }, null).warmth).toBe(2);
  });

  it('never pushes warmth outside 1–5', () => {
    expect(buildContextFromEvents([], weather({ feels: -20, todayLo: -20 }), { tempSens: 'cold' }, null).warmth).toBe(5);
    expect(buildContextFromEvents([], weather({ feels: 35, todayLo: 35 }), { tempSens: 'hot' }, null).warmth).toBe(1);
  });

  it('asks for a coat below 14°C and a heavy one below 5°C', () => {
    expect(buildContextFromEvents([], weather({ feels: 16, todayLo: 16 }), null, null).layers.needsOuter).toBe(false);
    expect(buildContextFromEvents([], weather({ feels: 10, todayLo: 10 }), null, null).layers).toMatchObject({ needsOuter: true, needsHeavyOuter: false });
    expect(buildContextFromEvents([], weather({ feels: 2, todayLo: 2 }), null, null).layers).toMatchObject({ needsOuter: true, needsHeavyOuter: true });
  });

  it('plans for the day’s low when there is no event time', () => {
    const ctx = buildContextFromEvents([], weather({ feels: 17, todayLo: 8 }), null, null);
    expect(ctx.layers.needsOuter).toBe(true);
  });

  it('flags rain from the forecast chance or the condition', () => {
    expect(buildContextFromEvents([], weather({ rainChance: 60 }), null, null).layers.needsRain).toBe(true);
    expect(buildContextFromEvents([], weather({ condition: 'drizzle' }), null, null).layers.needsRain).toBe(true);
    expect(buildContextFromEvents([], weather({ rainChance: 10 }), null, null).layers.needsRain).toBe(false);
  });

  it('marks big temperature swings as a layering day', () => {
    expect(buildContextFromEvents([], weather({ variability: 10 }), null, null).layers.layeringDay).toBe(true);
    expect(buildContextFromEvents([], weather({ variability: 4 }), null, null).layers.layeringDay).toBe(false);
  });

  it('takes occasions and formality from the day’s events', () => {
    const ctx = buildContextFromEvents([{ title: 'Capstone presentation', time: '10:00' }], null, null, null);
    expect(ctx.occasions).toEqual(['presentations']);
    expect(ctx.formality).toEqual([3, 4]);
    expect(ctx.primaryEvent.title).toBe('Capstone presentation');
  });

  it('dresses for the most formal event when events disagree', () => {
    const ctx = buildContextFromEvents([
      { title: 'CSC 503', time: '09:30' },
      { title: 'Job interview', time: '14:00' },
    ], null, null, null);
    expect(ctx.primaryEvent.title).toBe('Job interview');
    expect(ctx.formality[0]).toBeLessThanOrEqual(ctx.formality[1]);
    expect(ctx.occasions).toEqual(expect.arrayContaining(['university', 'interviews']));
  });

  it('uses the forecast for the event hour when hourly data exists', () => {
    const w = weather({
      feels: 5, todayLo: 3,
      hourly: {
        time: ['2026-10-07T08:00', '2026-10-07T14:00'],
        temp: [4, 19], precipChance: [0, 0], code: [0, 0],
      },
    });
    const ctx = buildContextFromEvents([{ title: 'Capstone presentation', time: '14:00' }], w, null, '2026-10-07');
    expect(ctx.weather.temp).toBe(19);
    expect(ctx.warmth).toBe(2);
    expect(ctx.layers.needsOuter).toBe(false);
  });

  it('targets the latest event when none is formal, even with unpadded times', () => {
    const w = weather({
      hourly: {
        time: ['2026-10-07T09:00', '2026-10-07T13:00'],
        temp: [6, 16], precipChance: [0, 0], code: [0, 0],
      },
    });
    const ctx = buildContextFromEvents([
      { title: 'Dentist', time: '9:00' },
      { title: 'Groceries', time: '13:00' },
    ], w, null, '2026-10-07');
    expect(ctx.weather._atTime).toBe('13:00');
  });
});

describe('carrying a layer for later', () => {
  // The real afternoon: 14° at 4pm, dropping to 11° by 7pm, low of 8°.
  const saturday = weather({
    feels: 14, temp: 14, todayLo: 8, todayHi: 14, variability: 6,
    hourly: {
      time: ['2026-10-10T15:00', '2026-10-10T16:00', '2026-10-10T17:00', '2026-10-10T18:00', '2026-10-10T19:00'],
      temp: [14, 14, 14, 13, 11], precipChance: [0, 0, 0, 0, 0], code: [1, 0, 0, 0, 0],
    },
  });
  const lunch = [{ title: 'Late Lunch with boys', time: '16:00' }];

  it('suggests a layer to carry when it cools off after the event starts', () => {
    const ctx = buildContextFromEvents(lunch, saturday, null, '2026-10-10');
    expect(ctx.layers).toMatchObject({ needsOuter: false, carryLayer: true, coolsTo: 11 });
    expect(ctx.occasions).toEqual(['brunch']);
  });

  it('does not suggest one when it stays mild', () => {
    const mild = { ...saturday, hourly: { ...saturday.hourly, temp: [17, 17, 16, 16, 15] } };
    expect(buildContextFromEvents(lunch, mild, null, '2026-10-10').layers.carryLayer).toBe(false);
  });

  it('asks for a proper coat instead when it is already cold', () => {
    const cold = { ...saturday, hourly: { ...saturday.hourly, temp: [9, 9, 8, 7, 6] } };
    const ctx = buildContextFromEvents(lunch, cold, null, '2026-10-10');
    expect(ctx.layers).toMatchObject({ needsOuter: true, carryLayer: false });
  });

  it('needs an event time to know when "later" is', () => {
    expect(buildContextFromEvents([], saturday, null, '2026-10-10').layers.carryLayer).toBe(false);
  });
});
