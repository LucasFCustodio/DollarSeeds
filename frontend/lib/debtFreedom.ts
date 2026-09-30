/**
 * debtFreedom.ts — the Debts tab's API layer (plant debts, snowball method).
 *
 * The server computes EVERYTHING the garden shows — order, focus, species, growth
 * step, rollover, payoff projection, billing cycles. The client only renders these
 * fields; there is deliberately no business logic in this file or in the components
 * that use it.
 *
 * Separate from the Goals tab's debt goals (`/savings/goal/?goal_type=debt`): these
 * routes read and write only the `debts` / `debt_transactions` / `debt_freedom_settings`
 * tables.
 */
import axios from 'axios';

/** Production API. In a dev build EXPO_PUBLIC_API_URL can point at a local backend
 *  (`uvicorn main:app --host 0.0.0.0`), which the axios interceptor also authenticates
 *  in __DEV__ only — the /debt-freedom/ routes exist there before they reach Render. */
const PROD_BASE = 'https://dollarseeds-1.onrender.com';
const BASE = (__DEV__ && process.env.EXPO_PUBLIC_API_URL) || PROD_BASE;

// Canonical English — stored as-is, translated only at render (see i18n.md).
export const DEBT_TYPES = [
    'credit_card', 'student_loan', 'medical', 'auto',
    'personal', 'bnpl', 'family', 'other',
] as const;
export type DebtType = (typeof DEBT_TYPES)[number];

export type DebtStatus = 'active' | 'paid_off';
export type TransactionKind =
    | 'payment_minimum' | 'payment_extra' | 'interest' | 'balance_edit'
    | 'late_fee' | 'statement_adjustment' | 'minimum_reversal';
export type Species = 1 | 2 | 3 | 4;

/** Stored columns (backend/migrations/0010_debt_freedom.sql, 0011_debt_freedom_v2.sql). */
export interface DebtRow {
    id: number;
    name: string;
    original_balance: number;
    current_balance: number;
    min_payment: number;
    apr: number;
    due_day: number | null;
    debt_type: DebtType | null;
    lender: string | null;
    pay_url: string | null;
    autopay: boolean | null;
    credit_limit: number | null;
    late_fee: number | null;
    notes: string | null;
    species: Species;
    species_locked: boolean;
    status: DebtStatus;
    paid_off_at: string | null;
    created_at: string;
    /** The due date whose statement check-in is pending. */
    checkin_due_since: string | null;
    /** A missed due date waiting for the user to enter the late fee. */
    late_fee_pending_for: string | null;
    highest_step: number | null;
}

/** A debt as the garden renders it: the row plus server-computed fields. */
export interface Debt extends DebtRow {
    position: number;
    total: number;
    is_focus: boolean;
    /** What the plant draws: max(computed_step, highest_step). Plants never shrink. */
    growth_step: number;
    /** The step the numbers alone give (for a future "plant dying" animation). */
    computed_step: number;
    pct_paid: number;
    ready_to_complete: boolean;
    next_due_date: string | null;
    /** The due date that closes the cycle the min-payment toggle belongs to. */
    current_cycle_due_date: string | null;
    /** The toggle's state: a net minimum is logged in the current cycle. */
    min_logged_this_cycle: boolean;
    suggested_payment: number;
    est_payoff_month: string | null;
    paid_off_count_through_here: number;
    missing: string[];
    monthly_interest: number;
    interest_remaining: number | null;
    rolls_into_id: number | null;
}

export interface Garden {
    debts: Debt[];
    focus_id: number | null;
    plan_est_payoff_month: string | null;
    /** "Extra each month" — null when never set (= $0). */
    monthly_extra: number | null;
}

export interface DebtTransaction {
    id: number;
    debt_id: number;
    kind: TransactionKind;
    amount: number;
    balance_after: number;
    occurred_on: string;
}

export interface DebtDetail {
    debt: Debt;
    transactions: DebtTransaction[];
    rolls_into: { id: number; name: string } | null;
    focus_id: number | null;
    plan_est_payoff_month: string | null;
}

export interface OneDebt {
    debt: Debt;
    focus_id: number | null;
    plan_est_payoff_month: string | null;
}

export interface PaymentResult extends OneDebt {
    previous_step: number;
    transactions: DebtTransaction[];
}

export interface CheckinResult extends OneDebt {
    /** Signed: the statement balance minus the app's balance before the check-in. */
    balance_change: number;
}

export interface DebtFreedomSettings {
    monthly_extra: number | null;
}

export interface DebtInput {
    name: string;
    original_balance: number;
    current_balance: number;
    min_payment: number;
    apr: number;
    due_day: number;
    debt_type?: DebtType | null;
    lender?: string | null;
    pay_url?: string | null;
    autopay?: boolean | null;
    credit_limit?: number | null;
    late_fee?: number | null;
    notes?: string | null;
}

// numeric columns can arrive as strings from PostgREST; normalise once, here.
const NUMERIC = ['original_balance', 'current_balance', 'min_payment', 'apr', 'credit_limit',
    'late_fee', 'suggested_payment', 'pct_paid', 'monthly_interest', 'interest_remaining'] as const;

