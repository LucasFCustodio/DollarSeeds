-- ─────────────────────────────────────────────────────────────────────────────
-- 0007 — announcements + the announcement-images bucket (the in-app News modal)
--
-- WHY. There is no way today to tell users anything between App Store releases.
-- A release only reaches the phones that take the update, so "we shipped a new
-- lesson series" currently reaches nobody who has not updated. This table is the
-- publishing surface: one INSERT in the Supabase SQL editor and every app that
-- boots afterwards shows the modal. Nothing about the feature requires a build —
-- that is the entire point of it, and any future change here has to keep it true.
--
-- Purely ADDITIVE. One new table, one partial index, one new public storage
-- bucket. The binaries already in the App Store never call GET /announcements/
-- (the route did not exist when they were compiled), and nothing they DO call is
-- touched, so this migration is invisible to them.
--
-- What pre-migration rows fall back to: nothing to fall back to. The table starts
-- empty, and "no rows" is the correct and only representation of "nothing has
-- been announced yet" — the client renders no modal and no unread dot. Rows
-- default to is_published = false, so even an INSERT does not go live until it is
-- deliberately flipped; that is also the rollback, and it needs no app update.
--
-- RLS parity with lesson_series / lessons / subscriptions: ENABLED with NO
-- policies. The FastAPI backend holds the service-role key and bypasses RLS; the
-- anon key shipped inside every app binary is denied outright. The app never
-- reads this table directly — announcements arrive only via GET /announcements/.
-- ─────────────────────────────────────────────────────────────────────────────

-- One row per announcement. English is the canonical language and is NOT NULL;
-- the pt-BR columns are nullable and the client falls back to English per FIELD,
-- not per row, so a half-translated announcement still renders sensibly.
--
-- This is the per-language-columns shape .claude/docs/i18n.md describes as the
-- eventual answer for server-supplied content. It is affordable here and not for
-- lesson_series only because this table is brand new: there is no deployed client
-- reading a single-language `title`, so there is no expand→contract to stage.
--
-- NOTE there is deliberately NO foreign key and no per-user targeting. An
-- announcement is global by construction — the seen/unseen state lives in the
-- app's own AsyncStorage, never here. A read-receipt table would mean a write on
-- every boot for a feature whose entire job is to show a paragraph of text.
create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,                       -- English (canonical)
  body          text not null,                       -- English (canonical)
  title_pt      text,                                -- pt-BR; NULL/'' ⇒ English
  body_pt       text,                                -- pt-BR; NULL/'' ⇒ English
  image_url     text,                                -- optional landscape image (public bucket)
  link_type     text,                                -- 'external' | 'internal' | NULL
  link_target   text,                                -- https://…  OR an expo-router path
  link_label    text,                                -- NULL ⇒ the client's default label
  author        text not null default 'Lucas',
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  is_published  boolean not null default false,

  -- Added to the PROPOSED shape. The rows here are typed by hand into the SQL
  -- editor with no admin UI in front of them, and a typo'd 'externsl' would sail
  -- through to the client, which would then render no link at all — a silent
  -- failure discovered only by a user who never saw the button. Failing at INSERT
  -- time is strictly better. It is safe on a table that starts empty (nothing is
  -- revalidated), and allowing a new link_type later is a CHECK WIDENING, which
  -- CLAUDE.md permits in a single release.
  --
  -- NULL passes: `link_type is null` is the "no link" case and must stay legal.
  constraint announcements_link_type_check
    check (link_type is null or link_type in ('external', 'internal'))
);

-- The exact shape of the only query that runs against this table:
--   where is_published order by published_at desc, id desc limit 3
-- Partial, because unpublished drafts are never read and there is no reason to
-- carry them in the index.
create index if not exists announcements_published_idx
  on public.announcements (published_at desc, id desc)
  where is_published;

alter table public.announcements enable row level security;

-- ─── Storage bucket ──────────────────────────────────────────────────────────
-- announcement-images: PUBLIC, mirroring lesson-thumbnails. The image is a
-- decorative landscape banner inside the modal; there is nothing to protect, and
-- a public URL means announcements.image_url is a plain string the client can
-- render with no signing round-trip (and therefore no new backend route).
--
-- WORKFLOW (no admin UI, same as 0001): upload the image in the Supabase
-- dashboard, copy its public URL into announcements.image_url, insert the row
-- with is_published = false, check it, then flip is_published to true.
insert into storage.buckets (id, name, public) values
  ('announcement-images', 'announcement-images', true)
on conflict (id) do nothing;

-- Verify after applying:
--   -- 1. the table exists with the expected columns and nullability
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'announcements'
--    order by ordinal_position;
--   -- expect title/body/author/published_at/created_at/is_published NOT NULL,
--   -- every other column YES (nullable)
--
--   -- 2. it starts empty — nothing was written, nothing to fall back to
--   select count(*) from public.announcements;                       -- expect 0
--
--   -- 3. RLS on, zero policies (parity with lesson_series / subscriptions)
--   select c.relname, c.relrowsecurity from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname = 'announcements';     -- expect true
--   select count(*) from pg_policies
--    where schemaname = 'public' and tablename = 'announcements';    -- expect 0
--
--   -- 4. the public bucket exists
--   select id, name, public from storage.buckets
--    where id = 'announcement-images';                               -- expect public = true
--
--   -- 5. pre-existing data is untouched — this migration names no existing table
--   select count(*) as series from public.lesson_series;             -- unchanged
--   select key, value from public.app_config order by key;           -- unchanged

-- Applied to project vbvsblpyeylnemrecyqv on <NOT APPLIED — see the summary; the
-- Supabase MCP is unauthenticated in this session, so the user applies this by
-- hand in the dashboard SQL editor and fills in the date>.
