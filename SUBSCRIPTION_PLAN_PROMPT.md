# Prompt — Premium Subscription Implementation Plan

> Paste everything below the line into Claude Code (Opus 5) in plan mode.
> All decisions are final. App Store Connect is already configured — see that section.

---

Read `CLAUDE.md`, `.claude/docs/lessons_page.md`, `.claude/docs/architectural_patterns.md`, and `.claude/docs/data_model.md` before doing anything.

**Produce a plan only. Do not write code, migrations, or files in this pass.** I want to review the plan first.

## Goal

DollarSeeds is live on the App Store and currently 100% free. I'm adding a premium subscription (monthly and yearly options) that gates **video lesson series only**. The existing written lessons and all other app features stay free.

The hard constraint: the app ships as App Store builds, so the binary users already have installed will keep hitting the production backend indefinitely after this ships. Every change must leave those old binaries behaving **exactly as they do today** — same response shapes, no new required params, no endpoint made stricter. Expand → contract, per `CLAUDE.md`.

## Decisions already made — treat these as fixed, do not re-litigate them

### Payments

- Apple In-App Purchase (required for digital content). Enrolled in the Small Business Program → 15% commission.
- **RevenueCat** (`react-native-purchases`) handles receipt validation, renewals, cancellations, refunds, and Android.
- Requires an Expo development build — IAP does not work in Expo Go. Current stack is Expo SDK 54.
- Call `Purchases.logIn(<supabase user id>)` at sign-in so the RevenueCat App User ID equals the Supabase `user_id`. Never rely on RevenueCat anonymous IDs.
- Entitlement is **server-side truth**. The client never asserts its own subscription status to the backend. RevenueCat webhook → FastAPI → Supabase.
- App Review requirements to account for: a Restore Purchases button, price / duration / auto-renew disclosure on the paywall, and links to Privacy Policy + Terms.

### Access model

- **Igor's Series on Generosity stays free forever.** Never retro-paywall existing content — no already-published series changes its access level.
- All *new* series get `lesson_series.is_premium = true`. That column already exists (migration `0001`) and is currently ungated.
- The gate lives on `GET /lessons/{lesson_id}/playback/` **only** — there's already a hook comment marking the spot in `backend/main.py`. The list and detail routes expose no video paths, so they stay open: a non-subscriber should still browse premium series, see titles, thumbnails, lesson counts, and a lock badge.
- The entitlement check is **not** "a row exists for this user." It is:
  `status in ('active', 'in_grace_period') and expires_at > now()`
  Cancelled users keep access until `expires_at` (they paid for the period). Grace period covers failed renewals, which Apple retries for up to ~16 days.
- The client checks its cached entitlement before the tap and opens the paywall sheet. The backend returning `403 {"code": "premium_required"}` is the enforcement backstop, not the UX trigger — but the app must render the paywall on that code rather than a generic error.

### Backward compatibility — the part that matters most

- **Capability signaling.** The v2 build sends a marker (e.g. `?supports_premium=1` or an `X-Client-Features` header). A request *without* the marker must return a response byte-identical to what the endpoint returns today.
- Requests without the marker: premium series are filtered out of `GET /lessons/series/` entirely, and `/playback/` stays ungated for them.
- Rationale — do not "improve" on this: the old binary has no RevenueCat SDK, no paywall, and no purchase path. Showing it a locked series creates a dead end with no way to subscribe. Hiding it costs no revenue because that user cannot buy from that build.
- No endpoint gets a new required param or tighter validation. No response field is removed, renamed, or retyped.

| | Old binary | v2, not subscribed | v2, subscribed |
|---|---|---|---|
| Igor's series | visible, plays | visible, plays | visible, plays |
| Premium series | not in the list | visible, locked → paywall | visible, plays |

### Data model

- New `subscriptions` table — new tables are invisible to old clients, so this is zero-risk. At minimum: `user_id`, `store`, `product_id`, `original_transaction_id`, `status`, `expires_at`, `updated_at`. Propose the full schema, indexes, and the RLS posture (match the existing convention: RLS enabled, no policies, service-role backend bypasses it).
- `original_transaction_id` is the stable identity across renewals — needed to reconcile refunds and disputes.
- Migration goes in `backend/migrations/` as `0005_*.sql`, following the header-comment format of `0004_goal_completion_snapshot.sql` (why, what old rows fall back to, `Applied to project … on <date>`).
- **I apply migrations via the Supabase dashboard.** Never run DDL against production.

