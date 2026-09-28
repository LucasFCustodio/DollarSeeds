-- ─────────────────────────────────────────────────────────────────────────────
-- 0010 — Debt Freedom: the plant-debts tables
--
-- WHY. The new Debts tab shows each debt as a plant that grows as it is paid
-- down with the snowball method (smallest balance first; a paid-off debt's
-- minimum rolls into the next). It needs its own debts and a payment history.
--
-- It is deliberately SEPARATE from the existing debt goals on the Goals tab
-- (savings_goals.goal_type = 'debt'). Nothing here reads, writes or references
-- savings_goals or savings_transactions; whether the old system is retired is a
-- later decision, once this one is proven.
--
-- Purely ADDITIVE. Two brand-new tables, their indexes, and RLS on those two
-- tables only. No existing table, column, constraint, policy or row is touched,
-- so no deployed query — including every query in the binaries already on
-- people's phones — can change what it returns.
--
-- WHAT PRE-MIGRATION ROWS FALL BACK TO. There are none: both tables start empty.
-- Nullable optional columns (due_day, debt_type, lender, …) read as "not set",
-- which the pot label shows as a red "--". interest_checked_through NULL means
-- "never checked" and the missed-payment rule anchors on created_at instead.
--
-- CHECK constraints are declared here, at birth, against empty tables — nothing
-- is revalidated. Adding a debt_type or kind later is a widening (safe).
--
-- OLD BINARIES. No existing route changes. The new /debt-freedom/ routes are only
-- called by builds that ship the Debts tab, which is also behind
-- DEBT_FREEDOM_ENABLED in the app. POST /account/delete/ now also clears these two
-- tables; it wraps each table in its own try/except, so it is correct in the
-- window before this migration is applied, too.
--
-- DEPLOY ORDER. Apply this migration BEFORE deploying a backend with the
-- /debt-freedom/ routes. The reverse order only breaks those new routes (no old
-- client calls them), never an existing one.
--
-- ROLLBACK NEEDS NO APP UPDATE: the feature is flagged off in production builds,
-- and unused tables are inert. Dropping them later is a contract step for the
-- owner to run by hand.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.debts (
  id                        bigint generated always as identity primary key,
  user_id                   uuid        not null,
  name                      text        not null,
  original_balance          numeric     not null,
  current_balance           numeric     not null,
  min_payment               numeric     not null,
  apr                       numeric     not null,          -- percent, e.g. 24.99
  due_day                   smallint    null check (due_day between 1 and 31),
  debt_type                 text        null check (debt_type in (
                              'credit_card', 'student_loan', 'medical', 'auto',
                              'personal', 'bnpl', 'family', 'other')),
  lender                    text        null,
  pay_url                   text        null,
  autopay                   boolean     null,
  credit_limit              numeric     null,
  notes                     text        null,
  species                   smallint    not null default 4 check (species between 1 and 4),
  species_locked            boolean     not null default false,
  status                    text        not null default 'active'
                              check (status in ('active', 'paid_off')),
  paid_off_at               timestamptz null,
  interest_checked_through  date        null,              -- missed-payment rule
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table if not exists public.debt_transactions (
  id             bigint generated always as identity primary key,
  user_id        uuid        not null,
  debt_id        bigint      not null references public.debts (id) on delete cascade,
  kind           text        not null check (kind in (
                   'payment_minimum', 'payment_extra', 'interest', 'balance_edit')),
  amount         numeric     not null,
  balance_after  numeric     not null,
  occurred_on    date        not null,
  created_at     timestamptz not null default now()
);

-- No FK from user_id to auth.users, matching every other per-user table here.
create index if not exists debts_user_id_idx             on public.debts (user_id);
create index if not exists debt_transactions_user_id_idx on public.debt_transactions (user_id);
create index if not exists debt_transactions_debt_id_idx on public.debt_transactions (debt_id);

-- Same posture as expenses / income / savings_*: the backend uses service_role and
-- bypasses RLS; this closes direct PostgREST access with the public anon key.
alter table public.debts             enable row level security;
alter table public.debt_transactions enable row level security;

create policy "Users control their own debts"
  on public.debts for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users control their own debt transactions"
  on public.debt_transactions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Verify after applying:
--   -- 1. both tables exist with the columns above
--   select table_name, column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name in ('debts', 'debt_transactions')
--    order by table_name, ordinal_position;
--
--   -- 2. both start empty
--   select (select count(*) from public.debts) as debts,
--          (select count(*) from public.debt_transactions) as debt_transactions;
--   -- expect 0, 0
--
--   -- 3. RLS on, one ALL policy each on role authenticated, auth.uid() = user_id
--   select c.relname, c.relrowsecurity from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname in ('debts', 'debt_transactions');
--   select tablename, policyname, cmd, roles, qual from pg_policies
--    where schemaname = 'public' and tablename in ('debts', 'debt_transactions');
--
--   -- 4. nothing else moved: every pre-existing policy still reads auth.uid() = user_id
--   select tablename, policyname, qual from pg_policies
--    where schemaname = 'public' order by tablename;

-- Applied to project … on <date>.
