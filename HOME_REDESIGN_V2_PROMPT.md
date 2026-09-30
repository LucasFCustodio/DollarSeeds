# Home Redesign v2: section backgrounds, painted cards and a rearranged Envision

v1 (`HOME_REDESIGN_PROMPT.md`) is built on `home-redesign-branch`. This prompt refines it:

- It separates the Core Journey steps with alternating backgrounds.
- It gives two cards a painted background.
- It moves the Savings label next to its icon.
- It rearranges the Envision section.

Everything not mentioned here stays as v1 built it.

Read `CLAUDE.md`, `design_system.md` and `i18n.md`, then read the v1 code before changing anything. Start with `frontend/app/(tabs)/index.tsx` and `frontend/components/home/`, especially `HomeTopBar`, `IncomeHero`, `StatusTitheRow`, `NextPaymentCard`, `SplitContainers`, `Encouragement`, `RotatingCard`, `FocusPlant` and `homeType.ts`. Also read `components/debts/PlantView.tsx`, `components/debts/art.ts` and `scripts/extract-plant-svgs.mjs`.

## 0. Ground rules

- **Branch:** keep working on `home-redesign-branch`. Run `git pull origin home-redesign-branch` first. Commit and push only to this branch. Never commit to `main`, and don't merge anything.
- **I'm still testing against my local backend** (`uvicorn main:app --reload --host 0.0.0.0 --port 8000`, reached through `EXPO_PUBLIC_API_URL` in the dev build). Nothing in this prompt needs a backend change. `/home/summary/` already returns everything used here (`debts.paid_count` included).
  - If you find you do need a backend change, stop and tell me instead of making it. Never assume the change is live on Render.
- No migration and no API change. All the API and database rules in CLAUDE.md still apply.
- **Fonts and type scale stay as v1 defined them** (`homeType.ts`). The only size changes are the ones stated below.
- Colors come from `useTheme()` tokens. The one new token allowed is in section 1.
- Every new user-facing string goes in both `en` and `pt-BR`. Run `npm run check-locales` and `npm run verify-i18n`.
- Debt elements stay behind `DEBT_FREEDOM_ENABLED`, exactly as in v1.
- Work in small, reviewable commits.

## 1. Separation of purposes: alternating section backgrounds

The user shouldn't be able to name the Core Journey steps, but the screen should split into them without thinking. Group the home into three full-bleed bands:

| Band | Contains | Background |
|---|---|---|
| **1: Green** | Top bar + Analyze (hero, status block, tithe) | `sectionGreen` |
| **2: Cream** | Plan (close-out card, next payment, splits, logging area, connect-bank prompt) | `theme.bg` |
| **3: Green** | Envision (section 6) | `sectionGreen` |

**New token `sectionGreen`:** add it to `ThemeContext` and `design_system.md`.

- Value: `#178D65` in both themes. It's sampled from the lighter part of the old dashboard hero gradient.
- If a flat fill looks dull next to the old hero, you may use a very subtle vertical gradient between `#167353` and `#178D65` via `expo-linear-gradient`, which is already installed. Keep it quiet; it's a background, not a feature.

**Band edges:** the cream band overlaps the green band above it by 24 px with 28 px top corner radii, like the old content area overlapping the hero. The Envision band does the same over the cream band. The last green band runs to the bottom of the scroll content, behind the floating tab bar, so there's never a strip of cream under Envision. The status bar area is green, with light status-bar content.

**Contrast on green (bands 1 and 3):**

- **Text:** text sitting directly on `sectionGreen` uses `onBrand`, never at reduced opacity for small text. This covers the date, the hero, "left this month" and the Envision heading. The debts-paid line is the exception (see 6.3).
- **Top bar buttons (News, Settings, profile):** go back to the old glass style (`rgba(255,255,255,0.16)` fill, `rgba(255,255,255,0.22)` border, `onBrand` icon). Reuse the old `glassBtn` values rather than inventing new ones.
- **Hero progress bar:** track `rgba(255,255,255,0.2)`, fill `onBrand`. It turns `harvest` when spending passes income.
- **Hero + button:** `onBrand` circle with a `brand` plus.
- The status block stays solid `brand` (forest). Make sure it still reads as a distinct block on the lighter green: keep depth 7 and add a 1 px `rgba(255,255,255,0.12)` border if needed.
- The tithe card stays on `surface` with its `harvest` outline.

