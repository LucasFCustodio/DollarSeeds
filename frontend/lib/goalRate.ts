/**
 * goalRate — the $/week figure on a goal card ("Save $57/week · 4mo left").
 *
 * ── WHAT THE NUMBER MEANS ─────────────────────────────────────────────────────
 * It is THE PLAN, not the remaining work: what you committed to setting aside each
 * week when you created the goal. It is therefore a pure function of three things —
 * the target, when the goal was created, and its deadline — and of nothing else.
 *
 *     weeklyRate = target / daysBetween(created_at, deadline) * 7
 *
 * `allocated_amount` deliberately does NOT appear. The previous version divided the
 * REMAINING balance by the FULL original timespan, mixing a shrinking numerator with
 * a fixed denominator, and that single mistake produced two separate reported bugs:
 *
 *   - Every deposit made the displayed rate fall, so the plan you signed up for kept
 *     rewriting itself downward as you followed it.
 *   - The rate stopped tracking the target: with `allocated` in the numerator, editing
 *     $3,000 → $2,000 moved it by an amount that had nothing to do with either figure,
 *     and once `allocated` passed the new target the `max(0, …)` clamp pinned it at $0
 *     no matter what the target was changed to.
 *
 * Progress and the "achieved" state still key off `allocated_amount` — only the rate
 * changed. This module is dependency-free (the deadline arrives as a Date, computed by
 * `monthEndDate` at the call site) so it can be unit-tested outside React Native:
 * `npm run verify-goal-rate`.
 */

const MS_PER_DAY = 86_400_000;

/**
 * Whole days from `createdAt` to `deadline`, floored at 1 so the division is always
 * defined. A goal created mid-period measures from its own creation date, never from
 * today — that is what keeps the rate constant as the deadline approaches.
 */
export function daysBetween(createdAt: Date, deadline: Date): number {
    return Math.max(1, Math.ceil((deadline.getTime() - createdAt.getTime()) / MS_PER_DAY));
}

/**
 * @param target     the goal's `target_amount`. Null / 0 / unparseable ⇒ 0.
 * @param createdAt  the goal's `created_at` (ISO string from the API, or a Date).
 *                   Unparseable ⇒ measured from now, which is the closest honest
 *                   answer available and still never returns NaN to the UI.
 * @param deadline   end of the target month, from `monthEndDate(target_month, target_year)`.
 */
export function weeklyGoalRate(
    target: number | null | undefined,
    createdAt: string | Date | null | undefined,
    deadline: Date,
): number {
    if (!target || !Number.isFinite(target) || target <= 0) return 0;
    if (!(deadline instanceof Date) || Number.isNaN(deadline.getTime())) return 0;

    const created = createdAt instanceof Date ? createdAt : new Date(createdAt ?? NaN);
    const from = Number.isNaN(created.getTime()) ? new Date() : created;

    const rate = (target / daysBetween(from, deadline)) * 7;

    // A window shorter than a week would otherwise report a "weekly" pace larger than
    // the goal itself (target / 1 day * 7). You never need to set aside more than the
    // whole thing in one week, so cap it there. No effect on any window ≥ 7 days.
    return Math.min(rate, target);
}
