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
    | 'series_explore_clicked'
    | 'lesson_video_clicked'
    | 'written_lesson_opened'
    | 'written_lesson_completed'
    | 'lesson_progress'
    | 'lesson_video_completed';

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
    };
}
