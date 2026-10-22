import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scoreOutfit } from './scoring';
import { VIBES } from '../data/options';
import { top, bottom, outer, shoes, context } from '../test/fixtures';

const DAY = 86400000;
const vibe = (id) => VIBES.find(v => v.id === id);
const score = (outfit, ctx = context(), opts = {}) =>
  scoreOutfit(outfit, opts.profile ?? null, ctx, opts.feedback ?? null, opts.vibe ?? null);

describe('scoreOutfit — basics', () => {
  it('rejects outfits with fewer than two pieces', () => {
    expect(score({ top: top() })).toEqual({ score: -100, reasons: [] });
    expect(score({})).toEqual({ score: -100, reasons: [] });
  });

  it('ignores empty slots when counting pieces', () => {
    expect(score({ top: top(), bottom: null, shoes: undefined }).score).toBe(-100);
  });

  it('always returns a whole-number score', () => {
    const r = score({ top: top({ formality: 2 }), bottom: bottom({ formality: 3 }), shoes: shoes({ formality: 3 }) });
    expect(Number.isInteger(r.score)).toBe(true);
  });

  it('returns at most four reasons, with no duplicates', () => {
    const t = top({ color: 'black', fit: 'oversized', formality: 3, warmth: 3, occasions: ['office'], styles: ['minimal'], tags: ['ribbed'] });
    const b = bottom({ color: 'white', fit: 'fitted', formality: 3, warmth: 3, occasions: ['office'], styles: ['minimal'], tags: ['tank'] });
    const r = scoreOutfit({ top: t, bottom: b }, { references: ['minimal', 'tonal'], silhouette: 'balanced' },
      context({ formality: [3, 3], occasions: ['office'] }), null, vibe('polished'));
    expect(r.reasons.length).toBeLessThanOrEqual(4);
    expect(new Set(r.reasons).size).toBe(r.reasons.length);
  });
});

describe('scoreOutfit — colour and proportion', () => {
  it('prefers a tonal outfit over a clashing one', () => {
    const tonal = score({ top: top({ color: 'black' }), bottom: bottom({ color: 'grey' }) });
    const busy = score({ top: top({ color: 'rust' }), bottom: bottom({ color: 'pink' }), shoes: shoes({ color: 'mustard' }) });
    expect(tonal.score).toBeGreaterThan(busy.score);
    expect(tonal.reasons).toContain('color harmony');
    expect(busy.reasons).not.toContain('color harmony');
  });

  it('calls out balanced proportions', () => {
    const r = score({ top: top({ fit: 'oversized' }), bottom: bottom({ fit: 'fitted' }) });
    expect(r.reasons).toContain('proportion');
  });
});

describe('scoreOutfit — formality', () => {
  it('rewards outfits inside the day’s formality range and names the level', () => {
    const r = score({ top: top({ formality: 3 }), bottom: bottom({ formality: 3 }) }, context({ formality: [3, 4] }));
    expect(r.reasons).toContain('fits smart-casual');
  });

  it('penalises outfits further from the target more heavily', () => {
    const ctx = context({ formality: [4, 5] });
    const near = score({ top: top({ formality: 3 }), bottom: bottom({ formality: 3 }) }, ctx);
    const far = score({ top: top({ formality: 1 }), bottom: bottom({ formality: 1 }) }, ctx);
    expect(near.score).toBeGreaterThan(far.score);
  });

  it('penalises mixing very formal and very casual pieces', () => {
    const ctx = context({ formality: [1, 5] });
    const even = score({ top: top({ formality: 3 }), bottom: bottom({ formality: 3 }) }, ctx);
    const clash = score({ top: top({ formality: 1 }), bottom: bottom({ formality: 5 }) }, ctx);
    expect(even.score - clash.score).toBe(6);
  });

  it('treats a missing formality as casual (2)', () => {
    const r = score({ top: top({ formality: undefined }), bottom: bottom({ formality: undefined }) }, context({ formality: [2, 2] }));
    expect(r.reasons).toContain('fits relaxed');
  });
});

