# Subscription Rework — Rollout Plan

*Context file for the subscription/pricing rework. Read alongside
[.claude/docs/data_model.md](.claude/docs/data_model.md) and
[.claude/docs/lessons_page.md](.claude/docs/lessons_page.md). Last updated: 2026-09-13.*

---

## Status

| Phase | What | State |
|---|---|---|
| 0 | App Store Connect products + RevenueCat wiring | **DONE — verified end to end** |
| 1 | Backend: capability token, entitlements resolver, gates | **BUILT on `subscription` — 432 tests green, ready to merge and deploy** |
| 2a | Frontend: paywall (products, prices, trial, purchase) | **Unblocked — can start now** |
| 2b | Frontend: gating UI (locked goals, grayed states, budget lock) | Blocked on Phase 1 landing |
| 3 | Release: flip `premium_enabled` | After 2 ships and is approved |
| 4 | Contract: retire old products | Much later |

All blocking decisions are settled. Remaining questions in §13 are non-blocking.

### Branching and deployment

- Every change gets its own branch, **chained**: the first branches off `main`, each later
  one branches off the previous. Phase 1 lives on **`subscription`**.
- **Phase 1 merges into `main` as soon as it's done, and Render deploys it to production.**
  That's safe because old builds never send `limits`: current users get exactly today's
  behaviour. The Phase 2 branch is then created off the merged `main`, and the frontend
  branches merge later, for the final build.
- **Testing on a phone happens against production**, which the dev build already points at
  (`https://dollarseeds-1.onrender.com`). Two things make it work:
  - The dev build sends `limits` (added to `CLIENT_FEATURES` in Phase 2).
  - Test accounts are listed in the `LIMITS_TEST_USER_IDS` environment variable on Render.
    For those accounts only, on `limits` requests only, the limits are enforced as if
    `premium_enabled` were on. It never touches `/config/`, `/playback/`, or anyone else.
- **Never flip `app_config.premium_enabled` to test.** The shipped premium build reads it from
  `/config/` to decide what to lock. It flips at release (Phase 3).
- Test accounts: `custodiolucas555` (`44776d06-9114-48ce-95b6-40c58ce6c033`) and
  `appletester` (`63103554-5b72-4d59-9168-9968b559142b`). Anything created while testing is
  a real row in the production database.
- (CLAUDE.md's note that the frontend hardcodes `10.0.0.13:8000` is out of date — screens
  hardcode the Render address.)

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
app created for them. **Completed goals don't count either** — a free user who completes
their goal can create a new one.

**No grandfathering.** The rules apply to every user once all three hold: the new backend
is deployed, the user is on a build that sends the `limits` token, and `premium_enabled`
is `true`. Users still on an older build never send `limits`, so they keep today's
behaviour (unlimited goals, any budget type) until they update. At the time of deciding,
7 users had 2+ active goals and 9 were on a gated budget type.

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

**The oldest eligible goal by `created_at`.** Eligible means user-created and not
completed — `is_general`, `is_reconciliation` and completed goals are excluded, as they
are from the cap. Every other eligible goal is **locked**.

**Locked goals are enforced by the server, not just grayed in the UI.** For a `limits`
client that isn't entitled, any write that targets a locked goal is refused with
`goal_locked` (§7): deposits or withdrawals, transfers from General Savings, editing,
completing, finishing, and deleting its transactions. **Deleting the goal itself is always
allowed** — the existing delete already returns prior-month deposits to General Savings.

`GET /savings/goal/` adds a `locked` boolean to each goal for `limits` clients, so the
app doesn't have to re-derive the rule.

Deliberately chosen over a user-nominated "favourite" for simplicity. Consequences:

- **No schema change.** It is a query, not stored state.
- **No promotion logic.** Delete or complete the active goal and the next-oldest simply
  *is* the active one on the next read. Nothing to maintain.
- **No backfill.** The rule applies identically to existing users from day one.
- **Accepted trade-off:** the user has no say. If their oldest goal is minor and their
  newest is the one that matters, the important one grays out.

