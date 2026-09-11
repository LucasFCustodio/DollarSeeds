# Subscription Rework — Rollout Plan

*Context file for the subscription/pricing rework. Read alongside [data_model.md](data_model.md) and [lessons_page.md](lessons_page.md). Last updated: 2026-09-11.*

> **Phase 1 is NOT approved for implementation.** Lucas is re-reading it before it is
> scoped. Do not write backend gating code, migrations, or a Phase 1 task breakdown
> until he says Phase 1 is settled. Everything in §2–§4 and Phase 0 *is* decided and
> may be acted on.

---

## Status

| Phase | What | State |
|---|---|---|
| 0 | App Store Connect products + RevenueCat wiring | Decided, not started |
| 1 | Backend: capability tokens, entitlements resolver, gates | **Under review — do not implement** |
| 2 | Frontend: `limits` token, paywall, locked/grayed states | Blocked on 0 (paywall) and 1 |
| 3 | Release: flip `premium_enabled` | After 2 ships |
| 4 | Contract: retire old products | Much later |

---

## 1. Why

The current model has four subscription tiers, a $40/month top tier, and premium value
limited to a video series. It confuses users, reads as greedy, and has produced **zero
external subscribers** — the only active row in `subscriptions` is Lucas's own production
purchase of `com.dollarseeds.support.monthly.5`; the other two rows are expired sandbox
tests.

The fix is one plan at a credible price, with premium that *limits* the core features
rather than locking them away, so the free tier still builds a habit.

---

## 2. Pricing — decided

| | Price | Notes |
|---|---|---|
| **Premium Monthly** | $9.99/mo | Nets ~$8.49 after Apple's 15% Small Business rate |
| **Premium Yearly** | $69.99/yr | 41.6% off monthly ($119.88). Nets ~$59.49 |

Display names are **"Premium Monthly"** and **"Premium Yearly"** — use these exact strings.

Market context at time of writing: EveryDollar $17.99/mo or $79.99/yr; YNAB $14.99/$109;
Monarch $14.99/$99.99; Copilot $13/$95; Rocket Money $7–14 user-chosen. DollarSeeds
undercuts all but Rocket Money and stays below EveryDollar annually, which matters
because EveryDollar draws from substantially the same audience.

**Free trial:** 1 month, delivered as an Apple **Introductory Offer**, card required.
Apple grants one trial per Apple ID *per subscription group*, so a user who trials
Monthly cannot also trial Yearly.

---

## 3. Free vs Premium — decided

Premium limits the amount of a feature a user gets; it does not hide the feature.

**Free keeps:**

- The tithing envelope — in full. This is the app's differentiator and its word-of-mouth
  hook in church communities; it is never gated.
- General Savings, with all functions.
- **One goal** (savings *or* debt), with every function working on it: setting money
  aside, transfers from General Savings, marking complete.
- Goal destination and reporting on completion or on moving money. Basic information
  about a user's own money is never gated.
- The news tab.
- The **Balanced** budget type (50/30/20).

**Premium adds:**

- Unlimited savings and debt goals.
- The other budget types — `wealth_builder` (30/20/50) and `firm_foundation` (70/10/20).
- Video series.
- Bank sync, when it ships. Mechanism undecided; it must be premium because Plaid costs
  per connected user and free users would be pure cost.

---

## 4. Downgrade behaviour — decided (one open question)

When a subscriber lapses:

- **Goals are never deleted.** Extra goals stay visible but grayed out.
- A grayed goal can be **deleted**, and its money returns to General Savings. It cannot
  receive transfers from General Savings, cannot have money set aside, and cannot be
  marked complete.
- The user keeps **one active goal**.
- **Closed months keep the budget type they were closed with** — permanently, regardless
  of subscription state. This already works; see §7.
- **Unclosed months fall back to `balanced`.**

