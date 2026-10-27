-- ─────────────────────────────────────────────────────────────────────────────
-- 0013 — Goals v2: monthly minimums, the automatic minimum, Ready to Replant
--
-- WHY. Goals become a monthly habit, like debts (GOALS_REWORK.md). Each goal stores
-- the monthly minimum it was planned with (computed once, never on every read), can
-- add that minimum automatically, and a minimum deposit has to be told apart from
-- every other deposit so the toggle can delete exactly that row. Ready to Replant is a
-- new container for money a deleted goal left behind: its own savings_goals row, NOT
-- a renamed General Savings, because month-end rollover keeps writing to General
-- Savings for the "kept under budget" stat.
--
-- Only clients sending `X-Client-Features: goals_v2` read or write any of this. Every
-- request without it runs today's code and gets today's response: the new columns
-- are stripped from the rows those builds receive, and the Ready to Replant row is
-- left out of their goal list.
--
-- Purely ADDITIVE:
--   * six NULLABLE columns, no DEFAULT, so each add is metadata-only: no table
--     rewrite, no existing row touched or revalidated;
--   * a CHECK on the new `kind` column, added NOT VALID (every existing row is NULL,
--     which passes anyway; NOT VALID means not even a scan);
--   * two partial UNIQUE indexes whose predicates match no existing row (both test a
--     column that is NULL everywhere until this release writes it), so building them
--     cannot fail. Both tables are tiny (tens of rows), so the brief lock of a
--     non-concurrent CREATE INDEX is milliseconds.
--
-- savings_goals
--   monthly_minimum      numeric  The whole-dollar minimum, stored at creation and
--                                 recomputed only when the target amount or date is
--                                 edited. NULL → not computed yet: the first goals_v2
--                                 read computes and stores it (lazily, like Debt
--                                 Freedom's cycles). Stays NULL for General Savings,
--                                 Reconciliation, Ready to Replant, completed goals
--                                 and retired debt goals.
--   auto_minimum         boolean  "Add my monthly amount automatically". NULL → off.
--   auto_minimum_month   date     First day of the last month whose automatic minimum
--                                 was handled (added, or declined by toggling it off).
--                                 Claimed with a conditional update, so overlapping
--                                 reads add it at most once. NULL → never handled.
--   is_replant           boolean  The user's one Ready to Replant container. NULL →
--                                 an ordinary goal (every existing row).
--   replant_seed_amount  numeric  On the Ready to Replant row only: the General
--                                 Savings balance moved into it the first time a
--                                 goals_v2 build loaded the user's goals. Stored with
--                                 the row so a move that failed halfway is finished by
--                                 the next read instead of being lost. NULL elsewhere.
--
-- savings_transactions
--   kind                 text     NULL → an ordinary row (every existing row, and every
--                                 row an old build writes). 'minimum' = a goal's
--                                 monthly minimum (the toggle deletes it, never
--                                 reverses it); 'replant_seed' = the two legs of the
--                                 one-time General Savings → Ready to Replant move;
--                                 'replant_return' = what a deleted goal sent to Ready
--                                 to Replant.
--
-- No row is rewritten. `savings_transactions.source` keeps its CHECK unchanged: a
-- minimum is source='income', the seed and Replant transfers are source='transfer',
-- and goal-level "money I'd already saved" deposits are source='opening' — all values
-- the CHECK already allows.
--
-- DEPLOY ORDER: backend first, then this, then the app release.
--   1. Deploy the backend from this change. Its old-client paths never NAME a new
--      column (they read select('*') with .get()), so it runs unchanged before this
--      migration exists — and it strips the new columns from every row it serves to a
--      build without goals_v2.
--   2. Apply this. Only now do select('*') rows carry the new columns, and the backend
--      already removes them for old builds. Applied BEFORE step 1, the backend on
--      `main` would hand those columns (as nulls) to every installed binary.
--   3. Release the app that sends goals_v2. Its routes need this migration.
--
-- ROLLBACK NEEDS NO APP UPDATE: unused nullable columns, an unused CHECK and two
-- indexes over rows that do not exist are inert. Dropping any of them is a contract
-- step for the owner to run by hand.
--
-- Verify after applying:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public'
--      and ((table_name = 'savings_goals' and column_name in
--             ('monthly_minimum','auto_minimum','auto_minimum_month','is_replant','replant_seed_amount'))
--        or (table_name = 'savings_transactions' and column_name = 'kind'))
--    order by table_name, column_name;
--   -- expect 6 rows, all is_nullable = YES, column_default NULL
--
--   select conname, convalidated, pg_get_constraintdef(oid)
--     from pg_constraint where conname = 'savings_transactions_kind_check';
--   -- expect 1 row, convalidated = false
--
--   select indexname, indexdef from pg_indexes
--    where indexname in ('savings_goals_one_replant_idx', 'savings_transactions_one_replant_seed_idx');
--   -- expect 2 rows
--
--   -- Pre-existing rows are unchanged: every new column is NULL on every row.
--   select count(*) filter (where monthly_minimum is not null or auto_minimum is not null
--                             or auto_minimum_month is not null or is_replant is not null
--                             or replant_seed_amount is not null) as touched_goals,
--          count(*) as goals
--     from public.savings_goals;
--   select count(*) filter (where kind is not null) as touched_txns, count(*) as txns
--     from public.savings_transactions;
--   -- expect touched_goals = 0 and touched_txns = 0
--
-- Applied to project … on <date>.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.savings_goals
  add column if not exists monthly_minimum     numeric     null,
  add column if not exists auto_minimum        boolean     null,
  add column if not exists auto_minimum_month  date        null,
  add column if not exists is_replant          boolean     null,
  add column if not exists replant_seed_amount numeric     null;

alter table public.savings_transactions
  add column if not exists kind text null;

alter table public.savings_transactions
  drop constraint if exists savings_transactions_kind_check;
alter table public.savings_transactions
  add constraint savings_transactions_kind_check
  check (kind in ('minimum', 'replant_seed', 'replant_return')) not valid;

-- One Ready to Replant per user. Creating it is how concurrent first loads agree on
-- a single container: the loser of the insert gets 23505 and reads the winner's row.
create unique index if not exists savings_goals_one_replant_idx
  on public.savings_goals (user_id) where is_replant is true;

-- The one-time move is written as ONE insert of both legs; this makes a second,
-- overlapping attempt fail whole instead of moving the money twice.
create unique index if not exists savings_transactions_one_replant_seed_idx
  on public.savings_transactions (user_id, type) where kind = 'replant_seed';
