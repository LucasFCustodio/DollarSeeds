# Analytics Queries (Supabase)

> **Financial amounts are analyzed here, never sent to PostHog.** PostHog holds only
> behavioral events (ids, categories, counts, video timing) — see [frontend/lib/analytics.ts](../../frontend/lib/analytics.ts).
> Every dollar figure below is derived from the source-of-truth Postgres tables via SQL.

Run these in the **Supabase dashboard → SQL editor** (or the authed Supabase MCP). They
use only columns that actually exist on the current schema:

- `expenses(user_id, amount, category, day, month, created_at)`
- `income(user_id, amount, day, month, created_at)`
- `savings_goals(user_id, goal_type, created_at, completed)`
- `auth.users(id, created_at, email)`

---

## 1. Expenses per user + overall total

```sql
-- Row per user: expense count + summed amount, plus a grand-total row.
select
  coalesce(user_id::text, 'ALL USERS') as user_id,
  count(*)                             as expense_count,
  sum(amount)                          as total_spent,
  round(avg(amount)::numeric, 2)       as avg_expense
from public.expenses
group by rollup (user_id)
order by total_spent desc nulls last;
```

## 2. Income entries per user

```sql
-- How many income entries each user logged, and the total they recorded.
select
  user_id,
  count(*)      as income_entries,
  sum(amount)   as total_income
from public.income
group by user_id
order by total_income desc;
```

## 3. Goals created, split by goal_type

```sql
-- Saving vs debt goals: how many of each, how many completed.
select
  goal_type,
  count(*)                             as goals_created,
  count(*) filter (where completed)    as goals_completed
from public.savings_goals
group by goal_type
order by goals_created desc;
```

## 4. Activation — users with ≥ 1 expense

```sql
-- Activation rate = signed-up users who logged at least one expense.
select
  count(distinct u.id)                                     as total_users,
  count(distinct e.user_id)                                as activated_users,
  round(100.0 * count(distinct e.user_id)
        / nullif(count(distinct u.id), 0), 1)              as activation_pct
from auth.users u
left join public.expenses e on e.user_id = u.id;
```

## 5. Signups over time

```sql
-- New users per week (swap 'week' for 'day' or 'month' as needed).
select
  date_trunc('week', created_at)::date as week,
  count(*)                             as signups
from auth.users
group by 1
order by 1;
```
