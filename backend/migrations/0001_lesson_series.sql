-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: lesson_series + lessons (cloud-hosted VIDEO series for the Lessons page)
--
-- This repo does not track migrations in a supabase/ CLI project; schema changes are
-- applied to the remote project via the Supabase dashboard SQL editor (or the authed
-- Supabase MCP `apply_migration`). This file is the reviewable source of truth for the
-- lessons-video feature. After applying, regenerate frontend/lib/database.types.ts.
--
-- Parity with existing tables: RLS is ENABLED with NO policies. The FastAPI backend
-- uses the service-role key (SUPABASE_KEY), which bypasses RLS, so the app reaches
-- these rows only through backend routes — never directly from the (anon-key) client.
-- ─────────────────────────────────────────────────────────────────────────────

-- A "series" = title + image + description + an ordered set of video lessons.
create table if not exists public.lesson_series (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  creator       text,                              -- teacher / guest name (e.g. shown on the card)
  thumbnail_url text,                              -- series card image (public lesson-thumbnails url)
  sort_order    int  not null default 0,           -- display order of series on the Lessons page
  is_published  boolean not null default false,    -- only published series are returned to the app
  is_premium    boolean not null default false,    -- future subscription tier — do NOT gate on this yet
  created_at    timestamptz not null default now()
);

-- One-to-many: a series has many lessons (a playlist ordered by sort_order).
create table if not exists public.lessons (
  id               uuid primary key default gen_random_uuid(),
  series_id        uuid not null references public.lesson_series(id) on delete cascade,
  title            text not null,
  description      text,
  video_provider   text not null default 'supabase',
  video_id         text not null,                  -- Storage object PATH within lesson-videos when provider='supabase'
  duration_seconds int,
  thumbnail_url    text,
  sort_order       int  not null default 0,        -- order within the series (it's a playlist)
  created_at       timestamptz not null default now()
);

create index if not exists lessons_series_id_idx on public.lessons (series_id);

-- DESIGN NOTE: lesson_series intentionally has NO lesson_count column. The count is
-- DERIVED at query time (COUNT over lessons) so it can never drift as lessons are added.

-- RLS on, no policies (service-role backend bypasses; anon client is blocked — same as
-- expenses/income/savings_* / user_settings / month_status).
alter table public.lesson_series enable row level security;
alter table public.lessons        enable row level security;

-- ─── Storage buckets ─────────────────────────────────────────────────────────
-- lesson-videos:     PRIVATE — videos are never public; the app fetches a short-lived
--                    SIGNED URL per playback (GET /lessons/{id}/playback/). lessons.video_id
--                    holds the object path inside this bucket.
-- lesson-thumbnails: PUBLIC  — series/lesson card images; *.thumbnail_url stores the URL.
--
-- WORKFLOW (no admin UI): the actual video/image files are uploaded manually in the
-- Supabase dashboard, and the lesson_series / lessons rows are inserted manually there
-- too. The app only ever READS series/lessons and requests signed URLs for playback.
insert into storage.buckets (id, name, public) values
  ('lesson-videos',     'lesson-videos',     false),
  ('lesson-thumbnails', 'lesson-thumbnails', true)
on conflict (id) do nothing;
