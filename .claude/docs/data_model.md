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

### `subscriptions`

One row per **store subscription**, not per user — a user can hold an App Store and a
Play Store subscription at once, and TestFlight sandbox rows coexist with production
ones. Written **only** by `POST /webhooks/revenuecat`. Migration:
[backend/migrations/0005_subscriptions.sql](../../backend/migrations/0005_subscriptions.sql).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `user_id` | uuid | Supabase user id == RevenueCat App User ID (the app calls `Purchases.logIn(user.id)`). **No FK** — see below. |
| `store` | text | `app_store` \| `play_store` |
| `environment` | text | `sandbox` \| `production` |
| `store_txn_id` | text | `coalesce(original_transaction_id, transaction_id, original_app_user_id)`. Google often omits the first; a NULL here would let unlimited duplicate rows accumulate, since NULLs never collide in a unique index. |
| `product_id` | text | Which tier. **Reporting only — never access logic.** All eight products grant the same entitlement. |
| `pending_product_id` | text | A crossgrade the user has selected but which has not taken effect yet |
| `expires_at` | timestamptz | **The access horizon.** The only column entitlement reads. |
| `revoked_at` | timestamptz | Set on refund/pause; kills access immediately |
| `auto_renew` / `cancelled_at` / `status` | bool / timestamptz / text | **Descriptive only** — support and the paywall's "Current: …" line. Access never reads them. |
| `last_event_id` / `last_event_at` | text / timestamptz | Newest event applied; `last_event_at` is what makes the write monotonic |

`unique (store, environment, store_txn_id)` is the identity. `environment` is in the key
because Apple's sandbox and production transaction-id namespaces **overlap** — without
it a TestFlight purchase can collide with a real one. `user_id` is deliberately *not* in
the key, so a `TRANSFER` event can re-point a row instead of duplicating it.

**Entitlement is `expires_at > now() AND revoked_at IS NULL`** — `_has_premium` in
`main.py`. Deliberately not driven by `status`: RevenueCat delivers a refund as a
`CANCELLATION`, and a cancellation that merely turns auto-renew off must *not* revoke
access, since the user paid for the period. One status string cannot express both, so
`expires_at` carries it — RevenueCat moves that value forward when Apple extends a grace
period and back to the refund moment when money is returned.

**No foreign key to `auth.users`,** matching every other table here. An FK would make a
webhook arriving after account deletion raise a violation → 500 → 72h of RevenueCat
retries. Without it the row is simply orphaned, which is the wanted outcome: it is the
audit trail for a refund on a deleted account, and it is invisible to every query (all
filter by `user_id`). `subscriptions` *is* in `USER_DATA_TABLES`, so deletion clears it —
but note that does **not** cancel the store subscription; the user must do that in the
App Store, and the delete-account screen says so (App Review guideline 5.1.1(v)).

### `subscription_events`

Append-only audit log of every RevenueCat webhook, keyed by their `event_id` (PK).
**Deliberately not load-bearing:** PostgREST has no cross-table transaction, so nothing
may depend on both this insert and the `subscriptions` write landing together.
Idempotency lives in the conditional update on `subscriptions`
(`where <identity> and (last_event_at is null or last_event_at < :event_at)`), which
makes a duplicate delivery and a stale out-of-order delivery both match zero rows,
atomically. This table only answers "what did RevenueCat tell us, and when".

### `app_config`

`key` (PK) / `value` / `updated_at`. Three rows: `premium_enabled`,
`min_supported_version`, `update_url`. Served by the public `GET /config/`, cached 60s
in-process, and **failing open** to `premium_enabled=false` if the read throws.

A table rather than env vars on purpose: the kill switch flips with one `UPDATE` in the
Supabase dashboard — no Render redeploy, and the lever still works when a bad deploy is
what broke things. **This is the rollback lever** for the premium feature.

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
| `subscriptions`, `subscription_events`, `app_config` | enabled | **None** — same posture. Entitlement is served only through `GET /me/entitlements/`; letting the anon key read `subscriptions` directly would expose who pays. Added by migration `0005`. |

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