### New endpoints

- `GET /config/` → `{ premium_enabled, min_supported_version, update_url }`. A server-side kill switch: the paywall ships dark and launches with no app update. Must **fail open** — if `/config/` is unreachable, the app behaves as if unrestricted, never bricks.
- `GET /me/entitlements` → `{ premium_active, expires_at }`.
- `POST /webhooks/revenuecat` → the only writer of the `subscriptions` table. Must verify RevenueCat's authorization header. Must be idempotent — webhooks retry and arrive out of order. Cover the full event set: initial purchase, renewal, cancellation, expiration, billing issue / grace period, refund, product change.

### Force-update

- v2 checks its own version against `min_supported_version` from `/config/` and renders a blocking update screen when below. This is for v3 onward — it cannot apply retroactively to the binary already installed.
- Soft nudge for the current binary, optional: a zero-lesson series at `sort_order = -1` titled something like "New lessons available — update DollarSeeds." The old build renders it as a normal card and the empty-lessons branch already exists at `frontend/app/lessonSeries/[id].tsx:132`. Hidden from v2 clients via the capability marker. Flag this as optional in the plan.

### Rollout — three separate releases, in order

1. **Backend only.** Migration, new routes, capability gating, `premium_enabled: false`. Live app sees no change whatsoever.
2. **v2 app.** RevenueCat + paywall (dark) + force-update check. Tested on TestFlight with StoreKit sandbox testers. The subscription group and its eight products are submitted to review **with this binary** — that is required for a first subscription group.
3. **Flip the flag** once adoption looks reasonable, then publish the first premium series.

Note that the backend deploys from `main` to Render, so new routes 404 until merged and deployed.

## Pricing and products

Four support tiers, each with a monthly and an annual option — **eight products total**. Annual is exactly 12× the monthly price; there is deliberately **no annual discount**.

| Tier | Monthly | Yearly |
|---|---|---|
| Basic | $5.00 | $60.00 |
| Intermediate | $10.00 | $120.00 |
| High | $20.00 | $240.00 |
| Max | $40.00 | $480.00 |

Prices are exact round amounts, not `.99` — this is deliberate. Yearly is exactly 12× monthly; there is deliberately **no yearly discount**.

**Every tier grants exactly the same thing: access to the premium video lessons.** There are no tier-specific features, now or planned. The tiers exist so people can choose how much they want to support the work — the higher tiers buy nothing extra.

This has direct architectural consequences:

- All eight products live in **one subscription group** (`DS Subscriptions`, group ID `22303225`). A user can only hold one active subscription in a group, which is the desired behaviour.
- **All eight are at Level 1 — the same level.** This is intentional and already configured. Same level means every switch is a *crossgrade*, which takes effect at the **next renewal date** regardless of duration. So monthly → yearly, yearly → monthly, and any tier change all wait until the current period ends. Nothing is ever prorated, refunded mid-period, or applied immediately. Do not propose re-ranking the levels.
- All eight map to a **single RevenueCat entitlement** named `premium`. The backend never branches on tier. The `product_id` column on `subscriptions` records which tier someone chose, for reporting only — never for access logic.
- Do not build any tier-comparison UI. The paywall lists four amounts and one identical benefit.

### Tier-switch UX — required, because the delay is invisible otherwise

Because every switch takes effect at the next renewal, the app must make that explicit or it will look broken:

- The paywall shows the user's current tier when they already have one (e.g. "Current: Intermediate Monthly").
- Selecting a different tier confirms with the effective date — "Your new tier starts on 14 March 2027" — rather than silently closing.
- The backend must expect a **pending product change**. RevenueCat reports the switch before it takes effect, so `subscriptions.product_id` must not update until the renewal event actually fires. Describe explicitly how the webhook handler distinguishes a pending change from an applied one.
- Entitlement (`premium_active`) is unaffected by a pending switch — the user keeps access throughout.

### Required paywall copy

The subscription screen must display this note verbatim:

> All tiers offer the same features: Access to premium videos. The different tiers are simply different ways of supporting the work of the developer(s). Whichever tier you choose, thank you for the support that you give! God bless you.

