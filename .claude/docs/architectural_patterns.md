# Architectural Patterns

## Authentication Flow

Auth state lives in a single React Context. Every screen reads from it via `useAuth()`.

- Context defined in [frontend/context/AuthContext.tsx](../../frontend/context/AuthContext.tsx) — exposes `{ user, session, initialized }`
- Supabase session is restored from AsyncStorage on app open via `getSession()`, then kept live with `onAuthStateChange()`
- Root layout [frontend/app/_layout.tsx](../../frontend/app/_layout.tsx) — "bouncer": a logged-out user goes to `/onboarding` (only `/auth` and `/onboarding` are reachable); a signed-in account that has not done the onboarding, or the dev replay, goes to `/onboarding` in signed-in mode; a signed-in user is never moved *off* `/onboarding` (the flow leaves by itself). See Onboarding below
- Auth screen [frontend/app/auth.tsx](../../frontend/app/auth.tsx) — email/password login and signup, Google, Apple; a "New here?" link back to the onboarding. The flows themselves are in [frontend/lib/authActions.ts](../../frontend/lib/authActions.ts), shared with the onboarding's sign-up screen
- **PostHog identity**: `identify(user.id)` on every session; `reset()` only on a real `SIGNED_OUT`. A launch with no session must not reset, or the onboarding's anonymous pre-sign-up events would be orphaned instead of linked to the new account

**Convention**: never import `supabase` directly in screens for auth checks — always use `useAuth()`.

---

## Backend API Calls

All backend calls use Axios with a hardcoded base URL.

- Pattern used in: [frontend/app/(tabs)/index.tsx](../../frontend/app/(tabs)/index.tsx), [frontend/components/expense/ExpenseContainer.jsx](../../frontend/components/expense/ExpenseContainer.jsx), [frontend/components/income/IncomeContainer.jsx](../../frontend/components/income/IncomeContainer.jsx), [frontend/app/details.tsx](../../frontend/app/details.tsx)
- Current base URLs: `http://10.0.0.13:8000` (phone on LAN) or `http://127.0.0.1:8000` (desktop)
- All POST requests include header `'ngrok-skip-browser-warning': 'true'`
- `user_id` from `useAuth()` is still sent by most call sites (query param on GET, body on POST). It is **legacy and inert** — the backend ignores it and uses the token instead. New code need not send it.
- Errors are caught and `console.error`'d; no UI feedback to the user today

---

## API Authentication

The backend authenticates **every** request (only `GET /` is public) from the Supabase
access token. Identity is the token's verified `sub` claim — never a client-supplied
`user_id`.

- **Frontend**: an axios request interceptor in [frontend/lib/axiosConfig.ts](../../frontend/lib/axiosConfig.ts) attaches `Authorization: Bearer <access_token>` to every request aimed at the backend host. It reads the token fresh per request via `supabase.auth.getSession()` (which refreshes an expired one), and retries once after a 401. **Nothing needs doing at the call site** — screens keep calling the bare `axios` singleton.
- The interceptor deliberately attaches the token **only** to the backend host, so Sentry, PostHog and Supabase Storage playback URLs never see a user credential.
- **Backend**: the `get_current_user_id` dependency in [backend/main.py](../../backend/main.py) verifies the JWT and returns the user id. Every protected route takes `user_id: str = Depends(get_current_user_id)`.
- **How the signature is checked**: the project's Supabase JWT signing key is **ECC P-256**, so access tokens are **ES256**. They are verified against the project's public keys from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cached in-process for an hour — no network call per request, and **no secret to configure**. If the JWKS fetch fails, the cached client is dropped and that request falls back to `supabase.auth.get_user()` so a blip can't lock the whole app out.
- The verifier always passes a **fixed algorithm allowlist** — never the token's own `alg` — and only ever hands the JWKS public key to asymmetric algorithms. That is what makes an HS256-token-signed-with-the-public-key forgery impossible.
- **Adding a route**: it must take that dependency. Anything reaching the database must use the injected `user_id`, not a value off the request model — the Supabase client uses the **service_role** key, which bypasses RLS, so this file is the only access control there is.
- Tests in [backend/tests/](../../backend/tests/) enforce both halves; `test_every_protected_route_is_in_the_table` fails if a new route ships without security coverage.
- **Env vars**: none new. `SUPABASE_JWT_SECRET` is an optional dormant escape hatch for a rollback to a legacy HS256 shared secret; this project's HS256 key is already rotated out, so leave it unset. `PyJWT[crypto]` in `requirements.txt` is required — plain `PyJWT` cannot verify ES256.

---

## Database Queries (Backend)

