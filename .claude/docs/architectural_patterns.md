# Architectural Patterns

## Authentication Flow

Auth state lives in a single React Context. Every screen reads from it via `useAuth()`.

- Context defined in [frontend/context/AuthContext.tsx](../../frontend/context/AuthContext.tsx) — exposes `{ user, session, initialized }`
- Supabase session is restored from AsyncStorage on app open via `getSession()`, then kept live with `onAuthStateChange()`
- Root layout [frontend/app/_layout.tsx](../../frontend/app/_layout.tsx) — "bouncer" redirects unauthenticated users to `/auth` before rendering tabs
- Auth screen [frontend/app/auth.tsx](../../frontend/app/auth.tsx) — handles email/password login, signup, and Google OAuth

**Convention**: never import `supabase` directly in screens for auth checks — always use `useAuth()`.

---

## Backend API Calls

All backend calls use Axios with a hardcoded base URL.

- Pattern used in: [frontend/app/(tabs)/index.tsx](../../frontend/app/(tabs)/index.tsx), [frontend/components/expense/ExpenseContainer.jsx](../../frontend/components/expense/ExpenseContainer.jsx), [frontend/components/income/IncomeContainer.jsx](../../frontend/components/income/IncomeContainer.jsx), [frontend/app/details.tsx](../../frontend/app/details.tsx)
- Current base URLs: `http://10.0.0.13:8000` (phone on LAN) or `http://127.0.0.1:8000` (desktop)
- All POST requests include header `'ngrok-skip-browser-warning': 'true'`
- `user_id` from `useAuth()` is always sent — as a query param on GET, in the request body on POST
- Errors are caught and `console.error`'d; no UI feedback to the user today

---

## Database Queries (Backend)

All Supabase queries are in [backend/main.py](../../backend/main.py) using the Python Supabase client.

- Every query filters by `user_id` for tenant isolation
- Query style: `.table(name).select(...).eq("user_id", uid).eq(...)`
- Month values are stored as month-name strings (e.g., `"April"`), not numbers
- Budget percentages (50/30/20) are computed in Python from total income — see `main.py:53-55`
- Expense totals per category are summed in Python after fetching rows

---

## Form Pattern

Both expense and income forms follow the same structure.

- Container component manages all form state and submission: [frontend/components/expense/ExpenseContainer.jsx](../../frontend/components/expense/ExpenseContainer.jsx), [frontend/components/income/IncomeContainer.jsx](../../frontend/components/income/IncomeContainer.jsx)
- Shared primitives: [frontend/components/ui/InputField.jsx](../../frontend/components/ui/InputField.jsx) (label + text input), [frontend/components/ui/Dropdown.jsx](../../frontend/components/ui/Dropdown.jsx)
- On successful POST, all state fields are manually reset to `""` / `null`
- Validation: check all fields are non-empty before calling the API

---

## Savings / Piggy Bank

`SavingsContainer.jsx` follows the same pattern as `ExpenseContainer.jsx` — accepts a `transactionType` prop (`"deposit"` | `"withdrawal"`), manages form state locally, and POSTs to `/savings/transaction/`. The piggy bank balance is a cross-month aggregate (`GET /savings/balance/`) fetched separately from the monthly dashboard endpoint; the dashboard calls both in parallel via `Promise.all`.

## Dashboard Data Refresh

[frontend/app/(tabs)/index.tsx](../../frontend/app/(tabs)/index.tsx) uses `useFocusEffect` (not `useEffect`) so data refreshes every time the tab is opened.

- Month is tracked as a 0–11 index; previous/next buttons wrap around
- API returns `{ total_income, budgets: { needs, wants, goals }, expenses: { ... } }`
- Progress bars show `(spent / budget) * 100%`; values over 100% render red

---

## Navigation

Expo Router maps the file tree to routes.

- [frontend/app/(tabs)/](../../frontend/app/(tabs)/) — bottom tab group; tab config in `_layout.tsx`
- Route params passed via `router.push({ pathname, params })` and read with `useLocalSearchParams()`
- [frontend/app/details.tsx](../../frontend/app/details.tsx) receives `category`, `month`, and `type` params to show filtered items
- `Stack` used for modal-style screens; `Tabs` for persistent bottom nav
