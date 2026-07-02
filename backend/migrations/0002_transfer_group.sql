-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: savings_transactions.transfer_group
--
-- A "General Savings → goal" transfer books TWO rows (a withdrawal from General
-- Savings and a deposit into the destination goal) so per-goal allocation math
-- stays correct while the overall balance is unchanged. Previously those two rows
-- surfaced as two separate entries in Recent Activity, which was confusing and let
-- a user delete one leg without the other (leaving the books inconsistent).
--
-- This column ties the two legs together. Recent Activity collapses a transfer_group
-- into ONE entry, and deleting that entry deletes BOTH legs (see backend/main.py:
-- transfer_from_general / get_savings_history / delete_savings_transaction).
--
-- Apply via the Supabase dashboard SQL editor (or authed MCP apply_migration), same
-- as 0001. NULL for every pre-existing row (non-transfer rows never get a group).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.savings_transactions
  add column if not exists transfer_group uuid;

create index if not exists savings_transactions_transfer_group_idx
  on public.savings_transactions (transfer_group);
