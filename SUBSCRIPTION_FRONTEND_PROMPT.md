# Prompt — Premium Subscription, Release 2 (Frontend)

> Paste everything below the line into Claude Code (Opus 5).

---

Release 1 (backend) is merged to `main`, deployed, and verified — goldens pass, migration `0005` is applied, and the RevenueCat webhook is live and confirmed with a TEST event. Build release 2: the frontend.

Read `CLAUDE.md`, `.claude/docs/design_system.md`, `.claude/docs/architectural_patterns.md`, and `.claude/docs/lessons_page.md` first. Your own release-1 plan (§3 "Frontend changes — file by file") is the starting point; everything below either confirms or overrides it.

Work on a new `change-X-branch`. Never commit to `main`.

## RevenueCat — now fully configured

| Thing | Value |
|---|---|
| iOS SDK public key | `appl_SwgSURGIxQKogKwLTnMFmUzpzXi` |
| Entitlement identifier | `premium` |
| Offering identifier | `default` (marked current) |
| Android SDK key | Not yet — Play Console app doesn't exist. Structure for it, leave a documented placeholder. |

The SDK public key is safe in the repo — it is designed to ship inside the binary. It still belongs in `constants/premium.ts`, never inline in a component. The `sk_` secret key and the webhook secret are server-side only and must never appear in the frontend.

Package identifiers in the `default` offering:

```
basic_monthly          → com.dollarseeds.support.monthly.5     ($5)
intermediate_monthly   → com.dollarseeds.support.monthly.10    ($10)
high_monthly           → com.dollarseeds.support.monthly.20    ($20)
max_monthly            → com.dollarseeds.support.monthly.40    ($40)
basic_yearly           → com.dollarseeds.support.yearly.60     ($60)
intermediate_yearly    → com.dollarseeds.support.yearly.120    ($120)
high_yearly            → com.dollarseeds.support.yearly.240    ($240)
max_yearly             → com.dollarseeds.support.yearly.480    ($480)
```

**Never hardcode prices or product IDs in the UI.** Read packages from the offering and render `product.priceString` — that is what makes a future tier or reprice a dashboard change instead of an app release. Group by the `_monthly` / `_yearly` suffix; tier order is Basic → Intermediate → High → Max.

All eight grant the identical `premium` entitlement. The UI must never branch on which tier someone holds, except to display it.

## Where the CTA goes — exactly two places

**1. Lessons page** — directly under the page description ("Scripture-rooted reflections on money, generosity, and stewardship").

**2. Settings page** — directly under the budget-type section. It needs a **section title** above the description, following the visual pattern of the other settings sections (see the Tithing section at `app/settings.tsx:231`).

**No home/dashboard CTA.** Deliberate — do not add one, and do not suggest one.

Body copy for both: `Subscribe to premium to unlock exclusive features and support the app`

### Styling

Follow the **tithing yellow** treatment — `theme.harvest` (`#F4D35E`), the same palette as the tithing icon background in settings. The link is intentional: both are about giving.

Everything comes from `useTheme()`. No hardcoded colours, per `CLAUDE.md`. `theme.harvest` is the same value in light and dark, but the surfaces around it are not — **verify contrast in both themes** and adjust the text token rather than the yellow.

### Subscribed state — required, not optional

A paying subscriber must never see "Subscribe to premium". Drive this off `SubscriptionContext.premiumActive`:

| Screen | Not subscribed | Subscribed |
|---|---|---|
| Lessons | CTA visible | CTA hidden entirely |
| Settings | CTA visible | Replaced by **"Manage Subscription"** → opens `https://apps.apple.com/account/subscriptions`, with the current tier as the subtitle |

While entitlement is still loading on cold start, render the cached AsyncStorage value rather than flashing the CTA and then hiding it.

## The paywall modal

A modal, not a routed page and not a tab. Opens from either CTA and from any locked lesson or series tap.

Follow the existing modal pattern — RN `<Modal transparent animationType="fade">`, `theme.surface` card, `shadow(10)` — matching the four modals already in the app. No new dependency.

**It must scroll.** There is more content here than fits a phone screen.

### Contents, in order

**Heading**

> Subscribe to DollarSeeds Premium

**Description**

> DollarSeeds aims to provide everyone with the resources to budget effectively for free. That is why the only premium feature are the video lessons. Gain access to video series from successful Christian Entrepreneurs. Learn about their struggles and successes, and how they keep God first in their career

**Equal-tiers note** — a tinted callout, not plain text:

> Every subscription level offers the **exact same** benefits — unlocking premium exclusive video series. Whatever amount you choose to support with, we're thankful for it!

Render this in a low-opacity `theme.harvest` callout with `theme.ink` text, and **bold** on "exact same". Do **not** use `theme.danger` / red, and do not set it in caps. Red already means overspending and errors in this app, and this is the warmest message on the screen — the danger colour would make a generous message read as a warning.

**Billing-period selector** — monthly / yearly. The four tier options below update accordingly.

When **Yearly** is selected, show directly under the selector:

> Same price as monthly — just paid once a year.

