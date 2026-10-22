import { scoreOutfit } from './scoring';

/* ============================================================
   OUTFIT GENERATION
============================================================ */
export function isAvailable(item) {
  const state = item.state || 'clean';
  return state === 'clean' || state === 'recent';
}

export function generateOutfits(items, profile, context, feedback, vibe, mustInclude) {
  const available = items.filter(isAvailable);
  if (!available.length) return [];

  const tops = available.filter(i => i.role === 'top');
  const bottoms = available.filter(i => i.role === 'bottom');
  const dresses = available.filter(i => i.role === 'dress');
  const outers = available.filter(i => i.role === 'outer');
  const shoes = available.filter(i => i.role === 'shoes');
  const accs = available.filter(i => i.role === 'accessory');

  const candidates = [];

  function tryAdd(outfit) {
    if (mustInclude && !Object.values(outfit).some(i => i?.id === mustInclude.id)) return;
    const eval_ = scoreOutfit(outfit, profile, context, feedback, vibe);
    if (eval_.score > -50) {
      candidates.push({ outfit, score: eval_.score, reasons: eval_.reasons });
    }
  }

  // Two-piece: top + bottom
  for (const t of tops) {
    for (const b of bottoms) {
      const base = { top: t, bottom: b };
      // no shoes / outer / accessory
      tryAdd(base);
      for (const s of shoes) tryAdd({ ...base, shoes: s });
      if (context.layers.needsOuter || context.layers.carryLayer) {
        for (const o of outers) {
          tryAdd({ ...base, outer: o });
          for (const s of shoes) tryAdd({ ...base, outer: o, shoes: s });
        }
      }
      // with accessory
      for (const a of accs.slice(0, 3)) tryAdd({ ...base, accessory: a });
    }
  }

  // Dresses
  for (const d of dresses) {
    tryAdd({ dress: d });
    for (const s of shoes) tryAdd({ dress: d, shoes: s });
    if (context.layers.needsOuter) {
      for (const o of outers) {
        for (const s of shoes) tryAdd({ dress: d, outer: o, shoes: s });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  // Diversity: dedupe close cousins
  const out = [];
  const seenSigs = new Set();
  for (const c of candidates) {
    const sig = Object.values(c.outfit).filter(Boolean).map(i => i.id).sort().join('|');
    if (seenSigs.has(sig)) continue;
    seenSigs.add(sig);

    // dedupe by core (top + bottom)
    const core = (c.outfit.top?.id || '') + '|' + (c.outfit.bottom?.id || '') + '|' + (c.outfit.dress?.id || '');
    if (out.some(o => {
      const oCore = (o.outfit.top?.id || '') + '|' + (o.outfit.bottom?.id || '') + '|' + (o.outfit.dress?.id || '');
      return oCore === core;
    })) continue;

    out.push(c);
    if (out.length >= 6) break;
  }
  return out;
}
