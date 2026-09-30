# Debt Freedom v2: accurate balances, the min payment toggle, and statement check-ins

Version 1 of Debt Freedom is built on `plant-branch` (`DEBT_FREEDOM_PROMPT.md`). This prompt changes how balances stay accurate month to month, and replaces the "Log a payment" button. Everything not mentioned here stays as it is.

Read `CLAUDE.md` and the docs it points to, then read the v1 code before changing anything:

- **Backend:** `backend/debt_freedom.py`, the `/debt-freedom/` routes and models in `backend/main.py`, `backend/migrations/0010_debt_freedom.sql`, `backend/tests/test_debt_freedom.py`
- **Frontend:** `frontend/components/debts/`, `frontend/app/(tabs)/debts.tsx`, `frontend/app/debtDetail.tsx`, `frontend/app/debtForm.tsx`, `frontend/lib/debtFreedom.ts`, `frontend/locales/*/debts.json`

## 0. Ground rules

- **Branch:** keep working on `plant-branch`. Run `git fetch origin` and `git pull origin plant-branch` first. Commit and push only to `plant-branch`. Never commit to `main`, and don't merge anything.
- **The feature stays behind `DEBT_FREEDOM_ENABLED`.** The old debt goals on the Goals tab stay untouched, as in v1.
- **API rules still apply, with one note.** The `/debt-freedom/` routes have never shipped in a store build, since the tab is flagged off in production, so making one of them stricter (requiring `due_day`) can't break a phone in the wild. Confirm that's true with `git log` / the flag before relying on it, and say so in your summary. Every other API and database rule in CLAUDE.md applies as normal.
- **Dates:** cycle logic must use the user's local date, not the server's UTC date. Accept an optional `today` (YYYY-MM-DD) from the client on the routes that process cycles, falling back to the server date, the same way `occurred_on` already works.
- Work in small, reviewable commits.

## 1. Migration `0011_debt_freedom_v2.sql`

Create a new file in the format of `0004_goal_completion_snapshot.sql`. Don't edit `0010`. It must be purely additive:

**New nullable columns on `debts`** (`add column if not exists`):

| Column | Type | Purpose | Fallback for existing rows |
|---|---|---|---|
| `late_fee` | numeric null | Optional late fee from the user's card agreement | Null means no fee is added automatically |
| `highest_step` | smallint null | Highest growth step the plant has reached | Null means use the computed step |
| `cycle_start_balance` | numeric null | Balance at the start of the current cycle (the "statement balance" for the full-payment check) | Null means use `current_balance` at the first check |
| `checkin_due_since` | date null | The due date whose statement check-in hasn't been done yet | Null means no check-in pending |
| `late_fee_pending_for` | date null | A missed due date waiting for the user to enter a late fee amount | Null means nothing pending |

**Widen the `debt_transactions.kind` CHECK** to also allow `'late_fee'`, `'statement_adjustment'` and `'minimum_reversal'`. Drop the old constraint and add the wider one with `NOT VALID`, so existing rows aren't revalidated. Widening is allowed under the rules.

**New table `debt_freedom_settings`:**

- Columns: `user_id uuid primary key`, `monthly_extra numeric null`, `updated_at timestamptz not null default now()`.
- RLS enabled with the same single `ALL` policy for `authenticated` as the other debt tables.
- Add it to `POST /account/delete/` cleanup the same way v1 added its two tables.

Include `Verify after applying` queries. Run the CLAUDE.md gate before applying: state all five points in your response, apply only if every one holds, and otherwise write the file and let me apply it. If `0010` isn't applied yet, apply them in order. Update `data_model.md` for every new column, kind and table.

## 2. The due-date check (replaces the missed-payment rule)

Delete the v1 rule that adds interest only when a minimum is missed (`missed_payment_charges` and `_df_apply_missed_payments`). Replace it with one function in `debt_freedom.py`, `process_due_dates(debt, transactions, today)`, called lazily at the start of `GET /debt-freedom/`, the same way v1 is called.

