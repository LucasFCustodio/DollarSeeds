-- ─────────────────────────────────────────────────────────────────────────────
-- 0012 — Debt Freedom: a late minimum can name the billing cycle it pays for
--
-- WHY. A minimum used to belong to whichever cycle its occurred_on fell in. A user
-- who missed September and caught up in October therefore logged September's
-- minimum as October's: the toggle turned on for October and the overdue alert
-- cleared, while October's own minimum was never paid. "View all min payments" lets
-- a missed minimum be logged late, dated the day it is logged (so it counts against
-- that month's Goals budget, the existing rule) but attributed to the cycle it pays.
--
-- One NULLABLE column, no DEFAULT: a metadata-only change, no table rewrite, no
-- existing row touched or revalidated. No constraint, index or policy changes —
-- debt_transactions already has RLS with one ALL policy (0010).
--
-- WHAT PRE-MIGRATION ROWS FALL BACK TO.
--   cycle_due_date NULL → today's rule: a payment_minimum counts for the cycle its
--                  occurred_on falls in. Every existing row is NULL, so every
--                  existing cycle reads exactly as it did. Only POST
--                  /debt-freedom/{id}/payments with the new optional cycle_due_date
--                  writes a value, and only on a payment_minimum.
--
-- OLD BINARIES. No store build calls /debt-freedom/ (the Debts tab has been behind
-- DEBT_FREEDOM_ENABLED = __DEV__ since it was introduced), and no other table is
-- touched, so every query in the binaries on people's phones returns the same rows
-- and columns as before.
--
-- DEPLOY ORDER. Requires 0010. Apply this BEFORE deploying a backend whose
-- /debt-freedom/{id}/payments accepts cycle_due_date: that route writes the column.
-- Reads never require it (rows are read with select('*'), and a missing key is NULL).
--
-- ROLLBACK NEEDS NO APP UPDATE: a nullable column nobody writes is inert. Dropping
-- it later is a contract step for the owner to run by hand.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.debt_transactions
  add column if not exists cycle_due_date date null;

comment on column public.debt_transactions.cycle_due_date is
  'payment_minimum only: the due date of the billing cycle this minimum pays for, when it was logged late. NULL = the cycle its occurred_on falls in.';

-- Verify after applying:
--   -- 1. the column exists, nullable, no default
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'debt_transactions'
--      and column_name = 'cycle_due_date';
--   -- expect 1 row: date, is_nullable = YES, column_default NULL
--
--   -- 2. pre-existing rows unchanged: same counts per kind as before, none set
--   select kind, count(*) as rows, count(cycle_due_date) as attributed
--     from public.debt_transactions group by kind order by kind;
--   -- expect attributed = 0 on every row
--
--   -- 3. RLS still on, policies unchanged
--   select relrowsecurity from pg_class where relname = 'debt_transactions';
--   select policyname, cmd, roles, qual from pg_policies
--    where schemaname = 'public' and tablename = 'debt_transactions';

-- Applied to project … on <date>.
