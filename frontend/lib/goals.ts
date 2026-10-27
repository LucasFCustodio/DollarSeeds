/**
 * goals.ts — the goals_v2 requests (GOALS_REWORK.md): the monthly-minimum toggle,
 * extra payments, Ready to Replant and the goal form's budget context.
 *
 * The server computes every number on a goal card — the stored minimum, what the
 * toggle would deposit, "on pace for" — and these functions only send the user's
 * action and the phone's date. Each request carries `X-Client-Features: goals_v2`
 * (lib/axiosConfig.ts), which is what makes the server answer with these shapes.
 */
import axios from 'axios';
import { localDateISO } from './debtFreedom';

const BASE = (__DEV__ && process.env.EXPO_PUBLIC_API_URL) || 'https://dollarseeds-1.onrender.com';

/** 'income' = from this month's budget · 'opening' = from money already saved. */
export type MoneySource = 'income' | 'opening';

/** "On pace for": months_early > 0 early, < 0 behind, 0 on track. */
export interface OnPace {
    month: string;
    year: number;
    months_early: number;
}

/** The keys goals_v2 adds to every row of GET /savings/goal/. */
export interface GoalV2Fields {
    monthly_minimum?: number | null;
    auto_minimum?: boolean;
    is_replant?: boolean;
    minimum_logged?: boolean;
    /** What the toggle deposits (or did, once logged). Null when the goal has no minimum. */
    minimum_amount?: number | null;
    on_pace?: OnPace | null;
    ready_to_complete?: boolean;
}

export interface BudgetContext {
    has_income: boolean;
    goals_budget: number;
    goal_minimums: number;
    debt_minimums: number;
}

const n = (v: unknown) => Number(v ?? 0);

export async function fetchBudgetContext(excludeGoalId?: number): Promise<BudgetContext> {
    const { data } = await axios.get<BudgetContext>(`${BASE}/savings/goal/budget-context/`, {
        params: { today: localDateISO(), ...(excludeGoalId ? { exclude_goal_id: excludeGoalId } : {}) },
    });
    return {
        has_income: !!data.has_income,
        goals_budget: n(data.goals_budget),
        goal_minimums: n(data.goal_minimums),
        debt_minimums: n(data.debt_minimums),
    };
}

export async function logGoalMinimum(goalId: number): Promise<void> {
    await axios.post(`${BASE}/savings/goal/${goalId}/minimum`, { today: localDateISO() });
}

export async function undoGoalMinimum(goalId: number): Promise<void> {
    await axios.post(`${BASE}/savings/goal/${goalId}/minimum/undo`, { today: localDateISO() });
}

export async function addExtraPayment(goalId: number, amount: number, source: MoneySource): Promise<void> {
    await axios.post(`${BASE}/savings/goal/${goalId}/extra`, { amount, source, today: localDateISO() });
}

export async function plantFromReplant(toGoalId: number, amount: number): Promise<void> {
    await axios.post(`${BASE}/savings/replant/`, { to_goal_id: toGoalId, amount, today: localDateISO() });
}

export { BASE as GOALS_BASE };
