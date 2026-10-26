# Data Model

## Supabase Tables

### `expenses`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid | Foreign key to auth.users; all queries filter by this |
| `title` | text | Expense name |
| `amount` | numeric | Expense amount |
| `category` | text | Stored values (audited): `"Needs"`, `"Wants"`, `"Goals"`. New expenses are only ever `"Needs"` or `"Wants"`. `"Goals"` is the legacy "Investments" bucket — read-only for past months, never created anymore (debt/savings goals moved to `savings_goals`). A handful of orphaned `"Savings"` rows also exist but are read by no endpoint. |
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

### `savings_transactions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (identity PK) | |
| `user_id` | uuid | |
| `title` | text | e.g. "Emergency fund", "Bought the MacBook!" |
| `amount` | numeric | Always positive |
| `type` | text | `"deposit"` or `"withdrawal"` |
| `day` | integer | |
| `month` | text | Month name |
| `created_at` | timestamptz | Default NOW() |
| `source` | text | CHECK-constrained to `"income"` \| `"transfer"` \| `"rollover"` \| `"opening"`. **Only `income` counts toward the Goals budget** — every budget path allowlists it. `transfer` = moved between goals, `rollover` = month-end leftover, `opening` = savings the user had before joining (one row max per user, written by `POST /savings/starting-balance/`). Migration for `opening`: [backend/migrations/0003_opening_source.sql](../../backend/migrations/0003_opening_source.sql). |
| `transfer_group` | uuid | Nullable. Set only by `POST /savings/transfer/`, which writes **two** legs (a General Savings withdrawal + a destination-goal deposit) that share one `transfer_group`. `GET /savings/history/` collapses the pair into a single "Transfer from General Savings to X" entry (the withdrawal leg, flagged `is_transfer`), and deleting that entry deletes **both** legs. NULL for all non-transfer rows. Migration: [backend/migrations/0002_transfer_group.sql](../../backend/migrations/0002_transfer_group.sql). |

Balance = `SUM(amount WHERE type='deposit') - SUM(amount WHERE type='withdrawal')`, computed in `GET /savings/balance/`. Persists across months (not reset monthly).

A goal deposit is normally booked to the current `month`, but the Goals funding-source picker also lets a user fund from an **earlier open month** with leftover income — that deposit is written with `month` = the chosen month so it counts toward *that* month's Goals budget. `GET /income/funding-months/?user_id&current_month=` returns the eligible months (earlier in the calendar, not closed, income > $0).

### `savings_goals`

| Column | Type | Notes |
|--------|------|-------|
| `id` | int4 (PK) | |
| `user_id` | uuid | |
| `title` | text | Unique per user (enforced in backend) |
| `target_amount` | float8 | Nullable — null for General Savings |
| `target_month` | text | Deadline month name |
| `target_year` | int4 | Deadline year |
| `completed` | bool | Default false |
| `completed_amount` | numeric | Nullable. What the goal held the moment it was completed — see below |
| `completed_at` | timestamptz | Nullable. When it was completed |
| `is_general` | bool | Default false; exactly one General Savings pool per user |
| `goal_type` | text | `"saving"` (default) or `"debt"`. The Reconciliation goal is `"debt"`. User-created debt goals are **retired** for `limits` builds — see below. Old builds still create and fund them, unchanged. |
| `created_at` | timestamp | |

A goal's funded amount is computed (not stored) as `SUM(deposits) - SUM(withdrawals)` over `savings_transactions` with that `goal_id` (`_with_allocated` in `main.py`). A deposit into a legacy debt goal is an ordinary `source='income'` deposit, so it counts toward the Goals budget like any other — but Debt Freedom payments are **not** savings rows at all; see "Budget Calculation".

**Retired debt goals.** Debts live only on the Debts tab (`debts` / `debt_transactions`)
now. A *user* debt goal is `goal_type = 'debt'` and not `is_reconciliation`
(`_is_user_debt_goal`). For a client sending `X-Client-Features: limits`, and only for
one:

- **Holding $0** (`allocated_amount` ≤ half a cent, `_is_hidden_debt_goal`) → left out
  of `GET /savings/goal/` and `GET /savings/goal/completed/`.
- **Still holding money** (only an old binary can deposit into one) → still listed on
  the Goals tab, so money is never hidden, and still deletable (prior-month money to
  General Savings, as for any goal). `POST /savings/transaction/` (deposits) and
  `POST /savings/transfer/` (as `to_goal_id`) refuse it with 409
  `RETIRED_DEBT_GOAL_DETAIL`.
