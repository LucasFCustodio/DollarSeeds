/**
 * homeSummary.ts — the home screen's second fetch, GET /home/summary/.
 *
 * Everything the home needs beyond /dashboard/{month}: when the user last logged
 * something, which splits are over budget, the debt facts, and savings goals close to
 * their target. The server decides all of it (the overdue/due-soon tests, the next
 * payment, focus extras, payoff months) — like lib/debtFreedom.ts, this file only
 * fetches and types it. The client computes nothing about debts.
 */
import axios from 'axios';
import { localDateISO, type Debt, type Species } from './debtFreedom';

const PROD_BASE = 'https://dollarseeds-1.onrender.com';
const BASE = (__DEV__ && process.env.EXPO_PUBLIC_API_URL) || PROD_BASE;

/** Split keys as /dashboard/{month} names them. `goals` is the Savings container. */
export type SplitKey = 'needs' | 'wants' | 'goals';

export interface OverBudget {
    split: SplitKey;
    amount_over: number;
}

export interface NextPayment {
    id: number;
    name: string;
    /** YYYY-MM-DD */
    due_date: string;
    min_payment: number;
    /** 0 unless this is the focus debt. */
    focus_extra: number;
    is_focus: boolean;
}

export interface FocusDebt {
    id: number;
    name: string;
    species: Species;
    growth_step: number;
    pct_paid: number;
    focus_extra: number;
    /** The full decorated debt, so the plant and pot label match the Debts tab. */
    debt: Debt;
}

/** A debt due within 7 days (server rule), nearest first. */
export interface DueSoonDebt {
    id: number;
    name: string;
    /** YYYY-MM-DD */
    due_date: string;
    min_payment: number;
}

/** An overdue debt (server rule), longest overdue first. */
export interface OverdueDebt {
    id: number;
    name: string;
    min_payment: number;
    /** YYYY-MM-DD: the last passed due date whose minimum was not logged. */
    missed_due_date: string;
    days_overdue: number;
    pay_url: string | null;
}

export interface HomeDebts {
    paid_count: number;
    total_count: number;
    overdue_count: number;
    /** Absent from a backend older than this field; fall back to overdue_count. */
    overdue?: OverdueDebt[];
    due_soon_count: number;
    /** Absent from a backend older than this field; read it as []. */
    due_soon?: DueSoonDebt[];
    next_payment: NextPayment | null;
    focus: FocusDebt | null;
    /** YYYY-MM */
    plan_est_payoff_month: string | null;
    almost_free: { id: number; name: string; est_payoff_month: string } | null;
}

export interface GoalNearCompletion {
    id: number;
    title: string;
    /** 0.8 – 1.0 */
    pct: number;
}

export interface HomeSummary {
    last_logged_at: string | null;
    days_since_last_log: number | null;
    over_budget: OverBudget[];
    /** null when the user has no debts at all. */
    debts: HomeDebts | null;
    goals_near_completion: GoalNearCompletion[];
}

const n = (v: unknown) => Number(v ?? 0);

/** `month` is the canonical English month name — never a translated label. */
export async function fetchHomeSummary(month: string): Promise<HomeSummary> {
    const { data } = await axios.get<HomeSummary>(`${BASE}/home/summary/`, {
        params: { month, today: localDateISO() },
    });
    const debts = data.debts;
    return {
        ...data,
        over_budget: (data.over_budget ?? []).map(o => ({ ...o, amount_over: n(o.amount_over) })),
        goals_near_completion: (data.goals_near_completion ?? []).map(g => ({ ...g, pct: n(g.pct) })),
        debts: debts && {
            ...debts,
            next_payment: debts.next_payment && {
                ...debts.next_payment,
                min_payment: n(debts.next_payment.min_payment),
                focus_extra: n(debts.next_payment.focus_extra),
            },
            focus: debts.focus && {
                ...debts.focus,
                focus_extra: n(debts.focus.focus_extra),
                debt: {
                    ...debts.focus.debt,
                    min_payment: n(debts.focus.debt.min_payment),
                    current_balance: n(debts.focus.debt.current_balance),
                    original_balance: n(debts.focus.debt.original_balance),
                    pct_paid: n(debts.focus.debt.pct_paid),
                },
            },
        },
    };
}