Also required on the paywall: price, billing period, auto-renewal disclosure, Restore Purchases, and links to Privacy Policy and Terms.

**Wording caution for App Review:** Apple's guidelines prohibit using IAP to collect donations. What we're doing is legitimately IAP because it unlocks content, but the paywall, the App Store description, and the subscription display names must avoid the words "donate," "donation," and "give." Use "support tier." Flag any copy in the plan that risks this.

### No free trial, no introductory offer

Igor's Series on Generosity is free forever and serves as the sample. Do not configure a free trial or a pay-as-you-go intro offer. (Apple allows only one introductory offer per subscription group per Apple ID, so this also keeps that slot unused and available later.)

No launch pricing and no planned price increases — the listed prices are the prices.

### Android

The Android build is not live yet (still short of the testers Google requires for production release). This version ships to Android too, at minimum for testing. So:

- Mirror all eight products in Google Play Console as subscriptions with base plans.
- RevenueCat maps both stores to the same `premium` entitlement.
- The `subscriptions.store` column distinguishes `app_store` from `play_store`.
- The webhook handler must handle Play Store events as well as App Store events — they are not identical.
- Nothing in the backend gate may assume iOS.

### App Store Connect — already configured, do not propose changes to it

All eight products already exist in App Store Connect with prices, availability, and localizations complete. Status is "Prepare for Submission," which is expected — the first subscription group must be submitted alongside a new app version, and sandbox/TestFlight purchases work regardless of that status.

| Tier | Period | Price | Product ID | Level |
|---|---|---|---|---|
| Basic | Monthly | $5.00 | `com.dollarseeds.support.monthly.5` | 1 |
| Intermediate | Monthly | $10.00 | `com.dollarseeds.support.monthly.10` | 1 |
| High | Monthly | $20.00 | `com.dollarseeds.support.monthly.20` | 1 |
| Max | Monthly | $40.00 | `com.dollarseeds.support.monthly.40` | 1 |
| Basic | Yearly | $60.00 | `com.dollarseeds.support.yearly.60` | 1 |
| Intermediate | Yearly | $120.00 | `com.dollarseeds.support.yearly.120` | 1 |
| High | Yearly | $240.00 | `com.dollarseeds.support.yearly.240` | 1 |
| Max | Yearly | $480.00 | `com.dollarseeds.support.yearly.480` | 1 |

Other configured state:

- Subscription group: `DS Subscriptions`, ID `22303225`. Group display name shown to users: "Exclusive Premium Video Lessons" (EN) / "Vídeos Premium Exclusivos" (PT-BR).
- Per-subscription display names follow the pattern "Basic Support - Monthly", "Max Support - Annual", etc. Description on all eight is identical: "Access to exclusive video lessons".
- **Family Sharing is OFF on all eight, deliberately.** Nothing in the implementation may assume a shared or transferable entitlement.
- Availability: 3 countries — US, Canada, Brazil — matching the app's own availability.
- Localizations: English (U.S.) and Portuguese (Brazil).
- No introductory offers, no promotional offers, no "Monthly with a 12-Month Commitment" variants.

Product IDs are permanent and cannot be renamed or reused. Use them verbatim. **Do not hardcode this list in the app** — the frontend must read available products from the **RevenueCat offering**, so tiers can be added or repriced later without an app update. Treat the IDs above as configuration to be mirrored in Google Play Console and mapped in the RevenueCat dashboard.

Note the copy mismatch to resolve: the store descriptions say "exclusive video lessons" while the required paywall note below says "premium videos." Flag this in open questions; do not silently change the verbatim note.

## What I want back

A plan covering:

1. **Migration `0005`** — proposed schema, verbatim SQL for me to review, and what pre-migration rows fall back to.
2. **Backend changes** in `backend/main.py` — the capability-marker mechanism (propose header vs. query param and justify the choice), the gate at `/playback/`, the three new endpoints, and the webhook handler's event mapping and idempotency strategy.
3. **Frontend changes** — file-by-file: RevenueCat init and `logIn` wiring into `AuthContext`, entitlement caching, the lock badge on series cards, the paywall sheet (four tiers + the verbatim note above), the `403 premium_required` path, Restore Purchases, and the force-update gate. All styling from `useTheme()` per the design system — no hardcoded colors.
4. **Manual setup steps** I have to do by hand, in order. App Store Connect is done — this means Google Play Console products, the RevenueCat project, app configuration, entitlement + offering + package mapping, sandbox tester accounts, and webhook configuration.
5. **Verification plan** — see below. Treat this as the most important deliverable, not an afterthought.
6. **Open questions and risks**, including anything above you think is wrong.

