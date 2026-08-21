/**
 * purchases.ts — the only module that talks to the RevenueCat SDK.
 *
 * Everything here is defensive about one thing: **RevenueCat may not be configured**.
 * Android has no SDK key yet, and IAP does not exist at all in Expo Go. Rather than
 * crash or hang, every function degrades to "no purchases available" and the paywall
 * surfaces that. A budgeting app must not become unusable because a purchase SDK is
 * missing.
 *
 * The client is NEVER the authority on entitlement. It decides what to *show*; the
 * backend decides what to *serve*. See SubscriptionContext.
 */
import { Platform } from 'react-native';
import Purchases, {
    CustomerInfo,
    PurchasesOffering,
    PurchasesPackage,
} from 'react-native-purchases';

import {
    ENTITLEMENT_ID,
    OFFERING_ID,
    PACKAGE_MAP,
    RC_ANDROID_API_KEY,
    RC_IOS_API_KEY,
    TIER_ORDER,
    type BillingPeriod,
    type TierKey,
} from '../constants/premium';

export type TierOption = {
    key: string;              // RevenueCat package identifier
    tier: TierKey | null;     // null for a package we don't recognise
    /**
     * LAST-RESORT English fallback, derived from the package identifier. The label a
     * user actually sees comes from `premium:tier.<tier>`, with this as the
     * `defaultValue` — so it only surfaces for a tier added in the RevenueCat
     * dashboard that has no catalogue entry yet.
     */
    label: string;
    period: BillingPeriod;
    priceString: string;      // ALWAYS from the store — never computed or hardcoded
    productId: string;
    pkg: PurchasesPackage;
};

let configured = false;
let configureFailed = false;

function apiKey(): string | null {
    if (Platform.OS === 'ios') return RC_IOS_API_KEY;
    if (Platform.OS === 'android') return RC_ANDROID_API_KEY;
    return null;
}

/**
 * Configure the SDK exactly once, at module scope rather than in an effect — an effect
 * can re-run, and configuring twice is a RevenueCat warning at best.
 *
 * Returns false when purchases are unavailable on this platform/build, which every
 * caller treats as "no paywall", not as an error.
 */
export function configurePurchases(): boolean {
    if (configured) return true;
    if (configureFailed) return false;

    const key = apiKey();
    if (!key) {
        // Android before the Play Console listing exists, or web. Expected, not a bug.
        configureFailed = true;
        return false;
    }

    try {
        Purchases.configure({ apiKey: key });
        configured = true;
        return true;
    } catch (err) {
        // Most likely Expo Go, where the native module isn't linked.
        console.warn('RevenueCat configure failed — purchases unavailable:', err);
        configureFailed = true;
        return false;
    }
}

/**
 * Configure at MODULE SCOPE, on first import, rather than from a hook or an effect.
 * Effects re-run and components re-render; `Purchases.configure()` must happen exactly
 * once, and doing it here means it has already happened before any screen can ask
 * whether purchases are available.
 */
const AVAILABLE = configurePurchases();

export function purchasesAvailable(): boolean {
    return AVAILABLE;
}

/**
 * Tie the RevenueCat App User ID to the Supabase user id, so the webhook's
 * `app_user_id` is a uuid the backend can resolve to a real account. Anonymous
 * RevenueCat ids are never relied on — the backend ignores them outright.
 */
export async function loginPurchases(userId: string): Promise<void> {
    if (!configurePurchases()) return;
    try {
        await Purchases.logIn(userId);
    } catch (err) {
        console.warn('RevenueCat logIn failed:', err);
    }
}

export async function logoutPurchases(): Promise<void> {
    if (!configurePurchases()) return;
    try {
        // ASK BEFORE CALLING, don't call-and-catch. logOut() throws when the current
        // RevenueCat user is already anonymous — the normal state on a cold start
        // before anyone has signed in, and again after a second sign-out. Catching the
        // throw is not enough: the SDK ALSO emits its own ERROR-level log through
        // setLogHandler before it rejects, and that surfaces as a red LogBox screen in
        // dev and as error noise in production. The only way to silence it is to not
        // make the call. SubscriptionContext invokes this unconditionally whenever
        // there is no user (see the `!user?.id` branch), so the anonymous case is
        // routine rather than exceptional.
        if (await Purchases.isAnonymous()) return;
        await Purchases.logOut();
    } catch (err) {
        // Still swallowed. isAnonymous() can itself fail, and this runs inside the auth
        // listener where an unhandled rejection is a plausible sign-out crash.
        console.warn('RevenueCat logOut skipped:', err);
    }
}

