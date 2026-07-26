# Task: Fix Critical API Authorization Vulnerability in DollarSeeds

**You are Opus 5 running inside the Claude Code VS Code extension.** Your job is to fix a
critical, launch-blocking security vulnerability in the DollarSeeds backend API and the
frontend that calls it. Read this entire document first. **Produce a written plan before you
change any code**, and **write tests that prove both that the vulnerability is closed and that
every existing app feature still works.** This is the app's first public release — there must be
no regressions to core functionality.

---

## 1. The app and its architecture (context)

DollarSeeds is a personal-finance / budgeting app (50/30/20 rule, faith-integrated).

- **Backend:** FastAPI (Python), single file `backend/main.py`, deployed on Render at
  `https://dollarseeds-1.onrender.com`. It talks to Supabase using a client created with
  `create_client(SUPABASE_URL, SUPABASE_KEY)` where **`SUPABASE_KEY` is the Supabase
  service_role key** (confirmed: the account-deletion route calls
  `supabase.auth.admin.delete_user(...)`, which only works with service_role).
- **Database & Auth:** Supabase (PostgreSQL + Supabase Auth). Users authenticate with
  email/password, Sign in with Google, and Sign in with Apple. Row Level Security (RLS) is
  enabled on the user tables.
- **Frontend:** React Native / Expo (TypeScript). It calls the backend with `axios`. The base
  URL is hardcoded as `const BASE = 'https://dollarseeds-1.onrender.com'` across screens.
  Global axios config is in `frontend/lib/axiosConfig.ts`; the Supabase client is in
  `frontend/lib/supabase.ts`; auth/session state is in `frontend/context/AuthContext.tsx`.

---

## 2. The vulnerability (in detail)

The backend API has **no authentication at all**, and it **trusts a `user_id` value supplied by
the caller** to decide whose data to act on.

Concretely:

1. **The backend uses the service_role key, which bypasses Row Level Security entirely.**
   RLS being enabled on the tables provides **zero protection** for anything accessed through
   the backend, because service_role is an admin key that ignores all RLS policies. All access
   control therefore has to live in the backend code — and currently there is none.

2. **No endpoint verifies the identity of the caller.** There is no JWT/token verification, no
   auth dependency, no API key — nothing. CORS is wide open (`allow_origins=["*"]`,
   `allow_headers=["*"]`).

3. **Every route takes `user_id` as a plain request parameter or request-body field and trusts
   it.** For example:
   - `GET /dashboard/{current_month}?user_id=<ANY_ID>` returns that user's full financial
     dashboard.
   - `GET /income/details/?user_id=<ANY_ID>`, `GET /savings/balance/?user_id=<ANY_ID>`, etc.
     return other users' financial data.
   - `POST /expenses/`, `POST /income/`, `POST /savings/transaction/` etc. accept a `user_id`
     in the body and write data as that user.
   - `DELETE /expenses/delete/{id}?user_id=<ANY_ID>`, `DELETE /savings/goal/{id}`, etc. delete
     other users' records.
   - **`POST /account/delete/`** reads `user_id` from the request body and deletes that account
     and all of its data — meaning an unauthenticated attacker can **permanently destroy any
     user's account.**

**Impact:** Anyone on the internet who knows (or obtains) a user's `user_id` can read, modify,
or delete that user's sensitive financial data — with no login. This is a textbook **Broken
Object Level Authorization (BOLA / IDOR)** flaw. For an app holding real people's income,
spending, savings, and faith-related (tithing) data, this is the most severe class of bug and
must be fixed before public launch.

---

## 3. The required fix (what "secure" means here)

Identity must come from a **cryptographically verified token**, not from a value the client can
freely set. The app already has this token after login — it just isn't being sent or checked.

### The specific tokens involved

- After a user logs in, Supabase issues a **session** containing an **`access_token`** and a
  **`refresh_token`**.
  - The **`access_token` is a signed JWT** (HS256, signed with the project's **Supabase JWT
    secret**). Its `sub` claim is the user's UUID — i.e., the authoritative `user_id`.
  - The `refresh_token` is used by the client only, to obtain a new access_token when it
    expires; it is **not** sent to the backend.
- **The backend must require and verify the `access_token` (JWT) on every protected request,
  and take the `user_id` from the token's verified `sub` claim.**

### Frontend requirement

- On **every** axios request to the backend, attach the current Supabase access token as an
  HTTP header:  `Authorization: Bearer <access_token>`.
- Implement this **centrally** (an axios request interceptor in `frontend/lib/axiosConfig.ts`)
  rather than editing every call site. The interceptor should fetch the current session/token
  from the Supabase client (e.g. `supabase.auth.getSession()`) and set the header. Handle the
  token-refresh case so an expired token doesn't break requests (Supabase auto-refreshes; read
  the fresh token per request).
