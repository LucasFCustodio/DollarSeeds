-- 0005 — Row Level Security policies (defense in depth).
--
-- READ THIS BEFORE ASSUMING THIS FILE FIXES ANYTHING.
--
-- This migration is NOT the fix for the missing-authorization vulnerability, and it
-- cannot be. The backend connects to Supabase with the SERVICE_ROLE key, which is an
-- admin credential that bypasses RLS entirely — every policy below is invisible to
-- backend/main.py. The actual fix is the verified-JWT auth dependency in
-- backend/main.py (`get_current_user_id`), which is what stops one user from reading
-- or destroying another user's data.
--
-- What this file IS for:
--   * The app's own Supabase client (lib/supabase.ts) holds the ANON key, and the anon
--     key IS subject to RLS. Without policies, a table left readable is readable by
--     anyone who has the key — and the anon key ships inside the app binary, so
--     "has the key" means "downloaded the app".
--   * Blast radius. If the backend ever accidentally runs on the anon key, or a future
--     feature queries Supabase directly from the client, ownership is still enforced
--     at the database.
--
-- Model: a row belongs to the user whose id matches auth.uid() (the `sub` of the
-- caller's JWT — the same claim the backend now trusts). Shared lesson content is
-- readable by any signed-in user and writable by nobody (content is loaded manually
-- via the Supabase dashboard, which uses service_role and ignores these policies).
--
-- Idempotent: safe to re-run. Apply to project vbvsblpyeylnemrecyqv.

-- ─── Per-user financial data ─────────────────────────────────────────────────
-- One policy per table covering all of SELECT/INSERT/UPDATE/DELETE. `using` gates
-- which existing rows are visible/affectable; `with check` gates what a row is
-- allowed to look like after an insert or update — without it a user could hand a
-- row over to someone else by writing a different user_id.

do $$
declare
  t text;
begin
  foreach t in array array[
    'expenses',
    'income',
    'savings_transactions',
    'savings_goals',
    'month_status',
    'lesson_ratings',
    'user_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    -- FORCE makes the policies apply even to the table's owner role. It does NOT
    -- affect service_role, which bypasses RLS at a higher level.
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_access', t);
    -- Both sides cast to text so the policy applies whether a given table's user_id
    -- is uuid (as expenses/income/savings_* are) or text. These are safety-net
    -- policies on small per-user tables; the cast's effect on planning is immaterial.
    execute format($f$
      create policy %I on public.%I
        for all
        to authenticated
        using (auth.uid()::text = user_id::text)
        with check (auth.uid()::text = user_id::text)
    $f$, t || '_owner_access', t);
  end loop;
end
$$;

-- ─── Shared lesson content ───────────────────────────────────────────────────
-- Not user-owned. Signed-in users may read published series and their lessons;
-- nobody may write. Note `lessons` exposes video_id (the object path in the PRIVATE
-- lesson-videos bucket) — the path alone grants no access, since streaming requires
-- a signed URL that only the backend can mint (GET /lessons/{id}/playback/).

alter table public.lesson_series enable row level security;
drop policy if exists lesson_series_read_published on public.lesson_series;
create policy lesson_series_read_published on public.lesson_series
  for select
  to authenticated
  using (is_published = true);

alter table public.lessons enable row level security;
drop policy if exists lessons_read_published on public.lessons;
create policy lessons_read_published on public.lessons
  for select
  to authenticated
  using (
    exists (
      select 1 from public.lesson_series s
      where s.id = lessons.series_id and s.is_published = true
    )
  );

-- ─── Verification ────────────────────────────────────────────────────────────
-- Expect rowsecurity = true for all nine tables:
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--     and tablename in ('expenses','income','savings_transactions','savings_goals',
--                       'month_status','lesson_ratings','user_settings',
--                       'lesson_series','lessons');
--
-- And one policy per table:
--   select tablename, policyname, cmd, roles from pg_policies
--   where schemaname = 'public' order by tablename;
