# Phase 1 — Subscription backend

## Before you start

1. You are on the branch **`subscription`**, already created and checked out. Run
   `git branch --show-current` and confirm it prints `subscription` before editing anything.
   If it doesn't, stop and tell me.
2. Work and commit **only** on `subscription`. Don't create or switch branches, don't push,
   don't merge. **As soon as this is done I'll merge it into `main`, and Render will deploy
   it to production** while the current App Store builds are still in use. Build it to that
   standard.
3. Read these in order before writing code:
   - `CLAUDE.md`
   - `SUBSCRIPTION_REWORK.md`, all of it. §4–§8 are the spec for this work.
   - `.claude/docs/lessons_page.md`, especially "Premium gating"
   - `.claude/docs/data_model.md`
   - `.claude/docs/architectural_patterns.md`
4. `SUBSCRIPTION_REWORK.md` holds the decisions. If this prompt and that file disagree, or
   the code doesn't match what they describe, stop and ask me. Don't guess.

## The rule that overrides everything else

The App Store builds already on people's phones keep calling this backend and can't be
updated. **Any request that doesn't send `limits` in `X-Client-Features` must behave exactly
as it does today** — same queries, same responses, same status codes. That covers all three
generations in the wild: no header, `premium`, and `premium, social`.

- Check the `limits` marker **first**, so a request without it issues no extra queries (no
  `app_config` read, no `subscriptions` scan, no goal counting). Follow the pattern and the
  comment in `get_lesson_playback`.
- **Existing tests must pass unmodified.** If one needs editing to accommodate your change,
  your change is wrong — `main.py` says the same.
- No migrations, no schema changes, and no writes to production data or to `app_config`.

## What to build

All backend work is in `backend/main.py`.

### 1. Capability token

Add `LIMITS_FEATURE = "limits"` next to `PREMIUM_FEATURE` and `SOCIAL_FEATURE`, with a
comment in the same style explaining what a build that sends it can handle: the goal cap,
locked goals, the budget-type lock, and the new entitlement fields.

### 2. Generalize `PremiumRequired`

Let it carry a `code` and `detail`. **The existing response must stay byte-identical**:
raising it with no arguments still returns 403 with
`{"code": "premium_required", "detail": "This series is part of DollarSeeds Premium."}` —
the shipped build branches on that exact string. Add three codes, each with its own plain
English detail sentence:

| Code | When |
|---|---|
| `goal_limit_reached` | Creating a goal at the cap |
| `budget_type_locked` | Choosing a gated budget type |
| `goal_locked` | Any write to a locked goal, except deleting the goal |

Keep the top-level `code` plus `detail` shape. Every other error in the file stays
`{"detail": "..."}`.

### 3. The entitlements resolver

One function that works out, once per request, what the caller is allowed. Only call it
when `LIMITS_FEATURE in features`.

- `limits_on = _premium_enabled() or user_id in LIMITS_TEST_USER_IDS` (see §8)
- `paid = (not limits_on) or _is_entitled(user_id)`
- `enforced = not paid` (the caller has already confirmed the `limits` marker)
- It produces the allowance values in `SUBSCRIPTION_REWORK.md` §6: `max_goals` (`1`, or
  `None` for unlimited), `budget_types`, `video_series` (`"free_only"` / `"all"`),
  `max_bank_connections` (`0` free, `1` paid).
- **When RevenueCat can't be reached** (`_EntitlementLookupUnavailable`): gates on writes
  treat the user as unpaid and return the relevant 403, the same posture as `/playback/`.
  Reads treat the user as paid, so a dashboard never drops a paying user to Balanced because
  a lookup timed out. Design the interface however you like, but both postures must be
  explicit and tested.

**Eligible goals** means rows in `savings_goals` for the user where `is_general` is not
true, `is_reconciliation` is not true, and `completed` is not true.

- `goals_used` = count of eligible goals.
- **Active goal** = the oldest eligible goal by `created_at` (tie-break by `id`).
- **Locked** = every other eligible goal, and only when `enforced`. When not enforced,
  nothing is locked.

### 4. `GET /me/entitlements/`

The six existing keys (`premium_active`, `expires_at`, `product_id`, `pending_product_id`,
`store`, `auto_renew`) stay exactly as they are for every caller. For `limits` callers only,
add `max_goals`, `goals_used`, `budget_types`, `video_series`, `max_bank_connections`. The
allowance fields must reflect what the server will actually enforce for this caller — when
`premium_enabled` is off, that means unlimited.

### 5. Goal cap

`POST /savings/goal/`: for an enforced `limits` caller, if `goals_used >= max_goals`, raise
`goal_limit_reached`. Keep the existing duplicate-title check and its order.

### 6. Locked goals

For an enforced `limits` caller, refuse with `goal_locked` any write that targets a locked
goal:

- `POST /savings/transaction/` (deposits and withdrawals via `goal_id`)
- `POST /savings/transfer/` (`to_goal_id`)
- `PATCH /savings/goal/{id}`
- `PATCH /savings/goal/{id}/complete`
- `POST /savings/goal/{id}/finish`
- `DELETE /savings/transaction/{id}` when the row, or either leg of its `transfer_group`,
  belongs to a locked goal

