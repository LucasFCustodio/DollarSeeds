/**
 * planPricing — the two figures the paywall DERIVES from the store's prices.
 *
 * Every amount the user is BILLED is `option.priceString`, straight off the store and
 * never computed. This module produces only the comparison figures around it on the
 * Annual card:
 *
 *   - the crossed-out twelve-month price   = monthly × 12
 *   - the discount                         = 1 − yearly ÷ (monthly × 12), rounded DOWN
 *
 * The maths runs in whole cents so a saving that is exactly 50% never lands on 49.999…
 * and floors to 49. The discount is floored, never rounded: overstating a saving by a
 * point is a claim the store price does not back up.
 *
 * NOTHING is shown unless every input is trustworthy: both plans present, the same
 * currency on both, and a saving above zero. Otherwise `derivePlanPricing` returns null
 * and the paywall shows only the store prices.
 *
 * Formatting follows lib/money.ts and constants/currencies.ts — separators owned here
 * rather than Intl.NumberFormat, because Hermes' Intl fallback silently emits en-US
 * separators. The symbol comes from the PRODUCT's currency code, not the user's
 * display-currency preference: these figures are store prices, and the store decides
 * their currency.
 *
 * Dependency-free so `npm run verify-plan-pricing` can run it in plain Node.
 */
import type { NumberFormat } from '../constants/currencies';

/** The numeric half of a plan option — the store's price and its ISO currency code. */
export type PlanPrice = { price: number; currencyCode: string };

export type DerivedPricing = {
    /** Whole percent, floored. Always ≥ 1. */
    discountPercent: number;
    /** Monthly price × 12, formatted. Rendered struck through. */
    twelveMonths: string;
};

/**
 * Symbols for the storefronts the app is sold in. CAD is `$` because that is how the
 * Canadian storefront writes its own prices. Anything else falls back to the ISO code,
 * which is unambiguous if unlovely — better than borrowing the wrong symbol.
 */
const SYMBOLS: Record<string, { symbol: string; space: boolean }> = {
    USD: { symbol: '$', space: false },
    CAD: { symbol: '$', space: false },
    BRL: { symbol: 'R$', space: true },
};

const toCents = (amount: number) => Math.round(amount * 100);

function validPrice(p: PlanPrice | null | undefined): p is PlanPrice {
    return !!p
        && typeof p.price === 'number' && Number.isFinite(p.price) && p.price > 0
        && typeof p.currencyCode === 'string' && p.currencyCode.length > 0;
}

/** Cents → "$5.83" / "R$ 5,83" / "EUR 5,83", with the app language's separators. */
export function formatStorePrice(cents: number, currencyCode: string, format: NumberFormat): string {
    const code = currencyCode.toUpperCase();
    const known = SYMBOLS[code];
    const symbol = known ? known.symbol : code;
    const gap = known ? (known.space ? ' ' : '') : ' ';
    const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, format.group);
    const frac = String(cents % 100).padStart(2, '0');
    return `${symbol}${gap}${whole}${format.decimal}${frac}`;
}

/**
 * The derived figures for the Annual card, or null when any of them would be
 * unreliable (see the header) — in which case none of them is shown.
 */
export function derivePlanPricing(
    monthly: PlanPrice | null | undefined,
    yearly: PlanPrice | null | undefined,
    format: NumberFormat,
): DerivedPricing | null {
    if (!validPrice(monthly) || !validPrice(yearly)) return null;
    if (monthly.currencyCode.toUpperCase() !== yearly.currencyCode.toUpperCase()) return null;

    const twelveMonthsCents = toCents(monthly.price) * 12;
    const yearlyCents = toCents(yearly.price);
    const savingCents = twelveMonthsCents - yearlyCents;
    if (savingCents <= 0) return null;

    // Integer division: floor(saving / twelveMonths × 100) without a float in sight.
    const discountPercent = Math.floor((savingCents * 100) / twelveMonthsCents);
    if (discountPercent < 1) return null;

    const code = yearly.currencyCode;
    return {
        discountPercent,
        twelveMonths: formatStorePrice(twelveMonthsCents, code, format),
    };
}
