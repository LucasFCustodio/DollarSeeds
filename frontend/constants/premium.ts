/**
 * Premium subscription — configuration and the single source of every user-facing
 * string on the paywall.
 *
 * KEYS. The values below are RevenueCat *public SDK* keys. They are designed to ship
 * inside the binary and are safe in the repo. The `sk_` secret key and the webhook
 * secret are server-side only and must never appear anywhere in `frontend/`.
 *
 * PRICES ARE NOT HERE, DELIBERATELY. Every price the user sees comes from
 * `package.product.priceString` on the RevenueCat offering, so a reprice or a new tier
 * is a dashboard change rather than an app release — which matters, because a release
 * only reaches the phones that take the update. The product ids below exist to ORDER
 * and LABEL the packages, never to look up a price.
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

/** The one entitlement. All eight products grant exactly this. */
export const ENTITLEMENT_ID = 'premium';

/** The offering marked "current" in the RevenueCat dashboard. */
export const OFFERING_ID = 'default';

/**
 * Per-user cache of the last known entitlement, matching the `<prefix>_<userId>`
 * convention in constants/onboarding.ts. Read on cold start so a subscriber does not
 * see the "Subscribe" CTA flash before the network answers.
 */
export const premiumEntitlementKey = (userId: string) => `premium_entitlement_${userId}`;

// ─── Tiers ────────────────────────────────────────────────────────────────────

export type BillingPeriod = 'monthly' | 'yearly';
export type TierKey = 'basic' | 'intermediate' | 'high' | 'max';

/** Display order on the paywall: Basic → Intermediate → High → Max. */
export const TIER_ORDER: TierKey[] = ['basic', 'intermediate', 'high', 'max'];


/**
 * RevenueCat package identifier → tier + period.
 *
 * Used only to group and order what the offering returns. A package the offering
 * serves that is missing from this map is rendered last with a humanised label rather
 * than dropped, so adding a tier in the dashboard degrades gracefully instead of
 * silently hiding a product someone can pay for.
 */
export const PACKAGE_MAP: Record<string, { tier: TierKey; period: BillingPeriod }> = {
    basic_monthly: { tier: 'basic', period: 'monthly' },
    intermediate_monthly: { tier: 'intermediate', period: 'monthly' },
    high_monthly: { tier: 'high', period: 'monthly' },
    max_monthly: { tier: 'max', period: 'monthly' },
    basic_yearly: { tier: 'basic', period: 'yearly' },
    intermediate_yearly: { tier: 'intermediate', period: 'yearly' },
    high_yearly: { tier: 'high', period: 'yearly' },
    max_yearly: { tier: 'max', period: 'yearly' },
};

/**
 * Product id → tier + period, for labelling a subscription the BACKEND reports.
 * `/me/entitlements/` returns a store product id, not a RevenueCat package id, so
 * "Current: Intermediate Monthly" needs this second direction.
 */
export const PRODUCT_MAP: Record<string, { tier: TierKey; period: BillingPeriod }> = {
    'com.dollarseeds.support.monthly.5': { tier: 'basic', period: 'monthly' },
    'com.dollarseeds.support.monthly.10': { tier: 'intermediate', period: 'monthly' },
    'com.dollarseeds.support.monthly.20': { tier: 'high', period: 'monthly' },
    'com.dollarseeds.support.monthly.40': { tier: 'max', period: 'monthly' },
    'com.dollarseeds.support.yearly.60': { tier: 'basic', period: 'yearly' },
    'com.dollarseeds.support.yearly.120': { tier: 'intermediate', period: 'yearly' },
    'com.dollarseeds.support.yearly.240': { tier: 'high', period: 'yearly' },
    'com.dollarseeds.support.yearly.480': { tier: 'max', period: 'yearly' },
};

/**
 * The tier and period behind a product id, or null if we don't recognise it.
 *
 * Returns STRUCTURE, not prose. It used to build "Intermediate Monthly" here, which
 * meant the one string a paying subscriber sees most — "Current: …" on the paywall and
 * the Settings row — stayed English in every language. Both names are in
 * `premium:tier.*` / `premium:paywall.monthly|yearly`, so the caller composes with
 * `premium:tierPeriod` and gets a translated label plus the freedom to reorder it.
 */
export function describeProduct(
    productId?: string | null,
): { tier: TierKey; period: BillingPeriod } | null {
    if (!productId) return null;
    return PRODUCT_MAP[productId] ?? null;
}

// ─── Copy ─────────────────────────────────────────────────────────────────────
// The user-facing premium strings moved to locales/<lang>/premium.json. The WORDING
// RULES that governed them did not, and they are not stylistic:
//
//  - "exclusive video lessons" / "premium exclusive video series". Never "premium
//    videos" — the App Store product descriptions say "exclusive video lessons" and
//    the two must match. In pt-BR: "séries em vídeo exclusivas premium".
//  - Never "donate", "donation", or "give" as a noun — and never "doar", "doação" or
//    "dar" in Portuguese. Apple prohibits collecting donations through IAP; this is
//    legitimately IAP because it unlocks content, and the copy has to keep making that
//    obvious in every language. "Support tier" / "nível de apoio" only.
//  - premium:paywall.autoRenew is an App Review requirement and must appear in the
//    language the purchase screen is presented in.

/** Where a user actually cancels. Deleting the DollarSeeds account does NOT cancel. */
export const MANAGE_SUBSCRIPTION_URL = 'https://apps.apple.com/account/subscriptions';
