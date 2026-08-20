-- ─────────────────────────────────────────────────────────────────────────────
-- 0006 — creator social links on lesson_series (Instagram / LinkedIn / website)
--
-- WHY: the series detail screen shows who made the series but gives no way to reach
-- them. Three optional links under the lesson list close that. Series content is
-- inserted BY HAND in the Supabase SQL editor (see 0001), so the schema is optimised
-- for being written by a person at 11pm and understood by that same person a year
-- later — not for generality.
--
-- WHY THREE DISCRETE text COLUMNS, NOT A JSONB BLOB:
--   * The set is fixed and small. A blob buys extensibility we do not want: a fourth
--     network is a UI change anyway, so it may as well be a fourth column.
--   * `set instagram_url = '…'` is the whole edit. With jsonb it is a
--     jsonb_set / merge incantation, and a typo'd key ("instgram") stores silently
--     and renders nothing, with no schema to catch it.
--   * `select creator, instagram_url from lesson_series` is legible in the dashboard
--     table view. A blob is not.
--   * NULL already means "this creator has no such account". A blob needs a
--     convention for absent-vs-empty, which is one more thing to remember.
--
-- WHAT GOES IN THEM: a complete https:// URL, exactly as it should open. Nothing
-- normalises or prefixes on the way in or out, so what you paste is what the phone
-- opens. The app derives the DISPLAYED handle from the URL (last path segment for
-- Instagram, host+path otherwise) — no second column to keep in sync, and no way for
-- a stored handle to disagree with the link it sits next to.
--
-- Deliberately NO CHECK constraint on the shape. Adding one would make Postgres
-- validate it against every existing row, which CLAUDE.md's migration gate forbids;
-- the app already ignores anything that is not http(s), which is where a bad value
-- would surface anyway.
--
-- WHAT PRE-MIGRATION ROWS FALL BACK TO: all three are NULL on every existing series,
-- which is the correct and complete representation of "no links known". The frontend
-- renders one row per non-null link and drops the whole section when all three are
-- null, so "The Truth on Generosity" looks exactly as it does today until someone
-- fills these in.
--
-- BACKWARD COMPATIBILITY: purely additive, and the columns are NOT exposed to the
-- app binaries already in the App Store. GET /lessons/series/{id}/ adds them only for
-- clients that advertise `X-Client-Features: social`; an unmarked request gets a
-- byte-identical response (pinned by tests/test_backcompat_lessons.py against
-- tests/goldens/series_detail.json).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.lesson_series
  add column if not exists instagram_url text,
  add column if not exists linkedin_url  text,
  add column if not exists website_url   text;

comment on column public.lesson_series.instagram_url is
  'Full https:// URL to the creator''s Instagram profile. NULL = no account shown. The app derives the @handle from the last path segment.';
comment on column public.lesson_series.linkedin_url is
  'Full https:// URL to the creator''s LinkedIn profile or company page. NULL = no account shown.';
comment on column public.lesson_series.website_url is
  'Full https:// URL to the creator''s business site. NULL = no link shown.';

-- Example — filling in all three for a series (this is the shape to copy):
--   update public.lesson_series set
--     instagram_url = 'https://www.instagram.com/igorbarroso',
--     linkedin_url  = 'https://www.linkedin.com/in/igor-barroso',
--     website_url   = 'https://igorbarroso.com'
--   where title = 'The Truth on Generosity';

-- Verify after applying:
--   -- 1. the three columns exist, are nullable, and are text
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'lesson_series'
--      and column_name in ('instagram_url','linkedin_url','website_url')
--    order by column_name;
--   -- expect 3 rows, all text / YES / null default
--
--   -- 2. every pre-existing row is untouched and valid with all three null
--   select id, title, is_premium, is_published, sort_order,
--          instagram_url, linkedin_url, website_url
--     from public.lesson_series order by sort_order;
--   -- expect the same rows, same values, with the three new columns NULL
--
--   -- 3. nothing was rewritten
--   select count(*) as total,
--          count(instagram_url) + count(linkedin_url) + count(website_url) as any_set
--     from public.lesson_series;
--   -- expect any_set = 0

-- Applied to project vbvsblpyeylnemrecyqv on 2026-08-20.
