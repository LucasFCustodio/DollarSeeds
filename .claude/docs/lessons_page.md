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

- `lesson_series`: `id, title, description, creator, thumbnail_url, sort_order, is_published, is_premium, created_at`
- `lessons`: `id, series_id, title, description, video_provider, video_id, duration_seconds, thumbnail_url, sort_order, created_at`

Rules:
- **`lesson_count` is derived** at query time (never stored → can't drift).
- Always `order by sort_order` (series on the page, lessons within a series).
- `is_premium` exists for a future paid tier but is **not gated yet**.

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
| `GET /lessons/series/{series_id}/` | The series + its lessons ordered by `sort_order` |
| `GET /lessons/{lesson_id}/playback/` | `{ url, expires_in }` — signed URL from `lesson-videos` (TTL `SIGNED_URL_TTL_SECONDS`, 3600s). Future `is_premium` gate goes here. |

Frontend base URL: `https://dollarseeds-1.onrender.com`. **Backend deploys from `main`** — new routes are 404 until merged + deployed to Render.

## Deferred (not built)

Persistent video watch-progress: resume position, marking a *video* lesson complete, a `lesson_progress` table, and wiring videos into the "lessons completed" strip. A hook comment marks where resume/save would go in [lessonPlayer.tsx](../../frontend/app/lessonPlayer.tsx).