This exists because yearly is deliberately exactly 12× monthly with no discount. Without the line, users read a no-discount annual as a mistake or a trap.

**Tier options** — two rows of two:

```
[ Basic ]         [ Intermediate ]
[ High  ]         [ Max          ]
```

Each shows tier name and `priceString` from the package. No feature lists, no "most popular" badge, no comparison table — every tier is identical and the UI must not imply otherwise.

### Required by App Review — do not omit any of these

- Price and billing period per option (from the package, never hardcoded)
- An auto-renewal disclosure
- A **Restore Purchases** button
- Privacy Policy and Terms links — reuse `TERMS_URL` / `PRIVACY_URL` from `constants/legal.ts:16-17`
- When the user already has a subscription: show the current tier ("Current: Intermediate Monthly")
- On selecting a *different* tier while subscribed: confirm with the effective date — "Your new tier starts on 14 March 2027" — never silently dismiss

That last one matters because all eight products are at **Level 1** in App Store Connect. Every switch is a crossgrade that takes effect at the **next renewal**, in both directions, never prorated or immediate. The UI must not imply the change is instant.

### Copy that this replaces

The earlier planned paywall note ("Every tier unlocks the same full library of exclusive video lessons…") is **superseded** by the description and equal-tiers note above. Do not render both. Update `constants/premium.ts` accordingly. All in-app wording uses "exclusive video lessons" / "premium exclusive video series", never "premium videos".

The words "donate", "donation", and "give" as a noun stay out of the paywall, the App Store description, and all eight subscription display names. "Support tier" is the only framing.

## Everything else in release 2

Build the rest of your §3 plan as written:

- `lib/purchases.ts` — `Purchases.configure()` once at module scope, `logIn`/`logOut`, offering→tier mapping, error normalisation. `Purchases.logOut()` throws when already anonymous — catch it.
- `context/SubscriptionContext.tsx` — inside `AuthProvider`, outside `OnboardingProvider`. Caches to AsyncStorage `premium_entitlement_<userId>`. Key on `user?.id` with a `useRef` guard — do **not** hook into `AuthContext.syncIdentity`, which fires hourly on `TOKEN_REFRESHED`.
- `lib/axiosConfig.ts` — `X-Client-Features: premium`, inside the request interceptor, **after** the `isBackendUrl` guard at `:66` so it never reaches Sentry, PostHog, or Supabase Storage.
- `components/premium/UpdateGate.tsx` — numeric semver compare, fails open on unreachable `/config/` or a malformed version.
- `app/(tabs)/lessons.tsx` — lock badge on premium series cards, "Explore ›" → "Unlock ›", tap opens the paywall.
- `app/lessonSeries/[id].tsx` — guard the unprotected `detail.lessons.length` at `:128`, per-row lock, locked row opens the paywall.
- `app/lessonPlayer.tsx` — `403` + `code === 'premium_required'` → paywall, not the generic error. Fix the dead retry at `:165` with a `reloadKey` counter.
- `app/settings.tsx` — Restore Purchases row; delete-account confirmation at `:388` must state that deleting the account does **not** cancel the App Store subscription, linking to `https://apps.apple.com/account/subscriptions` (App Review 5.1.1(v)).
- `lib/analytics.ts` — add the paywall/purchase events. The rule at `:10-11` forbids dollar amounts: send `product_id` only, never price.
- `app.json` — version → `1.1.0`.
- New deps: `react-native-purchases`, `expo-dev-client`.

**Post-purchase race:** after `purchase()` resolves, poll `/me/entitlements/` with backoff (1s, 2s, 4s, 8s) and only dismiss the paywall on `premium_active: true` or timeout. The webhook may not have landed yet.

**Config cache skew:** refetch `/config/` on app foreground and render lock badges off the live value, never a boot-time snapshot. Otherwise flipping `premium_enabled` off to roll back leaves locks showing for content the backend now serves freely.

## Verification

**Backward compatibility still applies.** The riskiest line in this release is the `X-Client-Features` header: it must be attached only to backend requests, and its presence must not alter anything for a user who is signed in but unsubscribed. Re-run the goldens suite and confirm it still passes — an *unmarked* request must remain byte-identical.

Then prove:

- Lessons and Settings CTAs render correctly in **light and dark**, and both **disappear** when `premiumActive` is true (Settings switches to Manage Subscription)
- No CTA flash on cold start while entitlement loads
- Paywall scrolls fully on a small device; all App Review elements reachable
- Monthly/yearly toggle swaps all four options; the yearly explanation line appears only for yearly
- Prices render from the offering — grep the diff to confirm no hardcoded `$5`/`$10`/`$20`/`$40` anywhere in the UI
- Locked series → paywall; free series (The Truth on Generosity) plays untouched for an unsubscribed user
- `403 premium_required` opens the paywall rather than the generic error, and retry works after purchase
- Update gate blocks below `min_supported_version`, passes at/above, fails open when `/config/` is unreachable
- Every colour comes from `useTheme()` — no hex literals in new code

State clearly which checks you can run yourself and which need me on a physical device with a sandbox account.

Flag anything above you think is wrong rather than designing around it silently.