## Verification — required in the plan, in detail

Two separate things must be proven, and they need separate verification strategies. For each check below, state **what is run, what the expected result is, and what a failure looks like.** Vague items like "test the app" are not acceptable.

### A. Nothing breaks for the version already in the App Store

This is the higher-stakes half. A regression here hits real users who cannot roll back.

- **Endpoint inventory.** List every existing endpoint whose code path is touched, however slightly. For each: the exact request an old binary sends (URL, params, headers), and the response it receives today.
- **Response-shape proof.** For each of those endpoints, demonstrate the response for an unmarked request is unchanged — same keys, same types, same ordering, same status codes, including error cases. Propose a concrete mechanism: capture responses from the deployed production backend before the change, replay identical requests against the branch, and diff. Specify how the captures are produced and stored.
- **Old-client call-site audit.** Read the current frontend code and enumerate every call site that touches `/lessons/series/`, `/lessons/series/{id}/`, and `/lessons/{id}/playback/`. Confirm that none of them will encounter a new field, a missing field, a new status code, or a changed error body.
- **The premium-series-hidden path.** Prove that when a premium series exists in the DB, an unmarked request to `GET /lessons/series/` omits it entirely and `lesson_count` and ordering remain correct for the series that do appear.
- **Playback stays open for old clients.** Prove `/playback/` never returns 403 to an unmarked request, even for a premium lesson.
- **DB safety review.** Confirm the migration is additive only — no drops, renames, type narrowing, tightened CHECKs, or NOT NULL on populated tables — and that every existing query still returns the same rows after it is applied.
- **Flag-off behaviour.** With `premium_enabled: false`, prove the entire app (both binaries) behaves exactly as it does today.
- **A rollback story.** If something is wrong after deploy, what is the single fastest action that restores current behaviour, and does it require an app update? (It should not.)

### B. The new functionality actually works

- **Entitlement logic unit tests.** Cover the boundary cases directly: active and unexpired; active but `expires_at` in the past; `in_grace_period`; cancelled but not yet expired; expired; refunded; no row at all; and two rows for one user. State the expected outcome for each.
- **Webhook handler tests.** For every RevenueCat event type, the resulting row state. Explicitly cover: duplicate delivery of the same event, out-of-order delivery (an expiration arriving before the renewal it precedes), an event for an unknown user, and a malformed or unauthorized payload.
- **Capability-marker matrix.** Every combination of {marked, unmarked} × {premium series, free series} × {subscribed, not subscribed} against both `/lessons/series/` and `/playback/`. Present it as a table with expected status and body for each cell.
- **Sandbox purchase lifecycle** on a real device via TestFlight: purchase → entitlement appears in the DB → premium lesson plays → cancel → access persists until expiry → expires → access revoked. Note that sandbox subscriptions renew on a compressed clock, and give the actual expected durations.
- **Tier switching**, given the all-Level-1 configuration: monthly → yearly, yearly → monthly, and tier → tier. Verify the change takes effect at the next renewal and *not* immediately, that access is uninterrupted throughout, and that `product_id` updates only when the renewal fires.
- **Restore Purchases** on a second device and after reinstalling.
- **Force-update gate**: below `min_supported_version` blocks; at or above passes; `/config/` unreachable fails **open**.
- **Igor's series** plays for a signed-out-of-subscription user on every client version — the single most important functional regression check.
- **Android parity** for the checks above, at whatever depth is possible given the app is not yet in production there.

State clearly which of these you can execute yourself and which require me on a physical device with a sandbox account.

## Ground rules

Work on a new `change-X-branch` per `CLAUDE.md`. Never commit to `main`. I apply migrations myself via the Supabase dashboard — never run DDL against production.

If any of the fixed decisions above looks like a mistake to you, say so in the open-questions section rather than silently designing around it.
