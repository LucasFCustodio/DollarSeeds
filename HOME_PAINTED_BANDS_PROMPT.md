# Home: painted watercolor backgrounds for the Analyze and Envision bands

The top band (top bar + Analyze) still uses `HeroBg`: the old forest→emerald gradient with low-poly leaf shapes. The Envision band uses the flat `sectionGreen` (`#178D65`), which reads too vibrant for a background. Both get the same painted watercolor wash. It's a very wet, blurry field in Version A's style, matching the painted next-payment and encouragement cards.

- **Top band:** the painting as it is. Calm forest at the top, the misty field toward the bottom.
- **Envision band:** the same painting **flipped vertically**. The misty field is at the top of the band and the solid forest at the bottom. The page then opens and closes with the same green, mirrored around the cream Plan band.

Nothing else on the home changes. The Envision heading size, the plant and the debts-paid line all stay as they are for now.

Read `CLAUDE.md` and `design_system.md`. Then read `frontend/app/(tabs)/index.tsx`, `components/ui/HeroBg.tsx`, `components/home/PaintedCard.tsx` (how the cards already render painted art) and `components/home/HomeTopBar.tsx`.

## 0. Ground rules

- **Branch:** keep working on `home-adjustments-branch`. Run `git pull origin home-adjustments-branch` first. Commit and push only to this branch. Never commit to `main`, and don't merge anything.
- **I'm testing against my local backend** via uvicorn. This prompt is frontend-only, so make no backend changes.
- Colors come from `useTheme()` tokens. Don't delete `sectionGreen` (check what still references it), but the Envision band no longer uses it as its fill.
- **Leave `HeroBg` itself unchanged.** `app/(tabs)/piggyBank.tsx` still uses it. Only the home stops using it.
- Work in small, reviewable commits.

## 1. The asset

- `frontend/assets/images/home/analyze-bg.png` is already in the repo (960 × 1600, my final choice). Use that one file for both bands. Don't create a second, flipped asset.
- **Size:** the three home PNGs total about 6.8 MB. Losslessly optimize all three **in place**, keeping the same file names (e.g. `oxipng`/`zopflipng` via `npx`, or similar).
  - Don't use lossy quantization. Watercolor gradients band visibly.
  - Report the before and after sizes.
  - If lossless saves under 15%, leave them and tell me. Don't switch formats on your own.

## 2. Shared component: `PaintedBand`

Create `frontend/components/home/PaintedBand.tsx`. It's a container that draws `analyze-bg.png` behind its children:

- It renders with `expo-image`, `contentFit="cover"`, filling the band's full width and height. The band's height is set by its content, never by the image.
- **Props:**
  - `flipped?: boolean` mirrors the image vertically (`transform: [{ scaleY: -1 }]` on the image layer only, never on the children).
  - `anchor: 'top' | 'bottom'` decides which edge of the *visible* image stays pinned when the band is shorter than the art.
  - `style`, `children`.
- **Fallback color:** a `backgroundColor` matching the art's dark forest edge shows while the image loads and on any overscroll. Sample it from the asset's top-edge pixels and add it as a token, e.g. `paintedForest`, in `ThemeContext` and `design_system.md`. Don't guess the hex.

## 3. Top band (Analyze)

- Replace `HeroBg` in the home with `<PaintedBand anchor="bottom">`. The field side stays pinned, and any crop comes off the calm top.
- Keep everything `HeroBg` gave the band: the same padding (`paddingTop: insets.top + 8`, `HOME_PAD`), the same bottom corner radius curving over the cream, the same shadow if it had one, and the same children in the same order.
- The pull-down overscroll strip above the hero (`styles.overscroll`, currently `theme.brand`) uses `paintedForest`.
- **The fixed status-bar strip** must also use `paintedForest`, so it blends into the painting instead of showing a different green.
- In `HomeTopBar`, the News unread dot's border (currently `theme.sectionGreen`) switches to `paintedForest`.

## 4. Envision band

- Replace the flat `sectionGreen` fill with `<PaintedBand flipped anchor="top">`. After the flip, the misty field is at the top of the band and stays pinned. Any crop comes off the solid forest at the bottom, behind the floating tab bar.
- Keep the band's rounded top corners overlapping the cream, its padding and its children exactly as they are.
- The scroll view's overscroll background (`envision ? theme.sectionGreen : theme.bg`) becomes `paintedForest`, so a bounce past the bottom matches the solid end of the flipped painting.
- Review `Encouragement.tsx` and anything else tuned against `sectionGreen` (e.g. the debts-paid glow). Keep it working on the painting, and adjust only if it visibly breaks.

## 5. Readability checks (do these before finishing)

The white text now sits on a painting, not a flat fill. Measure it, don't eyeball it:

- **Method:** for each text block below, sample the rendered background behind it from a device or simulator screenshot (average and worst pixel over the text's box) and compute WCAG contrast against white.
- **Top band:** the month label, `$X` hero, "left this month" and the white progress-bar track. Small text needs ≥ 4.5:1, the hero ≥ 3:1.
- **Envision:** the "Envision" heading sits on the lightest, textured part after the flip. It needs ≥ 3:1 (large text).
- **If anything fails:** add the smallest fix that passes. That's a soft forest scrim (a linear gradient from `paintedForest` at 0.35–0.5 opacity to transparent) behind just that area, inside `PaintedBand` via an optional prop. Don't darken the whole painting.
- Report every measured ratio in your summary.

## 6. Verify before you finish

- `npm run lint`, `npm run check-locales`.
- Check these and describe each in your summary (with a screenshot if you can run the app):
  1. Top band with and without the overdue alert. The band height changes, and the field must stay pinned at the bottom with nothing awkwardly cut.
  2. Envision with the flag on (heading, card, debts paid, plant).
  3. Envision short: with the flag off, only the goals-near-completion item.
  4. Overscroll at the top and the bottom.
  5. The status-bar strip while scrolled over the cream band.
  6. A 375 pt wide phone.
- Confirm `piggyBank.tsx` still renders its `HeroBg` unchanged.
- List every decision this prompt left to you.