describe('scoreOutfit — weather', () => {
  it('says "weather-right" when warmth matches the target', () => {
    const r = score({ top: top({ warmth: 4 }), bottom: bottom({ warmth: 4 }) }, context({ warmth: 4 }));
    expect(r.reasons).toContain('weather-right');
  });

  it('prefers warmer pieces on a cold day', () => {
    const cold = context({ warmth: 5 });
    const warm = score({ top: top({ warmth: 5 }), bottom: bottom({ warmth: 5 }) }, cold);
    const light = score({ top: top({ warmth: 1 }), bottom: bottom({ warmth: 1 }) }, cold);
    expect(warm.score).toBeGreaterThan(light.score);
  });

  it('rewards a rain-ready outfit when rain is expected', () => {
    const rainy = context({ layers: { needsRain: true } });
    const base = { top: top(), bottom: bottom() };
    const shell = score({ ...base, outer: outer({ fabric: 'tech' }) }, rainy);
    const bare = score(base, rainy);
    expect(shell.reasons).toContain('rain-ready');
    expect(shell.score).toBeGreaterThan(bare.score);
  });

  it('counts a "rain"-tagged piece or technical fabric as rain-ready', () => {
    const rainy = context({ layers: { needsRain: true } });
    expect(score({ top: top({ tags: ['rain'] }), bottom: bottom() }, rainy).reasons).toContain('rain-ready');
    expect(score({ top: top({ fabric: 'tech' }), bottom: bottom() }, rainy).reasons).toContain('rain-ready');
  });

  it('penalises a missing coat more on a very cold day', () => {
    const base = { top: top(), bottom: bottom() };
    const chilly = score(base, context({ layers: { needsOuter: true } }));
    const freezing = score(base, context({ layers: { needsOuter: true, needsHeavyOuter: true } }));
    expect(chilly.score - freezing.score).toBe(6);
  });

  it('rewards wearing an outer layer when one is needed', () => {
    const ctx = context({ layers: { needsOuter: true } });
    const t = top(); const b = bottom();
    const withCoat = score({ top: t, bottom: b, outer: outer({ warmth: 3 }) }, ctx);
    const without = score({ top: t, bottom: b }, ctx);
    expect(withCoat.score).toBeGreaterThan(without.score);
  });
});

describe('scoreOutfit — a layer to carry', () => {
  const ctx = context({ layers: { carryLayer: true, coolsTo: 11 } });
  const t = top(); const b = bottom();

  it('rewards bringing a light layer', () => {
    const withKnit = score({ top: t, bottom: b, outer: outer({ warmth: 3 }) }, ctx);
    const without = score({ top: t, bottom: b }, ctx);
    expect(withKnit.reasons).toContain('carry-layer');
    expect(withKnit.score).toBeGreaterThan(without.score);
  });

  it('prefers a light layer to a heavy coat', () => {
    const light = score({ top: t, bottom: b, outer: outer({ warmth: 2 }) }, ctx);
    const heavy = score({ top: t, bottom: b, outer: outer({ warmth: 5 }) }, ctx);
    expect(light.score).toBeGreaterThan(heavy.score);
    expect(heavy.reasons).not.toContain('carry-layer');
  });

  it('does not penalise going without a layer', () => {
    const plain = context();
    expect(score({ top: t, bottom: b }, ctx).score).toBe(score({ top: t, bottom: b }, plain).score);
  });
});

