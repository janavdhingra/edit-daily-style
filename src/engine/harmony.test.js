import { describe, it, expect } from 'vitest';
import { colorScore, fitBalance, NEUTRALS } from './harmony';

describe('colorScore', () => {
  it('returns 0 when there are no colours to judge', () => {
    expect(colorScore([])).toBe(0);
    expect(colorScore([null, undefined])).toBe(0);
  });

  it('rewards an all-neutral (tonal) palette', () => {
    expect(colorScore(['black', 'white', 'grey'])).toBe(8);
    expect(colorScore(['navy', 'denim'])).toBe(8);
  });

  it('rewards exactly one accent on a neutral base the most', () => {
    expect(colorScore(['black', 'rust'])).toBe(10);
    expect(colorScore(['cream', 'tan', 'burgundy'])).toBe(10);
  });

  it('gives a lone accent with no neutral base only a middling score', () => {
    expect(colorScore(['rust'])).toBe(4);
  });

  it('gives two accents a middling score', () => {
    expect(colorScore(['rust', 'olive', 'black'])).toBe(4);
  });

  it('penalises three or more accents as too busy', () => {
    expect(colorScore(['rust', 'olive', 'pink'])).toBe(-4);
    expect(colorScore(['rust', 'olive', 'pink', 'black'])).toBe(-4);
  });

  it('ignores missing colours rather than counting them', () => {
    expect(colorScore([null, 'black', 'rust'])).toBe(10);
  });

  it('treats denim and navy as neutrals', () => {
    expect(NEUTRALS.has('denim')).toBe(true);
    expect(NEUTRALS.has('navy')).toBe(true);
    expect(NEUTRALS.has('sky')).toBe(true);
    expect(NEUTRALS.has('rust')).toBe(false);
  });

  it('always scores tonal and one-accent outfits above busy ones', () => {
    const busy = colorScore(['rust', 'olive', 'pink']);
    expect(colorScore(['black', 'white'])).toBeGreaterThan(busy);
    expect(colorScore(['black', 'rust'])).toBeGreaterThan(busy);
  });
});

describe('fitBalance', () => {
  const withFits = (...fits) => fits.map(fit => ({ fit }));

  it('rewards oversized against fitted', () => {
    expect(fitBalance(withFits('oversized', 'fitted'))).toBe(8);
  });

  it('rewards relaxed against fitted', () => {
    expect(fitBalance(withFits('relaxed', 'fitted', 'regular'))).toBe(8);
  });

  it('penalises head-to-toe oversized', () => {
    expect(fitBalance(withFits('oversized', 'oversized'))).toBe(-2);
  });

  it('gives an ordinary mix a small positive score', () => {
    expect(fitBalance(withFits('regular', 'regular'))).toBe(3);
    expect(fitBalance(withFits('relaxed', 'oversized'))).toBe(3);
  });

  it('does not penalise items that have no fit recorded', () => {
    // Uploaded pieces often have no fit tag; that is "unknown", not "all oversized".
    expect(fitBalance([{}, {}])).toBe(3);
    expect(fitBalance([])).toBe(3);
  });

  it('ignores untagged pieces when other pieces have fits', () => {
    expect(fitBalance([{ fit: 'oversized' }, {}, { fit: 'fitted' }])).toBe(8);
  });
});
