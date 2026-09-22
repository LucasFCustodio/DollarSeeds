# Subscription Rework — Rollout Plan

*Context file for the subscription/pricing rework. Read alongside
[.claude/docs/data_model.md](.claude/docs/data_model.md) and
[.claude/docs/lessons_page.md](.claude/docs/lessons_page.md). Last updated: 2026-09-13.*

---

## Status

| Phase | What | State |
|---|---|---|
| 0 | App Store Connect products + RevenueCat wiring | **DONE — verified end to end** |
| 1 | Backend: capability token, entitlements resolver, gates | **Decided and specified — ready to implement** |
| 2a | Frontend: paywall (products, prices, trial, purchase) | **Unblocked — can start now** |
| 2b | Frontend: gating UI (locked goals, grayed states, favourite picker, budget lock) | Blocked on Phase 1 landing |
| 3 | Release: flip `premium_enabled` | After 2 ships and is approved |
| 4 | Contract: retire old products | Much later |

All blocking decisions are settled. Remaining questions in §13 are non-blocking.

---

## 1. Why

Four subscription tiers, a $40/month top tier, and premium value limited to a video
series. It confused users, read as greedy, and produced **zero external subscribers**.

The fix is one plan at a credible price, with premium that *limits* core features rather
than locking them away, so the free tier still builds a habit.

---

## 2. Pricing — live in App Store Connect

| | Price | Notes |
|---|---|---|
| **Premium Monthly** | $9.99/mo | ~$8.49 after Apple's 15% Small Business rate |
| **Premium Yearly** | $69.99/yr | 41.6% off monthly ($119.88). ~$59.49 net |

Display names are **"Premium Monthly"** and **"Premium Yearly"** — use these exact strings.

**Free trial:** 1 month, as an Apple Introductory Offer, card required. Effective
2026-09-12, no end date, all three territories.

> Apple grants **one introductory offer per Apple ID per subscription group**. The group
> holds all ten products, so anyone who consumed a trial on a legacy tier is ineligible.
> The paywall MUST check eligibility (`checkTrialOrIntroDiscountEligibility`) rather than
> promising a free month unconditionally.

Market context: EveryDollar $17.99/mo or $79.99/yr; YNAB $14.99/$109; Monarch
$14.99/$99.99; Copilot $13/$95; Rocket Money $7–14. DollarSeeds undercuts all but Rocket
Money and stays below EveryDollar annually — which matters, because EveryDollar draws
from substantially the same audience.

---

## 3. App Store Connect — current state

Subscription group **"DS Subscriptions"**, ID `22303225`. Available in **3 territories
only: United States, Canada, Brazil** (deliberate — the app ships nowhere else).

| Level | Product | Status |
|---|---|---|
| 1 | `com.dollarseeds.premium.yearly` | Ready for Review |
| 2 | `com.dollarseeds.premium.monthly` | Ready for Review |
| 3 | the 8 legacy `com.dollarseeds.support.*` products | Approved |

**Level 1 is the highest service level.** This ordering is deliberate:

| Change | Behaviour |
|---|---|
| Legacy → Premium Monthly or Yearly | Upgrade — immediate, prorated refund of the old |
| Premium Monthly → Premium Yearly | Upgrade — immediate, prorated, new annual term starts now |
| Premium Yearly → Premium Monthly | Downgrade — accepted and scheduled for the end of the annual term |

Apple never *refuses* a downgrade; it defers it. UI copy must say "Your plan changes to
Premium Monthly on <date>", never an error.

**Not yet submitted.** Both new products carry a placeholder review screenshot. Replace it
with a real shot of the new paywall before Add for Review — the store description promises
unlimited goals, and a screenshot of the old four-tier paywall invites a rejection.

**Legacy products stay on sale** until adoption of the new build is high (Phase 4).
Removing them early leaves installed binaries with a dead purchase flow.

---

## 4. Free vs Premium — final

Premium limits the amount of a feature; it does not hide the feature.

**Free keeps:**

- The tithing envelope, in full. The app's differentiator and its word-of-mouth hook in
  church communities. Never gated.
- General Savings, with all functions.
- **One goal** (savings *or* debt), with every function: setting money aside, transfers
  from General Savings, marking complete.