- **Either kind** is left out of the home: the goals half of `GET /home/progress/`
  (completed and total counts, the nearest goal, "saved toward goals" and its series,
  milestones) drops every user debt goal and its transactions, funded or not — the
  Goals tab is the only place one shows. `goals_near_completion` (`/home/summary/`)
  skips every debt goal for every client.
- **Either kind** is excluded from the free tier's eligible goals: it never counts in
  `goals_used`, is never `locked`, and never takes the active slot.

Nothing is rewritten: no row is updated or deleted, `POST /savings/goal/` still accepts
`goal_type = 'debt'`, and every response a build without `limits` reads is unchanged.
The Reconciliation goal is untouched everywhere.

**Completing a goal** (`POST /savings/goal/{id}/finish`) withdraws the goal's entire funded amount in one server-side transaction, which drives that computed value to $0 — hence the `completed_amount` snapshot, which is what the Completed tab actually renders (falling back to the computed value for goals completed before the column existed). The legacy `PATCH /savings/goal/{id}/complete` only flips the flag and writes no withdrawal; it exists solely for app builds already shipped, which write their own withdrawal first.

**Editing a goal** (`PATCH /savings/goal/{id}`) can change `title`, `target_amount`, `target_month`, `target_year`. Since `savings_transactions.title` is a denormalized copy of the goal title, a rename also rewrites the titles of that goal's transactions so Recent Activity doesn't show the old name. General Savings and the Reconciliation goal are auto-managed and reject both routes.

**The free-tier goal cap is derived, not stored.** A free user (a client sending
`X-Client-Features: limits`, with `premium_enabled` on and no entitlement) keeps one
**eligible** goal. Eligible means `is_general` is not true, `is_reconciliation` is not
true, `completed` is not true and it is not a retired user debt goal (`goal_type =
'debt'`) — nobody may be locked out of their one free goal by a goal the app created for
them or by a debt goal that can no longer take money, and finishing a goal frees the
slot. The **active** goal
is the oldest eligible one by `created_at`, `id` as the tiebreak; every other eligible
goal is **locked** and the server refuses writes to it with `goal_locked`. Deleting a
locked goal is always allowed.

`GET /savings/goal/` sorts **oldest first** (`id` breaking ties, the same key that picks
the active goal) for a `limits` client, so the active goal sits at the top under General
Savings instead of below every grayed one. Every other client keeps the newest-first
order it was built against. `GET /savings/goal/completed/` is newest-first for everyone.

No schema supports any of that: it is a query in `_Entitlements._eligible_goals`, which
is why the rule needed no migration, no promotion logic and no backfill. `goal_type`,
`is_general`, `is_reconciliation` and `completed` are the only columns it reads. See
[SUBSCRIPTION_REWORK.md](../../SUBSCRIPTION_REWORK.md) §5.

### `subscriptions`

One row per **store subscription**, not per user — a user can hold an App Store and a
Play Store subscription at once, and TestFlight sandbox rows coexist with production
ones. Written **only** by `POST /webhooks/revenuecat`. Migration:
[backend/migrations/0005_subscriptions.sql](../../backend/migrations/0005_subscriptions.sql).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `user_id` | uuid | Supabase user id == RevenueCat App User ID (the app calls `Purchases.logIn(user.id)`). **No FK** — see below. |
| `store` | text | `app_store` \| `play_store` |
| `environment` | text | `sandbox` \| `production` |
| `store_txn_id` | text | `coalesce(original_transaction_id, transaction_id, original_app_user_id)`. Google often omits the first; a NULL here would let unlimited duplicate rows accumulate, since NULLs never collide in a unique index. |
| `product_id` | text | Which tier. **Reporting only — never access logic.** All eight products grant the same entitlement. |
| `pending_product_id` | text | A crossgrade the user has selected but which has not taken effect yet |
| `expires_at` | timestamptz | **The access horizon.** The only column entitlement reads. |
| `revoked_at` | timestamptz | Set on refund/pause; kills access immediately |
| `auto_renew` / `cancelled_at` / `status` | bool / timestamptz / text | **Descriptive only** — support and the paywall's "Current: …" line. Access never reads them. |
| `last_event_id` / `last_event_at` | text / timestamptz | Newest event applied; `last_event_at` is what makes the write monotonic |

**`GET /me/entitlements/` is the only way this table reaches a client**, and its shape
is two halves:

