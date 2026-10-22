import { item } from './fixtures';

// A realistic 12-piece closet for end-to-end engine tests.
export const sampleProfile = {
  fit: 'relaxed', silhouette: 'balanced', tempSens: 'neutral',
  references: ['minimal', 'workwear', 'preppy'], colors: ['navy', 'cream'], occasions: ['university', 'office'],
};

export function sampleCloset() {
  const p = (name, role, color, formality, warmth, fabric, fit, styles, occasions, tags = []) =>
    item({ name, role, color, formality, warmth, fabric, fit, styles, occasions, tags });
  return [
    p('White oxford shirt', 'top', 'white', 3, 2, 'soft', 'relaxed', ['preppy', 'minimal'], ['office', 'university']),
    p('Grey crewneck sweater', 'top', 'grey', 2, 4, 'wool', 'relaxed', ['minimal'], ['university', 'lounge']),
    p('Black tee', 'top', 'black', 1, 1, 'soft', 'fitted', ['minimal'], ['lounge', 'brunch']),
    p('Navy knit polo', 'top', 'navy', 3, 3, 'wool', 'fitted', ['preppy'], ['office', 'date']),
    p('Dark jeans', 'bottom', 'denim', 2, 2, 'denim', 'relaxed', ['minimal', 'workwear'], ['university', 'brunch']),
    p('Tan chinos', 'bottom', 'tan', 3, 2, 'soft', 'relaxed', ['preppy'], ['office', 'university']),
    p('Black trousers', 'bottom', 'black', 4, 3, 'wool', 'fitted', ['minimal', 'tailored'], ['office', 'interviews']),
    p('Navy rain shell', 'outer', 'navy', 2, 3, 'tech', 'relaxed', ['workwear'], ['university'], ['rain']),
    p('Wool overcoat', 'outer', 'grey', 4, 5, 'wool', 'relaxed', ['minimal', 'tailored'], ['office', 'formal']),
    p('White sneakers', 'shoes', 'white', 2, 2, 'leather', 'relaxed', ['minimal'], ['university', 'brunch']),
    p('Brown boots', 'shoes', 'tan', 3, 4, 'leather', 'relaxed', ['workwear'], ['university', 'office']),
    p('Black loafers', 'shoes', 'black', 4, 2, 'leather', 'relaxed', ['tailored', 'preppy'], ['office', 'interviews']),
  ];
}
