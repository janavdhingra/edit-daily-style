import { STYLE_PROFILES } from './aesthetics';

/* ============================================================
   UI OPTIONS — these are app features, not mock data
============================================================ */
export const GENDERS = [
  { id: 'man', label: 'Man', hint: 'menswear-led' },
  { id: 'woman', label: 'Woman', hint: 'womenswear-led' },
  { id: 'nonbinary', label: 'Non-binary', hint: 'cross-category' },
  { id: 'private', label: 'Prefer not to say', hint: 'no gender bias' },
];
export const FITS = [
  { id: 'fitted', label: 'Fitted' },
  { id: 'relaxed', label: 'Relaxed' },
  { id: 'oversized', label: 'Oversized' },
  { id: 'mixed', label: 'Mix it up' },
];
export const SILHOUETTES = [
  { id: 'streamlined', label: 'Streamlined', hint: 'closer to body' },
  { id: 'volume', label: 'Volume', hint: 'oversized, drapey' },
  { id: 'balanced', label: 'Balanced', hint: 'fitted top, loose bottom (or reverse)' },
  { id: 'mixed', label: 'It depends', hint: 'no fixed rule' },
];
export const TEMP_SENS = [
  { id: 'cold', label: 'Run cold', hint: 'always need a layer' },
  { id: 'neutral', label: 'Neutral', hint: 'middle of the road' },
  { id: 'hot', label: 'Run hot', hint: 'less is more' },
];
export const COLORS = [
  { id: 'black', label: 'Black', hex: '#0F0F0F' },
  { id: 'white', label: 'White', hex: '#F5F1E8' },
  { id: 'cream', label: 'Cream', hex: '#E8DDC4' },
  { id: 'tan', label: 'Tan', hex: '#C4A675' },
  { id: 'grey', label: 'Grey', hex: '#8A8780' },
  { id: 'sky', label: 'Light blue', hex: '#B9C9DD' },
  { id: 'navy', label: 'Navy', hex: '#1E2A3F' },
  { id: 'olive', label: 'Olive', hex: '#6B6845' },
  { id: 'rust', label: 'Rust', hex: '#A0512C' },
  { id: 'burgundy', label: 'Burgundy', hex: '#5B2A2A' },
  { id: 'denim', label: 'Denim', hex: '#5A6B82' },
  { id: 'pink', label: 'Pink', hex: '#D9A0A0' },
  { id: 'mustard', label: 'Mustard', hex: '#C49B4A' },
];
export const OCCASIONS = [
  { id: 'university', label: 'University' },
  { id: 'lectures', label: 'Lectures' },
  { id: 'presentations', label: 'Presentations' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'office', label: 'Office / WFO' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'formal', label: 'Formal' },
  { id: 'wedding', label: 'Wedding' },
  { id: 'date', label: 'Date night' },
  { id: 'going-out', label: 'Going out' },
  { id: 'brunch', label: 'Brunch' },
  { id: 'travel', label: 'Travel' },
  { id: 'workout', label: 'Workout' },
  { id: 'lounge', label: 'Lounge' },
];
// How dressed-up to go today. Independent of the user's style references.
export const VIBES = [
  { id: 'low-effort', label: 'Relaxed', hint: 'Fewest pieces, most comfort',
    tilt: { formality: [1, 2], pieceCountTarget: 3 } },
  { id: 'considered', label: 'Everyday', hint: 'Your usual, put together',
    tilt: { formality: [2, 3], pieceCountTarget: 4 } },
  { id: 'polished', label: 'Polished', hint: 'A step dressier',
    tilt: { formality: [3, 4], pieceCountTarget: 4 } },
  { id: 'statement', label: 'Bold', hint: 'Lead with a standout piece',
    tilt: { formality: [3, 5], pieceCountTarget: 5, allowAccent: true } },
];
export const ROLES = [
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'outer', label: 'Outerwear' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'dress', label: 'Dress / one-piece' },
  { id: 'accessory', label: 'Accessory' },
];
export const FABRICS = [
  { id: 'soft', label: 'Soft / cotton' },
  { id: 'wool', label: 'Wool / warm' },
  { id: 'denim', label: 'Denim' },
  { id: 'leather', label: 'Leather' },
  { id: 'silk', label: 'Silk / fluid' },
  { id: 'tech', label: 'Technical / synthetic' },
];
// Item-level style tags — same vocabulary as STYLE_PROFILES so the engine
// matches your aesthetic picks directly against your tagged items.
export const STYLES = Object.keys(STYLE_PROFILES);
export const FORMALITY_LABELS = ['casual', 'relaxed', 'smart-casual', 'business', 'formal'];
