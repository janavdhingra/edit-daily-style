import { describe, it, expect } from 'vitest';
import {
  rowToItem, itemToRow, rowToProfile, profileToRow, normalizeHandle, isValidHandle, PREF_DEFAULTS,
} from './closetApi';

const row = {
  id: 'f1c6', user_id: 'u1', name: 'Wool overcoat', role: 'outer', color: 'grey',
  formality: 4, warmth: 5, fabric: 'wool', fit: 'relaxed',
  styles: ['minimal'], occasions: ['office'], tags: [],
  photo_path: 'u1/item-abc.jpg', state: 'clean', last_worn: '2026-10-07T15:00:00.000Z',
  created_at: '2026-10-01T00:00:00Z',
};

describe('rowToItem', () => {
  it('maps a database row to the engine’s item shape', () => {
    expect(rowToItem(row)).toEqual({
      id: 'f1c6', name: 'Wool overcoat', role: 'outer', color: 'grey',
      formality: 4, warmth: 5, fabric: 'wool', fit: 'relaxed',
      styles: ['minimal'], occasions: ['office'], tags: [],
      photoPath: 'u1/item-abc.jpg', state: 'clean', lastWorn: Date.parse('2026-10-07T15:00:00.000Z'),
    });
  });

  it('fills in empty values the engine expects', () => {
    const item = rowToItem({ ...row, fabric: null, fit: null, styles: null, occasions: null, tags: null, state: null, last_worn: null });
    expect(item).toMatchObject({ fabric: '', fit: '', styles: [], occasions: [], tags: [], state: 'clean', lastWorn: null });
  });
});

describe('itemToRow', () => {
  it('only sends the fields that changed', () => {
    expect(itemToRow({ state: 'washing' })).toEqual({ state: 'washing' });
  });

  it('converts names and timestamps to database columns', () => {
    const t = Date.parse('2026-10-08T09:30:00Z');
    expect(itemToRow({ photoPath: 'u/p.jpg', lastWorn: t })).toEqual({ photo_path: 'u/p.jpg', last_worn: '2026-10-08T09:30:00.000Z' });
    expect(itemToRow({ lastWorn: null })).toEqual({ last_worn: null });
  });

  it('never sends ids or unknown fields', () => {
    expect(itemToRow({ id: 'x', userId: 'someone-else', user_id: 'someone-else', photo: 'data:', bogus: 1 })).toEqual({});
  });

  it('round-trips through rowToItem', () => {
    const item = rowToItem(row);
    const back = itemToRow(item);
    expect(back).toMatchObject({ name: row.name, role: row.role, photo_path: row.photo_path, last_worn: row.last_worn });
  });
});

describe('profiles', () => {
  const profileRow = {
    id: 'u1', display_name: 'Janav', handle: 'janav', avatar_path: null, is_public: true,
    prefs: { fit: 'relaxed', colors: ['navy'] },
  };

  it('merges stored preferences over defaults', () => {
    expect(rowToProfile(profileRow)).toEqual({
      id: 'u1', name: 'Janav', handle: 'janav', avatarPath: null, isPublic: true,
      ...PREF_DEFAULTS, fit: 'relaxed', colors: ['navy'],
    });
  });

  it('gives a brand-new profile safe empty lists', () => {
    const p = rowToProfile({ id: 'u2', prefs: {} });
    expect(p).toMatchObject({ name: '', handle: '', isPublic: false, references: [], colors: [], occasions: [] });
  });

  it('returns null for a missing profile', () => {
    expect(rowToProfile(null)).toBeNull();
  });

  it('splits a profile back into columns and prefs', () => {
    expect(profileToRow({ name: '  Janav ', handle: 'Janav', isPublic: true, fit: 'fitted', colors: ['black'] }))
      .toEqual({ display_name: 'Janav', handle: 'janav', is_public: true, prefs: { fit: 'fitted', colors: ['black'] } });
  });

  it('stores blank names and handles as null', () => {
    expect(profileToRow({ name: ' ', handle: '' })).toEqual({ display_name: null, handle: null });
  });

  it('keeps every preference when one changes (prefs is a single column)', () => {
    const current = rowToProfile(profileRow);
    const row = profileToRow({ ...current, fit: 'oversized' });
    expect(row.prefs).toEqual({ ...PREF_DEFAULTS, fit: 'oversized', colors: ['navy'] });
  });

  it('never sends the profile id', () => {
    expect(profileToRow({ id: 'someone-else' })).toEqual({});
  });
});

describe('handles', () => {
  it.each([
    ['Janav', 'janav'],
    ['janav.dhingra', 'janavdhingra'],
    ['  Jo Smith! ', 'josmith'],
    ['under_score', 'under_score'],
    [null, ''],
  ])('normalises %j to %j', (input, out) => {
    expect(normalizeHandle(input)).toBe(out);
  });

  it('caps handles at 30 characters', () => {
    expect(normalizeHandle('a'.repeat(40))).toHaveLength(30);
  });

  it('accepts 3–30 lowercase letters, digits and underscores', () => {
    expect(isValidHandle('janav')).toBe(true);
    expect(isValidHandle('ab')).toBe(false);
    expect(isValidHandle('Janav')).toBe(false);
    expect(isValidHandle('a'.repeat(31))).toBe(false);
    expect(isValidHandle('')).toBe(false);
  });
});
