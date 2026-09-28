# Phase 2 — Subscription frontend

> Paste everything below the line into a fresh Claude Code chat.

---

## Before you start

1. Create a new `change-X-branch` off `main`, where X is the next unused number. Never
   commit to `main`. Run `git branch --show-current` and confirm before editing anything.
2. Read these, in order:
   - `CLAUDE.md`
   - `SUBSCRIPTION_REWORK.md`, all of it. §2, §4, §5, §6, §7 and §10 are the spec for this
     work; the "Branching and deployment" section tells you how to test it.
   - `.claude/docs/i18n.md` — **before you touch a single user-facing string**
   - `.claude/docs/design_system.md`
   - `.claude/docs/architectural_patterns.md`
   - `.claude/docs/lessons_page.md`, the "Premium gating" section
3. `SUBSCRIPTION_REWORK.md` holds the decisions. If this prompt and that file disagree, or
   the code doesn't match what they describe, stop and ask me. Don't guess.

**Phase 1 is done.** The backend is merged, deployed and verified against production. Every
endpoint below already works today. You are not waiting on anything server-side, and you
should not need to change `backend/` at all — if you think you do, stop and tell me why.

## The two rules that override everything else

**1. Nothing you build may reach a build that can't handle it.** The backend tells builds
apart by `X-Client-Features`. Three generations are already installed and unpatchable: no
header, `premium`, and `premium, social`. Adding `limits` to `CLIENT_FEATURES` is what
switches this whole release on, and it is one line in
[frontend/lib/axiosConfig.ts](frontend/lib/axiosConfig.ts). Add the token, never repurpose
one, and update the comment block above it in the same style as the other two.

**2. Render the server's numbers. Never hardcode them.** `GET /me/entitlements/` returns
`max_goals`, `budget_types` and `max_bank_connections` as VALUES precisely so the free tier
can change without an App Store release. The moment a screen says "1 goal" in its copy, that
property is gone. Use `{{count}}` interpolation and the number from the server. This is §6
of the rework doc and it is the reason the contract is shaped the way it is.

## What the backend already serves

| Endpoint | What's new for a `limits` client |
|---|---|
| `GET /me/entitlements/` | the six existing keys, plus `max_goals` (`null` = unlimited), `goals_used`, `budget_types`, `video_series`, `max_bank_connections` |
| `GET /savings/goal/` | a `locked` boolean per goal, and the list is sorted **oldest first** |
| `POST /savings/goal/` | `403 {"code": "goal_limit_reached", "detail": "..."}` at the cap |
| `PATCH /settings/` | `403 {"code": "budget_type_locked", ...}` for a gated type. **Applies none of the other fields in that request** |
| every goal write | `403 {"code": "goal_locked", ...}` when the goal is locked |

`detail` is always a finished English sentence. **Do not render it.** Translate by `code`
into `locales/<lang>/premium.json`, the way the app already handles `premium_required` —
`detail` exists for logs and for a client that doesn't know the code yet.

Deleting a locked goal is **always allowed**, deliberately. A goal the user can't fund has
to be one they can get rid of.

## What to build

### 1. The capability token

Add `limits` to `CLIENT_FEATURES`. Everything else in this prompt is dead code until you do,
so do it first and verify against production early — see "How to test" below.

### 2. Paywall (was Phase 2a)

[frontend/constants/premium.ts](frontend/constants/premium.ts) and
[frontend/lib/purchases.ts](frontend/lib/purchases.ts) still encode the dead four-tier model.
`SUBSCRIPTION_REWORK.md` §10 lists the landmines; all of them are still there. Confirm each
before you change it.

- **`PRODUCT_MAP` has no entries for the new product ids.** `describeProduct()` returns
  `null` for `com.dollarseeds.premium.monthly` and `...premium.yearly`, so the paywall's
  "Current plan" line and the Settings row go blank for exactly the people who just paid.
- **`TierKey` / `TIER_ORDER` / `PACKAGE_MAP`** encode four tiers. There is now **one tier
  with two billing periods**: Premium Monthly at $9.99 and Premium Yearly at $69.99. Reshape
  the model rather than bolting a fifth tier on.
- **The period fallback in `loadTierOptions()` is wrong for `$rc_` identifiers.**
  `pkg.identifier.endsWith('_yearly')` is `false` for `$rc_annual`, so the annual plan is
  grouped as monthly. It is visibly wrong on the current paywall today.
- **The legacy products stay on sale** (§3, Phase 4). A user still holding one is entitled
  and must keep seeing a correct "Current plan" label, so `PRODUCT_MAP` keeps its eight old
  entries and gains two new ones. Don't delete the old ones.
