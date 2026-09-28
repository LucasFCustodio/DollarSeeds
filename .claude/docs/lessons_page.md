# Lessons Page

The Lessons tab has **two independent content types**:

1. **Written lessons** — hardcoded in [frontend/constants/lessons.ts](../../frontend/constants/lessons.ts); completion tracked locally in AsyncStorage (`'completed_lessons'`). The "lessons completed" progress strip is tied to these **only**.
2. **Video series** — cloud-hosted, DB-driven (see below). Added above the written lessons; does **not** touch the progress strip.

Page order (top → bottom): header → video series list → progress strip (written) → written-lesson cards.

## Screens

| Route | File | Purpose |
|-------|------|---------|
| `/(tabs)/lessons` | [lessons.tsx](../../frontend/app/(tabs)/lessons.tsx) | Header, series list, progress strip, written cards |
| `/lessonDetail?id=` | [lessonDetail.tsx](../../frontend/app/lessonDetail.tsx) | A written lesson (do not repurpose for video) |
| `/lessonSeries/[id]` | [lessonSeries/[id].tsx](../../frontend/app/lessonSeries/[id].tsx) | A series' playlist (ordered video lessons) |
| `/lessonPlayer?seriesId=&lessonId=` | [lessonPlayer.tsx](../../frontend/app/lessonPlayer.tsx) | Video player (expo-video native controls + Prev/Next) |

## Design guidelines

All colors/fonts from `useTheme()` — never hardcode (see [design_system.md](design_system.md)).

- **Series card**: white `theme.surface`, ink outline + `stickerShadow` (reuse `Card`). Serif title (left), full-width thumbnail with a `{n} lessons` badge (brand bg) bottom-right, description with a **min-height** so short/long cards share a rhythm, and an `Explore ›` brand button bottom-right.
- **Player**: black video surface, `<VideoView nativeControls />` handles play/pause, seek, scrubber, fullscreen. **No custom playback UI** — only Previous / Next buttons (they swap the active lesson within the series). Native controls only.
- Thumbnails render via `expo-image`.

## Database

Two tables, one-to-many (`lesson_series` 1─∞ `lessons`, `on delete cascade`). RLS **enabled, no policies** — parity with all other tables; the service-role backend bypasses RLS, the anon client is blocked. Migration: [backend/migrations/0001_lesson_series.sql](../../backend/migrations/0001_lesson_series.sql).

