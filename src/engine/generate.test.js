import { describe, it, expect } from 'vitest';
import { generateOutfits, isAvailable } from './generate';
import { top, bottom, outer, shoes, dress, accessory, context, ids } from '../test/fixtures';

const core = (o) => `${o.top?.id || ''}|${o.bottom?.id || ''}|${o.dress?.id || ''}`;

function closet() {
  return [
    top({ color: 'white', fit: 'fitted' }),
    top({ color: 'black', fit: 'oversized' }),
    top({ color: 'grey' }),
    bottom({ color: 'black', fit: 'fitted' }),
    bottom({ color: 'denim', fit: 'relaxed' }),
    bottom({ color: 'tan' }),
    outer({ color: 'navy', warmth: 5 }),
    outer({ color: 'tan', warmth: 4, fabric: 'tech' }),
    shoes({ color: 'white' }),
    shoes({ color: 'black' }),
    accessory({ color: 'tan' }),
  ];
}

describe('isAvailable', () => {
  it('counts clean and recently worn pieces as wearable', () => {
    expect(isAvailable({})).toBe(true);
    expect(isAvailable({ state: 'clean' })).toBe(true);
    expect(isAvailable({ state: 'recent' })).toBe(true);
  });

  it('skips pieces in the wash or otherwise unavailable', () => {
    expect(isAvailable({ state: 'laundry' })).toBe(false);
    expect(isAvailable({ state: 'dirty' })).toBe(false);
  });
});

describe('generateOutfits', () => {
  it('returns nothing for an empty closet', () => {
    expect(generateOutfits([], null, context(), null, null, null)).toEqual([]);
  });

  it('returns nothing when every piece is in the wash', () => {
    const items = closet().map(i => ({ ...i, state: 'laundry' }));
    expect(generateOutfits(items, null, context(), null, null, null)).toEqual([]);
  });

  it('needs both a top and a bottom (or a dress) to make an outfit', () => {
    expect(generateOutfits([top(), top(), shoes()], null, context(), null, null, null)).toEqual([]);
  });

  it('returns at most six suggestions, best first', () => {
    const out = generateOutfits(closet(), null, context(), null, null, null);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < out.length; i++) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
  });

  it('never suggests the same top + bottom twice', () => {
    const out = generateOutfits(closet(), null, context(), null, null, null);
    const cores = out.map(c => core(c.outfit));
    expect(new Set(cores).size).toBe(cores.length);
  });

  it('never uses a piece that is in the wash', () => {
    const items = closet();
    items[0].state = 'laundry';
    const out = generateOutfits(items, null, context(), null, null, null);
    for (const c of out) expect(ids(c.outfit)).not.toContain(items[0].id);
  });

  it('only builds outfits around a required piece when one is given', () => {
    const items = closet();
    const pick = items[4]; // the denim bottom
    const out = generateOutfits(items, null, context(), null, null, pick);
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) expect(ids(c.outfit)).toContain(pick.id);
  });

  it('adds a coat to the top pick when the weather calls for one', () => {
    const ctx = context({ warmth: 5, layers: { needsOuter: true, needsHeavyOuter: true } });
    const [best] = generateOutfits(closet(), null, ctx, null, null, null);
    expect(best.outfit.outer).toBeTruthy();
  });

  it('does not add coats on a warm day', () => {
    const out = generateOutfits(closet(), null, context({ warmth: 1 }), null, null, null);
    for (const c of out) expect(c.outfit.outer).toBeUndefined();
  });

  it('offers a light layer when the afternoon will cool off', () => {
    const items = [top({ color: 'sky' }), bottom({ color: 'navy', warmth: 1 }), outer({ color: 'grey', warmth: 3 })];
    const [best] = generateOutfits(items, null, context({ layers: { carryLayer: true, coolsTo: 11 } }), null, null, null);
    expect(best.outfit.outer).toBeTruthy();
    expect(best.reasons).toContain('carry-layer');
  });

  it('builds dress outfits when the closet has dresses', () => {
    const items = [dress({ color: 'black', formality: 3 }), shoes({ color: 'black', formality: 3 })];
    const [best] = generateOutfits(items, null, context({ formality: [3, 3] }), null, null, null);
    expect(best.outfit.dress).toBeTruthy();
    expect(best.outfit.shoes).toBeTruthy();
  });

  it('moves outfits with a loved piece up the list', () => {
    const items = closet();
    const favourite = items[5]; // tan bottom
    const rank = (feedback) => generateOutfits(items, null, context(), feedback, null, null)
      .findIndex(c => ids(c.outfit).includes(favourite.id));
    const before = rank(null);
    const after = rank({ pieces: { [favourite.id]: 'love' } });
    expect(after).toBeGreaterThanOrEqual(0);
    expect(before === -1 || after <= before).toBe(true);
  });

  it('lets a strongly loved style win the top spot', () => {
    const items = closet();
    const favourite = items[5];
    favourite.styles = ['vintage'];
    const feedback = { pieces: { [favourite.id]: 'love' }, weights: { vintage: 10 } };
    const [best] = generateOutfits(items, null, context(), feedback, null, null);
    expect(ids(best.outfit)).toContain(favourite.id);
  });

  it('keeps a hated piece out of the top suggestion', () => {
    const items = closet();
    const [first] = generateOutfits(items, null, context(), null, null, null);
    const hated = first.outfit.top;
    const feedback = { pieces: { [hated.id]: 'hate' } };
    const [best] = generateOutfits(items, null, context(), feedback, null, null);
    expect(ids(best.outfit)).not.toContain(hated.id);
  });

  it('gives every suggestion a score and a list of reasons', () => {
    for (const c of generateOutfits(closet(), null, context(), null, null, null)) {
      expect(typeof c.score).toBe('number');
      expect(Array.isArray(c.reasons)).toBe(true);
    }
  });
});
