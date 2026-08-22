# Prompt — News modal + rating prompt

> Paste everything below the line into Claude Code (Opus 5).

---

Read `CLAUDE.md`, `.claude/docs/design_system.md`, `.claude/docs/i18n.md`, and `.claude/docs/architectural_patterns.md` first. Work on a new `change-X-branch`; never commit to `main`.

Two independent features. Both must leave the live App Store binary untouched — re-run the goldens suite and report the diff.

---

# FEATURE 1 — News modal

A modal for announcements I publish from the Supabase SQL editor, with **no app update required** for users to see them. That is the whole point of the feature; nothing in the design may require shipping a build to publish an announcement.

## Migration `0007_announcements.sql`

Additive: one new table plus one new public storage bucket. Follow the header format of `0005_subscriptions.sql` — why, what pre-migration rows fall back to, an `Applied to project … on <date>` line, and `Verify after applying` queries.

Proposed shape; adjust if you see something wrong, but state why:

```sql
create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,              -- English
  body          text not null,              -- English
  title_pt      text,                       -- pt-BR; falls back to English when null
  body_pt       text,
  image_url     text,                       -- optional landscape image (public bucket)
  link_type     text,                       -- 'external' | 'internal' | null
  link_target   text,                       -- https://…  OR an expo-router path
  link_label    text,
  author        text not null default 'Lucas',
  published_at  timestamptz not null default now(),
  is_published  boolean not null default false
);
```

RLS **enabled with no policies**, matching `lesson_series` / `lessons` / `subscriptions`. The backend reads on the service-role key; the app never touches this table directly.

Add a public `announcement-images` bucket mirroring `lesson-thumbnails`.

Per `CLAUDE.md` you may apply this yourself if it passes the five-point gate — state each point explicitly before applying, then run the verify queries and report results.

## Backend

`GET /announcements/` → the **3 most recent** rows where `is_published = true`, ordered `published_at desc`.

- Brand-new route, so no capability marker is needed and no old client can reach it. Say so explicitly in your back-compat section rather than leaving it implied.
- Return **both** language variants and let the client pick. Do not make the backend locale-aware.
- Protected route (bearer token), consistent with the rest of the API. Add it to `PROTECTED_ROUTES` in `test_auth_security.py` or that test fails.

## Frontend

**Seen state: AsyncStorage.** One key holding the id of the most recent announcement the user has been shown. On boot, fetch; if `latest.id !== storedId`, show the modal and write the id. A reinstall showing one announcement again is acceptable and expected — do not add a server-side read table.

Follow whatever pattern the existing allGreen scripture modal uses for once-per-period display (`app/(tabs)/index.tsx:6` notes it fires once per month).

**Mount** in `app/_layout.tsx` next to `UpdateGate` and `StartingBalanceGate`, and **after `UpdateGate`** in priority — a user who must update should never see an announcement they can't act on.

**The button.** A sibling of the settings gear in `styles.heroControls` (`app/(tabs)/index.tsx:423-431`). Reuse `styles.glassBtn` unchanged so both buttons are identical in size, and use a **white** mail icon (`color="#fff"`, `size={18}`) to match `IconGearMascot` — the hero background is dark forest, so a black icon would be invisible. Add the icon to `components/icons/`.

Add a small unread dot on the mail icon when there is an unseen announcement, cleared once viewed. Without it nobody discovers the button.

**The modal.**

- Cream background (`theme.bg`) with a black outline — a visible border, distinct from the surface-plus-shadow treatment the other modals use
- Content order: **heading** (black, larger than body) → optional landscape image → optional link → body text → date and author
- Navigation between the 3 most recent announcements, opening on the latest
- Scrollable; the image plus a long body will overflow a small screen
- All colours from `useTheme()` — no hex literals

**Links.** `link_type = 'external'` opens in the browser; `'internal'` navigates via expo-router to `link_target` (e.g. `/lessonSeries/<uuid>`) and closes the modal. Guard against a malformed or unroutable `link_target` — a bad value I typed in SQL must not crash the app. If `link_type` is null, render no link.

**i18n — read `.claude/docs/i18n.md` first.** Two distinct categories:

- **Announcement content** comes from the DB. Pick `title_pt` / `body_pt` when the resolved language is pt-BR, **falling back to English when they are null or empty**. This content is deliberately outside the catalogues.
- **Modal chrome** — navigation labels, the link button's default label, any "New" badge — goes through the catalogues like every other string. `npm run check-locales` must stay clean.

Dates must format per locale, not with a hardcoded US format.

## Give me in your summary

A copy-paste SQL example creating a fully populated announcement: both languages, an image, and an internal link.

---

# FEATURE 2 — Rating prompt

Use Apple's **native** review prompt via `expo-store-review`.

**Do not build a satisfaction pre-question.** No "Are you enjoying DollarSeeds?" dialog gating whether the native prompt appears. Apple treats that as a review gate and rejects for it under guideline 1.1.7. The native sheet is shown directly or not at all.

**Do not add an opt-out toggle.** Apple already caps this at 3 prompts per 365 days per user.

## Trigger points

Call `StoreReview.requestReview()` after a positive moment, specifically:

- Completing a savings or debt goal
- Closing out a month (the rollover flow)

Fire it *after* whatever celebration UI already exists, never interrupting it.

## Throttling

Keep your own throttle in AsyncStorage on top of Apple's — roughly once per 60 days, and not on a user's first session. Apple's three annual slots are a scarce resource; don't spend one on someone who just installed.

Note in code comments that **the API gives no callback and no return value** — you cannot detect whether the prompt appeared or whether the user rated. Any logic that branches on "have they rated yet" is unimplementable, so don't write it. Also call `isAvailableAsync()` before requesting.

## Settings row

Add a **"Rate DollarSeeds"** row in `app/settings.tsx`, following the `legalLinkRow` pattern at `:319-353`. This one opens the App Store write-review page directly. Explicit user-initiated taps are always permitted and unaffected by the 3-per-year cap — this is where someone who *wants* to leave a review will go.

## Testing caveat

`requestReview()` is a **no-op in dev builds and TestFlight** — it only appears in production App Store builds. State this plainly in your summary so it doesn't look broken during testing. Make the trigger logic unit-testable independently of whether the sheet renders.

`expo-store-review` is a native module, so it needs a new build — fine, we're building anyway.

---

# Verification

- Goldens suite re-run; report the diff. Any change to an existing endpoint for an unmarked request is a failure, not a golden to update
- `npm run check-locales` and `npm run verify-i18n` both clean
- Announcement renders correctly in English and pt-BR, including the fallback when `title_pt` / `body_pt` are null
- Modal shows once, then not again on next launch; unread dot clears
- Navigation across 3 announcements, and correct behaviour with 0, 1, and 2 published
- Optional fields absent: no image, no link, no `link_label`
- Malformed `link_target` doesn't crash
- Mail button is pixel-identical in size to the gear and legible on the hero
- Rating throttle logic unit-tested; `requestReview` correctly not called before the interval elapses
- Premium subscription flow untouched — CTAs, paywall, entitlement gate, update gate

State which checks you ran and which need me on a device. Flag anything above you think is wrong rather than designing around it silently.
