/* ============================================================
   AESTHETIC PROFILES — these are the same vocabulary used to tag
   closet items. Picking "minimal" as a reference and tagging your
   ribbed crew "minimal" both flow into the same scoring signal,
   so the rec engine learns directly from this language as you
   save / skip / wear outfits.
============================================================ */
export const STYLE_PROFILES = {
  'minimal': {
    name: 'Minimal',
    tagline: 'clean lines · neutrals · restraint',
    palette: ['black', 'white', 'cream', 'grey', 'tan'],
    formality: [2, 5],
    signatures: ['ribbed', 'tank', 'crew', 'loafer', 'blazer'],
    styleWeight: { minimal: 4, tonal: 2, tailored: 1 },
  },
  'tonal': {
    name: 'Tonal',
    tagline: 'one color · top to toe',
    palette: ['cream', 'tan', 'grey', 'navy', 'black'],
    formality: [2, 4],
    signatures: ['monochrome', 'matched', 'co-ord'],
    styleWeight: { tonal: 4, minimal: 2 },
  },
  'tailored': {
    name: 'Tailored',
    tagline: 'sharp lines · suiting · polished',
    palette: ['black', 'navy', 'grey', 'cream', 'burgundy'],
    formality: [3, 5],
    signatures: ['blazer', 'trouser', 'oxford', 'collar', 'loafer'],
    styleWeight: { tailored: 4, minimal: 2, refined: 2 },
  },
  'streetwear': {
    name: 'Streetwear',
    tagline: 'oversized · sneakers · layered',
    palette: ['black', 'grey', 'cream', 'olive', 'denim'],
    formality: [1, 3],
    signatures: ['hoodie', 'sneaker', 'cargo', 'graphic', 'cap'],
    styleWeight: { streetwear: 4, casual: 2 },
  },
  'vintage': {
    name: 'Vintage',
    tagline: 'thrifted · era-tinged · lived-in',
    palette: ['cream', 'rust', 'burgundy', 'denim', 'tan', 'olive'],
    formality: [1, 3],
    signatures: ['vintage-tee', 'mom-jean', 'cardigan', 'denim'],
    styleWeight: { vintage: 4, casual: 2 },
  },
  'preppy': {
    name: 'Preppy',
    tagline: 'collars · loafers · polos',
    palette: ['navy', 'cream', 'tan', 'white', 'denim'],
    formality: [2, 4],
    signatures: ['polo', 'collar', 'loafer', 'cardigan', 'oxford'],
    styleWeight: { preppy: 4, tailored: 1 },
  },
  'old-money': {
    name: 'Old Money',
    tagline: 'quiet luxury · cashmere · understated',
    palette: ['cream', 'tan', 'navy', 'burgundy', 'white'],
    formality: [3, 5],
    signatures: ['cashmere', 'silk', 'trench', 'oxford', 'loafer'],
    styleWeight: { 'old-money': 4, tailored: 2, minimal: 2 },
  },
  'workwear': {
    name: 'Workwear',
    tagline: 'utility · function · military',
    palette: ['olive', 'tan', 'grey', 'cream', 'denim'],
    formality: [1, 3],
    signatures: ['carhartt', 'cargo', 'chore-coat', 'boot', 'denim'],
    styleWeight: { workwear: 4, utility: 3, vintage: 1 },
  },
  'soft': {
    name: 'Soft',
    tagline: 'flowy · romantic · silk',
    palette: ['cream', 'pink', 'tan', 'burgundy', 'white'],
    formality: [2, 4],
    signatures: ['silk', 'flowy', 'ballet', 'lace', 'ruffle'],
    styleWeight: { soft: 4, romantic: 3, feminine: 2 },
  },
  'grunge': {
    name: 'Grunge',
    tagline: 'distressed · dark · layered',
    palette: ['black', 'grey', 'denim', 'burgundy'],
    formality: [1, 3],
    signatures: ['flannel', 'leather', 'distressed', 'boot', 'band-tee'],
    styleWeight: { grunge: 4, vintage: 2, streetwear: 1 },
  },
  'bold': {
    name: 'Bold',
    tagline: 'pattern · statement · fearless',
    palette: ['varied'],
    formality: [2, 5],
    signatures: ['statement', 'pattern', 'color', 'metallic'],
    styleWeight: { bold: 4, eclectic: 3 },
  },
  'athleisure': {
    name: 'Athleisure',
    tagline: 'sporty · technical · comfortable',
    palette: ['black', 'grey', 'white', 'navy'],
    formality: [1, 2],
    signatures: ['hoodie', 'jogger', 'sneaker', 'tech', 'tank'],
    styleWeight: { athleisure: 4, casual: 2 },
  },
  'day': {
    name: 'Day Fits',
    tagline: 'simple · repeatable · low-effort',
    palette: ['cream', 'denim', 'grey', 'white', 'tan'],
    formality: [1, 3],
    signatures: ['tee', 'jean', 'sneaker', 'crew'],
    styleWeight: { day: 4, casual: 2, minimal: 1 },
  },
  'evening': {
    name: 'Evening',
    tagline: 'after-dark · refined · fitted',
    palette: ['black', 'burgundy', 'metallic', 'cream'],
    formality: [3, 5],
    signatures: ['silk', 'leather', 'heel', 'slip', 'fitted'],
    styleWeight: { evening: 4, refined: 2, bold: 1 },
  },
  'y2k': {
    name: 'Y2K',
    tagline: 'low-rise · baby-tee · micro',
    palette: ['denim', 'pink', 'cream', 'metallic'],
    formality: [1, 3],
    signatures: ['low-rise', 'baby-tee', 'cropped', 'mini'],
    styleWeight: { y2k: 4, vintage: 2, bold: 1 },
  },
};

export const STYLE_PROFILE_LIST = Object.entries(STYLE_PROFILES).map(([id, v]) => ({ id, ...v }));

// Aesthetics aren't gendered — same vocabulary works across lanes.
// Kept the function name for caller compatibility.
export function refsForGender(gender) {
  return { primary: STYLE_PROFILE_LIST, secondary: [] };
}