| Half | Keys | Who gets them |
|------|------|---------------|
| Frozen | `premium_active`, `expires_at`, `product_id`, `pending_product_id`, `store`, `auto_renew` | **everyone** — the shipped premium build reads them, so they are never removed, renamed or retyped |
| Allowances | `max_goals`, `goals_used`, `budget_types`, `video_series`, `max_bank_connections`, `debt_freedom` | only clients sending `X-Client-Features: limits` |

The allowances are **values, not verdicts** — the server states what the user is allowed
and the client renders whatever it says. That is deliberate: with un-updatable binaries,
changing the free tier to two goals is then a one-line server change every installed
build obeys, where a boolean would put the number in the app's copy and need an App
Store release. `null` means unlimited. They report what this server will actually
enforce for that caller, so while `premium_enabled` is false everyone is unlimited. See
[SUBSCRIPTION_REWORK.md](../../SUBSCRIPTION_REWORK.md) §6.

`unique (store, environment, store_txn_id)` is the identity. `environment` is in the key
because Apple's sandbox and production transaction-id namespaces **overlap** — without
it a TestFlight purchase can collide with a real one. `user_id` is deliberately *not* in
the key, so a `TRANSFER` event can re-point a row instead of duplicating it.

**Entitlement is `expires_at > now() AND revoked_at IS NULL`** — `_has_premium` in
`main.py`. Deliberately not driven by `status`: RevenueCat delivers a refund as a
`CANCELLATION`, and a cancellation that merely turns auto-renew off must *not* revoke
access, since the user paid for the period. One status string cannot express both, so
`expires_at` carries it — RevenueCat moves that value forward when Apple extends a grace
period and back to the refund moment when money is returned.

**No foreign key to `auth.users`,** matching every other table here. An FK would make a
webhook arriving after account deletion raise a violation → 500 → 72h of RevenueCat
retries. Without it the row is simply orphaned, which is the wanted outcome: it is the
audit trail for a refund on a deleted account, and it is invisible to every query (all
filter by `user_id`). `subscriptions` *is* in `USER_DATA_TABLES`, so deletion clears it —
but note that does **not** cancel the store subscription; the user must do that in the
App Store, and the delete-account screen says so (App Review guideline 5.1.1(v)).

### `subscription_events`

Append-only audit log of every RevenueCat webhook, keyed by their `event_id` (PK).
**Deliberately not load-bearing:** PostgREST has no cross-table transaction, so nothing
may depend on both this insert and the `subscriptions` write landing together.
Idempotency lives in the conditional update on `subscriptions`
(`where <identity> and (last_event_at is null or last_event_at < :event_at)`), which
makes a duplicate delivery and a stale out-of-order delivery both match zero rows,
atomically. This table only answers "what did RevenueCat tell us, and when".

### `debts` / `debt_transactions` — Debt Freedom (plant debts)

The Debts tab: each debt is a plant grown by paying it down with the snowball method.
Migrations [0010](../../backend/migrations/0010_debt_freedom.sql) and
[0011](../../backend/migrations/0011_debt_freedom_v2.sql) (v2: due-date cycles). **The only place debts
live in the new app** — debt goals (`savings_goals.goal_type = 'debt'`) are retired (see
`savings_goals`). Nothing here writes `savings_goals` or `savings_transactions`; payments
reach the Goals budget by being read there (see "The Goals split's spend" under Budget
Calculation). Routes live under `/debt-freedom/` in
`main.py`; **every rule is a pure function in
[backend/debt_freedom.py](../../backend/debt_freedom.py)**, unit-tested in
`tests/test_debt_freedom.py` and `tests/test_debt_missed_cycles.py`. The client
renders server-computed fields only.

**It has clients in the wild from the release that turned `DEBT_FREEDOM_ENABLED` on.**
Until then no store build had the Debts tab, so these routes could change freely. From
that release on, the API and database rules in CLAUDE.md apply to them like any other.

**Premium.** Debt Freedom is premium: every write route (create, PATCH, DELETE,
payments, undo-minimum, delete-payment, checkin, late-fee, complete, PUT settings)
calls `_assert_debt_freedom_writable` first and answers 403 `debt_freedom_locked` unless
the user is entitled — before the debt is loaded or a cycle closed, so a refused request
changes nothing. It uses the goal gates' WRITE posture (`_Entitlements.debt_freedom_locked`
= `enforced`, fails closed when RevenueCat is unreachable; a subscriber recorded in
`subscriptions` never reaches RevenueCat). Reads (`GET /debt-freedom/`, `/{id}`,
`/settings`, `/payments`) stay open, and the lazy cycle processing they run keeps a
lapsed user's balances true.

