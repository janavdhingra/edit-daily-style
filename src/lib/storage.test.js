import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { storage, onStorageQuota, KEYS, userStorage, memoryStorage } from './storage';

// Node 25 ships its own global localStorage that shadows a test environment's,
// so give these tests a real browser-style Storage from their own jsdom.
const { window } = new JSDOM('', { url: 'https://edit.test/' });
const Storage = window.Storage;
vi.stubGlobal('localStorage', window.localStorage);

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('storage', () => {
  it('round-trips JSON values', () => {
    storage.set('k', { a: 1, list: ['x'] });
    expect(storage.get('k')).toEqual({ a: 1, list: ['x'] });
  });

  it('returns the fallback for missing keys', () => {
    expect(storage.get('missing', 'fallback')).toBe('fallback');
  });

  it('returns the fallback for corrupted data instead of crashing', () => {
    localStorage.setItem('k', '{not json');
    expect(storage.get('k', [])).toEqual([]);
  });

  it('deletes keys', () => {
    storage.set('k', 1);
    storage.del('k');
    expect(storage.get('k', null)).toBeNull();
  });

  it('tells listeners when the browser runs out of space', () => {
    const listener = vi.fn();
    const off = onStorageQuota(listener);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    storage.set('k', 'x'.repeat(10));
    expect(listener).toHaveBeenCalled();
    off();
  });

  it('swallows other storage errors quietly', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => storage.set('k', 1)).not.toThrow();
  });

  it('keeps every storage key unique and versioned', () => {
    const values = Object.values(KEYS);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) expect(v).toMatch(/^edit\..+\.v3$/);
  });
});

describe('userStorage', () => {
  it('keeps each account’s data separate', () => {
    const alice = userStorage('alice');
    const bob = userStorage('bob');
    alice.set(KEYS.saved, ['a']);
    bob.set(KEYS.saved, ['b']);
    expect(alice.get(KEYS.saved)).toEqual(['a']);
    expect(bob.get(KEYS.saved)).toEqual(['b']);
    expect(storage.get(KEYS.saved, null)).toBeNull();
  });

  it('deletes only that account’s key', () => {
    const alice = userStorage('alice');
    const bob = userStorage('bob');
    alice.set('k', 1); bob.set('k', 2);
    alice.del('k');
    expect(alice.get('k', null)).toBeNull();
    expect(bob.get('k')).toBe(2);
  });
});

describe('memoryStorage', () => {
  it('works like storage but never touches the browser', () => {
    const mem = memoryStorage();
    mem.set('k', { a: 1 });
    expect(mem.get('k')).toEqual({ a: 1 });
    expect(localStorage.length).toBe(0);
    mem.del('k');
    expect(mem.get('k', 'gone')).toBe('gone');
  });
});

