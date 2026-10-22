import { describe, it, expect } from 'vitest';
import { closetLimits } from './limits';
import { top, bottom, outer, weather } from '../test/fixtures';

const basics = () => [top(), bottom()];
const kinds = (notes) => notes.map(n => n.kind);

describe('closetLimits', () => {
  it('says nothing for an empty closet', () => {
    expect(closetLimits([], weather({ feels: -5, rainChance: 90 }), [{ title: 'Interview' }])).toEqual([]);
  });

  it('says nothing on a mild, dry, casual day', () => {
    expect(closetLimits(basics(), weather(), [])).toEqual([]);
  });

  it('never suggests buying anything', () => {
    const notes = closetLimits(
      [top({ state: 'washing' }), top(), bottom()],
      weather({ feels: -3, rainChance: 90 }),
      [{ title: 'Wedding' }],
    );
    expect(notes.length).toBe(4);
    for (const n of notes) expect(n.text).not.toMatch(/\b(buy|get|shop|purchase|add a|you need)\b/i);
  });

  it('notes when it is too cold for anything you own', () => {
    const [note] = closetLimits(basics(), weather({ feels: 2 }), []);
    expect(note.kind).toBe('cold');
    expect(note.text).toContain('2°');
  });

  it('is satisfied by a warm coat, but not a light jacket', () => {
    expect(closetLimits([...basics(), outer({ warmth: 4 })], weather({ feels: 2 }), [])).toEqual([]);
    expect(kinds(closetLimits([...basics(), outer({ warmth: 2 })], weather({ feels: 2 }), []))).toEqual(['cold']);
  });

  it('ignores a warm coat that is in the wash, and says why it is missing', () => {
    expect(kinds(closetLimits([...basics(), outer({ warmth: 5, state: 'washing' })], weather({ feels: 0 }), [])))
      .toEqual(['away', 'cold']);
  });

  it('counts pieces in the wash with the right grammar', () => {
    expect(closetLimits([...basics(), top({ state: 'washing' })], weather(), [])[0].text).toMatch(/^1 piece is .* it’s left out/);
    expect(closetLimits([...basics(), top({ state: 'washing' }), top({ state: 'cleaners' })], weather(), [])[0].text)
      .toMatch(/^2 pieces are .* they’re left out/);
  });

  it('suggests an umbrella when nothing is rain-ready', () => {
    expect(kinds(closetLimits(basics(), weather({ rainChance: 70 }), []))).toEqual(['rain']);
    expect(kinds(closetLimits(basics(), weather({ condition: 'drizzle' }), []))).toEqual(['rain']);
  });

  it('accepts a technical fabric or rain-tagged piece', () => {
    expect(closetLimits([...basics(), outer({ fabric: 'tech' })], weather({ rainChance: 70 }), [])).toEqual([]);
    expect(closetLimits([top({ tags: ['rain'] }), bottom()], weather({ rainChance: 70 }), [])).toEqual([]);
  });

  it('names the formal event it cannot fully dress for', () => {
    const [note] = closetLimits(basics(), null, [{ title: 'Job interview' }]);
    expect(note.kind).toBe('formal');
    expect(note.text).toContain('Job interview');
    expect(closetLimits([top({ formality: 4 }), bottom()], null, [{ title: 'Job interview' }])).toEqual([]);
  });

  it('ignores casual events', () => {
    expect(closetLimits(basics(), null, [{ title: 'Coffee' }, { title: 'Gym' }])).toEqual([]);
  });

  it('works without weather or events', () => {
    expect(closetLimits(basics(), null, null)).toEqual([]);
  });
});
