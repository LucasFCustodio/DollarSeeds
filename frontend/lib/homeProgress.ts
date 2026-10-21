/**
 * homeProgress.ts — the home's third fetch, GET /home/progress/, for the Envision
 * dashboard: debts paid and goals completed (count view), and the money paid toward
 * debt / saved toward goals over time (amount view and its graph).
 *
 * The server computes every number — counts, totals, stages, series, milestones.
 * This file only fetches, types and coerces them (money columns can arrive as
 * strings). A failure is the caller's to swallow: the home hides the dashboard and
 * renders the rest of the band.
 */
import axios from 'axios';
import { localDateISO } from './debtFreedom';

const PROD_BASE = 'https://dollarseeds-1.onrender.com';
const BASE = (__DEV__ && process.env.EXPO_PUBLIC_API_URL) || PROD_BASE;

/** The home's mini-plant stage, by share of the debt paid (server rule). */
export type PotStage = 'empty' | 'started' | 'finishing' | 'completed';

export interface ProgressPot {
    id: number;
    name: string;
    pct_paid: number;
    stage: PotStage;
    is_focus: boolean;
}

export interface SeriesPoint {
    /** YYYY-MM */
    month: string;
    cumulative: number;
}

export interface Milestone {
    /** YYYY-MM */
    month: string;
    name: string;
}

export interface DebtProgress {
    paid_count: number;
    total_count: number;
    /** Garden order. */
    pots: ProgressPot[];
    /** null once every debt is paid. */
    focus_name: string | null;
    total_paid: number;
    paid_this_year: number;
    /** One point per month, first payment → this month, no gaps. [] before any payment. */
    series: SeriesPoint[];
    milestones: Milestone[];
}

export interface GoalProgress {
    completed_count: number;
    total_count: number;
    /** The in-progress goal closest to its target; null when none is in progress. */
    nearest: { id: number; title: string; pct: number } | null;
    total_saved: number;
    saved_this_year: number;
    series: SeriesPoint[];
    milestones: Milestone[];
}

export interface HomeProgress {
    /** null when the user has no debts. */
    debts: DebtProgress | null;
    /** null when the user has no goals (General Savings doesn't count). */
    goals: GoalProgress | null;
}

const n = (v: unknown) => Number(v ?? 0);
const series = (s: SeriesPoint[] | undefined) =>
    (s ?? []).map(p => ({ month: p.month, cumulative: n(p.cumulative) }));

export async function fetchHomeProgress(): Promise<HomeProgress> {
    const { data } = await axios.get<HomeProgress>(`${BASE}/home/progress/`, {
        params: { today: localDateISO() },
    });
    const d = data.debts;
    const g = data.goals;
    return {
        debts: d && {
            ...d,
            pots: (d.pots ?? []).map(p => ({ ...p, pct_paid: n(p.pct_paid) })),
            total_paid: n(d.total_paid),
            paid_this_year: n(d.paid_this_year),
            series: series(d.series),
            milestones: d.milestones ?? [],
        },
        goals: g && {
            ...g,
            nearest: g.nearest && { ...g.nearest, pct: n(g.nearest.pct) },
            total_saved: n(g.total_saved),
            saved_this_year: n(g.saved_this_year),
            series: series(g.series),
            milestones: g.milestones ?? [],
        },
    };
}