describe('scoreOutfit — occasions and taste profile', () => {
  it('rewards pieces that suit today’s events', () => {
    const ctx = context({ occasions: ['office', 'meetings'] });
    const match = score({ top: top({ occasions: ['office'] }), bottom: bottom({ occasions: ['meetings'] }) }, ctx);
    const miss = score({ top: top({ occasions: ['workout'] }), bottom: bottom({ occasions: ['lounge'] }) }, ctx);
    expect(match.reasons).toContain('matches the day');
    expect(match.score).toBeGreaterThan(miss.score);
  });

  it('caps the occasion bonus at 10', () => {
    const ctx = context({ occasions: ['office'] });
    const pieces = (n) => Array.from({ length: n }, () => ['office']);
    const [a, b, c, d] = pieces(4);
    const four = score({ top: top({ occasions: a }), bottom: bottom({ occasions: b }), shoes: shoes({ occasions: c }), outer: outer({ occasions: d, warmth: 3 }) }, ctx);
    const fourNoOcc = score({ top: top(), bottom: bottom(), shoes: shoes(), outer: outer({ warmth: 3 }) }, ctx);
    expect(four.score - fourNoOcc.score).toBe(10);
  });

  it('rewards pieces that match the user’s style references', () => {
    const profile = { references: ['minimal'] };
    // Minimal's signatures include "ribbed" and "tank".
    const onRef = score({ top: top({ styles: ['minimal'], tags: ['ribbed'] }), bottom: bottom({ styles: ['minimal'], tags: ['tank'] }) }, context(), { profile });
    const offRef = score({ top: top({ styles: ['grunge'] }), bottom: bottom({ styles: ['grunge'] }) }, context(), { profile });
    expect(onRef.score).toBeGreaterThan(offRef.score);
    expect(onRef.reasons).toContain('on-reference');
  });

  it('ignores unknown style references instead of crashing', () => {
    const r = score({ top: top(), bottom: bottom() }, context(), { profile: { references: ['not-a-style'] } });
    expect(Number.isFinite(r.score)).toBe(true);
  });

  it('adds 2 points per piece in one of the user’s favourite colours', () => {
    const base = { top: top({ color: 'navy' }), bottom: bottom({ color: 'navy' }) };
    const fav = score(base, context(), { profile: { colors: ['navy'] } });
    const none = score(base, context(), { profile: { colors: [] } });
    expect(fav.score - none.score).toBe(4);
  });

  it('copes with a profile that has no colours list', () => {
    expect(() => score({ top: top(), bottom: bottom() }, context(), { profile: { references: [] } })).not.toThrow();
  });

  it('rewards a balanced silhouette for users who like one', () => {
    const o = { top: top({ fit: 'oversized' }), bottom: bottom({ fit: 'fitted' }) };
    const s = (silhouette) => score(o, context(), { profile: { silhouette } }).score;
    expect(s('balanced') - s('it-depends')).toBe(6);
  });

  it('names the balanced silhouette when there is room among the top reasons', () => {
    const o = { top: top({ fit: 'oversized', color: 'rust' }), bottom: bottom({ fit: 'fitted', color: 'pink' }) };
    const r = score(o, context({ formality: [4, 5], warmth: 1 }), { profile: { silhouette: 'balanced' } });
    expect(r.reasons).toContain('balanced silhouette');
  });

  it('rewards an all-fitted look for streamlined users and loose looks for volume users', () => {
    const fitted = { top: top({ fit: 'fitted' }), bottom: bottom({ fit: 'fitted' }) };
    const loose = { top: top({ fit: 'oversized' }), bottom: bottom({ fit: 'relaxed' }) };
    const s = (o, silhouette) => score(o, context(), { profile: { silhouette } }).score;
    expect(s(fitted, 'streamlined') - s(fitted, 'it-depends')).toBe(5);
    expect(s(loose, 'volume') - s(loose, 'it-depends')).toBe(5);
  });
});

describe('scoreOutfit — effort vibes', () => {
  it('labels an outfit that fits the chosen vibe', () => {
    const r = score({ top: top({ formality: 1 }), bottom: bottom({ formality: 1 }), shoes: shoes({ formality: 1 }) },
      context({ formality: [1, 2] }), { vibe: vibe('low-effort') });
    expect(r.reasons).toContain('low-effort');
  });

  it('prefers polished outfits when the vibe is "Polished"', () => {
    const ctx = context({ formality: [1, 5] });
    const sharp = score({ top: top({ formality: 4 }), bottom: bottom({ formality: 4 }), shoes: shoes({ formality: 4 }), outer: outer({ formality: 4, warmth: 3 }) }, ctx, { vibe: vibe('polished') });
    const sloppy = score({ top: top({ formality: 1 }), bottom: bottom({ formality: 1 }), shoes: shoes({ formality: 1 }), outer: outer({ formality: 1, warmth: 3 }) }, ctx, { vibe: vibe('polished') });
    expect(sharp.score).toBeGreaterThan(sloppy.score);
  });

  it('nudges toward the vibe’s target piece count', () => {
    const v = vibe('low-effort'); // target: 3 pieces
    const three = score({ top: top(), bottom: bottom(), shoes: shoes() }, context(), { vibe: v });
    const two = score({ top: top(), bottom: bottom() }, context(), { vibe: v });
    expect(three.score).toBeGreaterThanOrEqual(two.score);
  });

  it('rewards an accent colour for the "Statement" vibe', () => {
    const v = vibe('statement');
    const ctx = context({ formality: [3, 5] });
    const plain = score({ top: top({ color: 'black', formality: 4 }), bottom: bottom({ color: 'black', formality: 4 }) }, ctx, { vibe: v });
    const accent = score({ top: top({ color: 'rust', formality: 4 }), bottom: bottom({ color: 'black', formality: 4 }) }, ctx, { vibe: v });
    expect(accent.score).toBeGreaterThan(plain.score);
  });
});

