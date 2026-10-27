/**
 * goalPlan — the goal form's live numbers: the default target date, and the monthly
 * minimum it shows as the user types ("That's $334/month").
 *
 * The SERVER stores the minimum (backend/goals_v2.py) and is the source of truth; this
 * is the same formula, run on the phone so the form can update on every keystroke.
 * Keep the two in step:
 *
 *     months left = this month → target month, INCLUSIVE, minimum 1
 *     minimum     = ceil((target − saved) / months left), whole dollars
 *
 * A new goal never has this month's minimum logged, so the form always counts from
 * this month. Dependency-free (no React Native, no i18n) so `npm run verify-goal-plan`
 * can run it under plain node.
 */

/** Canonical English month names — the stored values (constants/months.ts mirrors). */
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

/** How many months after the current one the default target lands: the current
 *  month plus 3 more make 4 payments (October → January). */
export const DEFAULT_TARGET_OFFSET = 3;

/** One integer per month, so "the month after December" is plain arithmetic. */
export function monthIndex(year: number, monthName: string): number | null {
    const m = MONTH_NAMES.indexOf(monthName);
    if (m < 0 || !Number.isFinite(year)) return null;
    return year * 12 + m;
}

function todayIndex(today: Date): number {
    return today.getFullYear() * 12 + today.getMonth();
}

export function defaultTargetDate(today: Date): { month: string; year: number } {
    const idx = todayIndex(today) + DEFAULT_TARGET_OFFSET;
    return { month: MONTH_NAMES[idx % 12], year: Math.floor(idx / 12) };
}

/** A target before the current month is not allowed. */
export function isBeforeThisMonth(monthName: string, year: number, today: Date): boolean {
    const idx = monthIndex(year, monthName);
    return idx !== null && idx < todayIndex(today);
}

export function monthsLeft(monthName: string, year: number, today: Date): number {
    const idx = monthIndex(year, monthName);
    if (idx === null) return 1;
    return Math.max(1, idx - todayIndex(today) + 1);
}

/**
 * The whole-dollar monthly minimum, or null when it cannot be worked out yet (no
 * target, or a target the saved amount already reaches). Integer cents throughout,
 * so $1,200 over 4 months is $300 and never $301 through float dust.
 */
export function monthlyMinimum(
    target: number | null | undefined,
    saved: number | null | undefined,
    monthName: string,
    year: number,
    today: Date,
): number | null {
    if (!target || !Number.isFinite(target) || target <= 0) return null;
    const remaining = Math.round(target * 100) - Math.round((saved && Number.isFinite(saved) ? saved : 0) * 100);
    if (remaining <= 0) return null;
    const perMonth = monthsLeft(monthName, year, today) * 100;
    return Math.ceil(remaining / perMonth);
}

/**
 * Where a new minimum sits in this month's Goals budget, for the form's context line
 * and its gentle warning. `share` is the new minimum's fraction of the budget (null
 * without income); `over` is true when every goal minimum plus every debt minimum,
 * this one included, would not fit. Never a reason to block saving.
 */
export function budgetFit(
    minimum: number | null,
    ctx: { has_income: boolean; goals_budget: number; goal_minimums: number; debt_minimums: number } | null,
): { share: number | null; over: boolean } {
    if (minimum === null || !ctx || !ctx.has_income || !(ctx.goals_budget > 0)) {
        return { share: null, over: false };
    }
    const committed = minimum + (ctx.goal_minimums || 0) + (ctx.debt_minimums || 0);
    return { share: minimum / ctx.goals_budget, over: committed > ctx.goals_budget + 0.005 };
}
