> **Note:** this is the original design spec, written before building. The shipped app is a React + Vite web app on Supabase and Netlify; see the [README](../README.md).

# EDIT — Architecture & Build Notes

Companion spec to `edit-app.html`. Everything below is what I'd hand to a backend engineer once the design is signed off.

---

## 1. Product positioning

**Name:** EDIT
**Tagline:** Daily style.
**One-liner:** A stylist with taste, not a search bar.
**Core promise:** One look. Every morning. Reasoned, not random.

The app's job is *reduction*, not generation. Most wardrobe apps fail because they overwhelm — endless grids, infinite combinations. EDIT solves the actual problem: decision fatigue. We deliver one curated answer, with two alternates, and a stylist's reason. That restraint is the product.

---

## 2. Screen map

```
Splash (1.5s)
  └── Onboarding (4 steps: welcome → style → colors → occasions)
        └── App
              ├── Today  (default tab, the hero)
              │     ├── Outfit Detail (modal)
              │     └── Alternates (1 of 3, dot pagination)
              ├── Closet
              │     ├── Filter chips (All, Tops, Bottoms, Outer, Shoes, Accessories)
              │     └── Upload (modal: photo → auto-tag → confirm)
              ├── Vibes
              │     └── Vibe Detail (collection of outfits per mood)
              └── Saved
                    └── Outfit Detail (modal)
```

**Why this nav?** Four tabs is the maximum for thumb-reach without cognitive load. *Today* is the daily ritual; *Closet* is inventory; *Vibes* is exploration; *Saved* is memory. No "Profile" tab — settings live behind an icon on Today, because a profile tab implies social, which we are not.

---

## 3. Visual system

| Token | Value | Use |
|---|---|---|
| `--bg` | `#FAFAF8` | App background (warm white) |
| `--bg-warm` | `#F4EFE6` | Card/section accents |
| `--ink` | `#0F0F0F` | Primary text |
| `--ink-soft` | `#5C5C5C` | Secondary text |
| `--ink-muted` | `#9C968C` | Tertiary, labels |
| `--line` | `#ECE9E3` | Hairlines |
| `--accent` | `#B8A586` | Warm taupe accent |
| `--accent-deep` | `#6B5D45` | "Why it works" copy |

**Type:** Fraunces (serif) for editorial moments — outfit names, page titles, the emotional copy. Inter for everything functional. The contrast between the two is the brand.

**Why no logo wordmark in headers?** A real luxury app trusts the user to know where they are. Headers carry meaning ("Today's edit", a date, a vibe name) — not branding. The brand lives in the *feel*.

---

## 4. Data model (PostgreSQL)

```sql
-- Users
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  display_name TEXT,
  gender       TEXT,                            -- nullable, optional
  style_pref   TEXT,                            -- 'minimal' | 'streetwear' | ...
  color_prefs  TEXT[],                          -- ['ink','cream','stone']
  occasions    TEXT[],                          -- ['work','date','weekends']
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Wardrobe items
CREATE TABLE items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  image_url   TEXT NOT NULL,
  category    TEXT NOT NULL,                    -- 'top' | 'bottom' | 'outer' | 'shoes' | 'accessory'
  subtype     TEXT,                             -- 'tee', 'knit', 'trouser', 'denim', ...
  primary_color   TEXT,                         -- 'ink', 'cream', 'stone' ...
  secondary_color TEXT,
  fit         TEXT,                             -- 'oversized' | 'regular' | 'slim'
  fabric      TEXT,                             -- 'cotton', 'wool', 'leather', ...
  formality   INT CHECK (formality BETWEEN 1 AND 5),
  warmth      INT CHECK (warmth BETWEEN 1 AND 5),
  tags        TEXT[],                           -- 'casual','evening','workwear'
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Outfits (daily picks + saved looks)
CREATE TABLE outfits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT,                             -- "Quiet Confidence"
  description TEXT,                             -- one-line stylist copy
  why         TEXT,                             -- the rationale shown to user
  vibe        TEXT,                             -- 'clean' | 'street' | 'date' | 'luxury' | 'offduty'
  generated_for DATE,                           -- the day this was the daily fit
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE outfit_items (
  outfit_id UUID REFERENCES outfits(id) ON DELETE CASCADE,
  item_id   UUID REFERENCES items(id) ON DELETE CASCADE,
  role      TEXT,                               -- 'top','bottom','outer','shoes','accessory'
  PRIMARY KEY (outfit_id, item_id)
);

-- Feedback signal — drives future generation
CREATE TABLE feedback (
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  outfit_id  UUID REFERENCES outfits(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                     -- 'save' | 'like' | 'dislike' | 'wear'
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, outfit_id, kind)
);
```