**`DELETE /savings/goal/{id}` is always allowed** and stays unchanged — it already returns
prior-month deposits to General Savings. Put the new check after the existing ownership and
404 checks, so a missing goal still returns 404. A companion to `_assert_owns_goals` is a
natural home for it. Search for any other route that writes to a goal I haven't listed, and
tell me what you find rather than deciding alone.

`GET /savings/goal/`: for `limits` callers, add a `locked` boolean to each goal. Don't change
the sort order.

### 7. Budget types

**The gate.** `PATCH /settings/`: for an enforced `limits` caller, a `budget_type` outside
`budget_types` raises `budget_type_locked` and applies **none** of the other fields in that
request. `balanced` is always allowed.

**The fallback.** For an enforced `limits` caller, every **unclosed** month resolves to
`balanced`, whatever `user_settings.budget_type` says. Closed months keep their frozen stamp.

- Put this in **one** helper for the "effective live budget type" and route every read of
  the live setting through it on request paths. At least: the live branch of
  `_month_budget_type`, `_frozen_stamp` (so closing a month freezes what the user was
  shown), the per-row snapshot in `POST /income/`, and `live_budget_type` on the dashboard.
  Trace every caller, including rollover close and reconcile.
- Thread it as a keyword argument that defaults to today's behaviour, so every existing
  caller and every request without `limits` is untouched.
- **Never rewrite `user_settings.budget_type` because of a lapse.** The stored choice stays,
  so resubscribing restores it. Leave `GET /settings/` unchanged.

### 8. Test-account switch

Add an environment variable, `LIMITS_TEST_USER_IDS`: a comma-separated list of user ids,
parsed once at startup (trim whitespace, ignore blanks). For those users only, the
resolver in §3 treats the limits as switched on, even while `premium_enabled` is off.

It lets me test the new rules on my phone against production. Flipping `premium_enabled`
isn't an option: the live premium build reads it from `/config/` to decide what to lock.

It must affect **nothing except the §3 resolver**: not `_premium_enabled()`, not
`/config/`, not `/playback/`, and not any request without `limits`. When it's unset or
empty, behaviour is exactly as if it didn't exist. Log the number of ids (not the ids) at
startup when it's set. Explain all of this in a comment next to it.

### 9. Tests

In `backend/tests`, following the style of the existing files, especially
`test_backcompat_lessons.py`.

**Back-compat** — for no header, `premium`, and `premium, social`: creating a second goal and
beyond, choosing Wealth Builder, writing to older goals, the dashboard budget type, closing a
month, and `/me/entitlements/` returning exactly the six keys all behave as today. Assert
that no extra `app_config` or `subscriptions` queries happen, the way the lessons tests do.

**Enforcement**, with a `limits` caller:

- `premium_enabled` off → nothing enforced
- paid → nothing enforced, `max_goals` is `None`
- unpaid → `goal_limit_reached` at the cap; General Savings, Reconciliation and completed
  goals don't count; completing the one goal frees the slot
- unpaid → `goal_locked` on every route in §6; deleting a locked goal succeeds; the active
  goal accepts every write
- unpaid → `budget_type_locked`; `balanced` accepted; a rejected patch applies nothing;
  unclosed months resolve to `balanced`; closed months keep their stamp; closing a month
  freezes `balanced`; `user_settings.budget_type` is not modified
- RevenueCat unreachable → write gates return 403; reads don't downgrade
- `premium_required` response is byte-identical to today
- `LIMITS_TEST_USER_IDS`: a listed user is enforced while `premium_enabled` is off; an
  unlisted user isn't; a listed user without `limits` is unaffected; `/config/` and
  `/playback/` are unaffected; unset or empty changes nothing

Run the whole suite. Everything must pass.

### 10. Docs

- `SUBSCRIPTION_REWORK.md`: mark Phase 1 built, and record anything that turned out
  different from the spec.
- `.claude/docs/lessons_page.md` and `.claude/docs/data_model.md`: update wherever they
  describe `PremiumRequired`, `/me/entitlements/`, or the capability tokens.
- Don't rewrite unrelated sections, and don't edit `CLAUDE.md`.

## Out of scope — don't touch

- **Any frontend code**, including adding `limits` to `CLIENT_FEATURES`. That's Phase 2.
- The RevenueCat webhook, including the TRANSFER bug in `SUBSCRIPTION_REWORK.md` §11
- Migrations, schema, and `app_config`
- Video-series gating logic (it already works; only expose `video_series` in entitlements)
- Bank sync beyond the `max_bank_connections` value
- Goal list ordering

## When you're done

Commit in small logical commits on `subscription`. Then report back with:

1. Every route and helper you changed, one line each
2. Every judgement call you made that this prompt didn't settle
3. Anything in the spec that didn't match the code
4. Test results: counts, and confirmation that no existing test was modified
5. A short post-deploy checklist: what to set in Render (`LIMITS_TEST_USER_IDS`), what to
   check on the current App Store build to confirm nothing changed for users, and a few
   example requests (with the `limits` header and a test account's token) that show each
   403
