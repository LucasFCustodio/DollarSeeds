# Home design sources

Design references, exports and variations for the home screen (Home Redesign v2).
The app never reads this folder.

## Painted card backgrounds

**The app reads exactly these two files.** Replace either with new art of the same
name and size and the card updates with no code change:

| Card | Path the app reads | Size / ratio |
|---|---|---|
| Next debt payment (Plan) | `frontend/assets/images/home/next-payment-bg.png` | 1200 × 400 px (3:1) — 2400 × 800 @2x is fine |
| Encouragement (Envision) | `frontend/assets/images/home/encouragement-bg.png` | 1200 × 400 px (3:1) — 2400 × 800 @2x is fine |

Both are drawn by `frontend/components/home/PaintedCard.tsx`: `contentFit="cover"`,
clipped to the card's 18 px radius, under a `surface` scrim that fades from 0.85 on the
left to nothing by 65% of the width. Paint the **left ~60% calm and low-detail** — that
is where the text sits, and the encouragement card's two-line messages can run
further right than that.

A swapped file shows up on the next reload in a dev build, and ships with the next
app-store build (images are bundled into the binary).

## Files here

- `DollarSeeds Cards - A Planting to Harvest-selection*.png` — the chosen crops of
  Version A, "Planting → Harvest".
