/**
 * onboardingApi — the onboarding's requests (ONBOARDING_REWORK.md §2, §3, §5).
 *
 *   previewPlan     POST /onboarding/preview/ — the split, the goal's minimum and "on
 *                   pace for", the debt's payoff. Public: it works before sign-up.
 *   loadFacts       what an existing account already has (signed-in mode's skips).
 *   writeApi        the six writes, through the existing routes, plus the "did it
 *                   land?" checks lib/onboardingWrites.ts uses to resume safely.
 *
 * Every write uses the canonical stored values (i18n.md): English month names,
 * `Needs` / `Wants`, sub-category `Other`, income source `Paycheck`.
 */
import axios from 'axios';
import { supabase } from './supabase';
import { localDateISO } from './debtFreedom';
import { premiumErrorCode } from './premiumErrors';
import { MONTHS } from '../constants/months';
import type { Answers, ServerFacts } from './onboardingFlow';
import { DEBT_KINDS, titheRate } from './onboardingFlow';
import type { WriteApi, WriteItem, WriteOutcome } from './onboardingWrites';

const BASE = (__DEV__ && process.env.EXPO_PUBLIC_API_URL) || 'https://dollarseeds-1.onrender.com';

const CAT_API = { needs: 'Needs', wants: 'Wants' } as const; // i18n-canonical
const EXPENSE_SUBCAT = 'Other'; // i18n-canonical
const INCOME_SOURCE = 'Paycheck'; // i18n-canonical

export interface PlanPreview {
    split: {
        income: number;
        tithe: { enabled: boolean; rate: number; amount: number };
        budgetable: number;
        budget_type: string;
        needs: number;
        wants: number;
        goals: number;
    };
    goal: null | {
        minimum: number;
        share: number | null;
        on_pace: { month: string; year: number; months_early: number } | null;
    };
    debt: null | {
        payoff_month: string | null;
        covers_interest: boolean;
        monthly_interest: number;
        before_interest: boolean;
    };
}

export async function previewPlan(a: Answers): Promise<PlanPreview> {
    const rate = titheRate(a.tithe);
    const body: Record<string, unknown> = { income: a.income ?? 0, today: localDateISO() };
    if (rate !== null) body.tithe_rate = rate;
    if (a.goal) {
        body.goal = {
            target_amount: a.goal.targetAmount,
            saved_amount: a.goal.savedAmount,
            target_month: a.goal.targetMonth,
            target_year: a.goal.targetYear,
        };
    }
    if (a.debtChoice === 'yes' && a.debt) {
        body.debt = {
            amount_owed: a.debt.amountOwed,
            min_payment: a.debt.minPayment,
            ...(a.debt.apr !== null ? { apr: a.debt.apr } : {}),
        };
    }
    const { data } = await axios.post<PlanPreview>(`${BASE}/onboarding/preview/`, body);
    return data;
}

/** The current month's canonical name and day, from the phone's clock. */
function nowMonth() {
    const d = new Date();
    return { month: MONTHS[d.getMonth()], day: d.getDate() };
}

async function incomeThisMonth(): Promise<any[]> {
    const { data } = await axios.get(`${BASE}/income/details/`, { params: { month: nowMonth().month } });
    return data?.data ?? [];
}

async function expensesThisMonth(): Promise<any[]> {
    const { month } = nowMonth();
    const [needs, wants] = await Promise.all(['Needs', 'Wants'].map(category => // i18n-canonical
        axios.get(`${BASE}/expenses/details/`, { params: { month, category } })));
    return [...(needs.data?.data ?? []), ...(wants.data?.data ?? [])];
}

async function debts(): Promise<any[]> {
    const { data } = await axios.get(`${BASE}/debt-freedom/`, { params: { today: localDateISO() } });
    return data?.debts ?? [];
}

async function goals(): Promise<any[]> {
    const { data } = await axios.get(`${BASE}/savings/goal/`, { params: { today: localDateISO() } });
    return data?.data ?? [];
}

/**
 * Signed-in mode's skip facts. Each read is independent and a failed one is simply
 * "not known to exist" — the step shows, and its write's own checks still keep it
 * from duplicating anything. `goalsUsed` and `premiumActive` come from the
 * subscription context, which has already read /me/entitlements/.
 */
export async function loadFacts(user: { user_metadata?: Record<string, any> } | null): Promise<ServerFacts> {
    const meta = user?.user_metadata ?? {};
    const safe = async <T>(p: Promise<T>, fallback: T) => { try { return await p; } catch { return fallback; } };
    const [inc, exp, dbt] = await Promise.all([
        safe(incomeThisMonth(), []), safe(expensesThisMonth(), []), safe(debts(), []),
    ]);
    return {
        hasName: !!(String(meta.first_name ?? '').trim() || String(meta.full_name ?? '').trim()),
        hasIncomeThisMonth: inc.length > 0,
        hasExpenseThisMonth: exp.length > 0,
        hasDebt: dbt.length > 0,
    };
}

