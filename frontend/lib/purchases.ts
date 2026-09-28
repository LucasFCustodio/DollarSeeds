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
    INTRO_ELIGIBILITY_STATUS,
    PACKAGE_TYPE,
    PurchasesOffering,
    PurchasesPackage,
} from 'react-native-purchases';

import {
    ENTITLEMENT_ID,
    OFFERING_ID,
    PERIOD_ORDER,
    RC_ANDROID_API_KEY,
    RC_IOS_API_KEY,
    describeProduct,
    type BillingPeriod,
} from '../constants/premium';

/**
 * One purchasable plan: Premium Monthly or Premium Yearly. There is one tier now, so an
 * option is identified by its billing period alone.
 */
export type PlanOption = {
    key: string;              // RevenueCat package identifier ($rc_annual / $rc_monthly)
    period: BillingPeriod;
    /**
     * The store's own localised product name. Only ever shown for a product this build
     * does not recognise (see loadPlanOptions); known plans are labelled from the
     * catalogue via planLabelKey.
     */
    storeTitle: string;
    known: boolean;
    priceString: string;      // ALWAYS from the store — never computed or hardcoded
    productId: string;
    /**
     * The introductory offer configured on the product, if any — NOT a promise the user
     * gets it. Apple grants one per Apple ID per subscription group, so whether THIS
     * user may have it is a separate question: see checkTrialEligibility.
     */
    freeTrial: { unit: string; units: number } | null;
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
 * Billing period of a package. The package TYPE comes first: RevenueCat's predefined
 * `$rc_annual` / `$rc_monthly` identifiers carry it, and the identifier itself does not
 * end in `_yearly` — the old suffix test filed the annual plan under monthly. The
 * product map and the identifier are fallbacks for a custom package.
 */
function periodOf(pkg: PurchasesPackage): BillingPeriod {
    if (pkg.packageType === PACKAGE_TYPE.ANNUAL) return 'yearly';
    if (pkg.packageType === PACKAGE_TYPE.MONTHLY) return 'monthly';
    const mapped = describeProduct(pkg.product.identifier);
    if (mapped) return mapped.period;
    return /annual|year/i.test(pkg.identifier) ? 'yearly' : 'monthly';
}

/** A zero-price introductory offer, i.e. a free trial. A paid intro is not one. */
function freeTrialOf(pkg: PurchasesPackage): PlanOption['freeTrial'] {
    const intro = pkg.product.introPrice;
    if (!intro || intro.price !== 0) return null;
    return { unit: intro.periodUnit, units: intro.periodNumberOfUnits * Math.max(1, intro.cycles) };
}

/**
 * The purchasable plans, yearly first.
 *
 * `priceString` is taken straight from the store, already localised and
 * currency-correct. Nothing here derives a price, and nothing may: the app is sold in
 * the US, Canada and Brazil, so a hardcoded "$9.99" would be wrong in two of three.
 *
 * Legacy support-tier products are never offered here, even if an offering serves
 * them — `currentOffering()` falls back to `default` when `premium-2026` is missing,
 * and that holds only the eight legacy packages. Selling those from the new paywall
 * would be mislabelled and pointless. A product we don't recognise at all IS shown
 * (under the store's own title), because a plan someone can buy must never be
 * invisible.
 */
export async function loadPlanOptions(): Promise<PlanOption[]> {
    const offering = await currentOffering();
    if (!offering) return [];

    const options: PlanOption[] = [];
    for (const pkg of offering.availablePackages) {
        const mapped = describeProduct(pkg.product.identifier);
        if (mapped?.plan === 'legacy') continue;
        options.push({
            key: pkg.identifier,
            period: periodOf(pkg),
            storeTitle: pkg.product.title,
            known: !!mapped,
            priceString: pkg.product.priceString,
            productId: pkg.product.identifier,
            freeTrial: freeTrialOf(pkg),
            pkg,
        });
    }
    // Known plans first, in PERIOD_ORDER; anything unrecognised after them.
    const rank = (o: PlanOption) =>
        (o.known ? 0 : PERIOD_ORDER.length) + PERIOD_ORDER.indexOf(o.period);
    return options.sort((a, b) => rank(a) - rank(b));
}

/**
 * Which of these products THIS Apple ID may still take the introductory offer on.
 *
 * Apple grants one introductory offer per Apple ID per subscription group, and "DS
 * Subscriptions" holds all ten products — so anyone who took a trial on a legacy tier
 * is ineligible for the new one. Only an explicit ELIGIBLE answer counts: UNKNOWN (which
 * is all Android ever returns), INELIGIBLE, an error, or an unconfigured SDK all mean
 * "don't mention a trial". Promising a free month that doesn't arrive is a refund and a
 * one-star review; leaving out a trial that does arrive costs nothing.
 */
export async function checkTrialEligibility(productIds: string[]): Promise<Record<string, boolean>> {
    const none: Record<string, boolean> = {};
    if (!productIds.length || Platform.OS !== 'ios' || !configurePurchases()) return none;
    try {
        const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);
        const out: Record<string, boolean> = {};
        for (const id of productIds) {
            out[id] = result[id]?.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
        }
        return out;
    } catch (err) {
        console.warn('RevenueCat trial eligibility check failed:', err);
        return none;
    }
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
export async function purchasePlan(option: PlanOption): Promise<PurchaseResult> {
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