All Supabase queries are in [backend/main.py](../../backend/main.py) using the Python Supabase client.

- Every query filters by `user_id` for tenant isolation — and that `user_id` must come from `Depends(get_current_user_id)` (see API Authentication above), never from the request
- Query style: `.table(name).select(...).eq("user_id", uid).eq(...)`
- Month values are stored as month-name strings (e.g., `"April"`), not numbers
- Budget percentages (50/30/20) are computed in Python from total income — see `main.py:53-55`
- Expense totals per category are summed in Python after fetching rows

---

## Theming

All screens and components consume design tokens via `useTheme()` — never hardcode colors.

- Hook: `const { theme, isDark, toggleTheme } = useTheme()` from [frontend/context/ThemeContext.tsx](../../frontend/context/ThemeContext.tsx)
- `AppThemeProvider` wraps the app in [frontend/app/_layout.tsx](../../frontend/app/_layout.tsx)
- Apply tokens inline: `style={{ backgroundColor: theme.surface, color: theme.text }}`
- Full token list and Button API: [design_system.md](./design_system.md)
- **Dark mode is currently disabled** — `isDark` is always `false` and `toggleTheme()` is inert. See `FORCE_LIGHT_MODE` in `ThemeContext.tsx` and the Dark Mode section of [design_system.md](./design_system.md)

---

## Form Pattern

Both expense and income forms follow the same structure.

