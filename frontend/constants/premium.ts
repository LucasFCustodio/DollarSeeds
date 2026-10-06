/**
 * Premium subscription — configuration and the single source of every user-facing
 * string on the paywall.
 *
 * KEYS. The values below are RevenueCat *public SDK* keys. They are designed to ship
 * inside the binary and are safe in the repo. The `sk_` secret key and the webhook
 * secret are server-side only and must never appear anywhere in `frontend/`.
 *
 * PRICES ARE NOT HERE, DELIBERATELY. Every amount the user is BILLED is rendered from
 * `package.product.priceString` on the RevenueCat offering, so a reprice or a new tier
 * is a dashboard change rather than an app release — which matters, because a release
 * only reaches the phones that take the update. The product ids below exist to ORDER
 * and LABEL the packages, never to look up a price.
 *
 * The paywall does DERIVE three comparison figures from the store's numeric prices —
 * the crossed-out twelve-month price, the per-month equivalent and the discount
 * percentage (lib/planPricing.ts). Those are computed at render from whatever the store
 * returns, so they still follow a dashboard reprice with no release. Nothing else is
 * computed, and no price or percentage is ever written into the copy.
 */

// ─── RevenueCat ───────────────────────────────────────────────────────────────

export const RC_IOS_API_KEY = 'appl_SwgSURGIxQKogKwLTnMFmUzpzXi';

/**
 * Android is not configured yet — the Play Console app does not exist, so there is no
 * key to put here. `configurePurchases()` skips initialisation entirely on Android
 * rather than crashing, and `SubscriptionContext` then reports "not subscribed" with
 * the paywall unavailable. Fill this in when the Play Console listing exists; nothing
 * else needs to change.
 */
export const RC_ANDROID_API_KEY: string | null = null;

/** The one entitlement. All ten products — two Premium, eight legacy — grant exactly this. */
export const ENTITLEMENT_ID = 'premium';

/**
 * The offering this build sells: `$rc_annual` and `$rc_monthly`. It is deliberately NOT
 * the one marked "current" in the RevenueCat dashboard — that is still `default`, the
 * eight legacy packages, because the binaries already in the App Store fetch `current`
 * and must keep seeing the four-tier paywall they were written for.
 */
export const OFFERING_ID = 'premium-2026';

/**
 * Per-user cache of the last known entitlement, matching the `<prefix>_<userId>`
 * convention in constants/onboarding.ts. Read on cold start so a subscriber does not
 * see the "Subscribe" CTA flash before the network answers.
 */
export const premiumEntitlementKey = (userId: string) => `premium_entitlement_${userId}`;

// ─── Plans ────────────────────────────────────────────────────────────────────
//
// ONE tier, two billing periods: Premium Monthly and Premium Yearly. The old model
// (four "support tiers" × two periods) is gone from the paywall, but its eight products
// are still on sale to the binaries already installed and still held by subscribers,
// so they stay recognisable here as the `legacy` plan.

export type BillingPeriod = 'monthly' | 'yearly';

/** `premium` = the two products this build sells; `legacy` = the eight support tiers. */
export type PlanKey = 'premium' | 'legacy';

export type PlanInfo = { plan: PlanKey; period: BillingPeriod };

/** Display order on the paywall. Yearly first: it is the higher service level (§3). */
export const PERIOD_ORDER: BillingPeriod[] = ['yearly', 'monthly'];

export const PREMIUM_MONTHLY_ID = 'com.dollarseeds.premium.monthly';
export const PREMIUM_YEARLY_ID = 'com.dollarseeds.premium.yearly';

/**
 * Store product id → plan + period, for labelling a subscription the BACKEND reports
 * (`/me/entitlements/` returns a product id) and for grouping what the offering serves.
 *
 * The eight legacy entries must stay for as long as anyone holds one of those
 * products (Phase 4): without them a legacy subscriber's "Current plan" line goes
 * blank. The legacy tiers all granted the same thing, so they share one label per
 * period rather than four names that no longer mean anything.
 */
export const PRODUCT_MAP: Record<string, PlanInfo> = {
    [PREMIUM_MONTHLY_ID]: { plan: 'premium', period: 'monthly' },
    [PREMIUM_YEARLY_ID]: { plan: 'premium', period: 'yearly' },
    'com.dollarseeds.support.monthly.5': { plan: 'legacy', period: 'monthly' },
    'com.dollarseeds.support.monthly.10': { plan: 'legacy', period: 'monthly' },
    'com.dollarseeds.support.monthly.20': { plan: 'legacy', period: 'monthly' },
    'com.dollarseeds.support.monthly.40': { plan: 'legacy', period: 'monthly' },
    'com.dollarseeds.support.yearly.60': { plan: 'legacy', period: 'yearly' },
    'com.dollarseeds.support.yearly.120': { plan: 'legacy', period: 'yearly' },
    'com.dollarseeds.support.yearly.240': { plan: 'legacy', period: 'yearly' },
    'com.dollarseeds.support.yearly.480': { plan: 'legacy', period: 'yearly' },
};

/**
 * The plan and period behind a product id, or null if we don't recognise it.
 *
 * Returns STRUCTURE, not prose, so the one string a paying subscriber sees most —
 * "Current plan: …" on the paywall and the Settings row — is translated: the caller
 * turns it into a label with `planLabelKey`.
 */
export function describeProduct(productId?: string | null): PlanInfo | null {
    if (!productId) return null;
    return PRODUCT_MAP[productId] ?? null;
}

/**
 * Catalogue key for a plan's display name. "Premium Monthly" / "Premium Yearly" are
 * the exact names in App Store Connect (SUBSCRIPTION_REWORK.md §2).
 */
export function planLabelKey({ plan, period }: PlanInfo): string {
    if (plan === 'premium') {
        return period === 'yearly' ? 'premium:plan.premiumYearly' : 'premium:plan.premiumMonthly';
    }
    return period === 'yearly' ? 'premium:plan.legacyYearly' : 'premium:plan.legacyMonthly';
}

// ─── Copy ─────────────────────────────────────────────────────────────────────
// The user-facing premium strings moved to locales/<lang>/premium.json. The WORDING
// RULES that governed them did not, and they are not stylistic:
//
//  - "exclusive video lessons" / "premium exclusive video series". Never "premium
//    videos" — the App Store product descriptions say "exclusive video lessons" and
//    the two must match. In pt-BR: "séries em vídeo exclusivas premium".
//  - Never a free-tier NUMBER in the copy ("1 goal"). The allowances come from
//    GET /me/entitlements/ as values so the free tier can change without a release;
//    a number written into a sentence here would freeze it. Interpolate the server's.
//  - A free trial is only ever mentioned when RevenueCat says THIS Apple ID is
//    eligible for it (see checkTrialEligibility in lib/purchases.ts).
//  - Never "donate", "donation", or "give" as a noun — and never "doar", "doação" or
//    "dar" in Portuguese. Apple prohibits collecting donations through IAP; this is
//    legitimately IAP because it unlocks content, and the copy has to keep making that
//    obvious in every language. "Support tier" / "nível de apoio" only.
//  - premium:paywall.autoRenew is an App Review requirement and must appear in the
//    language the purchase screen is presented in.

/** Where a user actually cancels. Deleting the DollarSeeds account does NOT cancel. */
export const MANAGE_SUBSCRIPTION_URL = 'https://apps.apple.com/account/subscriptions';