## 2. Painted backgrounds for two cards

The **Next upcoming debt payment** card (Plan) and the **encouragement container** (Envision) get a painted watercolor background. I'll make the images myself and drop them in at these exact paths:

| Card | Final asset (used by the app) | Size / ratio |
|---|---|---|
| Next payment | `frontend/assets/images/home/next-payment-bg.png` | 1200 × 400 px (3:1) |
| Encouragement | `frontend/assets/images/home/encouragement-bg.png` | 1200 × 400 px (3:1) |

Design references, exports and variations live in `docs/design-home/`, next to `docs/design-debt-freedom/`. The app never reads that folder.

**Check first whether my final images are already at those paths.** If they are, use them as they are and **never overwrite them**. The design source (`docs/design-home/`) holds the procedural painting (Version A, "Planting → Harvest") and the preview mockups.

Only if a file is missing, create a placeholder PNG at that path so `require()` resolves and the bundle builds. Use a soft two-stop gradient generated with a script: cream → pale gold for the encouragement card, and cream → pale sage for the next-payment card.

Either way, replacing either file with new art later must need **zero code changes**. Add a line to `docs/design-home/README.md` saying which paths the app reads and at what size.

**How the art is rendered:**

- Use `expo-image` (installed) with `contentFit="cover"`, clipped to the card's radius (18). The art fills the whole card.
- **Readability:** the art will be painted with a calm, low-detail area on the **left ~60%** where text sits. Still add a subtle left-to-right scrim over the art for safety: `theme.surface` at 0.85 opacity on the left, fading to 0 by about 65% of the width. Test legibility with the placeholder and with a busy image (temporarily use any high-contrast photo, then remove it).
- Text on both cards stays `ink` / `ink2`, as in v1.
- **Next payment card:**
  - Keep v1's content and layout (name · due date, amount, and the Prune button on the right).
  - Drop the solid dark-green look. The card surface is the art.
  - The Prune button stays solid `brand` so it pops against the painting.
  - Keep a light `border` outline and depth 6, so the card holds its edge on the cream band.
- **Encouragement container:** see section 6.2 for its text and icon sizes. The rotation (4 s, right → left, dots) is unchanged. The art stays still while only the text/icon row slides.

## 3. Savings container

- Move the text "Savings + debt paydown" (`category.goalsSub`) up into the top row, directly to the right of the savings icon tile, vertically centered with it. The amount left stays right-aligned in that same row.
- Make that label bold using the heaviest Geist weight the app already uses for titles (`Fonts.sansSemiBold`), at the **small** size, in `ink`. It's the most important money category in the app, so it should read as a title rather than a hint.
- Remove the old examples line under it, since the label now lives in the top row. The progress bar stays at the bottom.
- Needs and Wants don't change.

## 4. Plan band

Its contents and order are unchanged from v1. Only the background (cream band) and the next-payment art (section 2) change.

## 5. Analyze band

Its contents, order and the status + tithe layout are unchanged from v1. Only the colors change, per section 1.

## 6. Envision band: new order

Top to bottom, inside the green band:

### 6.1 Heading

"Envision" at the **large** size, in the family and weight v1's large size uses, in `onBrand`, left-aligned. Add it to both locales (pt-BR: "Visão"). It renders whenever the band has at least one element.

- With the debt flag off and no goals near completion, the band would be empty. In that case hide the whole band, heading included, so the cream band simply ends the page.

### 6.2 Encouragement container