The split between `outfits` (a generated *pick*) and `feedback` (a user *signal*) matters: it lets the styling engine learn from any combination of save / wear / explicit thumbs without conflating them.

---

## 5. Styling logic — the rules engine

The MVP runs a deterministic, explainable engine. No ML, no API costs, ships today. Here's the spine:

### Inputs
- The user's `items[]`
- The user's profile (style_pref, color_prefs, occasions)
- The day's *context*: weekday/weekend, weather (optional), time of day

### Pipeline

```
1. CANDIDATE ASSEMBLY
   For each role (top, bottom, shoes, [outer], [accessory]),
   pick all eligible items. Weight by:
     - matches user's style_pref            (+2)
     - color in user's color_prefs          (+1)
     - liked in past feedback               (+2)
     - disliked in past feedback            (-3)
     - occasion matches today's context     (+1)

2. COMBINATION RULES (filter)
   For every (top × bottom × shoes [× outer]) combo:
     a. COLOR HARMONY
        - max 1 "loud" color (loud = saturated, non-neutral)
        - the rest must come from neutral palette
          (ink, cream, stone, bone, charcoal, camel, slate)
     b. FIT BALANCE
        - if top.fit == 'oversized' → bottom.fit must be 'slim' or 'regular'
        - if bottom.fit == 'wide'    → top.fit must be 'regular' or 'fitted'
     c. FORMALITY MATCH
        - max 1 step difference between top.formality, bottom.formality, shoes.formality
     d. WARMTH (if weather known)
        - sum of warmth ratings within ±1 of target for the temperature

3. SCORE
   final_score = candidate_weights + style_bonus + harmony_bonus
   where harmony_bonus rewards:
     - tonal palettes (all neutrals)        (+2)
     - one statement piece                  (+1)
     - texture mix (cotton + wool + leather)(+1)

4. RANK & DEDUPE
   Sort desc. Take top 3. Reject any combo where
   ≥2 items overlap with another top-3 combo.

5. NARRATE
   For the top pick: pick a `title` template based on style_pref
   and dominant tags. Pick a `why` template based on which rule
   fired hardest (color vs fit vs texture).
```

### Title library (sample)

```js
const TITLES = {
  minimal:    ['Quiet Confidence', 'Soft Power', 'Considered', 'Easy Hand'],
  streetwear: ['Effortless Edge', 'Off-Duty', 'After Hours', 'On Foot'],
  soft:       ['Gentle Hand', 'Tonal Story', 'Slow Light', 'Hush'],
  bold:       ['Set Tone', 'Worn Loud', 'In View', 'Take the Room'],
  luxury:     ['Quiet Money', 'Off the Record', 'Inside Voice', 'Old World'],
};
```

### "Why" templates (sample)

```js
const WHYS = {
  color_neutral:    'Neutral base + one statement piece keeps it balanced.',
  color_tonal:      'Tone-on-tone reads expensive without trying.',
  fit_balanced:     'Oversized up top, slim down low. The proportions do the work.',
  texture_mixed:    'Cotton with wool with leather — texture finishes it.',
  occasion_sharp:   'Tailored where it counts, easy everywhere else.',
};
```

The rule that fired hardest in scoring decides which template you see — so the *why* is always honest, not boilerplate.

---

## 6. API endpoints (Node.js + Express)

