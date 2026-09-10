-- ─────────────────────────────────────────────────────────────────────────────
-- 0009 — month_status: freeze a month's tithe + budget split when it is CLOSED
--
-- WHY. The backend decided whether a month used the LIVE user settings or frozen
-- history by asking "is this the current calendar month?" (_month_tithe and
-- _month_budget_type in main.py). Any other month fell back to a snapshot stamped
-- onto each income row at insert time.
--
-- That is the wrong question, and it produced two live bugs:
--
--   * Tithing switched ON after a month's income was already logged left those
--     income rows carrying tithe_enabled = false. While the month was current the
--     live branch masked it; at midnight on the 1st the code fell through to the
--     stale snapshot, the Tithing envelope VANISHED from the month that just
--     ended, and the carved-out money silently reappeared as spendable.
--   * Same mechanism for the budget split: past months reverted to 50/30/20 even
--     though the user had selected another type, and any month with no income
--     rows at all was hard-coded to 'balanced'.
--
-- The right question is "has the user CLOSED this month out?". These columns hold
-- the answer's payload: the tithe and split a month was closed with. A month that
-- is not closed — past, current or future — follows the live settings and stays
-- correctable; closing freezes it here, permanently and clock-independently.
--
-- Purely ADDITIVE. Four nullable columns on an existing table. Nothing dropped,
-- renamed, retyped or narrowed; no existing row is rewritten (nullable columns
-- with no DEFAULT are a catalogue-only change in Postgres 11+, not a table
-- rewrite), and no CHECK is added, so nothing is revalidated against live rows.
--
-- WHAT PRE-MIGRATION ROWS FALL BACK TO. NULL. The resolver reads NULL as "closed
-- before 0009" and takes the OLD income-row-snapshot path for that month, so
-- every month already closed keeps EXACTLY the numbers it shows today. The only
-- months whose figures move are open ones — precisely the months the app still
-- lets the user edit. Nothing is restated behind the user's back.
--
-- NO MONEY MOVES ON A READ. _compute_target_rollover is a pure read, and
-- reconcile_month is reachable ONLY from POST /rollover/close/. So a corrected
-- tithe on a never-closed past month changes what is DISPLAYED; the rollover
-- entry and the Reconciliation goal are touched only when the user explicitly
-- closes the month.
--
-- INTENTIONAL NUMERIC CHANGE, months closed from this release forward only: a
-- month's tithe becomes total_income x one month-level rate, instead of
-- sum(amount_i x rate_i) over income rows. Today's payload can already report a
-- `rate` that does not reconcile with its own `amount` (it reports the first
-- tithed row's rate while summing every row's own) — a single stamped rate makes
-- the two agree. Already-closed months are unaffected (they take the fallback).
--
-- OLD BINARIES. Response SHAPES are byte-identical — no key on
-- GET /dashboard/{month}, GET /dashboard/trends/ or GET /rollover/preview/ is
-- added, removed, renamed or retyped, and these columns are never forwarded to
-- the client. No request field becomes required: the stamping is entirely
-- server-side, so a shipped binary's POST /rollover/close/ gets the corrected
-- behaviour for free and cannot send a wrong value. The one guard that changes,
-- the prior-year check below, only ever makes _assert_month_open MORE permissive,
-- never stricter, so no old client can start failing.
--
-- ROLLBACK NEEDS NO APP UPDATE: leave the columns unwritten and the backend is
-- byte-for-byte the pre-migration behaviour. The backend reads month_status with
-- select('*') and treats a MISSING key exactly like NULL, so the API is also
-- correct in the window BEFORE this is applied — which is why the read path is
-- deploy-order-independent.
--
-- DEPLOY ORDER STILL MATTERS FOR THE WRITE PATH. rollover_close's upsert names
-- these columns; if the backend ships first it will 400 on every close. Apply
-- this migration, let PostgREST's schema cache reload, THEN deploy the backend.
-- ─────────────────────────────────────────────────────────────────────────────

-- The split key ('balanced' / 'wealth_builder' / 'firm_foundation'), NOT the
-- percentages — same rule as income.budget_type and user_settings.budget_type, so
-- BUDGET_TYPES in main.py stays the single source of truth and cannot drift.
--
-- Deliberately NO CHECK constraint. The backend already validates on the way in
-- (_frozen_stamp rejects anything not in BUDGET_TYPES) and again on the way out
-- (`key if key in BUDGET_TYPES else DEFAULT_BUDGET_TYPE`), so an unknown string
-- can never reach a client. A CHECK here would buy nothing and would have to be
-- NOT VALID to avoid revalidating existing rows.
alter table public.month_status
  add column if not exists budget_type text;

