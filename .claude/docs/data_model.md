# Data Model

## Supabase Tables

### `expenses`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid | Foreign key to auth.users; all queries filter by this |
| `title` | text | Expense name |
| `amount` | numeric | Expense amount |
| `category` | text | Stored values (audited): `"Needs"`, `"Wants"`, `"Goals"`. New expenses are only ever `"Needs"` or `"Wants"`. `"Goals"` is the legacy "Investments" bucket — read-only for past months, never created anymore (debt/savings goals moved to `savings_goals`). A handful of orphaned `"Savings"` rows also exist but are read by no endpoint. |
| `day` | integer | Day of month (1–31) |
| `month` | text | Month name, e.g. `"April"` |

### `income`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid | |
| `job_title` | text | Income source label |
| `amount` | numeric | |
| `job_type` | text | e.g. `"Full-time"`, `"Part-time"`, `"Freelance"` |
| `day` | integer | |
| `month` | text | Month name |

### `savings_transactions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (identity PK) | |
| `user_id` | uuid | |
| `title` | text | e.g. "Emergency fund", "Bought the MacBook!" |
| `amount` | numeric | Always positive |
| `type` | text | `"deposit"` or `"withdrawal"` |
| `day` | integer | |
| `month` | text | Month name |
| `created_at` | timestamptz | Default NOW() |
| `source` | text | CHECK-constrained to `"income"` \| `"transfer"` \| `"rollover"` \| `"opening"`. **Only `income` counts toward the Goals budget** — every budget path allowlists it. `transfer` = moved between goals, `rollover` = month-end leftover, `opening` = savings the user had before joining (one row max per user, written by `POST /savings/starting-balance/`). Migration for `opening`: [backend/migrations/0003_opening_source.sql](../../backend/migrations/0003_opening_source.sql). |
| `transfer_group` | uuid | Nullable. Set only by `POST /savings/transfer/`, which writes **two** legs (a General Savings withdrawal + a destination-goal deposit) that share one `transfer_group`. `GET /savings/history/` collapses the pair into a single "Transfer from General Savings to X" entry (the withdrawal leg, flagged `is_transfer`), and deleting that entry deletes **both** legs. NULL for all non-transfer rows. Migration: [backend/migrations/0002_transfer_group.sql](../../backend/migrations/0002_transfer_group.sql). |

Balance = `SUM(amount WHERE type='deposit') - SUM(amount WHERE type='withdrawal')`, computed in `GET /savings/balance/`. Persists across months (not reset monthly).

A goal deposit is normally booked to the current `month`, but the Goals funding-source picker also lets a user fund from an **earlier open month** with leftover income — that deposit is written with `month` = the chosen month so it counts toward *that* month's Goals budget. `GET /income/funding-months/?user_id&current_month=` returns the eligible months (earlier in the calendar, not closed, income > $0).

### `savings_goals`

| Column | Type | Notes |
|--------|------|-------|
| `id` | int4 (PK) | |
| `user_id` | uuid | |
| `title` | text | Unique per user (enforced in backend) |
| `target_amount` | float8 | Nullable — null for General Savings |
| `target_month` | text | Deadline month name |
| `target_year` | int4 | Deadline year |
| `completed` | bool | Default false |
| `completed_amount` | numeric | Nullable. What the goal held the moment it was completed — see below |
| `completed_at` | timestamptz | Nullable. When it was completed |
| `is_general` | bool | Default false; exactly one General Savings pool per user |
| `goal_type` | text | `"saving"` (default) or `"debt"`. Debt goals behave identically to savings goals — same allocation math (`allocated_amount / target_amount`), same transactions, same transfer support. Only the Goals-tab grouping/labels differ. |
| `created_at` | timestamp | |

A goal's funded amount is computed (not stored) as `SUM(deposits) - SUM(withdrawals)` over `savings_transactions` with that `goal_id` (`_with_allocated` in `main.py`). Debt payments are just deposits with `source='income'`, so they count toward the Goals 20% budget exactly like savings deposits.

**Completing a goal** (`POST /savings/goal/{id}/finish`) withdraws the goal's entire funded amount in one server-side transaction, which drives that computed value to $0 — hence the `completed_amount` snapshot, which is what the Completed tab actually renders (falling back to the computed value for goals completed before the column existed). The legacy `PATCH /savings/goal/{id}/complete` only flips the flag and writes no withdrawal; it exists solely for app builds already shipped, which write their own withdrawal first.

