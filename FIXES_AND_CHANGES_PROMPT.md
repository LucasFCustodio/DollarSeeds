# Prompt — Bug fixes + UI changes

> Paste everything below the line into Claude Code (Opus 5).

---

Read `CLAUDE.md` and `.claude/docs/design_system.md` first. Work on a new `change-X-branch`; never commit to `main`.

Premium subscriptions (releases 1 and 2) are merged and verified end to end. `premium_enabled` is `false`, `min_supported_version` is `0.0.0`. Nothing below should disturb any of that.

**The live App Store binary still matters.** Anything touching a backend response must keep unmarked requests byte-identical — re-run the goldens suite and report the diff.

---

# BUGS

## B1 — Income titles are all "Paycheck"

In "View all income", every entry shows "Paycheck" instead of the title the user typed.

Root cause is almost certainly `frontend/components/income/IncomeContainer.jsx:157`:

```js
title: title.trim() || source,
```

When the title field is left blank, the *source* chip value gets stored as the title, so everything defaults to "Paycheck". Confirm whether the details list at `frontend/app/details.tsx` is also rendering `source` where it should render `title` — fix whichever is actually wrong; don't assume it's only one.

Decide and state what a blank title should do: store `null` and have the UI fall back to the source at render time, rather than baking the source into the stored title. Storing the fallback is what made the two indistinguishable.

**Backward compatibility:** existing rows already have "Paycheck" written into `title`. Do not mass-update them. Any new nullable behaviour must render correctly for both old rows (title populated) and new ones (title null).

## B2 and B3 — the goal $/week rate is computed from the wrong quantity

Both bugs are the same root cause. `getWeeklyRate` at `frontend/app/(tabs)/piggyBank.tsx:83`:

```js
const remaining = Math.max(0, target - allocated);
const totalDays = Math.max(1, Math.ceil((getDeadline(m, y) - new Date(createdAt)) / 86_400_000));
return (remaining / totalDays) * 7;
```

It divides the **remaining** balance by the **full original** timespan. That mixes a shrinking numerator with a fixed denominator, which is wrong in both directions:

**B3 — allocating money must not change the rate.** Every deposit shrinks `remaining`, so the displayed rate falls. Expected: the rate is the *plan* — what you committed to save per week when you set the goal — and it stays constant no matter how much is already set aside. Even at $1 remaining with 12 months left, it shows the original figure.

**B2 — editing the target must change the rate.** Change a goal from $3,000 to $2,000 and the rate should recompute against the new target over the same created→deadline window. Investigate why it currently doesn't update: `target` is already an input, so this is likely stale state or a missing refetch after the edit, not the formula. Find the actual cause.

The corrected rate is a pure function of `target_amount`, `created_at`, and the deadline — `allocated_amount` must not appear in it:

```
weeklyRate = target / daysBetween(created_at, deadline) * 7
```

Applies to both savings and debt goals. The "achieved" state and progress bar keep using `allocated_amount` as they do now — only the rate changes.

Add unit tests: allocation changes leave the rate untouched; editing the target changes it; a goal created mid-period computes from `created_at`, not from today.

---

# CHANGES

## C1 — Disable dark mode entirely

Every user gets light mode, always. Users should not be able to tell dark mode exists.

- Remove the 🌙/☀️ toggle from the dashboard hero
- `ThemeContext` must stop reading the system colour scheme and always return the light palette
- **Do not delete the dark tokens or the dark branch of the code.** Leave the palette and any theming plumbing intact.

Re-enabling later should be a one-line change in `ThemeContext`, and leave a comment at that line saying exactly what to flip. State in your summary what that line is.

Reason: the dark palette has real contrast problems — on the paywall, price text is nearly invisible against the dark surface and the harvest callout goes muddy brown. Rather than fix it under time pressure, we're shipping light-only and revisiting properly later.

Check for anything that assumed dark mode could be active — persisted theme preferences in AsyncStorage or `user_settings`, status bar style, or components branching on scheme. Users who previously had dark mode on must land in light mode without a stale preference overriding it.

## C2 — Show the lesson description on the individual lesson page

`frontend/app/lessonPlayer.tsx` fetches `description` for each lesson but renders it nowhere. Display it **below the Previous/Next buttons**.

Handle null and empty descriptions — the production capture confirmed real lessons have `"description": null` on the wire. Render nothing rather than an empty block or the word "null".

## C3 — Creator social links on the series page

On the series detail page (`frontend/app/lessonSeries/[id].tsx`), show the creator's social accounts **below the lesson list**. Three supported, all optional:

- Instagram
- LinkedIn
- Business website / page

I add these by hand in the Supabase SQL editor when I create a series, so the schema must be trivial to write by hand and obvious a year from now.

**Migration `0006`.** Additive only, following the header format of `0005_subscriptions.sql`: why, what pre-migration rows fall back to, and an `Applied to project … on <date>` line. Propose the columns — I'd expect discrete nullable `text` columns over a JSON blob, since I'm writing these in raw SQL, but argue for whatever you think is right. Existing series rows must remain valid with everything null.

Per `CLAUDE.md` you may apply this yourself if it passes the five-point gate — state each point explicitly before doing so. Run the migration's verify queries afterwards and report results.

**Backend.** Serve the new fields from `GET /lessons/series/{id}/`. Two hard constraints:

- ⚠️ `main.py:1437` passes raw PostgREST **lesson** rows straight through — adding a column to that `select()` would leak a new field to old binaries. Leave the lessons select alone. The series-level dict is built key-by-key and is safe.
- Old clients must get a byte-identical response. Follow the existing capability-marker pattern (`X-Client-Features: premium`) if these fields should be marked-only, or justify why adding them unconditionally is safe given old clients ignore unknown keys. State which you chose and why.

**Frontend.** Each present link renders as a tappable row opening the external app or browser; absent ones render nothing. If all three are null, the whole section disappears — no empty header. Handles display as text (`@handle`), the URL is what opens. Style from `useTheme()` — no hardcoded colours.

Give me a copy-paste SQL example in your summary showing how to create a series with all three links filled in.

---

# Verification

- Unit tests for the weekly-rate fix, covering the three cases named in B2/B3
- Goldens suite re-run; report the diff for every unmarked endpoint. Any change to `GET /lessons/series/{id}/` for an unmarked request is a failure, not an update-the-golden
- Confirm the premium subscription flow is untouched: CTAs, paywall, entitlement gate, update gate
- Light mode renders correctly everywhere, including for a user whose stored preference was previously dark
- Series page with zero, one, and all three social links
- Lesson description present, empty string, and null

State which checks you ran and which need me on a device.

Flag anything above you think is wrong rather than designing around it silently.
