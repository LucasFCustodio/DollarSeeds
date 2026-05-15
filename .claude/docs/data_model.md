# Data Model

## Supabase Tables

### `expenses`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid | Foreign key to auth.users; all queries filter by this |
| `title` | text | Expense name |
| `amount` | numeric | Expense amount |
| `category` | text | One of: `"Need"`, `"Want"`, `"Savings"`, `"Debt"` |
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

## Budget Calculation

Computed server-side in [backend/main.py](../../backend/main.py) lines ~53–55 from the month's total income:

```
needs_budget  = total_income * 0.50
wants_budget  = total_income * 0.30
goals_budget  = total_income * 0.20
```

## Category Name Mismatch

The frontend displays **"Needs / Wants / Goals"** but the backend/DB stores **"Need / Want / Savings / Debt"**. The dashboard endpoint maps `Savings` and `Debt` into the `goals` bucket. Keep this in mind when adding new category logic.

## Supabase Client Setup

- Frontend: [frontend/lib/supabase.ts](../../frontend/lib/supabase.ts) — initialized with `EXPO_PUBLIC_SUPABASE_URL` and anon key; uses AsyncStorage as the session store
- Backend: [backend/main.py](../../backend/main.py) top of file — initialized with URL and service/anon key from `.env`