> **Ordering — DECIDED and BUILT.** `GET /savings/goal/` used to sort `created_at`
> **descending**, so the active goal landed at the *bottom* of the list, under every
> grayed one. For a `limits` client it now sorts **oldest first**, `id` breaking ties
> (the same key that picks the active goal). General Savings is seeded before a user's
> first goal, so it heads the list and the active goal sits directly below it — which
> is what this note asked for. It is also the better order on its own merits: a goal
> set long ago has usually had the most put into it.
>
> **Only for `limits` clients.** A reordered list crashes nothing, but "today's
> response in a different order" is not today's response, so the App Store binaries
> keep newest-first. `GET /savings/goal/completed/` is untouched — most recent
> achievement first is right for that tab.

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
prevent. Check the marker **first**, so a request without `limits` issues no extra queries.

> **As built** (see Phase 1 in §8): the resolver returns an `_Entitlements` object rather
> than a dict, and the marker check is the first thing *inside* it rather than at each
> gate. The two failure postures below are two separate things to ask it — `enforced` for
> a write, `enforced_on_reads` for a read — because a gate that reads the wrong one is a
> silent bug rather than a loud one.

**Failure posture when RevenueCat can't be reached:** gates on writes fail closed to the
relevant 403 (same reasoning as `/playback/`); reads never downgrade — a dashboard doesn't
drop a paying user to Balanced because a lookup timed out.

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
| `budget_type_locked` | `PATCH /settings/` choosing a gated budget type |
| `goal_locked` | Any write targeting a locked goal, except deleting it (§5) |

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

### Phase 1 — Backend. BUILT.

All in `backend/main.py`, on branch `subscription`. Everything below is implemented and
tested; nothing activates without the `limits` token, so it merges into `main` and
deploys to production as it stands.

- New capability token `limits`, alongside `PREMIUM_FEATURE` and `SOCIAL_FEATURE`
- The `_entitlements()` resolver (§6)
- `PremiumRequired` generalized to carry a code and detail (§7)
- Goal cap on `POST /savings/goal/` → `goal_limit_reached`
- Locked-goal enforcement on every goal write except deleting the goal → `goal_locked`;
  `locked` flag on `GET /savings/goal/` (§5)
- `PATCH /settings/` refuses a gated budget type → `budget_type_locked`
- One "effective budget type" rule (`_live_budget_type`) used everywhere the live setting
  is read: unclosed months resolve to `balanced` for an unentitled `limits` client. That
  includes `_frozen_stamp()`, so closing a month freezes what was shown, and the
  per-income-row snapshot. The stored `user_settings.budget_type` is never rewritten, so
  resubscribing restores it
- `/me/entitlements/` extended with the Style A fields, for `limits` clients only
- `LIMITS_TEST_USER_IDS` env var for testing against production (see Branching and deployment)
- Back-compat tests asserting unmarked, `premium` and `premium, social` requests behave
  exactly as they do today

**No migration.** Goal counts are derivable, the active-goal rule is a query over
`created_at` (§5), and budget types read existing columns.

**Tests:** 432 green, 147 of them new. `backend/tests/test_backcompat_limits.py` is the
back-compat half (every assertion parametrized over all three shipped generations, with
the kill switch on and no subscription, so the state *would* be enforced for a `limits`
caller); `backend/tests/test_limits.py` is the enforcement half. No existing test was
modified.

#### What came out different from the spec above

Eight things, none of them a change of behaviour the spec described — but each is a place
where reading §6 or §7 alone would leave you expecting something else.

1. **The resolver returns an object, not a dict.** §6 sketched
   `_entitlements() -> dict`. It returns an `_Entitlements` instance instead, because the
   two failure postures need to be *askable* rather than baked into one number: `enforced`
   (writes, fail closed) and `enforced_on_reads` (reads, fail open), plus
   `budget_types_for(write=…)` and `locked_goal_ids(write=…)` which select between them.
   The goal rows are loaded lazily and at most once per request.
