import { describe, it, expect } from 'vitest';
import { STYLE_PROFILES } from './aesthetics';
import { COLORS, OCCASIONS, ROLES, FABRICS, FITS, VIBES, FORMALITY_LABELS } from './options';
import { generateOutfits } from '../engine/generate';
import { buildContextFromEvents } from '../engine/context';
import { weather } from '../test/fixtures';
import { sampleCloset, sampleProfile } from '../test/sampleCloset';

const ids = (list) => new Set(list.map(x => x.id));
const COLOR_IDS = ids(COLORS);
const OCCASION_IDS = ids(OCCASIONS);
const ROLE_IDS = ids(ROLES);
const FABRIC_IDS = ids(FABRICS);
const FIT_IDS = ids(FITS);
const STYLE_IDS = new Set(Object.keys(STYLE_PROFILES));

describe('style profiles', () => {
  it.each(Object.entries(STYLE_PROFILES))('"%s" is well formed', (id, p) => {
    expect(p.name).toBeTruthy();
    expect(p.formality[0]).toBeLessThanOrEqual(p.formality[1]);
    expect(p.formality[0]).toBeGreaterThanOrEqual(1);
    expect(p.formality[1]).toBeLessThanOrEqual(5);
    // Palettes are descriptive; a couple of profiles use words like "varied".
    for (const c of p.palette) expect([...COLOR_IDS, 'varied', 'metallic']).toContain(c);
  });
});

describe('vibes', () => {
  it('each have a valid formality range and piece target', () => {
    for (const v of VIBES) {
      const [lo, hi] = v.tilt.formality;
      expect(lo).toBeLessThanOrEqual(hi);
      expect(v.tilt.pieceCountTarget).toBeGreaterThanOrEqual(2);
    }
  });

  it('cover every formality label', () => {
    expect(FORMALITY_LABELS).toHaveLength(5);
  });
});

describe('a realistic closet, end to end', () => {
  const closet = sampleCloset();

  it('only uses known roles, colours, fabrics, fits, styles and occasions', () => {
    for (const p of closet) {
      expect(ROLE_IDS, p.name).toContain(p.role);
      expect(COLOR_IDS, p.name).toContain(p.color);
      expect(FABRIC_IDS, p.name).toContain(p.fabric);
      expect(FIT_IDS, p.name).toContain(p.fit);
      for (const s of p.styles) expect(STYLE_IDS, `${p.name} style`).toContain(s);
      for (const o of p.occasions) expect(OCCASION_IDS, `${p.name} occasion`).toContain(o);
    }
    for (const ref of sampleProfile.references) expect(STYLE_IDS).toContain(ref);
  });

  const day = (events, w) => buildContextFromEvents(events, w, sampleProfile, null);
  const best = (ctx) => generateOutfits(closet, sampleProfile, ctx, null, null, null)[0];
  const ids = new Set(closet.map(i => i.id));

  it('only ever styles pieces from the closet', () => {
    for (const ctx of [day([], weather()), day([], weather({ feels: -2, todayLo: -4 })), day([{ title: 'Interview' }], weather())]) {
      for (const c of generateOutfits(closet, sampleProfile, ctx, null, null, null)) {
        for (const piece of Object.values(c.outfit)) expect(ids.has(piece.id)).toBe(true);
      }
    }
  });

  it('dresses for a mild, dry campus day', () => {
    const pick = best(day([{ title: 'CSC 503', time: '10:00' }], weather({ feels: 17, todayLo: 15 })));
    expect(pick.outfit.top).toBeTruthy();
    expect(pick.outfit.bottom).toBeTruthy();
  });

  it('reaches for a coat on a cold, rainy day', () => {
    const pick = best(day([], weather({ feels: 2, todayLo: 0, rainChance: 90, condition: 'rain' })));
    expect(pick.outfit.outer).toBeTruthy();
  });

  it('chooses the warm overcoat when it is freezing', () => {
    const pick = best(day([], weather({ feels: -6, todayLo: -8 })));
    expect(pick.outfit.outer?.name).toBe('Wool overcoat');
  });

  it('dresses up for an interview', () => {
    const pick = best(day([{ title: 'Job interview', time: '10:00' }], weather({ feels: 16, todayLo: 14 })));
    const pieces = Object.values(pick.outfit);
    const avg = pieces.reduce((a, p) => a + p.formality, 0) / pieces.length;
    expect(avg).toBeGreaterThanOrEqual(3);
    expect(pieces.map(p => p.name)).toContain('Black trousers');
  });

  it('keeps a free, warm day casual', () => {
    const pick = best(day([], weather({ feels: 22, todayLo: 18 })));
    const pieces = Object.values(pick.outfit);
    const avg = pieces.reduce((a, p) => a + p.formality, 0) / pieces.length;
    expect(avg).toBeLessThanOrEqual(3);
    expect(pick.outfit.outer).toBeUndefined();
  });
});