**The write gate ignores `X-Client-Features`** — the one gate that does. Everywhere else
a request without `limits` is exempt because it comes from a binary that cannot be
patched; no binary has ever called these routes (the Debts tab was behind
`DEBT_FREEDOM_ENABLED = __DEV__` in every store build before the release that made it
premium), so the exemption would only be a way around the paywall. The gate resolves
the entitlement as for a `limits` caller, so `premium_enabled` off (the kill switch) and
`LIMITS_TEST_USER_IDS` still apply. The `debt_freedom` allowance itself is still sent to
`limits` clients only, like every allowance.

| `debt_freedom` | When | App |
|---|---|---|
| `full` | entitled, or `premium_enabled` false, or the RevenueCat lookup failed (read posture; writes still fail closed) | the garden |
| `read_only` | not entitled, at least one row in `debts` (any status) | the garden and detail, every action hidden, a Subscribe banner |
| `none` | not entitled, no debts | the tutorial |

`debts`:

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint identity PK | |
| `user_id` | uuid | No FK, like every other table |
| `name` | text | |
| `original_balance` / `current_balance` | numeric | `current_balance` never goes below 0 |
| `min_payment` | numeric | |
| `apr` | numeric | Percent, e.g. `24.99` |
| `due_day` | smallint | 1–31. Past a short month's end it lands on the last day. **Required by the API since v2** (create; PATCH can set but never clear it); the column stays nullable. Pre-v2 debts without one show a red `--` and are skipped by the cycle check until it is set — setting it the first time anchors `interest_checked_through` on the previous due date, so there is no back-charging |
| `debt_type` | text | Nullable. Canonical English: `credit_card`, `student_loan`, `medical`, `auto`, `personal`, `bnpl`, `family`, `other` |
| `lender`, `pay_url`, `autopay`, `credit_limit`, `notes` | | All nullable. `pay_url` is http(s) only (server-enforced) |
| `species` | smallint | 1–4, default 4. Which plant art |
| `species_locked` | bool | Set by the first payment; a locked species never changes |
| `status` | text | `active` \| `paid_off` |
| `paid_off_at` | timestamptz | Set by `POST /debt-freedom/{id}/complete` |
| `interest_checked_through` | date | Last due date the cycle check closed. NULL = never; anchors on `created_at` |
| `late_fee` | numeric | 0011. Nullable. The card agreement's late fee. NULL = unknown (a missed minimum asks for it); `0` = no fee |
| `highest_step` | smallint | 0011. Nullable. Highest growth step reached; plants never shrink. NULL = use the computed step |
| `cycle_start_balance` | numeric | 0011. Nullable. The statement balance the full-payment check compares against; set on create, at each cycle close, and by a check-in; moves with a balance edit. NULL (pre-v2) = rebuilt as `current_balance` + the cycle's net payments |
| `checkin_due_since` | date | 0011. Nullable. The due date whose statement check-in is pending. NULL = none |
| `late_fee_pending_for` | date | 0011. Nullable. A missed due date waiting for the user to enter the fee. NULL = none |

`debt_transactions`: `debt_id` (FK, cascade), `kind` (`payment_minimum` \|
`payment_extra` \| `interest` \| `balance_edit` \| `late_fee` \| `statement_adjustment` \|
`minimum_reversal` — the last three added by 0011, CHECK widened `NOT VALID`), `amount`,
`balance_after`, `occurred_on` (date), `cycle_due_date` (date, nullable, migration
[0012](../../backend/migrations/0012_debt_cycle_due_date.sql)). `balance_edit.amount` and
`statement_adjustment.amount` are signed (new − old); `minimum_reversal.amount` is the
positive amount put back on the balance by the toggle's **old** undo.

**`cycle_due_date` — late minimums.** Set only on a `payment_minimum` logged late from
"View all min payments": the due date of the missed cycle it pays for. Such a minimum
counts for **that** cycle wherever its `occurred_on` falls (`df.pays_cycle`); NULL — every
row from before 0012 and every on-time minimum — keeps the old rule, the cycle its
`occurred_on` falls in. Its `occurred_on` is the day it was logged, so it counts against
**that** month's Goals budget (the budget rule is unchanged). Only a late minimum writes
the column, so on-time payments work before 0012 is applied; logging a late one needs it.

**`minimum_reversal` is legacy.** Nothing writes it any more — the toggle's undo now
deletes the minimum (below) — but the kind stays valid in the CHECK and existing rows
are never deleted. Every total keeps netting them (`net_minimum`, `net_paid`,
`debt_payment_events`, `budget_paydown`). Only the history hides them:
`df.cancelled_minimum_ids` pairs each reversal with the most recent uncancelled
minimum of the same debt before it, and `GET /debt-freedom/{id}` and
`GET /debt-freedom/payments` leave both rows out.