/** True when RevenueCat itself says the `premium` entitlement is active. */
export function hasPremiumEntitlement(info: CustomerInfo | null | undefined): boolean {
    if (!info) return false;
    return !!info.entitlements.active[ENTITLEMENT_ID];
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
    if (!configurePurchases()) return null;
    try {
        return await Purchases.getCustomerInfo();
    } catch (err) {
        console.warn('RevenueCat getCustomerInfo failed:', err);
        return null;
    }
}

async function currentOffering(): Promise<PurchasesOffering | null> {
    if (!configurePurchases()) return null;
    try {
        const offerings = await Purchases.getOfferings();
        return offerings.all[OFFERING_ID] ?? offerings.current ?? null;
    } catch (err) {
        console.warn('RevenueCat getOfferings failed:', err);
        return null;
    }
}

/**
 * The eight purchasable options, grouped by billing period and ordered
 * Basic → Intermediate → High → Max.
 *
 * `priceString` is taken straight from the store, already localised and
 * currency-correct. Nothing here derives a price, and nothing may: the app is sold in
 * the US, Canada and Brazil, so a hardcoded "$5" would be wrong in two of three.
 */
export async function loadTierOptions(): Promise<Record<BillingPeriod, TierOption[]>> {
    const empty: Record<BillingPeriod, TierOption[]> = { monthly: [], yearly: [] };
    const offering = await currentOffering();
    if (!offering) return empty;

    const grouped: Record<BillingPeriod, TierOption[]> = { monthly: [], yearly: [] };

    for (const pkg of offering.availablePackages) {
        const mapped = PACKAGE_MAP[pkg.identifier];
        // Fall back on the identifier's suffix so a tier added in the dashboard shows
        // up (unordered, humanised) instead of vanishing — a product someone can buy
        // must never be invisible.
        const period: BillingPeriod =
            mapped?.period ?? (pkg.identifier.endsWith('_yearly') ? 'yearly' : 'monthly');
        const tier = mapped?.tier ?? null;

        grouped[period].push({
            key: pkg.identifier,
            tier,
            label: humanise(pkg.identifier, period),
            period,
            priceString: pkg.product.priceString,
            productId: pkg.product.identifier,
            pkg,
        });
    }

    for (const period of ['monthly', 'yearly'] as BillingPeriod[]) {
        grouped[period].sort((a, b) => rank(a.tier) - rank(b.tier));
    }
    return grouped;
}

function rank(tier: TierKey | null): number {
    const i = tier ? TIER_ORDER.indexOf(tier) : -1;
    return i === -1 ? TIER_ORDER.length : i;   // unknown tiers sort last
}

function humanise(identifier: string, period: BillingPeriod): string {
    const base = identifier.replace(`_${period}`, '').replace(/[_-]+/g, ' ').trim();
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : identifier;
}

export type PurchaseResult =
    | { status: 'purchased'; info: CustomerInfo }
    | { status: 'cancelled' }
    | { status: 'unavailable' }
    | { status: 'error'; message: string };

/**
 * Buy a package. A user cancelling is a NORMAL outcome, not an error — surfacing an
 * alert for it is the classic IAP annoyance, so it gets its own status.
 */
export async function purchaseTier(option: TierOption): Promise<PurchaseResult> {
    if (!configurePurchases()) return { status: 'unavailable' };
    try {
        const { customerInfo } = await Purchases.purchasePackage(option.pkg);
        return { status: 'purchased', info: customerInfo };
    } catch (err: any) {
        if (err?.userCancelled) return { status: 'cancelled' };
        console.warn('RevenueCat purchase failed:', err);
        return {
            status: 'error',
            message: err?.message ?? 'The purchase could not be completed.',
        };
    }
}

export type RestoreResult =
    | { status: 'restored'; info: CustomerInfo }
    | { status: 'nothing' }
    | { status: 'unavailable' }
    | { status: 'error'; message: string };

/** Required on the paywall by App Review, and the only recovery path after reinstall. */
export async function restorePurchases(): Promise<RestoreResult> {
    if (!configurePurchases()) return { status: 'unavailable' };
    try {
        const info = await Purchases.restorePurchases();
        return hasPremiumEntitlement(info)
            ? { status: 'restored', info }
            : { status: 'nothing' };
    } catch (err: any) {
        console.warn('RevenueCat restore failed:', err);
        return {
            status: 'error',
            message: err?.message ?? 'Purchases could not be restored.',
        };
    }
}