- Goal destination and reporting. Basic information about a user's own money is never gated.
- The news tab.
- The **Balanced** budget type (50/30/20).

**Premium adds:**

| Item | Free | Premium |
|---|---|---|
| Savings & debt goals | 1 | unlimited |
| Budget types | `balanced` only | + `wealth_builder`, `firm_foundation` |
| Video series | free series only | all |
| Bank connections | 0 | **1** (v1 — mechanism TBD) |

**Goal-cap rules:** goals flagged `is_general` (General Savings) and `is_reconciliation`
(auto-created at month close) **do NOT count toward the cap**. Only user-created savings
and debt goals count. A user must never be locked out of their one free goal by a goal the
app created for them.

---

## 5. Downgrade behaviour

When a subscriber lapses:

- **Goals are never deleted.** Extra goals stay visible but grayed out.
- A grayed goal can be **deleted**, and its money returns to General Savings. It cannot
  receive transfers, have money set aside, or be marked complete.
- The user keeps **one active goal**.
- **Closed months keep the budget type they were closed with** — permanently. Already
  works; see §9.
- **Unclosed months fall back to `balanced`.**

### Which goal stays active (DECIDED)

**The oldest eligible goal by `created_at`.** Eligible means user-created — `is_general`
and `is_reconciliation` are excluded, as they are from the cap.

Deliberately chosen over a user-nominated "favourite" for simplicity. Consequences:

- **No schema change.** It is a query, not stored state.
- **No promotion logic.** Delete or complete the active goal and the next-oldest simply
  *is* the active one on the next read. Nothing to maintain.
- **No backfill.** The rule applies identically to existing users from day one.
- **Accepted trade-off:** the user has no say. If their oldest goal is minor and their
  newest is the one that matters, the important one grays out.

> **Ordering.** `GET /savings/goal/` currently sorts `created_at` **descending** — newest
> first — so the active goal lands at the *bottom* of the list, under every grayed one.
> Pin it directly below General Savings, or the feature reads as broken.

---

## 6. The entitlements contract — Style A (allowances)

`GET /me/entitlements/` returns **values, not verdicts**. The server states what the user
is allowed; the client renders whatever it says.

The reason is un-updatable binaries: with allowances, changing the free tier to two goals
is a one-line server change every installed build obeys. With booleans, the number lives in
the app's copy and needs an App Store update.

```json
{
  "premium_active": false,
  "expires_at": null,
  "product_id": null,
  "pending_product_id": null,
  "store": null,
  "auto_renew": false,

  "max_goals": 1,
  "goals_used": 3,
  "budget_types": ["balanced"],
  "video_series": "free_only",
  "max_bank_connections": 0
}
```

| Field | Meaning |
|---|---|
| `max_goals` | Cap on user-created savings/debt goals. `null` = unlimited |
| `goals_used` | Current count, excluding `is_general` and `is_reconciliation` |
| `budget_types` | Allowed keys from `BUDGET_TYPES` |
| `video_series` | `"free_only"` or `"all"` |
| `max_bank_connections` | `0` free, `1` premium. `null` = unlimited |

Entitled values: `max_goals: null`, `budget_types: ["balanced","wealth_builder","firm_foundation"]`,
`video_series: "all"`, `max_bank_connections: 1`.

**Hard constraint:** `premium_active`, `expires_at`, `product_id`, `pending_product_id`,
`store`, `auto_renew` must stay exactly as they are — the shipped premium build reads them.
**New fields are additive only. Never remove or rename an existing key.**

### The resolver

Resolve once per request rather than repeating the check at each gate:

```python
def _entitlements(user_id: str, features: set) -> dict:
    paid = (not _premium_enabled()) or _is_entitled(user_id)
    enforced = LIMITS_FEATURE in features and not paid
    ...
```

`LIMITS_FEATURE in features` is what protects shipped binaries. Scattered across six
routes it gets forgotten at the seventh — which is what this whole architecture exists to
prevent.

---

## 7. Error codes

Today `PremiumRequired` returns 403 with a top-level `code` so the client can tell "you
need to subscribe" apart from any other 403 and render a paywall instead of a generic
error. It is raised in exactly one place — `/lessons/{id}/playback/`.