-- Nullable BOOLEAN, three-valued on purpose: NULL means "not stamped" (month not
-- closed, or closed before this migration) and is the signal to take the legacy
-- fallback. false is a MEANINGFUL stamp — "closed with tithing off" — and must
-- not be confused with NULL, which is why the backend tests presence
-- (`is not None`) rather than truthiness.
alter table public.month_status
  add column if not exists tithe_enabled boolean;

-- numeric, matching 0004's completed_amount and every other decimal this repo has
-- added by migration. Exact rather than binary-float, so a rate of 0.10 stores as
-- 0.10. NOTE user_settings.tithe_rate and income.tithe_rate predate this
-- directory and were created straight against Supabase; their physical type is
-- not recorded anywhere in the repo. It does not need to match: this column is
-- only ever written from float() and read back through float() in main.py, and
-- PostgREST serialises numeric/real/double precision alike to a JSON number. The
-- values are two-decimal rates, far inside the exact range of all three.
alter table public.month_status
  add column if not exists tithe_rate numeric;

-- The year the frozen month belongs to. Months are stored as bare English NAMES
-- with no year, so (user_id, 'September') is ONE row for all time. Without this,
-- a September closed last year would still read as closed this September —
-- freezing the CURRENT month to a year-old split, and (via _assert_month_open)
-- rejecting every new income and expense entry for it with a 409.
--
-- Stamped at close from the month name and the wall clock. NULL on pre-migration
-- rows, where the backend derives it from closed_at instead (a month closed in a
-- month at or after its own position belongs to that year; December closed on
-- Jan 2 belongs to the previous one). A row whose year is not the current one is
-- treated as never-closed, and closing that month again recycles the row for the
-- new year.
--
-- This does NOT make the app year-aware: income, expenses and savings_transactions
-- are still keyed on a bare month name, so two Septembers' rows remain
-- indistinguishable and sum together. That is a separate, much larger
-- expand -> contract project; this column only stops the close-out state and the
-- read-only guard from going stale on the anniversary.
alter table public.month_status
  add column if not exists year integer;

comment on column public.month_status.budget_type is
  'Budget-split KEY this month was closed with. NULL = month not closed, or closed before migration 0009 (falls back to the income-row snapshot). Frozen: the live user_settings value no longer affects a closed month.';
comment on column public.month_status.tithe_enabled is
  'Whether tithing was on when this month was closed. NULL = not stamped (see budget_type); false is a real value meaning "closed with tithing off".';
comment on column public.month_status.tithe_rate is
  'Tithe rate this month was closed with, e.g. 0.10. Applied to the month''s total income as a single month-level rate.';
comment on column public.month_status.year is
  'Calendar year the frozen month belongs to. NULL on pre-0009 rows, where it is derived from closed_at. A row from a previous year is treated as never-closed, so the month name can be reused.';

-- Verify after applying:
--   -- 1. the four columns exist, are nullable, and have NO default
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'month_status'
--    order by ordinal_position;
--   -- expect budget_type / text / YES / NULL, tithe_enabled / boolean / YES / NULL,
--   -- tithe_rate / numeric / YES / NULL, year / integer / YES / NULL,
--   -- and user_id + month + closed_at + tithe_given_at unchanged
--
--   -- 2. every pre-existing row is untouched: same count, closed_at and
--   --    tithe_given_at intact, and all four new columns NULL everywhere
--   select count(*)              as rows_total,
--          count(closed_at)      as rows_closed,
--          count(tithe_given_at) as rows_tithe_given,
--          count(budget_type)    as rows_budget_type,
--          count(tithe_enabled)  as rows_tithe_enabled,
--          count(tithe_rate)     as rows_tithe_rate,
--          count(year)           as rows_year
--     from public.month_status;
--   -- expect rows_total / rows_closed / rows_tithe_given exactly as before, and
--   -- rows_budget_type = rows_tithe_enabled = rows_tithe_rate = rows_year = 0
--
--   -- 3. the query the live app's dashboard path runs still works
--   select * from public.month_status limit 1;
--
--   -- 4. RLS unchanged. month_status carries one pre-existing per-user policy,
--   -- "Users control their own month status" (ALL, authenticated, auth.uid() =
--   -- user_id). It names no column list, so it covers these four on the same
--   -- terms as closed_at.
--   select c.relrowsecurity from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname = 'month_status';      -- expect true
--   select policyname, cmd, roles from pg_policies
--    where schemaname = 'public' and tablename = 'month_status';     -- expect that 1 policy

-- Applied to project vbvsblpyeylnemrecyqv on <date>.
