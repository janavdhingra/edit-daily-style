import { STYLE_PROFILES } from '../data/aesthetics';
import { FORMALITY_LABELS } from '../data/options';
import { NEUTRALS, colorScore, fitBalance } from './harmony';

/* ============================================================
   SCORING — outfit candidate vs profile + context + feedback
============================================================ */
export function scoreOutfit(outfit, profile, context, feedback, vibe) {
  const items = Object.values(outfit).filter(Boolean);
  if (items.length < 2) return { score: -100, reasons: [] };

  const reasons = [];
  let score = 0;
  const weights = (feedback && feedback.weights) || {};
  const recentSigs = (feedback && feedback.recentSigs) || []; // [{sig, ts}]
  const skippedSigs = (feedback && feedback.skippedSigs) || [];
  const sig = items.map(i => i.id).sort().join('|');

  // 1. Color harmony
  const colors = items.map(i => i.color);
  const c = colorScore(colors);
  score += c;
  if (c >= 8) reasons.push('color harmony');

  // 2. Fit balance
  const fb = fitBalance(items);
  score += fb;
  if (fb >= 6) reasons.push('proportion');

  // 3. Formality match
  const formalities = items.map(i => i.formality || 2);
  const avgF = formalities.reduce((a,b)=>a+b,0) / formalities.length;
  const fSpread = Math.max(...formalities) - Math.min(...formalities);
  const [fMin, fMax] = context.formality;
  if (avgF >= fMin && avgF <= fMax) { score += 14; reasons.push(`fits ${FORMALITY_LABELS[Math.round(avgF)-1] || 'occasion'}`); }
  else { score -= Math.abs(avgF - (fMin+fMax)/2) * 5; }
  if (fSpread > 2) score -= 6;

  // 4. Warmth match
  const warmths = items.map(i => i.warmth || 3);
  const totalWarmth = warmths.reduce((a,b)=>a+b,0) / warmths.length;
  const warmDiff = Math.abs(totalWarmth - context.warmth);
  score += Math.max(0, 10 - warmDiff * 4);
  if (warmDiff < 0.6) reasons.push('weather-right');

  // 5. Rain readiness
  if (context.layers.needsRain) {
    const hasShield = items.some(i => i.tags?.includes('rain') || i.fabric === 'tech' || i.role === 'outer');
    if (hasShield) { score += 6; reasons.push('rain-ready'); }
    else score -= 8;
  }

  // 6. Outer requirement
  if (context.layers.needsOuter) {
    const hasOuter = items.some(i => i.role === 'outer');
    if (hasOuter) score += 4;
    else if (context.layers.needsHeavyOuter) score -= 10;
    else score -= 4;
  }

  // 6b. A layer to carry for later (cools off after the event starts):
  // a light layer helps, a heavy coat is overkill, going without is fine.
  if (context.layers.carryLayer && !context.layers.needsOuter) {
    const outer = items.find(i => i.role === 'outer');
    if (outer && (outer.warmth || 3) <= 3) { score += 5; reasons.push('carry-layer'); }
    else if (outer) score -= 3;
  }

  // 7. Occasion match
  if (context.occasions.length) {
    const matches = items.flatMap(i => i.occasions || []).filter(o => context.occasions.includes(o));
    score += Math.min(10, matches.length * 3);
    if (matches.length >= 2) reasons.push('matches the day');
  }

  // 8. Style-reference profile match
  if (profile?.references?.length) {
    let refBoost = 0;
    for (const refId of profile.references) {
      const ref = STYLE_PROFILES[refId];
      if (!ref) continue;
      // formality range overlap
      const overlap = Math.min(ref.formality[1], fMax) - Math.max(ref.formality[0], fMin);
      if (overlap >= 0) refBoost += 1;
      // shared style tags
      const shared = items.flatMap(i => i.styles || [])
        .filter(s => Object.keys(ref.styleWeight).includes(s)).length;
      refBoost += Math.min(4, shared);
      // signature match (item tags)
      const sigShared = items.flatMap(i => i.tags || [])
        .filter(t => ref.signatures.includes(t)).length;
      refBoost += sigShared * 2;
    }
    score += Math.min(14, refBoost);
    if (refBoost >= 6) reasons.push('on-reference');
  }

  // 9. User color preference
  if (profile?.colors?.length) {
    const matches = colors.filter(c => profile.colors.includes(c)).length;
    score += matches * 2;
  }

  // 10. Effort-axis tilt (formerly "vibe")
  if (vibe?.tilt) {
    const tilt = vibe.tilt;
    if (tilt.formality) {
      if (avgF >= tilt.formality[0] && avgF <= tilt.formality[1]) {
        score += 6;
        reasons.push(vibe.id === 'low-effort' ? 'low-effort'
          : vibe.id === 'considered' ? 'considered'
          : vibe.id === 'polished' ? 'polished' : 'statement');
      } else {
        score -= 4;
      }
    }
    if (tilt.pieceCountTarget) {
      const diff = Math.abs(items.length - tilt.pieceCountTarget);
      score -= diff * 2;
    }
    // statement effort wants at least one accent or bold-tagged piece
    if (tilt.allowAccent) {
      const accentCount = colors.filter(c => !NEUTRALS.has(c)).length;
      const hasBold = items.some(i => (i.styles||[]).includes('bold') || (i.tags||[]).includes('statement'));
      if (accentCount > 0 || hasBold) score += 6;
    }
  }

  // 11. Per-piece feedback memory
  let pieceBoost = 0;
  for (const it of items) {
    const fb = feedback?.pieces?.[it.id];
    if (fb === 'love') pieceBoost += 4;
    else if (fb === 'hate') pieceBoost -= 12;
  }
  score += pieceBoost;

  // 12. Recently-worn penalty (per item)
  for (const it of items) {
    if (it.lastWorn) {
      const days = (Date.now() - it.lastWorn) / 86400000;
      if (days < 1) score -= 10;
      else if (days < 3) score -= 5;
      else if (days < 5) score -= 2;
    }
  }

  // 13/14. Anti-repeat (recently worn, 5d) and skipped (14d). Take the
  // larger of the two penalties rather than stacking — an outfit you wore
  // Monday and skipped Tuesday should be discouraged, not buried.
  const fiveDaysMs = 5 * 86400000;
  const fourteenDaysMs = 14 * 86400000;
  const repeated = recentSigs.find(s => s.sig === sig && (Date.now() - s.ts) < fiveDaysMs);
  const wasSkipped = skippedSigs.find(s => s.sig === sig && (Date.now() - s.ts) < fourteenDaysMs);
  const repeatPenalty = repeated ? 14 : 0;
  const skipPenalty = wasSkipped ? 20 : 0;
  score -= Math.max(repeatPenalty, skipPenalty);

  // 15. Learned weight vector — every save / love / wear nudges these up,
  // every skip / hate nudges them down. The aesthetic taxonomy is the lingua
  // franca: same vocabulary as STYLE_PROFILES, item.styles, profile.references.
  let learnedBoost = 0;
  for (const it of items) {
    for (const tag of (it.styles || [])) {
      const w = weights[tag] || 0;
      learnedBoost += w * 1.2;
    }
  }
  score += Math.max(-20, Math.min(20, learnedBoost));

  // 16. Silhouette / fit profile
  if (profile?.silhouette) {
    const fits = items.map(i => i.fit).filter(Boolean);
    const allFitted = fits.every(f => f === 'fitted');
    const allLoose = fits.every(f => f === 'oversized' || f === 'relaxed');
    const mixed = fits.includes('fitted') && fits.includes('oversized');
    if (profile.silhouette === 'streamlined' && allFitted) score += 5;
    if (profile.silhouette === 'volume' && allLoose) score += 5;
    if (profile.silhouette === 'balanced' && mixed) { score += 6; reasons.push('balanced silhouette'); }
  }

  return { score: Math.round(score), reasons: Array.from(new Set(reasons)).slice(0, 4) };
}