**Removing a payment** (`_df_remove_payment`, shared by the undo and the extra delete):
the row is deleted, its amount goes back on `current_balance`, and every later row of
that debt (by `occurred_on`, then `id`) has `balance_after` raised by the same amount.
`cycle_start_balance` is untouched (a payment never moved it), the species stays
locked, and `highest_step` keeps the plant from shrinking. The delete is the race
guard: a second overlapping request deletes nothing and is refused before it touches
the balance.

**Payment routes and closed months.** A payment is part of its month's Goals spend, so
logging a minimum or an extra, undoing a minimum, and deleting an extra are refused
with `_assert_month_open`'s 409 (`"{Month} is closed. Reopen it before making
changes."`) when the budget month of the row's `occurred_on` is closed. A row dated
outside the year its month name resolves to today belongs to no budget month and is
never refused for this reason.

| Route | Rule |
|-------|------|
| `POST /debt-freedom/{id}/payments` | Optional `cycle_due_date` logs a LATE minimum: `minimum: true` and no extra (400 otherwise), the date must be one of the debt's `missed_cycles` (409 otherwise), the amount is that entry's, and the row stores the date. Absent: unchanged (the current cycle's minimum, 409 if already logged) |
| `POST /debt-freedom/{id}/payments/undo-minimum` | Deletes the current cycle's latest uncancelled `payment_minimum` (`df.minimum_row_to_undo`). However often the user toggles, a cycle ends with at most one minimum row. Still refused once the cycle's due date has passed. With `cycle_due_date`: deletes that cycle's late minimum instead (`df.late_minimum_row_to_undo`) — only one logged in the **current** cycle, the same window the toggle's own undo has; the cycle is then owed again |
| `DELETE /debt-freedom/{id}/payments/{transaction_id}` | Deletes a `payment_extra` of this debt in its **current billing cycle**, on an **active** debt, in an **open** month; 409 with a reason otherwise. Earlier cycles were closed against the payment (interest, the full-payment check), so they stay. Returns the payment routes' payload (`debt`, `focus_id`, `plan_est_payoff_month`, `monthly_extra`, `previous_step`, `transactions: []`). Optional `today` |
| `DELETE /debt-freedom/{id}` | Refused (409, "This debt has payments in a closed month…") when its net payments in any **closed** budget month are non-zero — deleting it would change that month. Otherwise unchanged; its open-month payments leave the Goals spend with it. Optional `today` |
| `GET /debt-freedom/{id}` | History is newest first with legacy pairs collapsed; each row carries `deletable` (`df.extra_is_deletable`: an extra in the current cycle of an active debt). The closed-month rule is applied when the delete arrives, so its message can say why |
| `GET /debt-freedom/payments?month=&today=` | The month's net Debt Freedom payments for the Goals split's "View all": `{id, debt_id, debt_name, kind, amount, occurred_on}`, minimums and extras only, legacy pairs collapsed, newest first. Same month/year rule as the budget, so it adds up to the debt part of the split. Declared before `/debt-freedom/{id}` |

`debt_freedom_settings` (0011): `user_id` (PK), `monthly_extra` (numeric, nullable —
blank/NULL = $0), `updated_at`. One row per user, upserted by
`PUT /debt-freedom/settings`. Cleared by `POST /account/delete/`.

**The rules** (all in `debt_freedom.py`):

- **Order** — paid-off first (oldest `paid_off_at` first), then active by
  `current_balance` ascending, ties by `created_at` then `id`. The first active debt is
  the **focus**; only it accepts `extra_amount`.
- **Species** — N < 4 → all species 4; else position i gets `floor(i*4/N)+1`. Re-dealt
  to unlocked debts after every create, delete and balance change.
- **Growth step** — 0 until a payment exists; then 1 below 10% paid, else
  `min(10, floor(pct*10)+1)`.
- **Rollover** — the focus's `suggested_payment` = its minimum + every paid-off debt's
  minimum.
- **Projection** — monthly: interest, then minimums, then everything left to the focus,
  rolling over within the month. Month 1 is next calendar month. `null` when the
  focus payment does not exceed its interest, or after 600 months.
- **Growth never shrinks** — `growth_step = max(computed_step, highest_step)`;
  `highest_step` is saved whenever the computed step passes it. Both are returned.
- **Due-date cycle check** (one function: `process_due_dates`) — run lazily at the start
  of every `/debt-freedom/` route that reads or changes a debt's balance. A cycle runs
  from the day after one due date through the next, inclusive; a due date is closed the
  **day after** it, so a minimum logged on the due date still counts. For each passed due
  date, in order (catch-up does them all at once): (1) net payments (`payment_minimum` +
  `payment_extra` − `minimum_reversal`) ≥ `cycle_start_balance` → paid in full, nothing
  added; else (2) net minimum < `min_payment` → a `late_fee` row if `late_fee` > 0, or
  `late_fee_pending_for` = that due date if `late_fee` is NULL; then (3) one `interest`
  row, `balance × APR/100/365 × days` since the previous due date (since creation for
  the first cycle); (4) `cycle_start_balance` = new balance, `checkin_due_since` = the
  due date, `interest_checked_through` advances — by a conditional update on its old
  value, so overlapping requests cannot process a cycle twice.
- **Missed cycles** (`df.missed_cycles`, on every decorated debt as `missed_cycles:
  [{due_date, amount}]`, oldest first) — every due date after `created_at` and before
  today whose cycle is not covered. Covered = the statement it opened with was ~$0, or
  it was paid in full (net payments dated in it reach the statement), or **any** net
  minimum pays for it (`pays_cycle`). Any amount counts because the toggle always logs
  the full minimum of its moment and no historical minimum is stored: comparing with
  today's `min_payment` would flag a cycle paid on time as missed after a check-in
  raised the minimum. `amount` = current `min_payment` capped at the statement.
- **Overdue** = `missed_cycles` is non-empty. A minimum logged for the current cycle no
  longer clears an older miss, and a late minimum is never the current cycle's (the
  toggle, `min_logged_this_cycle` and the plain undo all go through `pays_cycle`).
  `late_minimums` on the decorated debt lists the late minimums still undoable.
  `/home/summary/` overdue entries carry `missed_count`, and `missed_due_date` /
  `days_overdue` are from the **oldest** missed cycle.
