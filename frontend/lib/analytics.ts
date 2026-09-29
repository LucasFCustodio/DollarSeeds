/**
 * analytics.ts — the ONE place every PostHog event name and its payload shape lives.
 *
 * Usage:
 *   const analytics = useAnalytics();
 *   analytics.expenseLogged({ category: 'Needs' });
 *
 * RULES (enforced by the typed methods below, not just convention):
 *  - Behavioral events only: ids, categories, counts, and video timing.
 *  - NEVER pass a dollar amount / balance / target / any financial value. There is no
 *    method here that accepts one. Financial analysis happens in Supabase SQL instead
 *    (see .claude/docs/analytics_queries.md).
 *  - Every method no-ops safely when PostHog isn't ready (hook returns undefined before
 *    the provider mounts, or if the key is missing), so callers never need to null-check.
 *
 * Identity (identify/reset) is handled in context/AuthContext.tsx, not here.
 */
import { usePostHog } from 'posthog-react-native';

// ─── Event catalog ────────────────────────────────────────────────────────────
// Names are string-literal-typed so a typo is a compile error and renames happen once.
export type AnalyticsEvent =
    | 'expense_logged'
    | 'income_logged'
    | 'savings_goal_created'
    | 'debt_goal_created'
    | 'savings_goal_funded'
    | 'debt_goal_funded'
    | 'goal_completed'
    | 'debt_created'
    | 'debt_payment_logged'
    | 'debt_paid_off'
    | 'debt_min_toggled'
    | 'debt_checkin_saved'
    | 'debt_late_fee_entered'
    | 'series_explore_clicked'
    | 'lesson_video_clicked'
    | 'written_lesson_opened'
    | 'written_lesson_completed'
    | 'lesson_progress'
    | 'lesson_video_completed'
    | 'paywall_viewed'
    | 'paywall_dismissed'
    | 'purchase_started'
    | 'purchase_completed'
    | 'restore_completed';

/**
 * useAnalytics — a thin, typed wrapper over usePostHog(). One method per event so the
 * event name and its allowed properties are defined exactly once.
 */
export function useAnalytics() {
    const posthog = usePostHog();

    // Central capture — the ONLY place capture() is called. If posthog is undefined
    // (provider not mounted yet / disabled), this quietly does nothing. Property values
    // are restricted to string | number by design: no object/blob (and thus no place to
    // smuggle a financial payload) ever reaches an event.
    const capture = (event: AnalyticsEvent, properties?: Record<string, string | number>) => {
        posthog?.capture(event, properties);
    };

    return {
        // ── Finance (categories / ids / types only — never amounts) ──────────────
        expenseLogged: (p: { category: string }) => capture('expense_logged', p),
        incomeLogged: () => capture('income_logged'),
        savingsGoalCreated: () => capture('savings_goal_created'),
        debtGoalCreated: () => capture('debt_goal_created'),
        savingsGoalFunded: (p: { goal_id: number }) => capture('savings_goal_funded', p),
        debtGoalFunded: (p: { goal_id: number }) => capture('debt_goal_funded', p),
        goalCompleted: (p: { goal_id: number; goal_type: string }) =>
            capture('goal_completed', p),

        // ── Debt Freedom (the Debts tab — ids / positions / kinds only) ──────────
        debtCreated: (p: { debt_id: number; debt_type: string; position: number; total: number }) =>
            capture('debt_created', p),
        debtPaymentLogged: (p: { debt_id: number; kind: 'minimum' | 'extra' | 'minimum_extra'; growth_step: number }) =>
            capture('debt_payment_logged', p),
        debtPaidOff: (p: { debt_id: number; position: number; total: number }) =>
            capture('debt_paid_off', p),
        debtMinToggled: (p: { debt_id: number; state: 'on' | 'off' }) =>
            capture('debt_min_toggled', p),
        /** Whether the statement came in higher than the app's balance — never the amount. */
        debtCheckinSaved: (p: { debt_id: number; balance_went_up: 0 | 1 }) =>
            capture('debt_checkin_saved', p),
        debtLateFeeEntered: (p: { debt_id: number; outcome: 'saved' | 'skipped' }) =>
            capture('debt_late_fee_entered', p),

        // ── Lessons (ids / titles / video timing only) ───────────────────────────
        seriesExploreClicked: (p: { series_id: string; title: string }) =>
            capture('series_explore_clicked', p),
        lessonVideoClicked: (p: { series_id: string; lesson_id: string; title: string }) =>
            capture('lesson_video_clicked', p),
        writtenLessonOpened: (p: { lesson_id: number; title: string }) =>
            capture('written_lesson_opened', p),
        writtenLessonCompleted: (p: { lesson_id: number; title: string }) =>
            capture('written_lesson_completed', p),

        // ── Video playback (timing only) ─────────────────────────────────────────
        lessonProgress: (p: {
            series_id: string;
            lesson_id: string;
            position_seconds: number;
            duration_seconds: number;
        }) => capture('lesson_progress', p),
        lessonVideoCompleted: (p: { series_id: string; lesson_id: string }) =>
            capture('lesson_video_completed', p),

        // ── Premium (product ids only — NEVER a price) ───────────────────────────
        // RevenueCat's package and customerInfo objects carry `price`, `priceString`
        // and currency. None of that may be forwarded: the no-financial-values rule at
        // the top of this file covers subscription amounts exactly as it covers
        // balances. `product_id` already identifies the tier, so the price adds
        // nothing analytically that Supabase/RevenueCat cannot answer better.
        paywallViewed: () => capture('paywall_viewed'),
        paywallDismissed: () => capture('paywall_dismissed'),
        purchaseStarted: (p: { product_id: string }) => capture('purchase_started', p),
        purchaseCompleted: (p: { product_id: string }) => capture('purchase_completed', p),
        restoreCompleted: () => capture('restore_completed'),
    };
}
