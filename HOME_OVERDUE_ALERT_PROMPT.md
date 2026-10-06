# Home: make the overdue warning impossible to miss

The overdue status block (`frontend/components/home/OverdueStatus.tsx`) is the most important warning on the home screen. Right now it's a dark-forest block with one line ("1 debt overdue") on a dark-green band, and it gets lost. This prompt rebuilds it into a specific, actionable alert. Nothing else on the home changes.

Read `CLAUDE.md`, `design_system.md` and `i18n.md`. Then read `OverdueStatus.tsx`, `index.tsx`, `homeType.ts`, `lib/homeSummary.ts`, and in `backend/debt_freedom.py`: `is_overdue`, `missed_last_minimum` and `home_debt_summary`.

## 0. Ground rules

- **Branch:** keep working on `home-redesign-branch`. Run `git pull origin home-redesign-branch` first. Commit and push only to this branch. Never commit to `main`, and don't merge anything.
- **I'm testing against my local backend** (`uvicorn main:app --reload --host 0.0.0.0 --port 8000`, via `EXPO_PUBLIC_API_URL`). The backend change in section 1 won't be on Render until I deploy it. The app must render correctly against a backend without it (fall back as described in section 2).
- **API rules:** the change to `/home/summary/` is additive only. Keep `overdue_count` and every existing field exactly as they are.
- Colors come from `useTheme()` tokens. Fonts and sizes come from `homeType.ts`. No new tokens.
- Every new string goes in `en` and `pt-BR`. Run `npm run check-locales` and `npm run verify-i18n`.
- It stays behind `DEBT_FREEDOM_ENABLED`, and renders only when something is overdue, as today.
- Work in small, reviewable commits.

## 1. Backend: list the overdue debts

In `home_debt_summary`, add `debts.overdue`: every overdue active debt, sorted by days overdue (most first), then garden order:

```jsonc
"overdue": [{
  "id": 12,
  "name": "Chase Visa",
  "min_payment": 150.0,
  "missed_due_date": "2026-09-14",   // the last passed due date whose minimum was missed
  "days_overdue": 6,                 // today − missed_due_date
  "pay_url": "https://…"             // the debt's pay_url, or null
}]
```

- Derive `missed_due_date` from the same cycle logic `missed_last_minimum` uses. Don't re-implement the cycle math.
- `overdue_count` must always equal `len(overdue)`.
- Add tests:
  - one overdue debt;
  - two, checking the ordering;
  - an overdue debt that then logs its minimum, which drops off;
  - `pay_url` both null and set.
- Run `pytest`.

## 2. The alert card

Replace the look and content of `OverdueStatus`. Keep the file name and its place in the Analyze band.

**Look:**

- **Card:** solid `harvest` (gold) background, `brand` text and icons, radius 18, depth 7. Use the same black outline as the next-payment card and the tithe line (match their width and color exactly). Gold on the green band breaks the pattern of everything around it, and it signals "attention" without the shame of alarm red. Don't use `danger` anywhere on this card.
- **Leading icon:** a 36 px `brand` circle holding a `harvest` alert glyph. Reuse an existing icon from `components/icons` if one fits. Otherwise add a simple "!" or bell in the same style as the others.

**Content, one overdue debt:**

- Line 1, small size, `Fonts.sansSemiBold`: "{name} needs attention".
- Line 2: the minimum in the medium size and family (e.g. "$150"), followed by very small text: "was due {Sep 14} · {6} days ago". Write "1 day ago" in the singular, and use i18n plurals.

**Content, two or more overdue debts:**

- Line 1: "{n} debts need attention".
- Under it, up to 3 rows in very small text, one per debt: "{name} · {$min} · due {Sep 14}". If there are more than 3, end with a "+{n} more" row.

**Action button** (right side, vertically centered, compact pill, `brand` background, `onBrand` text):

- **One debt with a `pay_url`:** "Pay now". It opens the URL with `Linking.openURL`. Use the same safe-URL guard the app already applies to external links (see how announcements validate links). If the URL fails the guard, behave as if there's no `pay_url`.
- **Otherwise:** "Review". It opens the Debts tab on the first overdue debt (the `debtId` param already exists). That's where the user logs the minimum and answers any late-fee question.
- **Tapping the card body** (anywhere but the button) also opens the Debts tab on the first overdue debt.

**Tone:**

- No "late", "missed" or "failed" in the copy. The words say *needs attention*, never *you did something wrong*.
- pt-BR follows the same tone ("{name} precisa de atenção").

**Motion:** when the card first appears, play one soft pulse:

- scale 1 → 1.02 → 1 over about 600 ms;
- a gold glow behind the card fades in and out once;
- a single `Haptics.notificationAsync(Warning)`.

Play it once per app launch (not on every focus or month change). Skip it entirely with Reduce Motion on, haptic included.

**Accessibility:**

- `accessibilityRole="alert"` on the container, `accessibilityLiveRegion="polite"` on Android.
- One combined label for the card, e.g. "Chase Visa needs attention. $150 was due September 14, 6 days ago." Give the button its own label.

**Fallback (backend without `debts.overdue`):**

- If `overdue` is missing but `overdue_count > 0`, render the multi-debt layout's title only ("{n} debts need attention"), with "Review" opening the Debts tab.
- Add `overdue?:` to the `HomeSummary` type as optional.

## 3. Verify before you finish

- `pytest`, `npm run lint`, `npm run check-locales`, `npm run verify-i18n`.
- Against the local backend, check each of these and describe it in your summary (with a screenshot if you can run the app):
  1. One overdue debt with `pay_url`.
  2. One without `pay_url`.
  3. Two overdue.
  4. Four overdue (the "+1 more" row).
  5. The fallback, with `overdue` removed from the response.
  6. No overdue debts (the card is gone).
  7. Reduce Motion on.
- On a 375 pt wide phone, the name, amount and button must fit without truncating the amount or the date. Truncate the debt name first.
- List every decision this prompt left to you.