- **`process_due_dates` attributes minimums the same way.** Its late-fee test uses
  `attributed_minimum`, so a late September minimum logged in October never covers
  October: October still gets its fee (or its `late_fee_pending_for` question). A
  `payment_minimum` with no `cycle_due_date` counts by `occurred_on`, exactly as before
  0012. The full-payment test and the interest still read every payment by
  `occurred_on` — the late minimum really did lower the balance in October. A late
  payment never refunds a fee already charged.
- **Local date** — cycle routes take an optional `today` (the phone's date); one more
  than a day from the server's date is ignored. The first cycle's payment window opens
  the day before `created_at`, which is stamped in UTC.
- **Projection** uses the same daily-APR interest over each month's real days, and adds
  `monthly_extra` to the focus debt's payment every month.

### `app_config`

`key` (PK) / `value` / `updated_at`. Three rows: `premium_enabled`,
`min_supported_version`, `update_url`. Served by the public `GET /config/`, cached 60s
in-process, and **failing open** to `premium_enabled=false` if the read throws.

A table rather than env vars on purpose: the kill switch flips with one `UPDATE` in the
Supabase dashboard — no Render redeploy, and the lever still works when a bad deploy is
what broke things. **This is the rollback lever** for the premium feature.

### `month_status`

Per-month facts, one row per `(user_id, month)` — that pair is the primary key, and
`month` is a bare English month **name** with no year.

| Column | Meaning |
|--------|---------|
| `closed_at` | When the user closed the month out. `NULL` = open. Closed months are read-only (`_assert_month_open` → 409) and their budget state is frozen. |
| `tithe_given_at` | When the user marked this month's tithe as handed over. Display-only — it changes "left this month", never a stored transaction. Migration `0008`. |
| `budget_type`, `tithe_enabled`, `tithe_rate` | The split and tithe the month was **frozen** with at close-out. `NULL` = not frozen. Migration `0009`. |
| `year` | The calendar year the frozen month belongs to. `NULL` on pre-`0009` rows, where it is derived from `closed_at`. Migration `0009`. |

Read only through `_month_status`, always with `select('*')` so a column that does not
exist yet reads as `NULL` rather than raising — which is what makes both migrations
deploy-order-independent on the read path.

**The year column exists because month names have no year.** `(user, 'September')` is
one row forever, so without it a September closed last year would still read as closed
this September — freezing the current month to a year-old split and rejecting every new
entry with a 409. A row whose year is not the current one is treated as never-closed,
and closing that month again recycles the row. Note this does **not** make the app
year-aware: `income`, `expenses` and `savings_transactions` are still keyed on a bare
month name, so two Septembers' rows remain indistinguishable and sum together.

## Budget Calculation

Computed server-side in [backend/main.py](../../backend/main.py) (`get_dashboard_data`,
and the same math per month in `get_spending_trends`). The tithe is carved out **first**;
the split then applies to the remainder:

```
budgetable    = total_income - tithe_amount
needs_budget  = budgetable * split.needs
wants_budget  = budgetable * split.wants
goals_budget  = budgetable * split.savings
```

### The Goals split's spend

```
goals_spent = legacy 'Goals' expenses
            + savings_transactions deposits with source = 'income'
            + net Debt Freedom payments booked to the month
```

**Net Debt Freedom payments** = `payment_minimum` + `payment_extra` − `minimum_reversal`
(legacy) rows in `debt_transactions`, dated by `occurred_on`. `interest`, `late_fee`,
`balance_edit` and `statement_adjustment` never count — they are what the debt cost,
not money the user paid. The rule is `df.budget_paydown`; `_debt_paydown` in `main.py`
loads the rows.

**They are read, never mirrored.** A debt payment writes no `savings_transactions` row:
that would raise General Savings and the home's "saved toward goals" with money that
left the user.

**Which month a payment belongs to.** Months carry no year, payments do. A payment
counts toward budget month M only when `occurred_on` is in calendar month M of the
year `_month_year_at(M, today)` resolves to — so last October never counts toward this
October. "Today" is the phone's date when the client sends the optional `today`
(clamped by `_df_today`, as on the `/debt-freedom/` routes), else the server's.
`/dashboard/{month}`, `/dashboard/trends/`, `/rollover/preview/` and
`POST /rollover/close/` (body field) all accept it; `/home/summary/` already did.

**One place, every consumer.** `_month_budget_numbers` adds it, so the dashboard, the
home summary's over-budget list, the compliance score and the client's "all green"
check agree; `_compute_target_rollover` adds the same `_debt_paydown`, so the close-out
target is the leftover the home shows; trends applies `df.budget_paydown` per month.
Binaries from before Debt Freedom shipped have no Debts tab, so a user on one alone
has no Debt Freedom rows and their numbers are unchanged — and the total is only
touched when there is a payment, so an int total stays an int in their JSON.

`BUDGET_TYPES` in `main.py` is the single source of truth for the three splits —
`balanced` 50/30/20, `wealth_builder` 30/20/50, `firm_foundation` 70/10/20. Only the
KEY is ever stored (never the percentages), so they cannot drift.
[frontend/constants/budgetTypes.ts](../../frontend/constants/budgetTypes.ts) mirrors them
for display and must be kept in sync by hand.

### Which split and tithe a month uses

Resolved by `_month_tithe` / `_month_budget_type`, both keyed on **whether the month is
closed** — not on where the calendar is:

| Month state | Source |
|-------------|--------|
| Not closed (past, current or future) | The **live** `user_settings` row, through `_live_budget_type`. The month is still the user's to correct, so changing the setting updates it. |
| Closed | The values frozen onto `month_status` at close-out. Permanent, and clock-independent. |
| Closed before migration `0009` | Falls back to the per-row snapshot on that month's `income` rows (`income.budget_type` / `.tithe_enabled` / `.tithe_rate`, most recent `day` wins for the split), so months already closed keep exactly the numbers they had. |

This replaced an earlier rule that asked "is this the current calendar month?", which
made a month silently revert to its income-row snapshot the instant the calendar rolled
over — the tithe envelope disappearing from the month that just ended, and past months
snapping back to 50/30/20.

`income.budget_type` / `.tithe_enabled` / `.tithe_rate` are still stamped on every
`POST /income/` and still needed for that third row. They are not the month's answer
while it is open.

**`_live_budget_type` is the single reader of the live setting**, and the only place the
free-tier fallback exists. For a `limits` client that is not entitled, a gated type
resolves to `balanced` while the month is open; `user_settings.budget_type` is **never**
rewritten, so resubscribing restores the user's choice with no action from them. Every
request path that reads the live setting goes through that helper — the live branch of
`_month_budget_type` (dashboard, trends, rollover preview), the `POST /income/` row
snapshot, `live_budget_type` on the dashboard, and `_frozen_stamp`, so closing a month
freezes what the user was actually shown rather than a split they could not see. Closed
months are untouched: a subscriber who lapses does not have their history rewritten.

The fallback uses the **fail-open** posture — a RevenueCat lookup that times out never
drops a paying user to Balanced. The gate on `PATCH /settings/` uses the fail-closed one
(`budget_types_for(write=True)`), so the same outage refuses a gated type rather than
storing a choice the dashboard would then ignore.

## Category Name Mismatch

The dashboard's 50/30/20 split shows **"Needs / Wants / Goals"**, and the DB stores expense categories with those same plural names (`Needs`/`Wants`/`Goals`) — they match. The Goals bucket total = historical `Goals` expenses + income-sourced savings deposits (`savings_transactions` where `type='deposit'` AND `source='income'`) + net Debt Freedom payments (see "The Goals split's spend" above); transfers between goals (`source='transfer'`) are excluded so they don't double-count. (Note: earlier docs described the categories as `Need/Want/Savings/Debt` — that was never the stored reality; see the audited values above.)

## Row Level Security

**RLS is not what protects this app's data.** The backend connects with the
**service_role** key, which bypasses RLS entirely, so every policy below is invisible
to [backend/main.py](../../backend/main.py). Access control for anything reaching the
API is the verified-JWT dependency `get_current_user_id` — see
[architectural_patterns.md](architectural_patterns.md#api-authentication). RLS is the
second layer: it governs direct PostgREST access with the **anon** key, which ships
inside every app binary and is therefore public.

State as verified **2026-07-26** — already correct, nothing to apply:

| Tables | RLS | Policies |
|--------|-----|----------|
| `expenses`, `income`, `savings_transactions`, `savings_goals`, `month_status`, `lesson_ratings` | enabled | One `ALL` policy each, role `authenticated`, `USING (auth.uid() = user_id)` |
| `debts`, `debt_transactions` | enabled | Same: one `ALL` policy each, role `authenticated`, `USING (auth.uid() = user_id)` (plus the same `WITH CHECK`). Added by migration `0010`, applied before 2026-09-29. |
| `debt_freedom_settings` | enabled | Same single `ALL` policy. Added by migration `0011`, applied before 2026-09-29. |
| `user_settings` | enabled | Three policies — `SELECT` / `INSERT` / `UPDATE`, same `auth.uid() = user_id` — but on role `public`, not `authenticated`. No `DELETE` policy. |
| `lesson_series`, `lessons` | enabled | **None** — deny-all to anon and authenticated, by design. Shared content is served only through the backend (`GET /lessons/...`) on service_role. |
| `subscriptions`, `subscription_events`, `app_config` | enabled | **None** — same posture. Entitlement is served only through `GET /me/entitlements/`; letting the anon key read `subscriptions` directly would expose who pays. Added by migration `0005`. |

Notes on the two irregularities, both deliberate to leave alone:

- **`user_settings` on role `public`**: `public` means *every* role, including `anon`.
  Harmless in practice — an anon caller has `auth.uid() = NULL`, and `NULL = user_id`
  is never true, so no rows come back. It is loose scoping, not an opening. The
  missing `DELETE` policy likewise doesn't matter: account deletion runs through the
  backend on service_role.
- **`relforcerowsecurity = false` everywhere**: the Supabase default. FORCE only
  affects connections made *as the table owner*; PostgREST connects as
  `anon`/`authenticated`/`service_role`, never the owner, so it changes nothing for
  the app. **Do not enable it** — lesson content is loaded manually through the
  Supabase dashboard, and forcing RLS risks those admin queries returning filtered or
  empty results.

Confirmed empirically: with the anon key, `expenses`, `income`,
`savings_transactions`, `savings_goals` and `lesson_ratings` all return **0 rows**
while actually holding data (126 / 50 / 65 / 54 / 3 rows respectively).

To re-verify after any schema change:

```sql
-- Policies and the expression that enforces ownership
select tablename, policyname, roles, cmd, qual as using_expression, with_check
from pg_policies where schemaname = 'public' order by tablename, cmd;

-- RLS flags per table
select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by c.relname;
```

Every `using_expression` should read `(auth.uid() = user_id)`. A policy with
`USING (true)` would be a real hole.

## Supabase Client Setup

- Frontend: [frontend/lib/supabase.ts](../../frontend/lib/supabase.ts) — project URL and **anon** key are hardcoded in the file (not env vars); uses AsyncStorage as the session store. Subject to RLS.
- Backend: [backend/main.py](../../backend/main.py) top of file — URL and `SUPABASE_KEY` from `.env`. That key is the **service_role** key (required by `auth.admin.delete_user`), so it **bypasses RLS** — which is why authorization must live in the route dependencies.