**Cycles.** A cycle runs from the day after one due date through the next due date. For every due date after `interest_checked_through` (or after `created_at` if that's null), up to and including today, in order, run these steps:

1. **Full payment check.**
   - The statement balance for the cycle is `cycle_start_balance`, falling back to `current_balance` at the start of processing.
   - If the payments in the cycle (`payment_minimum` + `payment_extra`, minus `minimum_reversal`) are at least that amount, the debt is paid in full: add no interest and no fee, and stop for this cycle.
   - The balance will be 0 here, so the debt shows `ready_to_complete` as in v1. The user still taps "Mark as paid off", so the completion animation still plays.
2. **Minimum check.**
   - If net `payment_minimum` in the cycle is at least `min_payment`, go to step 3.
   - Otherwise, if `late_fee` is set, add a `late_fee` transaction for that amount.
   - If `late_fee` isn't set, set `late_fee_pending_for` to this due date and go to step 3. The app asks for the amount (section 5).
3. **Interest.** Add one `interest` transaction:
   - Amount: `balance × APR / 100 / 365 × days since the previous due date`, where balance is the balance after this cycle's payments and fee.
   - Use real calendar days, so February and 31-day months differ.
   - For the first cycle, count days from `created_at`.
4. **Close the cycle.**
   - Set `cycle_start_balance` to the new balance.
   - Set `checkin_due_since` to this due date.
   - Advance `interest_checked_through` to this due date.
   - Use the same conditional update as v1, so two overlapping requests can't process a cycle twice.

**Other rules:**

- Debts without a `due_day` (created before v2) are skipped until one is set. Their detail screen and pot label show the red `--` for the due date and a prompt to add it.
- Due day 29–31 in shorter months uses the last day of the month. `due_date_in` already does this; keep it.
- **Catch-up:** if several due dates passed since the last visit, all of them are processed in order in one request.

## 3. The minimum payment toggle and the Extra button

These replace the "Log a payment" button on the plant view.

**"Log min payment" toggle**

- Shows on every active debt's section. It uses the same style and position as the v1 "Log a payment" button.
- **Off → on:** calls `POST /debt-freedom/{id}/payments` with `{ minimum: true }` and plays the v1 drops animation and haptic.
  - The on state shows a check mark and reads "Min payment logged".
  - The server returns 409 if a net minimum already exists in the current cycle.
- **On → off (current cycle only):** calls a new route, `POST /debt-freedom/{id}/payments/undo-minimum`.
  - It writes a `minimum_reversal` transaction for the same amount and raises the balance back.
  - It's refused once the cycle's due date has passed.
  - Undoing never unlocks the species and never lowers `highest_step`.
- **Reset:** the toggle's state comes from the server: `min_logged_this_cycle` in the GET response. It turns off by itself the day after the due date, because a new cycle has started.

**"Extra" button**

- Only on the focus debt, next to the toggle.
- It opens the existing `LogPaymentSheet` with the "Paid minimum" checkbox removed. Everything else works the same (extra amount, drops and splash, grow transition).
- Make it the visually strongest button on the screen: filled with `theme.brand` and light text, while the toggle stays outlined. Use theme tokens only.

## 4. Statement check-in

- **When:** whenever the settled debt has `checkin_due_since` set.
- **Where:** a small pill to the right of "Free by {date}" in `GardenHeader`.
  - Harvest yellow background, dark text (`theme.text`), a small right arrow.
  - Text: "Check your statement".
  - Don't put yellow text directly on the cream background.
- **Tapping it** opens a short form with two fields, prefilled with the app's current values:
  - statement balance
  - minimum payment
- **On save:** new route `POST /debt-freedom/{id}/checkin` with `{ statement_balance, min_payment }`:
  - If the balance changed, write a `statement_adjustment` transaction for the difference (positive or negative) and set `current_balance` and `cycle_start_balance` to the statement balance.
  - Update `min_payment`.
  - Clear `checkin_due_since`.
- **If the statement balance is higher than the app's balance,** show a gentle message after saving, for example: "This card grew by $120 since last month. Try to keep it in the drawer while you pay it down." Use softer wording without "card" when `debt_type` isn't `credit_card`.
- Also offer the check-in from the debt detail screen, so it can be done anytime.
- Hide the pill after saving. There's no dismiss-without-saving option.

## 5. Late fee

- **In the form:** add `late_fee` as an optional field in `debtForm` under "More details", and in `DebtCreate` / `DebtUpdate`. Show it on the detail screen.
- **Asking when it's missing:** when `late_fee_pending_for` is set, show a small sheet the next time that debt settles on screen: "Your minimum wasn't logged by {date}. Did your card charge a late fee?" It has an amount field, Save, and "No fee / Skip".
  - Save calls `POST /debt-freedom/{id}/late-fee` with `{ due_date, amount }`. This writes a `late_fee` transaction and raises the balance. Offer "Save for next time", which also stores it in `late_fee`.
  - Skip calls the same route with `amount: null`. Both clear `late_fee_pending_for`.
  - Interest for that cycle has already been calculated without the fee. That's acceptable, because the next check-in corrects it.

## 6. Plants never shrink

- On every GET and payment response, `growth_step = max(computed_step, highest_step)`.
- Whenever `computed_step` is higher than `highest_step`, save the new `highest_step`.
- A check-in or undo that lowers the percent paid changes the numbers but never the plant.
- Return both `growth_step` and `computed_step` in the response, for a future "plant dying" animation.

## 7. "Extra each month" setting

- **Routes:** `GET` and `PUT /debt-freedom/settings` with `{ monthly_extra }`, reading and writing `debt_freedom_settings`. Declare these routes **before** the `/debt-freedom/{id}` routes so `settings` isn't parsed as an id.
- **Where it's edited:** an "Extra each month" row reached from the Debts header (a small settings icon next to the view toggle). It's optional; blank means $0.
- **In the simulation:** `simulate()` adds `monthly_extra` to the focus debt's payment every month, before rollover. Use the same monthly interest as section 2, so the "Free by" dates and the plan payoff date match how balances actually move.

## 8. Due day becomes required

- Make `due_day` required in `DebtCreate` (`int`, 1–31) and in `debtForm` validation. Move it out of "More details" into the required fields.
- Don't change the database column to NOT NULL. It stays nullable, per CLAUDE.md, and the API enforces it.
- `PATCH` can set it on older debts but can't clear it.

## 9. Response fields

Add to each debt in GET and payment responses:

- `min_logged_this_cycle`
- `current_cycle_due_date`
- `checkin_due_since`
- `late_fee_pending_for`
- `late_fee`
- `computed_step`
- `highest_step`

Add `monthly_extra` to the garden response. Update the types in `frontend/lib/debtFreedom.ts`.

## 10. i18n, analytics, accessibility

- Every new string goes in the `en` and `pt-BR` `debts` catalogues. Stored values (the new `kind` values) stay canonical English. Run `npm run check-locales` and `npm run verify-i18n`.
- Add analytics events `debt_min_toggled` (on/off), `debt_checkin_saved` (with whether the balance went up) and `debt_late_fee_entered` (saved/skipped).
- Accessibility:
  - The toggle uses `accessibilityRole="switch"` with its state.
  - The pill reads "Statement check-in due for {debt name}".

## 11. Tests and done criteria

Update `backend/tests/test_debt_freedom.py`: remove the old missed-payment tests, and cover:

- full payment in a cycle → no interest, no fee, `ready_to_complete`
- minimum logged → interest only
- minimum missed with `late_fee` set → fee then interest
- minimum missed without `late_fee` → `late_fee_pending_for` set and interest added
- interest day counts across 28-, 30- and 31-day months, including due day 31 in February
- catch-up over three missed due dates, processed in order
- toggle cycle boundaries: on the due date it's still the current cycle, and the next day is a new one
- `undo-minimum` restores the balance and is refused after the due date
- check-in writes the right adjustment in both directions and clears `checkin_due_since`
- `highest_step` never decreases
- `monthly_extra` shortens the simulated payoff
- `due_day` is required on create
- every new route is in the security table (`test_every_protected_route_is_in_the_table`)

**Done means:**

- lint, `check-locales`, `verify-i18n` and backend tests all pass
- the migration gate is stated and the migration applied only if it passes
- the Goals tab is unchanged
- screenshots or a recording of:
  - the toggle on and off
  - the Extra button and sheet on the focus debt
  - the check-in pill, form and "card grew" message
  - the late fee sheet
  - a garden with a debt that caught up on several missed due dates

Then stop and wait for my review.