- Painted background, per section 2.
- **Text:** v1's small size **+2 px** (13 → 15, still wrapped in `ft()`), same family and weight.
- **Icons:** increase from their current size to **22 px**. The 4-point star (`IconSparkle`) in particular must be clearly visible. If its glyph fills less of its box than the others, scale it so it looks the same visual size as the leaf, star and target icons, not just the same box size.
- Keep the icons in `harvest`, but put each one on a 32 px circle of `rgba(255,255,255,0.7)` so gold holds up on the painted background.

### 6.3 Debts paid

- "{paid} / {total} debts paid", medium size, left-aligned, not in a container. Same as v1, but now under the encouragement container.
- **Color animation**, only when `paid_count ≥ 1`:
  - The text color cycles smoothly between black (`ink`) and gold (`harvest`), using Reanimated `interpolateColor`, so it passes through the in-between shades rather than snapping.
  - One cycle: 2.4 s ease-in-out to gold, hold 1.2 s, 2.4 s back, rest 4 s, repeat.
  - Pause it when the screen is unfocused or the app is backgrounded.
  - With the OS "Reduce Motion" setting on, don't animate. Render it in gold.
  - Gold is low-contrast on `sectionGreen`. Keep it legible with `textShadowColor: theme.brand`, `textShadowRadius: 6`, applied only as the color moves toward gold.
- With `paid_count = 0`, show it static in `ink`.
- This is the one piece of text in the green bands that uses `ink` instead of `onBrand`. That's intentional.

### 6.4 Focus debt plant: trim the empty space

The plant still renders through `FocusPlant`, centered, and must still look identical to the Debts tab. The problem is vertical space. `PlantView` always draws the full canvas (`CANVAS_RATIO` 1.25), sized for a fully grown plant. So a seedling sits under a large empty area, and even a grown plant has empty space above it.

Fix it by cropping to the art's real height:

1. Extend `scripts/extract-plant-svgs.mjs` to measure, for every species, every frame and the paid-off art, the **top-most painted y**. Use the union of `back`, `front`, `top`, `snap`, bugs and puff, and any animation extents that can rise above the static frame, in canvas units. Emit it into the generated layout as, e.g., `ART_TOP[species][frame]` and `ART_TOP_PAID_OFF[species]`, the same way the script already generates `plantAssets.ts`/layout values. Regenerate, and don't hand-edit generated files.
2. In `FocusPlant`, crop the view:
   - Set `top = max(0, ART_TOP − 16)`, keeping 16 canvas units of breathing room.
   - The visible height is `(CANVAS_H − top) × scale`.
   - Wrap `PlantView` in a view of that height with `overflow: 'hidden'`, offsetting it up by `top × scale`.
   - Size and position `FocusGlow` to the cropped box.
3. Only the home's `FocusPlant` crops. The Debts tab keeps its full canvas, since its garden layout depends on it.
4. With the crop, you can raise the plant's width share from 55% to about 62% if it now looks small. Pick what looks balanced and say which you chose.
5. Check it with a seed (frame 0), a mid-growth plant, a fully grown plant of each species, and a paid-off plant. There should be no clipped leaves, bugs or puffs in any animation state.

It stays removable with one line in `index.tsx`, as in v1.

## 7. Verify before you finish

- `npm run lint`, `npm run check-locales`, `npm run verify-i18n`. Backend is untouched, but run `pytest` once to confirm.
- Check these states against the local backend. Describe each in your summary, with a screenshot of each if you can run the app:
  1. Flag off: the Envision band is hidden unless a goal is near completion.
  2. Flag on, no debts.
  3. Flag on with debts: all three bands, the painted next-payment card, the rotating encouragement card, the animated debts-paid line and the cropped plant.
  4. Reduce Motion on.
  5. Seedling vs. fully grown vs. paid-off plant (show the vertical space saved).
  6. A 375 pt wide phone: band overlaps look right, and nothing truncates in the Savings top row.
- Confirm that swapping each placeholder PNG for another image of the same name updates the card with no code change.
- In your summary, list every decision this prompt left to you.
