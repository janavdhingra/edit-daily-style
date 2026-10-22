/* ============================================================
   COLOR HARMONY — works on color tags
============================================================ */
// Light blue (oxford-shirt blue) works as a neutral, like denim and navy.
export const NEUTRALS = new Set(['black', 'white', 'cream', 'grey', 'tan', 'navy', 'denim', 'sky']);
export function colorScore(colors) {
  const cs = colors.filter(Boolean);
  if (!cs.length) return 0;
  const neutralCount = cs.filter(c => NEUTRALS.has(c)).length;
  const accentCount = cs.length - neutralCount;
  if (accentCount === 0) return 8; // all-tonal
  if (accentCount === 1 && neutralCount >= 1) return 10; // one accent on neutrals
  if (accentCount >= 3) return -4; // too busy
  return 4;
}

export function fitBalance(items) {
  const fits = items.map(i => i.fit).filter(Boolean);
  if (!fits.length) return 3; // no fit info: neutral, not "all oversized"
  const has = (f) => fits.includes(f);
  if ((has('oversized') && has('fitted')) || (has('relaxed') && has('fitted'))) return 8;
  if (fits.every(f => f === 'oversized')) return -2;
  return 3;
}
