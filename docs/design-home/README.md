# Home design sources

Design references, exports and variations for the home screen (Home Redesign v2).
The app never reads this folder.

## Painted card backgrounds

**The app reads exactly these three files.** Replace any of them with new art of the
same name and size and the card updates with no code change:

| Card | Path the app reads | Size / ratio |
|---|---|---|
| Next debt payment (Plan) | `frontend/assets/images/home/next-payment-bg.png` | 1200 × 400 px (3:1) — 2400 × 800 @2x is fine |
| Encouragement (Envision) | `frontend/assets/images/home/encouragement-bg.png` | 1200 × 400 px (3:1) — 2400 × 800 @2x is fine |
| Debts & goals dashboard (Envision) | `frontend/assets/images/home/envision-dashboard-bg.png` | 1200 × 900 px (4:3) — 2400 × 1800 @2x is fine |

All three are drawn by `frontend/components/home/PaintedCard.tsx`, `contentFit="cover"`
and clipped to the card's 18 px radius:

- **Next payment and encouragement:** under a `surface` scrim that fades from 0.85 on
  the left to nothing by 65% of the width. Paint the **left ~60% calm and
  low-detail** — that is where the text sits, and the encouragement card's two-line
  messages can run further right than that.
- **Dashboard:** under an even `surface` wash at 0.7 over the whole card, because its
  content (pots, a ring, sparklines, chevrons) spans the full width. Detail anywhere
  is fine; it comes through as a soft tint. The card is much taller than the other
  two, hence 4:3. The current file is a placeholder: a centre crop of
  `next-payment-bg.png`, scaled up. Don't reuse `encouragement-bg.png` — the two
  Envision cards touch, and the same painting twice would look repeated.

A swapped file shows up on the next reload in a dev build, and ships with the next
app-store build (images are bundled into the binary).

## Files here

- `DollarSeeds Cards - A Planting to Harvest-selection*.png` — the chosen crops of
  Version A, "Planting → Harvest".