function normalise<T extends DebtRow>(d: T): T {
    const out = { ...d } as Record<string, unknown>;
    for (const k of NUMERIC) {
        if (out[k] != null) out[k] = Number(out[k]);
    }
    return out as T;
}

function normaliseTx(t: DebtTransaction): DebtTransaction {
    return { ...t, amount: Number(t.amount), balance_after: Number(t.balance_after) };
}

function normaliseOne<T extends OneDebt>(r: T): T {
    return { ...r, debt: normalise(r.debt) };
}

const num = (v: number | string | null | undefined) => (v == null ? null : Number(v));

// Every route that can close a billing cycle gets the phone's date: cycles run on the
// user's local day, not the server's UTC one.

export async function fetchGarden(): Promise<Garden> {
    const { data } = await axios.get<Garden>(`${BASE}/debt-freedom/`, { params: { today: localDateISO() } });
    return { ...data, debts: data.debts.map(normalise), monthly_extra: num(data.monthly_extra) };
}

export async function fetchDebt(id: number): Promise<DebtDetail> {
    const { data } = await axios.get<DebtDetail>(`${BASE}/debt-freedom/${id}`, { params: { today: localDateISO() } });
    return { ...normaliseOne(data), transactions: data.transactions.map(normaliseTx) };
}

export async function createDebt(input: DebtInput): Promise<OneDebt> {
    const { data } = await axios.post<OneDebt>(`${BASE}/debt-freedom/`, input);
    return normaliseOne(data);
}

/** Send only the fields that changed; `null` clears an optional field. */
export async function updateDebt(id: number, patch: Partial<DebtInput>): Promise<OneDebt> {
    const { data } = await axios.patch<OneDebt>(`${BASE}/debt-freedom/${id}`, { ...patch, today: localDateISO() });
    return normaliseOne(data);
}

export async function deleteDebt(id: number): Promise<void> {
    await axios.delete(`${BASE}/debt-freedom/${id}`);
}

/** `extraAmount` is only accepted on the focus debt; the server refuses it elsewhere.
 *  A second minimum in the same cycle is refused (409). */
export async function logPayment(
    id: number,
    body: { minimum: boolean; extraAmount?: number; occurredOn?: string },
): Promise<PaymentResult> {
    const { data } = await axios.post<PaymentResult>(`${BASE}/debt-freedom/${id}/payments`, {
        minimum: body.minimum,
        ...(body.extraAmount ? { extra_amount: body.extraAmount } : {}),
        ...(body.occurredOn ? { occurred_on: body.occurredOn } : {}),
        today: localDateISO(),
    });
    return { ...normaliseOne(data), transactions: data.transactions.map(normaliseTx) };
}

/** The toggle's on → off. Refused (409) once the cycle's due date has passed. */
export async function undoMinimum(id: number): Promise<OneDebt> {
    const { data } = await axios.post<OneDebt>(`${BASE}/debt-freedom/${id}/payments/undo-minimum`, {
        today: localDateISO(),
    });
    return normaliseOne(data);
}

export async function saveCheckin(
    id: number,
    body: { statementBalance: number; minPayment: number },
): Promise<CheckinResult> {
    const { data } = await axios.post<CheckinResult>(`${BASE}/debt-freedom/${id}/checkin`, {
        statement_balance: body.statementBalance,
        min_payment: body.minPayment,
        today: localDateISO(),
    });
    return { ...normaliseOne(data), balance_change: Number(data.balance_change) };
}

/** `amount: null` is "No fee / Skip". `remember` also stores it as the debt's late fee. */
export async function answerLateFee(
    id: number,
    body: { dueDate: string; amount: number | null; remember?: boolean },
): Promise<OneDebt> {
    const { data } = await axios.post<OneDebt>(`${BASE}/debt-freedom/${id}/late-fee`, {
        due_date: body.dueDate,
        amount: body.amount,
        remember: !!body.remember,
        today: localDateISO(),
    });
    return normaliseOne(data);
}

export async function fetchSettings(): Promise<DebtFreedomSettings> {
    const { data } = await axios.get<DebtFreedomSettings>(`${BASE}/debt-freedom/settings`);
    return { monthly_extra: num(data.monthly_extra) };
}

/** `null` clears it (= $0). */
export async function saveSettings(monthlyExtra: number | null): Promise<DebtFreedomSettings> {
    const { data } = await axios.put<DebtFreedomSettings>(`${BASE}/debt-freedom/settings`, {
        monthly_extra: monthlyExtra,
    });
    return { monthly_extra: num(data.monthly_extra) };
}

export async function completeDebt(id: number): Promise<OneDebt> {
    const { data } = await axios.post<OneDebt>(`${BASE}/debt-freedom/${id}/complete`);
    return normaliseOne(data);
}

/** The plant state PlantView draws. Derived only from server fields. */
export type PlantState = 'seed' | 'growing' | 'ready' | 'paid_off';

export function plantStateOf(d: Debt): PlantState {
    if (d.status === 'paid_off') return 'paid_off';
    if (d.ready_to_complete) return 'ready';
    return d.growth_step === 0 ? 'seed' : 'growing';
}

/** Today in the user's timezone, as YYYY-MM-DD — payments are dated by the phone,
 *  not by the server's UTC clock. */
export function localDateISO(now = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