> **OPEN:** when a user with several goals lapses, which one stays active? Oldest by
> `created_at` requires no schema change and is predictable. Letting the user choose is
> friendlier but needs a column. Not yet decided.

---

## 5. Rollout

### Phase 0 — App Store Connect + RevenueCat. No code.

Only the *frontend paywall* depends on this; backend work does not, because `product_id`
is reporting-only and every product maps to the same entitlement.

- Create both products in the **same subscription group** as the existing four, so Apple
  handles upgrade/downgrade proration.
- **Do not encode price in the product ID.** The existing IDs
  (`com.dollarseeds.support.monthly.5`, `com.dollarseeds.support.monthly.20`) bake the
  price into the SKU, which is exactly why they cannot be reused now. Product IDs are
  permanent and non-reusable. Use `com.dollarseeds.premium.monthly` and
  `com.dollarseeds.premium.yearly`.
- Add the 1-month free trial as an Introductory Offer on both.
- Mark the four old products unavailable for new purchase. They cannot be deleted, and
  Lucas's own active `support.monthly.5` subscription must keep renewing.
- In RevenueCat, attach both new products to the existing `premium` entitlement. That is
  the whole integration — `_is_entitled()` does not care which product granted access.

### Phase 1 — Backend. **UNDER REVIEW. DO NOT IMPLEMENT.**

Shape only, for review — not a spec:

- A new capability token `limits`, alongside `PREMIUM_FEATURE` and `SOCIAL_FEATURE`.
- A capability-based entitlements resolver replacing the single `_is_entitled()` call
  site (see §6).
- Goal-cap enforcement on `POST /savings/goal/`, surfaced through the existing
  `PremiumRequired` handler with a new code (e.g. `goal_limit_reached`).
- Budget-type gating in `_month_budget_type`'s live branch only.
- `/me/entitlements/` extended with the capability set.
- Back-compat tests asserting unmarked and `premium`-only requests reach goals and
  settings exactly as they do today.

No migration is expected: goal counts are derivable and budget types read existing
columns.

Because nothing here activates without the `limits` token, **this phase can deploy to
production the day it is written** and remain invisible to every shipped binary.

### Phase 2 — Frontend

- Add `limits` to `CLIENT_FEATURES` in [axiosConfig.ts](../../frontend/lib/axiosConfig.ts).
- Build the paywall against the new RevenueCat offering.
- Build the locked/grayed goal states and the budget-type lock.
- Test on TestFlight **against production** — that build sends `limits` and gets the new
  behaviour with real data. Purchases go through RevenueCat sandbox, which already writes
  `environment = 'sandbox'` rows.

### Phase 3 — Release

Ship with `app_config.premium_enabled` still `false`, so the new binary installs and
behaves free. Once approved and rolling out, flip it to `true` in the Supabase dashboard
— no redeploy, no app update, and it still works when a bad deploy is what broke things.
Flipping it back is the rollback.

### Phase 4 — Contract

Retire the old products once no one holds them. This is Lucas's to run by hand.

---

## 6. Why there is no staging server

The `X-Client-Features` mechanism already does this job, and does it better.

The backend keys behaviour off what the *calling build* understands. A new token means
new gates activate only for builds that send it, so new backend code can ship to
production while every shipped binary keeps its exact current behaviour — permanently,
not just during development.

A second Render service would be worse:

- It tests new code against *new* clients. What breaks users is new code against *old*
  clients, and only the back-compat test suite catches that.
- It needs a second Supabase project to be meaningful, which means testing against empty
  data.
- Subscription environments are already separated — `subscriptions.environment` holds
  `production` vs `sandbox`, and RevenueCat sandbox is the dev environment.

The one thing staging would genuinely help with is rehearsing a risky migration, and
[CLAUDE.md](../../CLAUDE.md) forbids risky migrations.

---

## 7. Entitlements: capability set, not a boolean