describe('scoreOutfit — learning from feedback', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T12:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('boosts loved pieces and buries hated ones', () => {
    const t = top(); const b = bottom();
    const outfit = { top: t, bottom: b };
    const neutral = score(outfit).score;
    const loved = score(outfit, context(), { feedback: { pieces: { [t.id]: 'love' } } }).score;
    const hated = score(outfit, context(), { feedback: { pieces: { [t.id]: 'hate' } } }).score;
    expect(loved - neutral).toBe(4);
    expect(neutral - hated).toBe(12);
  });

  it('penalises pieces worn very recently, fading over five days', () => {
    const at = (daysAgo) => score({ top: top({ lastWorn: Date.now() - daysAgo * DAY }), bottom: bottom() }).score;
    const fresh = score({ top: top(), bottom: bottom() }).score;
    expect(fresh - at(0.5)).toBe(10);
    expect(fresh - at(2)).toBe(5);
    expect(fresh - at(4)).toBe(2);
    expect(fresh - at(6)).toBe(0);
  });

  it('discourages repeating an outfit worn in the last five days', () => {
    const t = top(); const b = bottom();
    const sig = [t.id, b.id].sort().join('|');
    const fresh = score({ top: t, bottom: b }).score;
    const repeat = score({ top: t, bottom: b }, context(), { feedback: { recentSigs: [{ sig, ts: Date.now() - 2 * DAY }] } }).score;
    const old = score({ top: t, bottom: b }, context(), { feedback: { recentSigs: [{ sig, ts: Date.now() - 6 * DAY }] } }).score;
    expect(fresh - repeat).toBe(14);
    expect(old).toBe(fresh);
  });

  it('discourages an outfit skipped in the last two weeks', () => {
    const t = top(); const b = bottom();
    const sig = [t.id, b.id].sort().join('|');
    const fresh = score({ top: t, bottom: b }).score;
    const skipped = score({ top: t, bottom: b }, context(), { feedback: { skippedSigs: [{ sig, ts: Date.now() - 10 * DAY }] } }).score;
    expect(fresh - skipped).toBe(20);
  });

  it('applies the larger of the repeat and skip penalties, not both', () => {
    const t = top(); const b = bottom();
    const sig = [t.id, b.id].sort().join('|');
    const recent = [{ sig, ts: Date.now() - DAY }];
    const skippedOnly = score({ top: t, bottom: b }, context(), { feedback: { skippedSigs: recent } }).score;
    const both = score({ top: t, bottom: b }, context(), { feedback: { skippedSigs: recent, recentSigs: recent } }).score;
    expect(both).toBe(skippedOnly);
  });

  it('learns style preferences from weights, capped at ±20', () => {
    const outfit = { top: top({ styles: ['minimal'] }), bottom: bottom({ styles: ['minimal'] }) };
    const neutral = score(outfit).score;
    const liked = score(outfit, context(), { feedback: { weights: { minimal: 2 } } }).score;
    const huge = score(outfit, context(), { feedback: { weights: { minimal: 999 } } }).score;
    const hated = score(outfit, context(), { feedback: { weights: { minimal: -999 } } }).score;
    expect(liked - neutral).toBe(5); // 2 pieces × 2 × 1.2 = 4.8 → rounds to 5
    expect(huge - neutral).toBe(20);
    expect(neutral - hated).toBe(20);
  });
});