**Editing a goal** (`PATCH /savings/goal/{id}`) can change `title`, `target_amount`, `target_month`, `target_year`. Since `savings_transactions.title` is a denormalized copy of the goal title, a rename also rewrites the titles of that goal's transactions so Recent Activity doesn't show the old name. General Savings and the Reconciliation goal are auto-managed and reject both routes.

## Budget Calculation

Computed server-side in [backend/main.py](../../backend/main.py) lines ~53–55 from the month's total income:

```
needs_budget  = total_income * 0.50
wants_budget  = total_income * 0.30
goals_budget  = total_income * 0.20
```

## Category Name Mismatch

The dashboard's 50/30/20 split shows **"Needs / Wants / Goals"**, and the DB stores expense categories with those same plural names (`Needs`/`Wants`/`Goals`) — they match. The Goals bucket total = historical `Goals` expenses + income-sourced savings deposits (`savings_transactions` where `type='deposit'` AND `source='income'`); transfers between goals (`source='transfer'`) are excluded so they don't double-count. (Note: earlier docs described the categories as `Need/Want/Savings/Debt` — that was never the stored reality; see the audited values above.)

## Row Level Security

**RLS is not what protects this app's data.** The backend connects with the
**service_role** key, which bypasses RLS entirely, so every policy below is invisible
to [backend/main.py](../../backend/main.py). Access control for anything reaching the
API is the verified-JWT dependency `get_current_user_id` — see
[architectural_patterns.md](architectural_patterns.md#api-authentication). RLS is the
second layer: it governs direct PostgREST access with the **anon** key, which ships
inside every app binary and is therefore public.

State as verified **2026-07-26** — already correct, nothing to apply:

| Tables | RLS | Policies |
|--------|-----|----------|
| `expenses`, `income`, `savings_transactions`, `savings_goals`, `month_status`, `lesson_ratings` | enabled | One `ALL` policy each, role `authenticated`, `USING (auth.uid() = user_id)` |
| `user_settings` | enabled | Three policies — `SELECT` / `INSERT` / `UPDATE`, same `auth.uid() = user_id` — but on role `public`, not `authenticated`. No `DELETE` policy. |
| `lesson_series`, `lessons` | enabled | **None** — deny-all to anon and authenticated, by design. Shared content is served only through the backend (`GET /lessons/...`) on service_role. |

Notes on the two irregularities, both deliberate to leave alone:

- **`user_settings` on role `public`**: `public` means *every* role, including `anon`.
  Harmless in practice — an anon caller has `auth.uid() = NULL`, and `NULL = user_id`
  is never true, so no rows come back. It is loose scoping, not an opening. The
  missing `DELETE` policy likewise doesn't matter: account deletion runs through the
  backend on service_role.
- **`relforcerowsecurity = false` everywhere**: the Supabase default. FORCE only
  affects connections made *as the table owner*; PostgREST connects as
  `anon`/`authenticated`/`service_role`, never the owner, so it changes nothing for
  the app. **Do not enable it** — lesson content is loaded manually through the
  Supabase dashboard, and forcing RLS risks those admin queries returning filtered or
  empty results.

Confirmed empirically: with the anon key, `expenses`, `income`,
`savings_transactions`, `savings_goals` and `lesson_ratings` all return **0 rows**
while actually holding data (126 / 50 / 65 / 54 / 3 rows respectively).

To re-verify after any schema change:

```sql
-- Policies and the expression that enforces ownership
select tablename, policyname, roles, cmd, qual as using_expression, with_check
from pg_policies where schemaname = 'public' order by tablename, cmd;

-- RLS flags per table
select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by c.relname;
```

Every `using_expression` should read `(auth.uid() = user_id)`. A policy with
`USING (true)` would be a real hole.

## Supabase Client Setup

- Frontend: [frontend/lib/supabase.ts](../../frontend/lib/supabase.ts) — project URL and **anon** key are hardcoded in the file (not env vars); uses AsyncStorage as the session store. Subject to RLS.
- Backend: [backend/main.py](../../backend/main.py) top of file — URL and `SUPABASE_KEY` from `.env`. That key is the **service_role** key (required by `auth.admin.delete_user`), so it **bypasses RLS** — which is why authorization must live in the route dependencies.
