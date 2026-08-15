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

export const TIER_LABELS: Record<TierKey, string> = {
    basic: 'Basic',
    intermediate: 'Intermediate',
    high: 'High',
    max: 'Max',
};

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

/** "Intermediate Monthly" from a product id, or null if we don't recognise it. */
export function describeProduct(productId?: string | null): string | null {
    if (!productId) return null;
    const entry = PRODUCT_MAP[productId];
    if (!entry) return null;
    return `${TIER_LABELS[entry.tier]} ${entry.period === 'monthly' ? 'Monthly' : 'Yearly'}`;
}

// ─── Copy ─────────────────────────────────────────────────────────────────────
// Every user-facing premium string lives here so the App Review-facing wording can
// never drift between screens.
//
// WORDING RULES, which are not stylistic:
//  - "exclusive video lessons" / "premium exclusive video series". Never "premium
//    videos" — the App Store product descriptions say "exclusive video lessons" and
//    the two must match.
//  - Never "donate", "donation", or "give" as a noun. Apple's guidelines prohibit
//    collecting donations through IAP; this is legitimately IAP because it unlocks
//    content, and the copy has to keep making that obvious. "Support tier" only.

export const PREMIUM_CTA_BODY =
    'Subscribe to premium to unlock exclusive features and support the app';

export const PAYWALL_HEADING = 'Subscribe to DollarSeeds Premium';

export const PAYWALL_DESCRIPTION =
    'DollarSeeds aims to provide everyone with the resources to budget effectively for ' +
    'free. That is why the only premium feature are the video lessons. Gain access to ' +
    'video series from successful Christian Entrepreneurs. Learn about their struggles ' +
    'and successes, and how they keep God first in their career';

/** Rendered with "exact same" bold — see PaywallSheet. */
export const PAYWALL_EQUAL_TIERS_PREFIX = 'Every subscription level offers the ';
export const PAYWALL_EQUAL_TIERS_BOLD = 'exact same';
export const PAYWALL_EQUAL_TIERS_SUFFIX =
    ' benefits — unlocking premium exclusive video series. Whatever amount you choose ' +
    'to support with, we’re thankful for it!';

/**
 * Shown only when Yearly is selected. Yearly is deliberately exactly 12x monthly with
 * no discount; without this line a no-discount annual reads as a mistake or a trap.
 */
export const PAYWALL_YEARLY_NOTE = 'Same price as monthly — just paid once a year.';

/** App Review requires an auto-renewal disclosure on the purchase screen. */
export const PAYWALL_AUTORENEW_DISCLOSURE =
    'Subscriptions renew automatically at the end of each billing period unless ' +
    'cancelled at least 24 hours beforehand. Manage or cancel any time in your App ' +
    'Store account settings.';

/** Where a user actually cancels. Deleting the DollarSeeds account does NOT cancel. */
export const MANAGE_SUBSCRIPTION_URL = 'https://apps.apple.com/account/subscriptions';

/** App Review 5.1.1(v): account deletion must say the subscription keeps billing. */
export const DELETE_ACCOUNT_SUBSCRIPTION_WARNING =
    'Deleting your account does not cancel your subscription. Subscriptions are billed ' +
    'by the App Store and must be cancelled separately in your App Store account ' +
    'settings.';
