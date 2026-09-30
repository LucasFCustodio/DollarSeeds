-- ─────────────────────────────────────────────────────────────────────────────
-- 0011 — Debt Freedom v2: due-date cycles, statement check-ins, late fees,
--        plants that never shrink, and the "extra each month" setting
--
-- WHY. v1 only added interest when a minimum was missed, so balances drifted from
-- the real statements. v2 closes a billing cycle on every due date (full-payment
-- check → minimum check / late fee → a cycle's interest at the daily APR), then asks
-- the user to check the app against their statement. That needs a little state per
-- debt, three new transaction kinds, and one per-user setting.
--
-- Purely ADDITIVE:
--   * five NULLABLE columns on `debts`, no DEFAULT, so adding them is a metadata-only
--     change — no table rewrite, no existing row touched;
--   * the `debt_transactions.kind` CHECK is WIDENED (three new allowed values). It is
--     dropped and re-added in this one transaction, and re-added NOT VALID, so no
--     existing row is revalidated;
--   * one brand-new table, `debt_freedom_settings`, with RLS.
--
-- WHAT PRE-MIGRATION ROWS FALL BACK TO.
--   late_fee              NULL → no fee is added automatically; a missed minimum sets
--                         late_fee_pending_for and the app asks for the amount.
--   highest_step          NULL → the plant shows its computed growth step.
--   cycle_start_balance   NULL → the first cycle check rebuilds it from
--                         current_balance plus the cycle's net payments.
--   checkin_due_since     NULL → no statement check-in pending.
--   late_fee_pending_for  NULL → no late fee question pending.
--   debt_freedom_settings no row → monthly_extra is 0.
--
-- OLD BINARIES. No store build calls /debt-freedom/ — the Debts tab has been behind
-- DEBT_FREEDOM_ENABLED (= __DEV__) since it was introduced, and the routes have never
-- been on `main`. No other table, column, policy or row is touched, so every query in
-- the binaries on people's phones returns exactly what it did before.
-- POST /account/delete/ also clears debt_freedom_settings; each table is wrapped in its
-- own try/except, so that is correct before this migration is applied, too.
--
-- DEPLOY ORDER. Requires 0010. Apply 0010, then this, BEFORE deploying a backend with
-- the v2 /debt-freedom/ routes.
--
-- ROLLBACK NEEDS NO APP UPDATE: the feature is flagged off in production builds, and
-- unused nullable columns and an unused table are inert. Dropping any of them later is
-- a contract step for the owner to run by hand.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.debts
  add column if not exists late_fee             numeric  null,
  add column if not exists highest_step         smallint null,
  add column if not exists cycle_start_balance  numeric  null,
  add column if not exists checkin_due_since    date     null,
  add column if not exists late_fee_pending_for date     null;

-- Widen: the 0010 constraint was declared inline, so Postgres named it
-- debt_transactions_kind_check.
alter table public.debt_transactions
  drop constraint if exists debt_transactions_kind_check;
alter table public.debt_transactions
  add constraint debt_transactions_kind_check check (kind in (
    'payment_minimum', 'payment_extra', 'interest', 'balance_edit',
    'late_fee', 'statement_adjustment', 'minimum_reversal')) not valid;

create table if not exists public.debt_freedom_settings (
  user_id        uuid        primary key,
  monthly_extra  numeric     null,
  updated_at     timestamptz not null default now()
);

-- Same posture as debts / debt_transactions: the backend uses service_role and
-- bypasses RLS; this closes direct PostgREST access with the public anon key.
alter table public.debt_freedom_settings enable row level security;

create policy "Users control their own debt freedom settings"
  on public.debt_freedom_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Verify after applying:
--   -- 1. the five new debts columns exist, all nullable, no default
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'debts'
--      and column_name in ('late_fee', 'highest_step', 'cycle_start_balance',
--                          'checkin_due_since', 'late_fee_pending_for');
--   -- expect 5 rows, is_nullable = YES, column_default NULL
--
--   -- 2. the kind CHECK allows the three new values (NOT VALID: convalidated = false)
--   select conname, convalidated, pg_get_constraintdef(oid)
--     from pg_constraint where conname = 'debt_transactions_kind_check';
--
--   -- 3. pre-existing rows unchanged: same counts as before, and every new column NULL
--   select count(*) as debts,
--          count(*) filter (where late_fee is not null or highest_step is not null
--                             or cycle_start_balance is not null
--                             or checkin_due_since is not null
--                             or late_fee_pending_for is not null) as touched
--     from public.debts;
--   -- expect touched = 0
--   select kind, count(*) from public.debt_transactions group by kind;
--
--   -- 4. the settings table: empty, RLS on, one ALL policy on authenticated
--   select count(*) from public.debt_freedom_settings;             -- expect 0
--   select relrowsecurity from pg_class where relname = 'debt_freedom_settings';
--   select policyname, cmd, roles, qual from pg_policies
--    where schemaname = 'public' and tablename = 'debt_freedom_settings';

-- Applied to project … on <date>.