2. **The marker check moved inside the resolver.** §6 wrote
   `enforced = LIMITS_FEATURE in features and not paid`, i.e. at each gate. It is now the
   first two lines of `_entitlements()`, which returns an inert object having issued no
   query at all. Same guarantee, but it cannot be forgotten at the thirteenth call site —
   which is the argument §6 makes for having a resolver in the first place.
3. **A gate must ask for the write posture explicitly, and one initially did not.**
   `PATCH /settings/` first compared the requested type against the fail-*open*
   allowance list, so during a RevenueCat outage `wealth_builder` was accepted while
   `_live_budget_type` went on resolving the month to `balanced` — a stored choice the
   dashboard ignored, with nothing to explain it. Found by the "writes fail closed" test.
   Hence `budget_types_for(write=True)`, and a test asserting both postures on one
   resolver.
4. **`POST /savings/transfer/` checks both goal ids.** §5 named the destination
   (`to_goal_id`). The route also writes a withdrawal against the client-supplied
   `general_goal_id`, and a locked goal in that slot is just as much a write to it. No
   legitimate client is affected — that slot always holds General Savings.
5. **The goal cap applies to *every* create by an enforced caller**, including one
   flagged `is_general`. Exempting the flag would have handed any client an
   unlimited-goals bypass, and no client needs the route for General Savings (the server
   seeds it lazily).
6. **`_live_budget_type` reaches two more request paths** than §7's "at least" list:
   `GET /dashboard/trends/` and `GET /rollover/preview/`. Both read the live setting for
   unclosed months, so leaving them out would have made them disagree with the dashboard.
   `reconcile_month` takes the argument too, though it can't move money with it — the
   rollover target is *net* leftover and no split affects it.
7. **`_client_features` moved to the top of `main.py`.** FastAPI evaluates `Depends(...)`
   when a handler is *defined*, and the first handler that needs it is now the dashboard,
   hundreds of lines above the subscription section. The tokens themselves stay put. A
   side effect: the client-mix counters now see most of the API rather than the lesson
   routes alone, so the log line reads `requests` instead of `lesson requests`.
8. **Closing a month freezes the *read* posture.** `_frozen_stamp` goes through
   `_live_budget_type`, which fails open — so in the middle of a RevenueCat outage an
   unpaid user closing a month freezes the gated split they were still being shown.
   That is the intended reading of "freezes what the user was shown", and the alternative
   (freezing `balanced` for someone whose dashboard said Wealth Builder) is worse.

Two things deliberately left alone: `GET /settings/` still returns the raw row, and
`GET /savings/goal/` kept its newest-first sort at the time of writing; §13 q1 has since
been decided and the oldest-first order is built (see §5).

### Phase 2a — Paywall. Unblocked.

Product cards, $9.99/$69.99, trial copy gated on eligibility, purchase, restore, "Current
plan" label. Needs only RevenueCat, which is done.

### Phase 2b — Gating UI. Needs Phase 1 landed + §5 confirmed.

Locked/grayed goal states, goal-cap messaging, budget-type lock.

Test the dev build against production (Phase 1 is deployed by then), signed in as an account
listed in `LIMITS_TEST_USER_IDS`. Purchases go through RevenueCat sandbox.

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

1. ~~How the goals list reorders so the active goal isn't buried under grayed ones.~~
   **DECIDED 2026-09-28: oldest first, newest last, for `limits` clients only. Built —
   see §5.**
2. How bank sync gates in practice, beyond the 0/1 connection cap. **Deferred — after
   the subscription frontend ships.**
3. Whether the paywall leads with Yearly or presents both equally. **Deferred to the
   paywall design, in Phase 2a.**
4. How consumer pricing interacts with the B2B partner track — partner seats were quoted
   at $6 each, below the $9.99 consumer price, leaving no rev-share margin. **Deferred —
   there is no partner to price for yet.**
