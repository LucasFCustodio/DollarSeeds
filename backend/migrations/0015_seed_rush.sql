-- ─────────────────────────────────────────────────────────────────────────────
-- 0015 — Seed Rush: the website's daily Bible-verse game
--
-- WHY. Seed Rush is a free daily game on dollarseeds.app: fill in missing words from
-- verses about money, work and stewardship against a 60-second clock, and land on a
-- daily global leaderboard. The server keeps the answers, the clock and the score, so
-- it needs its own verses, player profiles (username, email verification), runs and
-- per-verse answers.
--
-- Purely ADDITIVE. Five brand-new tables, their indexes and RLS on those five only.
-- No existing table, column, constraint, policy or row is touched, so no deployed
-- query — including every query in the app binaries on people's phones (1.1.0, 1.2.0
-- and older) — can change what it returns. No app build calls /seed-rush/.
--
-- WHAT PRE-MIGRATION ROWS FALL BACK TO. There are none: every table starts empty.
-- Nullable columns read as "not yet": a profile with no username or no
-- email_verified_at plays and keeps a streak but stays off the leaderboard; a run
-- with no finished_at is still running, or ended when its deadline passed.
--
-- Accounts are the app's own Supabase accounts. Nothing here (or in the backend)
-- reads or writes auth user metadata, and Supabase Auth settings are untouched —
-- in particular project-wide email confirmation stays off, because turning it on
-- would change sign-up in the live app. Seed Rush verifies emails itself
-- (seed_rush_profiles.email_verified_at).
--
-- TABLES
--   seed_rush_verses        The verse file, loaded by backend/load_seed_rush_verses.py
--                           (upsert by slug; a verse dropped from the file is set
--                           active = false, never deleted, since past runs point at it).
--   seed_rush_profiles      One per account that has used Seed Rush: username (unique
--                           regardless of capitals), email verification state. Only the
--                           SHA-256 of a verification token is stored. The two
--                           verification_window_* columns count sends for the
--                           3-per-hour limit.
--   seed_rush_runs          One game. Exactly one of user_id / guest_id is set. A daily
--                           run is one per account (and one per guest id) per game day,
--                           enforced by two partial unique indexes. question_served_at is
--                           when the current verse was handed out — what the
--                           minimum-believable-time check measures from.
--   seed_rush_answers       One graded verse of a run; unique (run_id, position), which
--                           is what makes a repeated or overlapping submission land once.
--   seed_rush_guest_claims  Which account claimed a guest id. Its primary key is what
--                           makes a guest id claimable only once.
--
-- No separate "daily results" table: the leaderboard reads finished daily runs
-- directly, so there is no second copy of a score to drift out of step.
--
-- No FK from user_id to auth.users, matching every other per-user table here.
-- seed_rush_answers → seed_rush_runs and → seed_rush_verses are FKs between the new
-- tables only.
--
-- RLS: ENABLED with NO policies, the posture of subscriptions / app_config (0005),
-- not the per-user "auth.uid() = user_id" policy of debts (0010). The backend uses
-- service_role and bypasses RLS. A per-user ALL policy here would let any signed-in
-- player write their own run's score, or set their own email_verified_at, directly
-- through PostgREST with their access token — exactly what the server-kept score and
-- verification exist to prevent.
--
-- DEPLOY ORDER. Apply this migration BEFORE deploying a backend with the /seed-rush/
-- routes. The reverse order only breaks those new routes (no app build calls them),
-- never an existing one. POST /account/delete/ now also clears these tables; every
-- step is in its own try/except, so it is correct before this migration exists too.
--
-- ROLLBACK NEEDS NO APP UPDATE: unused tables are inert. Dropping them later is a
-- contract step for the owner to run by hand.
--
-- Verify after applying:
--   -- 1. the five tables exist with the columns below
--   select table_name, column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name like 'seed\_rush\_%'
--    order by table_name, ordinal_position;
--
--   -- 2. all start empty
--   select (select count(*) from public.seed_rush_verses)       as verses,
--          (select count(*) from public.seed_rush_profiles)     as profiles,
--          (select count(*) from public.seed_rush_runs)         as runs,
--          (select count(*) from public.seed_rush_answers)      as answers,
--          (select count(*) from public.seed_rush_guest_claims) as claims;
--   -- expect 0, 0, 0, 0, 0
--
--   -- 3. the unique indexes
--   select indexname, indexdef from pg_indexes
--    where schemaname = 'public' and tablename like 'seed\_rush\_%' order by indexname;
--   -- expect seed_rush_profiles_username_lower_idx, seed_rush_runs_one_daily_per_user_idx,
--   -- seed_rush_runs_one_daily_per_guest_idx, and the primary / unique keys
--
--   -- 4. RLS on, zero policies
--   select c.relname, c.relrowsecurity from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname like 'seed\_rush\_%';
--   -- expect relrowsecurity = true for all five
--   select count(*) from pg_policies where schemaname = 'public' and tablename like 'seed\_rush\_%';
--   -- expect 0
--
--   -- 5. nothing else moved: every pre-existing policy is still there, unchanged
--   select tablename, policyname, qual from pg_policies
--    where schemaname = 'public' order by tablename;
--
-- Applied to project … on <date>.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.seed_rush_verses (
  id            bigint generated always as identity primary key,
  slug          text        not null unique,
  reference     text        not null,
  category      text        not null,
  text          text        not null,
  blanks        text[]      not null,     -- always 3, in verse order
  easy_blank    text        not null,     -- one of blanks
  easy_wrong    text[]      not null,     -- 2 words
  medium_wrong  text[]      not null,     -- 3 words
  explanation   text        null,
  active        boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.seed_rush_profiles (
  user_id                         uuid        primary key,
  username                        text        null,
  email_verified_at               timestamptz null,
  verification_token_hash         text        null,
  verification_expires_at         timestamptz null,
  verification_sent_at            timestamptz null,
  verification_window_started_at  timestamptz null,
  verification_window_count       integer     null,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create table if not exists public.seed_rush_runs (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        null,
  guest_id            uuid        null,
  kind                text        not null check (kind in ('daily', 'practice')),
  mode                text        not null check (mode in ('easy', 'medium', 'hard')),
  game_day            date        null,
  verse_order         bigint[]    not null,
  current_index       integer     not null default 0,
  started_at          timestamptz not null default now(),
  deadline_at         timestamptz not null,
  question_served_at  timestamptz null,
  finished_at         timestamptz null,
  score               integer     not null default 0,
  words_right         integer     not null default 0,
  words_wrong         integer     not null default 0,
  flagged             boolean     not null default false,
  flag_reason         text        null,
  created_at          timestamptz not null default now(),
  constraint seed_rush_runs_one_owner check ((user_id is null) <> (guest_id is null)),
  constraint seed_rush_runs_daily_has_day check ((kind = 'daily') = (game_day is not null))
);

create table if not exists public.seed_rush_answers (
  id           bigint generated always as identity primary key,
  run_id       uuid        not null references public.seed_rush_runs (id) on delete cascade,
  position     integer     not null,
  verse_id     bigint      not null references public.seed_rush_verses (id),
  submitted    jsonb       not null,     -- the strings sent, one per blank
  correct      jsonb       not null,     -- true/false per blank
  points       integer     not null,
  answered_at  timestamptz not null default now(),
  elapsed_ms   integer     not null,     -- since the verse was served
  created_at   timestamptz not null default now(),
  constraint seed_rush_answers_run_position_key unique (run_id, position)
);

create table if not exists public.seed_rush_guest_claims (
  guest_id    uuid        primary key,
  user_id     uuid        not null,
  claimed_at  timestamptz not null default now()
);

-- Usernames are unique regardless of capitals.
create unique index if not exists seed_rush_profiles_username_lower_idx
  on public.seed_rush_profiles (lower(username)) where username is not null;
-- Confirm looks a token up by its hash.
create index if not exists seed_rush_profiles_token_hash_idx
  on public.seed_rush_profiles (verification_token_hash) where verification_token_hash is not null;

-- One daily run per account, and per guest id, per game day.
create unique index if not exists seed_rush_runs_one_daily_per_user_idx
  on public.seed_rush_runs (user_id, game_day) where kind = 'daily' and user_id is not null;
create unique index if not exists seed_rush_runs_one_daily_per_guest_idx
  on public.seed_rush_runs (guest_id, game_day) where kind = 'daily' and guest_id is not null;
-- The leaderboard reads one day's daily runs; streaks and claims read one owner's.
create index if not exists seed_rush_runs_daily_day_idx
  on public.seed_rush_runs (game_day) where kind = 'daily';
create index if not exists seed_rush_runs_user_id_idx  on public.seed_rush_runs (user_id);
create index if not exists seed_rush_runs_guest_id_idx on public.seed_rush_runs (guest_id);
create index if not exists seed_rush_guest_claims_user_id_idx on public.seed_rush_guest_claims (user_id);

-- RLS on, no policies: service_role only (see the header for why not per-user).
alter table public.seed_rush_verses       enable row level security;
alter table public.seed_rush_profiles     enable row level security;
alter table public.seed_rush_runs         enable row level security;
alter table public.seed_rush_answers      enable row level security;
alter table public.seed_rush_guest_claims enable row level security;
