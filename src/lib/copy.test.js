import { describe, it, expect } from 'vitest';
import { describeOutfit, outfitPieces, explainReason, explainReasons, formatTime, describeForecast } from './copy';
import { top, bottom, outer, shoes, dress, accessory, context } from '../test/fixtures';

describe('describeOutfit', () => {
  it('names an outfit after the user’s own pieces, outermost first', () => {
    const o = {
      shoes: shoes({ name: 'loafers' }),
      top: top({ name: 'white tee' }),
      bottom: bottom({ name: 'black trousers' }),
      outer: outer({ name: 'Camel coat' }),
    };
    expect(describeOutfit(o)).toBe('Camel coat · white tee · black trousers · loafers');
  });

  it('lists two pieces', () => {
    expect(describeOutfit({ dress: dress({ name: 'Slip dress' }), shoes: shoes({ name: 'Boots' }) })).toBe('Slip dress · Boots');
  });

  it('copes with one piece or none', () => {
    expect(describeOutfit({ top: top({ name: 'Tee' }) })).toBe('Tee');
    expect(describeOutfit({})).toBe('');
    expect(describeOutfit(null)).toBe('');
  });

  it('keeps the user’s capitalisation (brand names)', () => {
    expect(describeOutfit({ top: top({ name: 'COS knit' }), bottom: bottom({ name: 'Levi’s 501' }) })).toBe('COS knit · Levi’s 501');
  });
});

describe('outfitPieces', () => {
  it('lists pieces in the order you put them on', () => {
    const o = { accessory: accessory(), shoes: shoes(), bottom: bottom(), top: top() };
    expect(outfitPieces(o).map(i => i.role)).toEqual(['top', 'bottom', 'shoes', 'accessory']);
  });
});

describe('explainReason', () => {
  it.each([
    ['color harmony', 'The colours work together'],
    ['proportion', 'Fitted and loose pieces balance out'],
    ['fits smart-casual', 'Right level of dressy for today'],
    ['rain-ready', 'Ready for rain'],
    ['carry-layer', 'A light layer for later, when it cools off'],
    ['matches the day', 'Suits what’s on your calendar'],
    ['on-reference', 'Matches the styles you like'],
    ['balanced silhouette', 'The balanced shape you prefer'],
    ['polished', 'Matches the “Polished” setting'],
  ])('explains "%s" plainly', (reason, text) => {
    expect(explainReason(reason, context())).toBe(text);
  });

  it('mentions the actual temperature when it knows it', () => {
    expect(explainReason('weather-right', context({ weather: { feels: 13 } }))).toBe('Right weight for today (feels like 13°)');
    expect(explainReason('weather-right', context())).toBe('Right weight for the weather');
  });

  it('names the event when the outfit suits it', () => {
    expect(explainReason('matches the day', context({ primaryEvent: { title: 'Late Lunch with boys' } })))
      .toBe('Right for “Late Lunch with boys”');
  });

  it('says how cold it will get when suggesting a layer', () => {
    expect(explainReason('carry-layer', context({ layers: { carryLayer: true, coolsTo: 11 } })))
      .toBe('A light layer for later, when it drops to 11°');
  });

  it('passes unknown reasons through untouched', () => {
    expect(explainReason('something new', context())).toBe('something new');
  });
});

describe('explainReasons', () => {
  it('explains a list and tolerates a missing one', () => {
    expect(explainReasons(['color harmony', 'rain-ready'], context())).toEqual(['The colours work together', 'Ready for rain']);
    expect(explainReasons(undefined, context())).toEqual([]);
  });
});

describe('formatTime', () => {
  it.each([
    ['16:00', '4:00 PM'], ['09:05', '9:05 AM'], ['9:30', '9:30 AM'],
    ['0:15', '12:15 AM'], ['12:00', '12:00 PM'], ['23:59', '11:59 PM'],
  ])('formats %s as %s', (t, out) => {
    expect(formatTime(t)).toBe(out);
  });

  it('copes with missing or odd values', () => {
    expect(formatTime(null)).toBe('');
    expect(formatTime('noon')).toBe('noon');
  });
});

describe('describeForecast', () => {
  const at4 = { temp: 14, feels: 14, rainChance: 10, _atTime: '16:00' };

  it('explains an afternoon that cools off', () => {
    expect(describeForecast(context({ weather: at4, layers: { carryLayer: true, coolsTo: 10 } })))
      .toBe('It’s 14° at 4:00 PM, dropping to 10° over the next few hours.');
  });

  it('flags cold and jacket weather', () => {
    expect(describeForecast(context({ weather: { ...at4, feels: 2 }, layers: { needsOuter: true, needsHeavyOuter: true } })))
      .toBe('Cold out: 2° at 4:00 PM.');
    expect(describeForecast(context({ weather: { ...at4, feels: 9 }, layers: { needsOuter: true } })))
      .toBe('Cool enough for a jacket: 9° at 4:00 PM.');
  });

  it('adds the chance of rain', () => {
    expect(describeForecast(context({ weather: { ...at4, rainChance: 70 }, layers: { needsRain: true } })))
      .toBe('70% chance of rain.');
  });

  it('says nothing on an unremarkable day or without weather', () => {
    expect(describeForecast(context({ weather: at4 }))).toBe('');
    expect(describeForecast(context())).toBe('');
  });
});

