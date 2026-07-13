-- 0004 — snapshot what a goal actually held when it was completed.
--
-- Completing a goal withdraws its funded amount, which drives the computed
-- allocated_amount (deposits − withdrawals) to 0. Without a snapshot the Completed
-- tab can only render "$0 of $2,825", which reads as a bug. POST /savings/goal/{id}/finish
-- stores the withdrawn amount here so the card can say "$2,825 saved".
--
-- Both nullable: goals completed before this migration keep NULL and the UI falls
-- back to allocated_amount.
-- Applied to project vbvsblpyeylnemrecyqv on 2026-07-13.

alter table public.savings_goals
  add column if not exists completed_amount numeric,
  add column if not exists completed_at     timestamptz;
