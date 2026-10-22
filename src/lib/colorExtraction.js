

/* ============================================================
   COLOR EXTRACTION — sample a photo's pixels, find dominant
   color, snap to the closest tag in our COLORS palette.
============================================================ */
export function rgbToLab(r, g, b) {
  // sRGB → linear → XYZ (D65) → Lab. Standard transform.
  let R = r/255, G = g/255, B = b/255;
  R = R > 0.04045 ? Math.pow((R+0.055)/1.055, 2.4) : R/12.92;
  G = G > 0.04045 ? Math.pow((G+0.055)/1.055, 2.4) : G/12.92;
  B = B > 0.04045 ? Math.pow((B+0.055)/1.055, 2.4) : B/12.92;
  let X = (R*0.4124 + G*0.3576 + B*0.1805) / 0.95047;
  let Y = (R*0.2126 + G*0.7152 + B*0.0722) / 1.0;
  let Z = (R*0.0193 + G*0.1192 + B*0.9505) / 1.08883;
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787*t + 16/116);
  const L = 116*f(Y) - 16;
  const a = 500*(f(X) - f(Y));
  const bb = 200*(f(Y) - f(Z));
  return [L, a, bb];
}
export function deltaE(l1, l2) {
  return Math.sqrt(Math.pow(l1[0]-l2[0],2) + Math.pow(l1[1]-l2[1],2) + Math.pow(l1[2]-l2[2],2));
}
export function hexToRgb(h) {
  const m = h.replace('#','').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [0,0,0];
  return [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)];
}

export async function extractDominantColors(source, palette) {
  // returns array of {id, label, hex, distance} sorted by closeness.
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let createdUrl = null;
    const cleanup = () => { if (createdUrl) { URL.revokeObjectURL(createdUrl); createdUrl = null; } };
    img.onload = () => {
      try {
        const w = 60, h = Math.round(60 * img.height / img.width) || 60;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        // Collect into coarser 32-step RGB bins so saturated colors that
        // straddle two narrow bins merge into one. Ignore near-white edges
        // (likely background) and very dark pixels (likely shadow).
        const buckets = {};
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
          if (a < 200) continue;
          if (r > 240 && g > 240 && b > 240) continue;
          // 32-step bin (5-bit). Drops the low 5 bits of each channel.
          const rb = r >> 5, gb = g >> 5, bb = b >> 5;
          const k = `${rb},${gb},${bb}`;
          if (!buckets[k]) buckets[k] = { count: 0, r: 0, g: 0, b: 0 };
          buckets[k].count++;
          buckets[k].r += r; buckets[k].g += g; buckets[k].b += b;
        }
        const top = Object.values(buckets).sort((x, y) => y.count - x.count).slice(0, 4);
        if (!top.length) return resolve([]);
        // For each top bucket, score every palette color by Lab distance.
        // Use sqrt(count) weighting so a single big bucket doesn't drown out
        // a smaller-but-real second-color signal.
        const paletteLab = palette.map(p => ({ ...p, lab: rgbToLab(...hexToRgb(p.hex)) }));
        const scoreById = {};
        for (const t of top) {
          const r = t.r / t.count, g = t.g / t.count, b = t.b / t.count;
          const lab = rgbToLab(r, g, b);
          // Weight by inverse Lab distance so closer palette colors get more
          // credit than distant ones (rather than rank position alone).
          const weight = Math.sqrt(t.count);
          for (const p of paletteLab) {
            const d = deltaE(lab, p.lab);
            // Inverse-distance with floor so the closest bucket dominates.
            scoreById[p.id] = (scoreById[p.id] || 0) + weight / (1 + d);
          }
        }
        const ranked = Object.entries(scoreById)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([id]) => palette.find(p => p.id === id))
          .filter(Boolean);
        cleanup();
        resolve(ranked);
      } catch (e) { cleanup(); resolve([]); }
    };
    img.onerror = () => { cleanup(); resolve([]); };
    if (source instanceof Blob) { createdUrl = URL.createObjectURL(source); img.src = createdUrl; }
    else img.src = source;
  });
}