/** The account's real month, for signed-in mode's split when income already exists. */
export async function loadDashboardSplit(): Promise<PlanPreview['split'] | null> {
    try {
        const { data } = await axios.get(`${BASE}/dashboard/${nowMonth().month}`, { params: { today: localDateISO() } });
        return {
            income: Number(data.total_income ?? 0),
            tithe: { enabled: !!data.tithe?.enabled, rate: Number(data.tithe?.rate ?? 0), amount: Number(data.tithe?.amount ?? 0) },
            budgetable: Number(data.total_income ?? 0) - Number(data.tithe?.amount ?? 0),
            budget_type: data.budget_type?.key ?? 'balanced',
            needs: Number(data.budgets?.needs ?? 0),
            wants: Number(data.budgets?.wants ?? 0),
            goals: Number(data.budgets?.goals ?? 0),
        };
    } catch {
        return null;
    }
}

const sameMoney = (a: unknown, b: number) => Math.abs(Number(a) - b) < 0.005;

async function write(item: WriteItem, a: Answers): Promise<WriteOutcome> {
    const { month, day } = nowMonth();
    switch (item) {
        case 'name': {
            const { error } = await supabase.auth.updateUser({ data: { first_name: a.name!.trim() } });
            if (error) throw error;
            return 'done';
        }
        case 'tithe': {
            const rate = titheRate(a.tithe);
            await axios.patch(`${BASE}/settings/`, rate === null
                ? { tithe_enabled: false }
                : { tithe_enabled: true, tithe_rate: rate });
            return 'done';
        }
        case 'income':
            await axios.post(`${BASE}/income/`, { amount: a.income, source: INCOME_SOURCE, title: null, day, month });
            return 'done';
        case 'expense':
            await axios.post(`${BASE}/expenses/`, {
                title: a.expense!.title.trim(), amount: a.expense!.amount, category: CAT_API[a.expense!.category],
                sub_category: EXPENSE_SUBCAT, day, month,
            });
            return 'done';
        case 'debt': {
            const d = a.debt!;
            try {
                await axios.post(`${BASE}/debt-freedom/first-debt/`, {
                    name: (a.debtName ?? '').trim(),
                    debt_type: a.debtKind ? DEBT_KINDS[a.debtKind] : null,
                    amount_owed: d.amountOwed,
                    min_payment: d.minPayment,
                    due_day: d.dueDay,
                    ...(d.apr !== null ? { apr: d.apr } : {}),
                    today: localDateISO(),
                });
                return 'done';
            } catch (e) {
                // A free account that already had a debt: Debt Freedom is premium from
                // here, and no retry will change that.
                if (premiumErrorCode(e) === 'debt_freedom_locked') return 'skipped';
                throw e;
            }
        }
        case 'goal': {
            const g = a.goal!;
            try {
                await axios.post(`${BASE}/savings/goal/`, {
                    title: g.title.trim(),
                    target_amount: g.targetAmount,
                    target_month: g.targetMonth,
                    target_year: g.targetYear,
                    goal_type: 'saving',
                    saved_amount: g.savedAmount,
                    saved_source: g.savedAmount > 0 ? g.savedSource : null,
                    auto_minimum: g.autoMinimum,
                    today: localDateISO(),
                });
                return 'done';
            } catch (e) {
                if (premiumErrorCode(e)) return 'skipped';         // over the free goal cap
                if ((e as any)?.response?.status === 400) {
                    // The title is taken: by this very goal if an earlier attempt landed,
                    // otherwise by a goal the account already had. Neither needs a retry.
                    return await exists('goal', a) ? 'done' : 'skipped';
                }
                throw e;
            }
        }
    }
}

async function exists(item: WriteItem, a: Answers): Promise<boolean> {
    switch (item) {
        case 'income':
            return (await incomeThisMonth()).some(r => sameMoney(r.amount, a.income!) && r.source === INCOME_SOURCE);
        case 'expense': {
            const e = a.expense!;
            return (await expensesThisMonth()).some(r => r.category === CAT_API[e.category]
                && String(r.title ?? '').trim() === e.title.trim() && sameMoney(r.amount, e.amount));
        }
        case 'debt': {
            const name = (a.debtName ?? '').trim().toLowerCase();
            return (await debts()).some(d => String(d.name ?? '').trim().toLowerCase() === name);
        }
        case 'goal': {
            const title = a.goal!.title.trim().toLowerCase();
            return (await goals()).some(g => String(g.title ?? '').trim().toLowerCase() === title);
        }
        default:
            return false;
    }
}

export const writeApi: WriteApi = { write, exists };