Today `_is_entitled(user_id)` returns a bool and is called in **exactly one place** —
`/lessons/{lesson_id}/playback/`. That is fine for one gate. The rework adds several:
goal count, budget types, video series, bank sync, and whatever the uniqueness pillar
becomes.

Extended naively, this line gets copied into every gated route:

```python
if _premium_enabled() and LIMITS_FEATURE in features and not _is_entitled(user_id):
    raise PremiumRequired(...)
```

Resolve it once instead:

```python
def _entitlements(user_id: str, features: set) -> dict:
    paid = (not _premium_enabled()) or _is_entitled(user_id)
    enforced = LIMITS_FEATURE in features and not paid
    return {
        "premium":      paid,
        "max_goals":    1 if enforced else None,          # None = unlimited
        "budget_types": ["balanced"] if enforced else list(BUDGET_TYPES),
        "video_series": paid,
        "bank_sync":    paid,
    }
```

Why:

- **One place to change the rules.** Free gets two goals instead of one? One line.
- **Back-compat lives in one place.** `LIMITS_FEATURE in features` is what protects
  shipped binaries. Scattered across six routes it gets forgotten at the seventh.
- **The client stops hardcoding the numbers.** `/me/entitlements/` returns `max_goals`
  and the UI renders whatever it says, so the cap can change server-side with no app
  update. Given that shipped binaries can never be force-updated, this is the biggest win.
- **It extends a decision already made.** `/me/entitlements/` already documents that
  `product_id` is reporting-only and that every tier grants the same entitlement.
  Capabilities, not tiers — this turns one boolean into a named set before there are six.
- **B2B partner editions** need different caps in the same binary. A resolver absorbs
  that; scattered tier checks do not.

---

## 8. Already built — do not rebuild

- **Budget-type freezing.** `_frozen_stamp()` writes `budget_type` into `month_status` at
  close-out, and `_month_budget_type()` reads the frozen value for closed months and the
  live setting otherwise. "Closed months keep their budget type" therefore already works.
  Only the *live* branch needs the not-entitled → `balanced` fallback.
- **`/me/entitlements/`** exists and returns `premium_active`, `expires_at`, `product_id`,
  `pending_product_id`, `store`, `auto_renew`.
- **RevenueCat webhook** at `POST /webhooks/revenuecat`, with `_has_premium()` reading the
  local table and `_entitlement_via_revenuecat()` as the miss fallback. Entitlement is
  driven by `expires_at`/`revoked_at`, not by `status`, because RevenueCat delivers
  refunds as cancellations.
- **The kill switch.** `app_config.premium_enabled` defaults to `"false"`, gates marked
  clients only, fails open, and needs no redeploy.
- **Two capability tokens** already in production: `premium` and `social`.

---

## 9. Hard rules for this work

- **Never repurpose a capability token.** Add one. The frontend list is `CLIENT_FEATURES`
  in `axiosConfig.ts`; the backend constants sit near `PREMIUM_FEATURE` in `main.py`.
- **An unmarked request must issue exactly the queries it issued before.** Gate the
  `select()`, not just the response shape. `test_backcompat_lessons.py` asserts this.
- **Hiding premium content from unmarked clients is backward compatibility, not a business
  rule.** It is not behind the kill switch and must survive every rollback.
- **No published series is ever retro-paywalled.** "The Truth on Generosity" is
  `is_premium = false` permanently. Whatever premium video value this plan assumes has to
  come from series not yet shipped.
- **Expand → contract.** See [CLAUDE.md](../../CLAUDE.md). Additive only; two releases for
  any reshape.
- **Never commit to `main`.**

---

## 10. Open questions

1. Which goal stays active when a multi-goal user lapses (§4).
2. How bank sync gates — per-connection limit, or all-or-nothing.
3. Whether the paywall leads with Yearly (higher cash up front, kills monthly churn) or
   shows both equally.
4. How consumer pricing interacts with the B2B partner track — partner seats were quoted
   at $6 each, below the new $9.99 consumer price, which leaves no rev-share margin.