```python
{"code": "premium_required", "detail": "This series is part of DollarSeeds Premium."}
```

**Generalize the exception to carry a code and detail.** Keep `premium_required`
byte-identical — the shipped build branches on that exact string — and add new codes
alongside it:

| Code | Raised when |
|---|---|
| `premium_required` | **unchanged.** Premium series playback, unentitled |
| `goal_limit_reached` | `POST /savings/goal/` at the cap |

The detail string differs per code; a video needs the full paywall, a goal cap needs an
inline upsell next to the button.

Keep the fail-closed-to-403 posture: when RevenueCat is unreachable a 403 renders
something the user can act on, a 500 renders a dead end.

---

## 8. Rollout

### Phase 0 — DONE

Verified end to end on 2026-09-13 from a dev build:

- `getOfferings()` returns `default` and `premium-2026`
- `premium-2026` → `$rc_annual`/`...premium.yearly`/$69.99 and `$rc_monthly`/`...premium.monthly`/$9.99, both with a 1-month intro offer (`P1M`, price 0)
- Sandbox purchase → `INITIAL_PURCHASE` (`period_type: TRIAL`, price 0.0) → webhook → `subscriptions` row (`environment: sandbox`) → premium lessons unlocked
- Trial converted: `RENEWAL` (`period_type: NORMAL`, price 9.99), **same `store_txn_id`** — the row updated rather than duplicating

**RevenueCat offering split:**

| Offering | Packages | Current? | Fetched by |
|---|---|---|---|
| `default` | the 8 legacy | **yes** | shipped binaries (`OFFERING_ID = 'default'`) |
| `premium-2026` | `$rc_annual`, `$rc_monthly` | no | the new build |

Both new products attach to the **existing `premium` entitlement** — `PREMIUM_ENTITLEMENT_ID = "premium"`
is hardcoded in `main.py`. The 8 legacy products stay attached; detaching them revokes
access for existing subscribers.

`OFFERING_ID` in `frontend/constants/premium.ts` is now `premium-2026`.

> **Never put new products in `default`.** Doing so makes shipped binaries render them on
> the old four-tier paywall, mislabelled, purchasable, and granting nothing new.

### Phase 1 — Backend. Decided, ready to implement.

- New capability token `limits`, alongside `PREMIUM_FEATURE` and `SOCIAL_FEATURE`
- The `_entitlements()` resolver (§6), replacing the single `_is_entitled()` call site
- Goal-cap enforcement on `POST /savings/goal/` → `goal_limit_reached`
- Budget-type gating in `_month_budget_type`'s **live branch only**
- `/me/entitlements/` extended with the Style A fields
- Back-compat tests asserting unmarked and `premium`-only requests reach goals and
  settings exactly as they do today

**One migration is required** — `savings_goals.is_favorite` (§5). Nullable, additive, plus
a partial unique index; it passes CLAUDE.md's five-point gate. Goal counts stay derivable
and budget types read existing columns, so nothing else needs schema.

Also required with it: the no-favourite fallback (oldest eligible goal) and auto-promotion
on delete/completion — both in §5.

**Deployable to production the day it is written** — nothing activates without the `limits`
token, so it is invisible to every shipped binary.

### Phase 2a — Paywall. Unblocked.

Product cards, $9.99/$69.99, trial copy gated on eligibility, purchase, restore, "Current
plan" label. Needs only RevenueCat, which is done.

### Phase 2b — Gating UI. Needs Phase 1 landed + §5 confirmed.

Locked/grayed goal states, goal-cap messaging, budget-type lock.

Test on TestFlight **against production** — that build sends `limits` and gets the new
behaviour with real data. Purchases go through RevenueCat sandbox.

### Phase 3 — Release

Ship with `app_config.premium_enabled` still `false`, so the new binary installs and
behaves free. Once approved and rolling out, flip it to `true` in the Supabase dashboard —
no redeploy, no app update, and it still works when a bad deploy is what broke things.
Flipping it back is the rollback.

Products must be **Approved** before this, plus up to 24h of store propagation.