- Container component manages all form state and submission: [frontend/components/expense/ExpenseContainer.jsx](../../frontend/components/expense/ExpenseContainer.jsx), [frontend/components/income/IncomeContainer.jsx](../../frontend/components/income/IncomeContainer.jsx)
- Shared primitives: [frontend/components/ui/InputField.jsx](../../frontend/components/ui/InputField.jsx), [frontend/components/ui/Dropdown.jsx](../../frontend/components/ui/Dropdown.jsx)
- Both primitives are theme-aware — no style props needed from callers
- Submit button uses `variant="primary" size="lg" fullWidth` — see [design_system.md#button-component](./design_system.md#button-component)
- On successful POST, all state fields are manually reset to `""` / `null`
- Validation: check all fields are non-empty before calling the API

---

## Savings / Piggy Bank

`SavingsContainer.jsx` follows the same pattern as `ExpenseContainer.jsx` — accepts a `transactionType` prop (`"deposit"` | `"withdrawal"`), manages form state locally, and POSTs to `/savings/transaction/`. The piggy bank balance is a cross-month aggregate (`GET /savings/balance/`) fetched separately from the monthly dashboard endpoint.

## Home (Dashboard)

[frontend/app/(tabs)/index.tsx](../../frontend/app/(tabs)/index.tsx) is layout only, built around the Core Journey (Analyze → Plan → Envision). State and requests live in [components/home/useHomeData.ts](../../frontend/components/home/useHomeData.ts); every piece is in [components/home/](../../frontend/components/home/).

- `useFocusEffect` (not `useEffect`) refetches on every focus: `/dashboard/{month}` plus `GET /home/summary/` ([lib/homeSummary.ts](../../frontend/lib/homeSummary.ts)). The summary never blocks the screen — if it fails, the home renders without its parts
- `GET /home/progress/` ([lib/homeProgress.ts](../../frontend/lib/homeProgress.ts)) is fetched alongside them for the Envision dashboard ([components/home/EnvisionDashboard.tsx](../../frontend/components/home/EnvisionDashboard.tsx)). Same rule: if it fails (or the backend predates it) the dashboard is hidden and the rest of the band renders
- Month is a 0–11 index, picked from a bottom sheet opened by tapping the date
- Every debt element is behind `DEBT_FREEDOM_ENABLED`, the `debt_freedom` allowance being `full` (Debt Freedom is premium — `useDebtFreedomAccess` in [lib/debtFreedomAccess.ts](../../frontend/lib/debtFreedomAccess.ts)), **and** at least one active debt; the client computes nothing about debts. A `none` / `read_only` user gets `DebtFreedomTeaser` in the next payment's place instead
- Logging is on the home: the + buttons open `app/logExpense.tsx` / `app/logIncome.tsx`. There is no Transactions tab. Bank-connected logging is a placeholder in [lib/bankTransactions.ts](../../frontend/lib/bankTransactions.ts) — wiring Plaid only touches that file

---

## Onboarding

[ONBOARDING_REWORK.md](../../ONBOARDING_REWORK.md). A conversation with Benny (the coin mascot,
`assets/images/mascot/`) that replaces the old 4-step tour. Route:
[frontend/app/onboarding.tsx](../../frontend/app/onboarding.tsx) (orchestration only); screens in
[frontend/components/onboarding/](../../frontend/components/onboarding/).

| File | Role |
|------|------|
| [lib/onboardingFlow.ts](../../frontend/lib/onboardingFlow.ts) | Pure: the step list, debt-before-goal ordering (screen 4), signed-in skips, progress, back, `resumeStep` |
| [lib/onboardingWrites.ts](../../frontend/lib/onboardingWrites.ts) | Pure: the ordered, retry-safe writes (name → tithe → income → expense → debt → goal) |
| [lib/onboardingApi.ts](../../frontend/lib/onboardingApi.ts) | The preview call, signed-in facts, and the six writes through the existing routes |
| [lib/onboardingStore.ts](../../frontend/lib/onboardingStore.ts) | AsyncStorage: saved answers (device-level), completion cache, home hint flag |
| [context/OnboardingContext.tsx](../../frontend/context/OnboardingContext.tsx) | `status` (needed / done) and the dev `replay` |
| `npm run verify-onboarding` | Unit tests for the two pure modules |

- **Two modes.** `new` (logged out): answers wait on the phone; sign-up (screen 19) creates the
  account, then the plan is written. `signed_in`: any account without the completion flag (every
  pre-rework account, once — no release-date cutoff) or the dev replay; steps whose data the
  account already has are skipped and each answer is written as it is given.
- **Completion lives on the account**: `user_metadata.onboarding_v2_completed_at` via
  `supabase.auth.updateUser` (no migration), cached in AsyncStorage
  (`onboarding_v2_completed_<userId>`). A cache with no metadata (the write failed offline)
  pushes it up on the next launch. The name is `user_metadata.first_name`.
- **Saved answers** (`onboarding_v2_state`, device-level): answers, current step, each write's
  state, the starting mode. Saved after every change, so a kill resumes on the same step
  (`resumeStep`: the saved step, or the first earlier unanswered one, or the next that still
  applies). Cleared when the flow ends.
- **Retry-safe writes.** Each item is saved `started` before its request and `done` after. A
  resumed `started` item is first checked on the server (`exists`: same income amount/source this
  month, same expense, a debt/goal of the same name) so a lost response never duplicates it. A
  refusal no retry can change (`debt_freedom_locked` for a free account that already had a debt,
  the free goal cap, a goal title already taken) is `skipped`. A failure shows Benny's "I couldn't
  save your plan just yet" with Try again; nothing is lost.
- **Email confirmation.** If sign-up returns no session (the project requires confirmation),
  screen 19 asks the user to tap the link, then signs in with what they typed (memory only).
  The answers stay on the phone throughout; signing in later through `/auth` also writes them.
- **Numbers** come from `POST /onboarding/preview/` (data_model.md), or in signed-in mode with
  this month's income already logged, from the account's own `/dashboard/{month}`. The goal step
  renders `GoalForm` with `requireAll`, `onSubmitValues` (hand back, don't POST) and a
  `budgetContext` from the preview.
- **Paywall**: screen 20 calls `openPaywallWith({headline, subtitle})`; the root `PaywallSheet`
  takes optional `headline` / `subtitle` props, unset everywhere else.
- **The root layout's spinner gate is boot-only.** Once the navigator has rendered it is never
  swapped back, because sign-up makes the onboarding flag `unknown` for a moment and unmounting
  the flow then would cut its writes off.
- **Home hint**: the last screen sets `home_plus_hint_<userId>` = `pending`;
  [components/home/BennyHint.tsx](../../frontend/components/home/BennyHint.tsx) shows once.
- **Analytics** (`lib/analytics.ts`): `onboarding_step_viewed` / `_completed` {step, group, mode},
  the answers to screens 4, 5, 10, 11, 14 as category keys, `onboarding_completed` with
  `$set: {onboarding_version: 'v2'}`. Never an amount.

## Navigation

Expo Router maps the file tree to routes.

- [frontend/app/(tabs)/](../../frontend/app/(tabs)/) — bottom tab group; tab config in `_layout.tsx`
- Route params passed via `router.push({ pathname, params })` and read with `useLocalSearchParams()`
- [frontend/app/details.tsx](../../frontend/app/details.tsx) receives `category`, `month`, and `type` params to show filtered items
- `Stack` used for modal-style screens; `Tabs` for persistent bottom nav

**Tab bar** — the default Expo tab bar is replaced by `CustomTabBar` (floating pill, Reanimated spring). It is registered in `_layout.tsx` via `screenOptions={{ tabBar: (props) => <CustomTabBar {...props} /> }}`. Do **not** use `tabBarStyle`, `tabBarIcon`, or `tabBarActiveTintColor` on individual tab screens — those target the old bar which is no longer rendered.
