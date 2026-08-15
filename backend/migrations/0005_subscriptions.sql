-- ─────────────────────────────────────────────────────────────────────────────
-- 0005 — subscriptions + subscription_events + app_config (premium video lessons)
--
-- Applied via the Supabase dashboard SQL editor, like every migration here.
-- Purely ADDITIVE. Three new tables are invisible to the app binaries already in
-- the App Store; the one ALTER changes a DEFAULT only and rewrites no existing row.
--
-- What pre-migration rows fall back to: nothing to fall back to. All three tables
-- start empty, and "no row" is the correct and only representation of "this user
-- has never subscribed" — the entitlement query reads it as false. lesson_series
-- rows keep whatever is_premium they already have.
--
-- RLS parity with lesson_series/lessons: ENABLED with NO policies. The FastAPI
-- backend holds the service-role key and bypasses RLS; the anon key shipped inside
-- every app binary is denied outright. The app never reads these tables directly —
-- entitlement is served only through GET /me/entitlements/.
-- ─────────────────────────────────────────────────────────────────────────────

-- One row per STORE SUBSCRIPTION, not per user: a user can hold an App Store and a
-- Play Store subscription at once, and TestFlight sandbox rows coexist with real
-- production rows. Entitlement is EXISTS-over-rows, never "the user's row".
--
-- NOTE there is deliberately NO foreign key to auth.users. No table in this schema
-- declares one, and adding it here creates a new failure mode: a webhook arriving
-- after account deletion would raise an FK violation, return 500, and RevenueCat
-- would retry for 72h. Without it the row is simply orphaned — which is what we
-- want. It is the audit trail for a refund on a deleted account, and it is the row
-- a TRANSFER event re-points if the same Apple ID signs up again. Orphans are
-- invisible to every query, all of which filter by user_id.
create table if not exists public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,                        -- Supabase auth.users id == RevenueCat App User ID
  store              text not null,                        -- 'app_store' | 'play_store'
  environment        text not null default 'production',   -- 'sandbox' | 'production'
  store_txn_id       text not null,                        -- stable identity; see the index comment below
  product_id         text,                                 -- tier IN FORCE. Reporting only — NEVER access logic
  pending_product_id text,                                 -- crossgrade target; applied when the renewal fires
  expires_at         timestamptz,                          -- THE access horizon (from event.expiration_at_ms)
  revoked_at         timestamptz,                          -- set on refund; kills access immediately
  auto_renew         boolean not null default true,        -- false after CANCELLATION; does NOT affect access
  cancelled_at       timestamptz,
  status             text not null default 'active',       -- DESCRIPTIVE ONLY (support/reporting), never queried for access
  last_event_id      text,
  last_event_at      timestamptz,                          -- event_timestamp_ms of the newest event applied
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- store_txn_id = coalesce(original_transaction_id, transaction_id, original_app_user_id),
-- computed in the webhook handler. Apple always sends original_transaction_id; Google
-- often sends NULL for it. A NULL here would be catastrophic quietly: NULLs never
-- collide in a UNIQUE index, so every Android renewal would insert another duplicate
-- row forever and the upsert would never match.
--
-- environment is IN the key because Apple's sandbox and production transaction-id
-- namespaces OVERLAP. Without it a TestFlight purchase can collide with a real one.
create unique index if not exists subscriptions_identity_idx
  on public.subscriptions (store, environment, store_txn_id);

-- The exact shape of the entitlement query (rows for this user, still in date).
create index if not exists subscriptions_user_expiry_idx
  on public.subscriptions (user_id, expires_at);

-- Append-only audit log. Deliberately NOT load-bearing for correctness: PostgREST
-- offers no cross-table transaction, so nothing may depend on both this insert and
-- the subscriptions update landing together. Idempotency comes from the conditional,
-- monotonic update on subscriptions itself. This table answers "what did RevenueCat
-- actually tell us, and when" during a refund or a dispute.
create table if not exists public.subscription_events (
  event_id     text primary key,   -- RevenueCat event.id; retries reuse the same id
  event_type   text not null,
  app_user_id  text,
  store_txn_id text,
  payload      jsonb not null,
  received_at  timestamptz not null default now()
);

-- Server-side kill switch + force-update floor. A table rather than env vars so the
-- flag flips with one UPDATE in this dashboard: no Render redeploy, and — the point —
-- the lever still works when a bad deploy is what broke things.
create table if not exists public.app_config (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions       enable row level security;
alter table public.subscription_events enable row level security;
alter table public.app_config          enable row level security;

insert into public.app_config (key, value) values
  ('premium_enabled',       'false'),   -- ships DARK; rollout step 3 flips this to 'true'
  ('min_supported_version', '0.0.0'),   -- 0.0.0 blocks nobody; raise only for v3+
  ('update_url',            'https://apps.apple.com/app/id6780037284')
on conflict (key) do nothing;

-- New series must be premium unless deliberately made free. Content is inserted by
-- hand in the dashboard (see 0001), so a default of FALSE means the first forgotten
-- flag ships a paid series for free — and the never-retro-paywall rule makes that
-- permanent. Changing the DEFAULT rewrites no existing row: the published series
-- ("The Truth on Generosity") keeps is_premium = false and stays free forever.
alter table public.lesson_series alter column is_premium set default true;

-- Verify after applying:
--   select key, value from public.app_config order by key;
--   select title, is_premium from public.lesson_series order by sort_order;  -- both still false
--   select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname in
--          ('subscriptions','subscription_events','app_config');            -- all true
--   select tablename, count(*) from pg_policies where schemaname = 'public'
--    and tablename in ('subscriptions','subscription_events','app_config') group by tablename;  -- 0 rows

-- Applied to project vbvsblpyeylnemrecyqv on 2026-08-14.
