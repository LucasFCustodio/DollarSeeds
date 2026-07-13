-- 0003 — allow source='opening' on savings_transactions.
--
-- 'opening' books the savings a user already had BEFORE they started using the app
-- (captured once, right after onboarding, by POST /savings/starting-balance/).
-- Like 'rollover', it is excluded from the budget math — those paths allowlist
-- source='income' — so pre-app money never consumes the Goals budget.
--
-- Additive only: every existing row already satisfies the widened constraint.
-- Applied to project vbvsblpyeylnemrecyqv on 2026-07-13.

alter table public.savings_transactions
  drop constraint savings_transactions_source_check;

alter table public.savings_transactions
  add constraint savings_transactions_source_check
  check (source = any (array['income'::text, 'transfer'::text, 'rollover'::text, 'opening'::text]));