### Phase 4 — Contract

Retire the legacy products once no one holds them. Lucas runs this by hand.

---

## 9. Already built — do not rebuild

- **Budget-type freezing.** `_frozen_stamp()` writes `budget_type` into `month_status` at
  close-out; `_month_budget_type()` reads the frozen value for closed months and the live
  setting otherwise. "Closed months keep their budget type" already works. Only the *live*
  branch needs the not-entitled → `balanced` fallback.
- **`/me/entitlements/`** exists, returning `premium_active`, `expires_at`, `product_id`,
  `pending_product_id`, `store`, `auto_renew`.
- **RevenueCat webhook** at `POST /webhooks/revenuecat`. Entitlement is driven by
  `expires_at`/`revoked_at`, not `status`, because RevenueCat delivers refunds as
  cancellations. `_has_premium()` reads the local table, `_entitlement_via_revenuecat()` is
  the miss fallback, both cached 60s.
- **The kill switch.** `app_config.premium_enabled` defaults to `"false"`, gates marked
  clients only, fails open, needs no redeploy.
- **Two capability tokens** in production: `premium` and `social`.

---

## 10. Known landmines in the frontend

All in `frontend/constants/premium.ts` and `frontend/lib/purchases.ts`:

- **`PRODUCT_MAP` has no entries for the new product IDs.** `describeProduct()` returns
  `null`, so the paywall's "Current plan" line and the Settings row go blank for exactly
  the people who just paid.
- **`TierKey` / `TIER_ORDER` / `PACKAGE_MAP` encode the dead four-tier model.** Under the
  new plan there is one tier with two billing periods.
- **The period fallback in `loadTierOptions()` is wrong for `$rc_` identifiers:**
  `pkg.identifier.endsWith('_yearly')` is `false` for `$rc_annual`, so the annual plan is
  grouped as monthly. Currently visible on the old paywall.
- **i18n.** Read [.claude/docs/i18n.md](.claude/docs/i18n.md) before touching any
  user-facing string. Paywall copy lives in `locales/<lang>/premium.json`; the
  `premium:tier.*` keys become obsolete. Run `npm run check-locales` and
  `npm run verify-i18n`.

---

## 11. Deferred bugs — NOT in Phase 1

**The webhook ignores `TRANSFER` events.** `POST /webhooks/revenuecat` logs them to
`subscription_events` but never acts on them: TRANSFER payloads carry `transferred_from` /
`transferred_to` arrays instead of `app_user_id`, so the handler stores a null
`app_user_id` and leaves the `subscriptions` row on the old user.

Observed 2026-09-12 — the production subscription `com.dollarseeds.support.monthly.5`
(txn `90003425703756`) transferred lucasquality555 → custodiolucas555 → appletester as
accounts were switched on one device, while `subscriptions` still showed it active on
lucasquality555. **In production this leaves the old account entitled indefinitely.**

Scheduled for after the subscription frontend is finalised.

---

## 12. Hard rules

- **Never repurpose a capability token.** Add one. Frontend list is `CLIENT_FEATURES` in
  `frontend/lib/axiosConfig.ts`; backend constants sit near `PREMIUM_FEATURE` in `main.py`.
- **An unmarked request must issue exactly the queries it issued before.** Gate the
  `select()`, not just the response shape. `test_backcompat_lessons.py` asserts this.
- **Hiding premium content from unmarked clients is backward compatibility, not a business
  rule.** Not behind the kill switch; must survive every rollback.
- **No published series is ever retro-paywalled.** "The Truth on Generosity" is
  `is_premium = false` permanently. Premium video value must come from series not yet
  shipped.
- **Expand → contract.** See [CLAUDE.md](CLAUDE.md). Additive only; two releases for any
  reshape.
- **Never commit to `main`.**

---

## 13. Open questions

1. Where reconciliation goals sort relative to the favourite (§5). Minor; decide when building.
2. How bank sync gates in practice, beyond the 0/1 connection cap.
3. Whether the paywall leads with Yearly or presents both equally.
4. How consumer pricing interacts with the B2B partner track — partner seats were quoted
   at $6 each, below the $9.99 consumer price, leaving no rev-share margin.