```
POST   /auth/signup             → create user
POST   /auth/login              → JWT
POST   /onboarding              → save profile { style, colors, occasions }

GET    /items                   → list user's wardrobe (filter: ?category=...)
POST   /items                   → upload + auto-tag
                                  body: multipart image
                                  returns: { id, category, primary_color, fit, ... }
PATCH  /items/:id               → manual tag override
DELETE /items/:id

GET    /today                   → today's outfit + 2 alternates
                                  returns: { outfits: [{id, title, why, items[], hero_url}] }
GET    /vibes/:vibe             → outfits filtered to a vibe
GET    /outfits/:id             → single outfit detail

POST   /feedback                → body: { outfit_id, kind: 'save'|'like'|'dislike'|'wear' }
GET    /saved                   → user's saved outfits
```

Auto-tagging on upload (`POST /items`):
1. Image hits `/items`
2. Send to a vision endpoint (Claude Sonnet vision API or a self-hosted model)
3. Return structured tags. With Claude, the prompt looks like:

```
You are tagging a clothing item for a wardrobe app. Return JSON only.
{
  "category": "top|bottom|outer|shoes|accessory",
  "subtype": "tee|knit|trouser|denim|jacket|coat|sneaker|loafer|boot|tote|cap|sunglasses|...",
  "primary_color": "ink|cream|stone|olive|camel|slate|rust|bone|navy|charcoal|...",
  "secondary_color": "...",
  "fit": "oversized|regular|slim|wide",
  "fabric": "cotton|wool|leather|silk|denim|knit",
  "formality": 1-5,
  "warmth": 1-5
}
```
With `response_format: {type: "json_object"}` to force valid JSON. ~$0.005 per upload.

---

## 7. Frontend stack (production)

For the real app I'd ship:

- **Expo (React Native)** — same codebase, iOS + Android, Hermes engine
- **Tamagui** or **NativeWind** for design tokens (matches the variables in `:root` above)
- **Expo Image** for the hero photography (handles caching + blur placeholders)
- **React Query** for `/today` with stale-while-revalidate
- **expo-image-picker** + `/items` upload flow
- **Reanimated** for the page transitions and the bookmark-press animation
- **Sentry** + **PostHog** from day one — you cannot improve what you don't measure

Sub-100ms perceived load: prefetch tomorrow's `/today` in the background once today's view is rendered.

---

## 8. Microcopy library

Treat the copy as a system, not strings:

**Greetings (rotated):** Good morning. · Welcome back. · Today's the day.

**Vibe descriptions:**
- Clean — *Quiet, intentional, uncluttered.*
- Street — *Edge with restraint.*
- Date night — *A little tension. A little softness.*
- Minimal luxury — *Quiet money.*
- Off-duty — *Sunday energy. Always.*
- Workday — *Sharp without effort.*

**Stylist lines (for hero descriptions):**
- "This one's clean. You're not trying too hard — and that's the point."
- "A little tension. Easy to wear, hard to forget."
- "Tonal, tactile, in no rush."
- "Sunday energy on a Saturday. Earned, not performed."
- "Let this one speak quietly. The fit does the talking."

**Feedback affirmations:**
- Like → "We'll lean into this."
- Save → "Saved."
- Dislike → (silent — never explain rejection back to the user)

**Empty state (Saved):** "Nothing here yet. Save a look and it'll live here. Quietly. Reliably."

The rule for every line: if a friend texted you this, would you screenshot it? If no, rewrite.

---

## 9. What's intentionally *not* in the MVP

- Social / following / shared outfits — kills the personal-stylist illusion
- Shopping / affiliate links — turns the app from a stylist into a store
- Gamification (streaks, badges) — wrong emotional register
- Multiple outfits per day (calendar view) — defeats the one-decision promise
- Manual outfit builder (drag-and-drop) — forces the user to be the stylist

Each of these would be requested by a PM. Each would dilute the product. Hold the line.

---

## 10. Build order (suggested)

1. Schema + auth + `/onboarding` (1 day)
2. `/items` upload + auto-tag with Claude vision (2 days)
3. Rules engine for `/today` (3 days, the actual work)
4. RN screens — Today, Closet, Vibes, Saved (4 days)
5. Feedback loop + saved outfits (1 day)
6. Polish pass — animations, microcopy, empty states (2 days)

Two weeks to TestFlight. Real users by week three.