- **Display names are exactly "Premium Monthly" and "Premium Yearly"** (§2).
- **The free trial must be eligibility-checked**, not promised. Apple grants one
  introductory offer per Apple ID per subscription group, and the group holds all ten
  products, so anyone who used a trial on a legacy tier is ineligible. Use
  `checkTrialOrIntroDiscountEligibility` and only show trial copy when it comes back
  eligible. Promising a free month to someone who won't get one is a refund and a review
  risk.
- Keep everything `premium.ts` already gets right: prices come from
  `package.product.priceString` and are never computed, the wording rules in the file's
  comment block still apply (never "donate"/"doar"; "exclusive video lessons"), and
  `premium:paywall.autoRenew` is an App Review requirement.
- A **yearly → monthly** switch is a downgrade Apple defers to the end of the term. Say
  "Your plan changes to Premium Monthly on <date>", never an error (§3).

### 3. Gating UI (was Phase 2b)

**Goals** — [frontend/app/(tabs)/piggyBank.tsx](frontend/app/(tabs)/piggyBank.tsx):

- A goal with `locked: true` renders grayed. It can't receive money, be transferred into,
  be edited, or be completed. It **can** be deleted, and that path must stay obviously
  available.
- The list now arrives oldest-first, so the active goal is the first non-General row. Don't
  re-sort it. General Savings and Reconciliation are never locked.
- The "add goal" affordance at the cap: show the upsell inline, next to the button, rather
  than pushing the full paywall. Use `goals_used` and `max_goals` from the entitlements
  call so the message states the real numbers.
- Handle `goal_limit_reached` and `goal_locked` as a backstop even when the UI thinks the
  action is impossible — entitlement can change between render and tap.

**Budget type** — [frontend/app/settings.tsx](frontend/app/settings.tsx), `BudgetTypeSelector`:

- Types outside `budget_types` render locked. Balanced is always available.
- `handleSelectBudgetType` does an optimistic update with a rollback on failure; make sure
  a 403 rolls back cleanly and shows the upsell rather than a generic error.
- **The stored choice is never rewritten by a lapse.** A user who had Wealth Builder and
  lapses still has `wealth_builder` in `user_settings`, while every unclosed month resolves
  to Balanced. `GET /settings/` returns the stored value and the dashboard returns the
  effective one. Decide how the selector shows that and tell me what you chose — showing
  Wealth Builder as selected-but-locked is honest and makes resubscribing obviously
  restore it, but it needs to not look like a bug.

**Videos** — already works, needs nothing. `video_series` is exposed for completeness.

### 4. i18n

Every new string goes in `locales/en/premium.json` and `locales/pt-BR/premium.json`. The
`premium:tier.*` keys for the four dead tiers become obsolete — remove them and anything
else the reshape orphans. Run `npm run check-locales` and `npm run verify-i18n`; both must
pass. Read `.claude/docs/i18n.md` first: `budget_type` keys are canonical values that stay
English on the wire.

## How to test

`app_config.premium_enabled` is already `true` in production, so **the free tier is live for
any `limits` client the moment you add the token.** No configuration, no environment
variable. `LIMITS_TEST_USER_IDS` is not needed and should stay unset.

- **Test signed in as a FRESH account.** Sign one up, test, delete it in Settings.
- **Never test the free tier on `appletester`.** It is permanently entitled through the
  TRANSFER bug in §11, so every gate passes it through silently and you'll conclude the
  gating doesn't work. It is the right account for testing the SUBSCRIBER experience.
- `custodiolucas555` has no password. Don't try.
- Everything you do while testing writes real rows to the production database.
- `verify_limits.py` at the repo root drives every backend gate against production on a
  throwaway account and cleans up after itself. Run it if you need to confirm the server
  side is behaving before you debug the client.
- Purchases go through the RevenueCat sandbox. **Expo Go cannot run this app** —
  `react-native-purchases` isn't bundled there. You need the dev build; see CLAUDE.md.

## Out of scope — don't touch

- **`backend/`.** Phase 1 is done and deployed.
- The RevenueCat webhook and the TRANSFER bug (§11)
- `app_config`, migrations, schema
- Bank sync beyond rendering `max_bank_connections`
- The `is_premium` flag on any series
- Flipping `premium_enabled`. Phase 3 is decided: there is no flag to flip, the limits go
  live per install, and the rollback is a new build

## When you're done

Small logical commits on your branch. Don't merge, don't push. Then report:

1. Every file you changed, one line each
2. Every judgement call this prompt didn't settle — especially the locked-but-selected
   budget type question above
3. Anything in `SUBSCRIPTION_REWORK.md` that didn't match the code
4. What you tested yourself vs. what needs me on a physical device with a sandbox account
5. Screenshots or a description of each new state: locked goal card, cap message, locked
   budget type, the paywall, and "Current plan" for a subscriber on a legacy product
