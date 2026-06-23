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

Balance = `SUM(amount WHERE type='deposit') - SUM(amount WHERE type='withdrawal')`, computed in `GET /savings/balance/`. Persists across months (not reset monthly).

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
| `is_general` | bool | Default false; exactly one General Savings pool per user |
| `goal_type` | text | `"saving"` (default) or `"debt"`. Debt goals behave identically to savings goals — same allocation math (`allocated_amount / target_amount`), same transactions, same transfer support. Only the Goals-tab grouping/labels differ. |
| `created_at` | timestamp | |

A goal's funded amount is computed (not stored) as `SUM(deposits) - SUM(withdrawals)` over `savings_transactions` with that `goal_id` (`_with_allocated` in `main.py`). Debt payments are just deposits with `source='income'`, so they count toward the Goals 20% budget exactly like savings deposits.

## Budget Calculation

Computed server-side in [backend/main.py](../../backend/main.py) lines ~53–55 from the month's total income:

```
needs_budget  = total_income * 0.50
wants_budget  = total_income * 0.30
goals_budget  = total_income * 0.20
```

## Category Name Mismatch

The dashboard's 50/30/20 split shows **"Needs / Wants / Goals"**, and the DB stores expense categories with those same plural names (`Needs`/`Wants`/`Goals`) — they match. The Goals bucket total = historical `Goals` expenses + income-sourced savings deposits (`savings_transactions` where `type='deposit'` AND `source='income'`); transfers between goals (`source='transfer'`) are excluded so they don't double-count. (Note: earlier docs described the categories as `Need/Want/Savings/Debt` — that was never the stored reality; see the audited values above.)

## Supabase Client Setup

- Frontend: [frontend/lib/supabase.ts](../../frontend/lib/supabase.ts) — initialized with `EXPO_PUBLIC_SUPABASE_URL` and anon key; uses AsyncStorage as the session store
- Backend: [backend/main.py](../../backend/main.py) top of file — initialized with URL and service/anon key from `.env`
