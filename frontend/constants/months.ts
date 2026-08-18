/**
 * months.ts — the canonical month list. There is exactly one, and this is it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ENGLISH MONTH NAMES ARE THE APP'S MONTH PRIMARY KEY. DO NOT TRANSLATE THEM.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The same string is simultaneously:
 *   - the value POSTed as `month` / `target_month` on expenses, income, savings
 *     transactions, goals, transfers and rollover
 *   - a URL path segment (`GET /dashboard/{current_month}`)
 *   - the value stored in Supabase, in rows going back to the app's first release
 *   - the ORDERING key — the backend does `MONTHS.index(current_month)` and the
 *     frontend derives goal deadlines from `MONTHS.indexOf(m)`
 *
 * So a picker whose *value* became a translated label would write "Agosto" rows that
 * no `.eq("month", …)` query ever matches again. The failure is silent, not loud:
 * `GET /income/funding-months/` returns `{"data": []}` for an unrecognised month
 * rather than erroring, so the symptom would be features quietly going empty.
 *
 * THE RULE: this array is canonical and stays English forever. Translation happens
 * only at render, via `useMonthLabel()` / `useMonthAbbr()` from LocaleContext, which
 * look up a display string keyed BY the canonical value.
 *
 * `constants/budgetTypes.ts` implements the same key/label split and is the in-repo
 * precedent. This file replaces seven duplicated copies of the month list that
 * previously lived in index.tsx, piggyBank.tsx, ExpenseContainer, IncomeContainer and
 * StartingBalanceGate, plus three separate abbreviation arrays.
 */

export const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export type MonthName = typeof MONTHS[number];

export function isMonthName(value: unknown): value is MonthName {
    return typeof value === 'string' && (MONTHS as readonly string[]).includes(value);
}

/** The canonical month for a JS Date (defaults to now). Never locale-dependent. */
export function currentMonthName(date: Date = new Date()): MonthName {
    return MONTHS[date.getMonth()];
}

/** 0–11 index of a canonical month, or -1. Use for ordering and date arithmetic. */
export function monthIndex(month: string): number {
    return (MONTHS as readonly string[]).indexOf(month);
}

/**
 * Last day of `month` in `year`, as a Date. Moved here from piggyBank.tsx, where it
 * was `new Date(y, MONTHS.indexOf(m) + 1, 0)` against a local copy of the array —
 * date arithmetic silently coupled to a string that was about to become translatable.
 */
export function monthEndDate(month: string, year: number): Date {
    return new Date(year, monthIndex(month) + 1, 0);
}
