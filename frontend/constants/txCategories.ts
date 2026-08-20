/**
 * Canonical transaction taxonomy — income sources and expense sub-categories.
 *
 * ── THE INVARIANT (same one as constants/months.ts) ───────────────────────────
 * The strings below are the values WRITTEN TO THE DATABASE. They are English and
 * they stay English, forever, in every language. A picker whose selected *value*
 * became the translated label would write "Aluguel" into `sub_category` — a value
 * no existing row, query, or already-installed binary knows anything about.
 *
 * Translate at RENDER, keyed by the canonical value. `constants/budgetTypes.ts` set
 * this precedent; `subcatLabel` / `sourceLabel` on LocaleContext are the accessors.
 *
 * ── WHY SUB-CATEGORIES ARE NAMESPACED BY DOMAIN ───────────────────────────────
 * 'Other' appears THREE times across this file: needs, wants, and sources. A flat
 * English-keyed map would collapse them into one entry and force a single
 * translation to serve three different grammatical contexts — in Portuguese the
 * agreement differs ("Outro gasto" vs "Outra renda"). So the catalogue is nested:
 *   common:subcategory.needs.Other · common:subcategory.wants.Other · common:source.Other
 * The canonical values are still identical, which is what the database cares about.
 */

export const SUBCATS = {
    needs: ['Rent', 'Groceries', 'Utilities', 'Transit', 'Insurance', 'Healthcare', 'Other'],
    wants: ['Dining', 'Coffee', 'Streaming', 'Shopping', 'Travel', 'Gifts', 'Other'],
} as const;

export const SOURCES = ['Paycheck', 'Side gig', 'Gift', 'Refund', 'Bonus', 'Other'] as const;

/** Which sub-category list a UI category key selects. */
export type SubcatDomain = keyof typeof SUBCATS;

export type Subcat = (typeof SUBCATS)[SubcatDomain][number];
export type Source = (typeof SOURCES)[number];

/** Maps UI category keys → the backend `category` value. */
export const CAT_API: Record<SubcatDomain, string> = { needs: 'Needs', wants: 'Wants' };

/**
 * Which domain an already-stored `sub_category` belongs to. Needed by transaction
 * lists, which render a stored sub-category without the picker context that
 * produced it. Returns null for 'Other' — genuinely ambiguous — and for anything
 * unrecognised, so callers fall through to the raw stored English.
 */
export function subcatDomain(sub: string): SubcatDomain | null {
    if (sub === 'Other') return null;
    if ((SUBCATS.needs as readonly string[]).includes(sub)) return 'needs';
    if ((SUBCATS.wants as readonly string[]).includes(sub)) return 'wants';
    return null;
}

/**
 * Domain from the backend `category` value on a stored row — the reliable route,
 * and the one transaction lists should use, since it resolves 'Other' correctly
 * where `subcatDomain` cannot.
 */
export function domainFromApiCategory(category?: string | null): SubcatDomain | null {
    if (category === 'Needs') return 'needs';
    if (category === 'Wants') return 'wants';
    return null;
}