- `lesson_series`: `id, title, description, creator, thumbnail_url, sort_order, is_published, is_premium, created_at`,
  plus `instagram_url, linkedin_url, website_url` (migration `0006` — the creator's socials, all nullable)
- `lessons`: `id, series_id, title, description, video_provider, video_id, duration_seconds, thumbnail_url, sort_order, created_at`

Rules:
- **`lesson_count` is derived** at query time (never stored → can't drift).
- Always `order by sort_order` (series on the page, lessons within a series).
- `is_premium` **is gated** — see [Premium gating](#premium-gating) below. It defaults to
  `true` since migration `0005`, so a new series is paid unless deliberately made free.
- The three social columns hold a **complete `https://` URL** and nothing else. Nothing
  normalises or prefixes them, so what you paste is what the phone opens; the app derives
  the displayed handle (`@igorbarroso`, `linkedin.com/in/igor-barroso`) from the URL, so
  there is no second column to keep in sync. Anything that is null, blank, or not http(s)
  renders no row, and a series with none of the three shows no section at all.
- They reach the app only for clients sending `X-Client-Features: social` — its own
  capability token, deliberately NOT `premium`. See [Premium gating](#premium-gating);
  the same reasoning applies, one shipped generation further on.

### Storage buckets

- `lesson-videos` — **private**. `lessons.video_id` = the object **path** inside it. Served only via short-lived signed URLs.
- `lesson-thumbnails` — **public**. `*.thumbnail_url` = the public URL.

**Content workflow (no admin UI):** upload files and insert rows manually in the Supabase dashboard.

### Useful SQL

```sql
-- Seed a published series + lessons (set video_id to the real uploaded object paths)
insert into lesson_series (title, description, creator, thumbnail_url, sort_order, is_published)
values ('The Art of Being Calm', 'A short series on staying focused.', 'Guest Teacher',
        'https://<project>.supabase.co/storage/v1/object/public/lesson-thumbnails/calm.jpg', 0, true)
returning id;  -- use this id below

insert into lessons (series_id, title, video_id, duration_seconds, sort_order) values
  ('<series-id>', 'Lesson 1', 'calm/lesson1.mp4', 320, 0),
  ('<series-id>', 'Lesson 2', 'calm/lesson2.mp4', 415, 1);

-- Publish / unpublish
update lesson_series set is_published = true  where id = '<series-id>';

-- Creator socials (migration 0006). All three optional — set only the ones that exist.
update lesson_series set
  instagram_url = 'https://www.instagram.com/igorbarroso',
  linkedin_url  = 'https://www.linkedin.com/in/igor-barroso',
  website_url   = 'https://igorbarroso.com'
where id = '<series-id>';

-- Remove one link again
update lesson_series set linkedin_url = null where id = '<series-id>';

-- Reorder
update lesson_series set sort_order = 1 where id = '<series-id>';
update lessons        set sort_order = 2 where id = '<lesson-id>';

-- Sanity: series with derived lesson count
select s.title, s.is_published, count(l.id) as lesson_count
from lesson_series s left join lessons l on l.series_id = s.id
group by s.id order by s.sort_order;
```

## Backend routes

All in [backend/main.py](../../backend/main.py). None return raw video paths/URLs except `/playback/`, which mints an expiring signed URL.

| Route | Returns |
|-------|---------|
| `GET /lessons/series/` | Published series (`is_published=true`), ordered, each with derived `lesson_count` |
| `GET /lessons/series/{series_id}/` | The series + its lessons ordered by `sort_order`. Adds `is_premium` for `premium` clients and `instagram_url` / `linkedin_url` / `website_url` for `social` clients |
| `GET /lessons/{lesson_id}/playback/` | `{ url, expires_in }` — signed URL from `lesson-videos` (TTL `SIGNED_URL_TTL_SECONDS`, 3600s). **The premium gate lives here** — the only route that enforces it. |

## Premium gating

Video series can be paid; written lessons and everything else stay free. The one
currently published series, **"The Truth on Generosity"**, is `is_premium = false`
**permanently** — no published series is ever retro-paywalled, because access given away
cannot be taken back.

**Clients are told apart by the `X-Client-Features: premium` header**, attached once in
the app's axios request interceptor. Requests without it come from a binary already in
the App Store, which has no paywall and no purchase path:

| | No marker (shipped binary) | v2, not subscribed | v2, subscribed |
|---|---|---|---|
| Free series | visible, plays | visible, plays | visible, plays |
| Premium series | **not in the list at all** | visible + `is_premium: true` | visible, plays |
| `/playback/` on premium | **always 200** | `403 {"code": "premium_required"}` | 200 |

Two independent switches, and conflating them is a bug:

- **Hiding premium series from unmarked clients is always on.** Backward compatibility,
  not a business rule — it must survive every rollback.
- **`app_config.premium_enabled` gates only marked clients.** This is the kill switch;
  flipping it to `false` is the rollback lever and needs no app update or redeploy.

Enforcement lives *only* on `/playback/`. The list and detail routes expose `is_premium`
to marked clients so the app can lock a card before the tap — the 403 is the backstop,
not the UX trigger.

**`LIMITS_TEST_USER_IDS` never reaches any of this.** That environment variable makes
the free-tier limits apply to listed accounts while `premium_enabled` is still false,
and it is read in exactly one place — the `_entitlements()` resolver. It does not move
`_premium_enabled()`, `/config/` or this gate, so a listed test account still plays
every video for free. Conflating the two would start locking videos for every user on
the live premium build, which reads `premium_enabled` from `/config/` to decide what
to lock.

### `PremiumRequired` — one exception, four codes

`PremiumRequired` is the only error in `main.py` that answers with a top-level `code`
beside `detail`; everything else is `{"detail": "..."}`, because screens pass `detail`
straight to `Alert.alert`. It now carries a code and a plain-English sentence per code:

| Code | Raised by |
|---|---|
| `premium_required` | `/lessons/{id}/playback/` on a premium series, unentitled |
| `goal_limit_reached` | `POST /savings/goal/` at the free cap |
| `budget_type_locked` | `PATCH /settings/` choosing a gated budget type |
| `goal_locked` | any write to a locked goal, except deleting the goal |

**`premium_required` is frozen.** Raised with no arguments the exception still produces
`{"code": "premium_required", "detail": "This series is part of DollarSeeds Premium."}`
byte for byte, because the shipped premium build branches on that exact string.
`/playback/` still raises it bare, and `test_limits.py` pins the pair. The sentences for
the other three are in `PREMIUM_REQUIRED_DETAILS` and may be reworded freely; no shipped
build has ever seen them.

> **The rule that governs any change here:** an unmarked request must issue exactly the
> queries it issued before this feature existed — no `app_config` read, no
> `lesson_series` lookup, no `subscriptions` scan. `test_backcompat_lessons.py` asserts
> the query set directly, and three older tests seed a lesson whose `series_id` has no
> `lesson_series` row so that hoisting a lookup fails loudly instead of shipping.

### `X-Client-Features` is a LIST, one token per capability

`premium` was the first; `social` (creator links, migration `0006`) is the second;
`limits` (the free-tier allowances) is the third. They are independent on purpose — a
build that ships a paywall was not thereby written to render a link row or a locked
goal card, and by now two of those builds are *themselves* shipped generations that
cannot be patched. Each generation gets exactly the response it was built against:

| | No marker (first binary) | `premium` only | `premium, social` | `+ limits` |
|---|---|---|---|---|
| `is_premium` on the detail route | absent | present | present | present |
| `instagram_url` / `linkedin_url` / `website_url` | absent | absent | present (null when unset) | present |
| `locked` on `GET /savings/goal/` | absent | absent | absent | present |
| `GET /savings/goal/` sort order | newest first | newest first | newest first | **oldest first**, `id` breaking ties |
| the five allowance fields on `/me/entitlements/` | absent | absent | absent | present |
| goal cap, locked goals, budget-type lock | never | never | never | enforced |

`limits` is the widest of the three: it reaches most of the API rather than the lesson
routes, so `_client_features` is now a dependency on the dashboard, income, settings,
savings, goal and rollover routes too. Everything it governs is in
[SUBSCRIPTION_REWORK.md](../../SUBSCRIPTION_REWORK.md) §4–§8; the back-compat half is
`test_backcompat_limits.py`, which asserts the other three generations cannot tell it
shipped, and the enforcement half is `test_limits.py`.

Three consequences worth keeping:

- **Add a token, never repurpose one.** The frontend list lives in `CLIENT_FEATURES` in
  [frontend/lib/axiosConfig.ts](../../frontend/lib/axiosConfig.ts); the backend constants
  sit together near `PREMIUM_FEATURE` in `main.py`. (The `_client_features` *dependency*
  sits near the top of the file instead — FastAPI evaluates `Depends(...)` when a handler
  is defined, so it has to exist before the first route that takes it.)
- **Gate the `select()`, not just the response.** `get_lesson_series` only *selects* the
  social columns when the caller asked for them, so a stale PostgREST schema cache after
  a column-adding migration can break social builds and never the App Store binary.
  `test_an_unmarked_request_does_not_even_select_the_new_columns` pins that.
  `delete_savings_transaction` does the same with `goal_id`, which it needs only to
  decide whether a goal is locked.
- **Check the marker before anything else.** `_entitlements()` does it in one place
  rather than at each of a dozen call sites, so a request without `limits` issues no
  `app_config` read, no `subscriptions` scan and no goal count. Spread across the routes
  it gets forgotten at the thirteenth, and the forgotten one is a live app that cannot
  be rolled back.

Entitlement, the RevenueCat webhook and the `subscriptions` schema are in
[data_model.md](data_model.md#subscriptions).

Frontend base URL: `https://dollarseeds-1.onrender.com`. **Backend deploys from `main`** — new routes are 404 until merged + deployed to Render.

## Deferred (not built)

Persistent video watch-progress: resume position, marking a *video* lesson complete, a `lesson_progress` table, and wiring videos into the "lessons completed" strip. A hook comment marks where resume/save would go in [lessonPlayer.tsx](../../frontend/app/lessonPlayer.tsx).