- Stop relying on sending `user_id` for identity. (You may leave `user_id` in payloads during
  transition, but the backend must ignore it for authorization — see below.)

### Backend requirement

- Add a **FastAPI dependency** (e.g. `get_current_user_id`) that:
  1. Reads the `Authorization: Bearer <token>` header (reject with **401** if missing).
  2. **Verifies the JWT.** Two acceptable approaches — pick one and justify it in your plan:
     - **Local verification** with the project's **Supabase JWT secret** (env var, e.g.
       `SUPABASE_JWT_SECRET`), validating signature, expiry, and audience. Fast, no network
       call per request. (Recommended.)
     - **Remote verification** via `supabase.auth.get_user(token)`. Simpler but adds a network
       round-trip per request.
  3. Extracts the user's UUID from the verified token's `sub` claim and returns it.
  4. Rejects invalid/expired/tampered tokens with **401**.
- **Apply this dependency to every protected route**, and use the **verified** `user_id`
  everywhere the code currently uses the client-supplied one. The client-supplied `user_id`
  (query param or Pydantic body field) must **no longer be trusted** for authorization — either
  remove it or override it with the verified value.
- `POST /account/delete/` and every destructive route must only ever act on the **token's own
  user**, never an arbitrary `user_id`.
- Keep the service_role key for legitimate admin operations (e.g. `auth.admin.delete_user`), but
  only after the token is verified and only for the authenticated user's own account.
- Decide which routes, if any, are legitimately public (e.g. shared lesson content that isn't
  user-specific) and document that decision. Everything touching user financial data is
  protected.

### Deployment coordination (important)

Because the app currently sends no token and the backend currently requires none, the frontend
and backend changes are coupled: once the backend **requires** a valid token, any app build that
doesn't send one will break. The secure backend and the secure app build must go out together.
The app is **not yet publicly released** (it is Pending Developer Release on the App Store), so
there are no production users to migrate — ship both together in the release build. Note this in
your plan.

### Defense-in-depth (recommended, secondary)

In addition to backend auth, add correct **RLS policies** on the user tables as a second layer.
Note clearly in your plan that RLS alone does **not** fix this vulnerability while the backend
uses the service_role key — it is only a safety net, not the primary fix.

---

## 4. What you (Opus 5) must do

1. **Investigate** `backend/main.py` and the frontend axios usage fully before proposing changes.
2. **Write a plan first** — enumerate every endpoint, how it currently gets `user_id`, and how it
   will get the verified `user_id`; the frontend interceptor approach; the JWT-verification
   approach you chose and why; env vars needed (e.g. `SUPABASE_JWT_SECRET`); and the
   deploy-together coordination. Do not start editing until the plan is written down.
3. **Implement** the backend auth dependency and apply it to all protected routes; add the
   frontend axios `Authorization` interceptor; add RLS policies as defense-in-depth.
4. **Write tests** — this is mandatory and the acceptance bar:
   - **Positive/regression tests:** every existing app operation (dashboard load, add/edit/delete
     income, expenses, savings transactions, goals, starting balance, settings, rollover, lesson
     ratings, account deletion, etc.) still works **when a valid token is provided.** The goal is
     to guarantee the initial release's core functionality is fully intact — no feature broken.
   - **Negative/security tests:** requests with **no token** are rejected (401); requests with an
     **invalid/expired/tampered token** are rejected (401); a request with a valid token but a
     **different user's `user_id`** in the params/body **cannot** read or modify that other
     user's data (the backend must use the token's user, not the supplied one). Include a test
     that a user cannot delete another user's account.
   - Run the tests and make them pass. Also run the frontend type-check (`npx tsc --noEmit`).
5. **Report** what changed, how to configure the new env var(s), and the exact deploy order.

## 5. Hard constraints

- **No regressions.** This is the first public release; every existing feature must keep working
  for the authenticated user. Do not break the app to secure it — prove both with tests.
- Do not weaken the fix with security-through-obscurity (e.g. a static API key baked into the
  app). Identity must come from the verified Supabase JWT.
- Keep changes focused on this vulnerability; don't refactor unrelated code.
- If anything about the intended behavior is ambiguous, state your assumption in the plan and
  choose the secure default.

## 6. Key files

- `backend/main.py` — all API routes and the Supabase client (service_role).
- `frontend/lib/axiosConfig.ts` — global axios config; add the request interceptor here.
- `frontend/lib/supabase.ts` — Supabase client (source of the session/access_token).
- `frontend/context/AuthContext.tsx` — holds session state; reference for how the token is obtained.
- Frontend screens making axios calls (dashboard, transactions, savings/piggyBank, details,
  settings, lessons, onboarding StartingBalanceGate, etc.) — should need no per-call change if the
  interceptor is centralized, but verify.
- Supabase project ref: `vbvsblpyeylnemrecyqv` (for RLS policies / JWT secret configuration).
