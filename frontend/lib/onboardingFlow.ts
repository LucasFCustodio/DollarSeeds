/**
 * onboardingFlow — which onboarding screen comes next, as pure functions
 * (ONBOARDING_REWORK.md §4, §5).
 *
 * The flow is ONE ordered list of steps, filtered per user:
 *   - Group 3 runs the debt steps before the goal steps when the user said they want
 *     to get out of debt (screen 4), and the goal steps first otherwise.
 *   - The debt steps after "Any debts?" only exist when the answer was "Yes, I do".
 *   - "That's it!" (expenseDone, the updated containers) only follows a logged
 *     expense; "I haven't spent anything yet" skips it.
 *   - In signed-in mode (an account that never did this onboarding) a step whose data
 *     the account already has is skipped (`ServerFacts`), and sign-up never shows.
 *   - Premium is skipped for an active subscriber, in both modes.
 *
 * Resuming after the app was killed is `resumeStep`: the saved step, unless an
 * earlier step it depends on has no answer (then that one), or it no longer applies
 * (then the next one that does).
 *
 * Dependency-free (no React Native, no i18n) so `npm run verify-onboarding` runs it
 * under plain node.
 */

export type StepId =
    | 'welcome' | 'promise'
    | 'name' | 'reasons' | 'feeling' | 'tithe'
    | 'income' | 'split' | 'expense' | 'expenseDone'
    | 'debtAsk' | 'debtType' | 'debtDetails' | 'debtPreview'
    | 'goalPick' | 'goalDetails' | 'goalPreview'
    | 'commitment' | 'plan' | 'signup' | 'premium' | 'done';

export type GroupId = 'heart' | 'month' | 'harvest' | 'garden';
export type Mode = 'new' | 'signed_in';

export const REASONS = ['debt', 'overspending', 'saving', 'honor', 'organized'] as const;
export type Reason = (typeof REASONS)[number];

export const FEELINGS = ['stressed', 'overwhelmed', 'hopeful', 'good'] as const;
export type Feeling = (typeof FEELINGS)[number];

/** Card key → the canonical `debts.debt_type` it stores. */
export const DEBT_KINDS = {
    credit_card: 'credit_card',
    car: 'auto',
    student: 'student_loan',
    medical: 'medical',
    personal: 'personal',
    other: 'other',
} as const;
export type DebtKind = keyof typeof DEBT_KINDS;

export const GOAL_KINDS = ['emergency', 'phone', 'vacation', 'car', 'home', 'wedding', 'gift', 'other'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export type TitheChoice = 'ten' | 'custom' | 'none';
export type MoneySource = 'income' | 'opening';

export interface Answers {
    name?: string;
    reasons?: Reason[];
    feeling?: Feeling;
    tithe?: { choice: TitheChoice; ratePct?: number };
    income?: number;
    /** null = "I haven't spent anything yet". */
    expense?: { category: 'needs' | 'wants'; title: string; amount: number } | null;
    debtChoice?: 'yes' | 'free' | 'later';
    debtKind?: DebtKind;
    debtName?: string;
    /** apr null = skipped ("You can add it later"). */
    debt?: { amountOwed: number; minPayment: number; dueDay: number; apr: number | null };
    goalKind?: GoalKind;
    goal?: {
        title: string;
        targetAmount: number;
        savedAmount: number;
        savedSource: MoneySource | null;
        targetMonth: string;
        targetYear: number;
        autoMinimum: boolean;
    };
    committed?: boolean;
}

/** What an existing account already has (signed-in mode). Unknown = not had. */
export interface ServerFacts {
    hasName?: boolean;
    hasIncomeThisMonth?: boolean;
    hasExpenseThisMonth?: boolean;
    hasDebt?: boolean;
    goalsUsed?: number;
    premiumActive?: boolean;
}

export const GROUP_OF: Partial<Record<StepId, GroupId>> = {
    name: 'heart', reasons: 'heart', feeling: 'heart', tithe: 'heart',
    income: 'month', split: 'month', expense: 'month', expenseDone: 'month',
    debtAsk: 'harvest', debtType: 'harvest', debtDetails: 'harvest', debtPreview: 'harvest',
    goalPick: 'harvest', goalDetails: 'harvest', goalPreview: 'harvest',
    commitment: 'garden', plan: 'garden', signup: 'garden', premium: 'garden', done: 'garden',
};

const DEBT_STEPS: StepId[] = ['debtAsk', 'debtType', 'debtDetails', 'debtPreview'];
const GOAL_STEPS: StepId[] = ['goalPick', 'goalDetails', 'goalPreview'];

/** Every step in canonical order for these answers, before any skip. */
export function canonicalSteps(answers: Answers): StepId[] {
    const debtFirst = !!answers.reasons?.includes('debt');
    const harvest = debtFirst ? [...DEBT_STEPS, ...GOAL_STEPS] : [...GOAL_STEPS, ...DEBT_STEPS];
    return [
        'welcome', 'promise',
        'name', 'reasons', 'feeling', 'tithe',
        'income', 'split', 'expense', 'expenseDone',
        ...harvest,
        'commitment', 'plan', 'signup', 'premium', 'done',
    ];
}

/** Is this step left out for this user? */
export function isSkipped(step: StepId, answers: Answers, mode: Mode, facts: ServerFacts): boolean {
    if (step === 'premium' && facts.premiumActive) return true;
    if (step === 'expenseDone') {
        // Only after a logged expense. Before screen 9 is answered it still counts
        // toward the progress bar, like the debt steps.
        if (answers.expense === null) return true;
        if (mode === 'signed_in' && facts.hasExpenseThisMonth) return true;
        return false;
    }
    if (['debtType', 'debtDetails', 'debtPreview'].includes(step) && answers.debtChoice !== 'yes') {
        // Only "Yes, I do" goes on. Until "Any debts?" is answered they still count
        // toward the progress bar, so it never jumps backwards on a "Yes".
        return answers.debtChoice !== undefined || (mode === 'signed_in' && !!facts.hasDebt);
    }
    if (mode !== 'signed_in') return false;
    switch (step) {
        case 'signup': return true;
        case 'name': return !!facts.hasName;
        case 'income': return !!facts.hasIncomeThisMonth;
        case 'expense': return !!facts.hasExpenseThisMonth;
        case 'debtAsk': case 'debtType': case 'debtDetails': case 'debtPreview': return !!facts.hasDebt;
        case 'goalPick': case 'goalDetails': case 'goalPreview': return (facts.goalsUsed ?? 0) > 0;
        default: return false;
    }
}

/** The steps this user walks through, in order. */
export function flowSteps(answers: Answers, mode: Mode, facts: ServerFacts = {}): StepId[] {
    return canonicalSteps(answers).filter(s => !isSkipped(s, answers, mode, facts));
}

export function nextStep(current: StepId, answers: Answers, mode: Mode, facts: ServerFacts = {}): StepId | null {
    const steps = flowSteps(answers, mode, facts);
    const i = steps.indexOf(current);
    if (i >= 0) return steps[i + 1] ?? null;
    // The current step stopped applying (an answer changed): the next one that does.
    const order = canonicalSteps(answers);
    const at = order.indexOf(current);
    return order.slice(at + 1).find(s => steps.includes(s)) ?? null;
}

export function prevStep(current: StepId, answers: Answers, mode: Mode, facts: ServerFacts = {}): StepId | null {
    const steps = flowSteps(answers, mode, facts);
    const i = steps.indexOf(current);
    if (i > 0) return steps[i - 1];
    const order = canonicalSteps(answers);
    const at = order.indexOf(current);
    return [...order.slice(0, Math.max(0, at))].reverse().find(s => steps.includes(s)) ?? null;
}

/** Steps whose screen has no back arrow and nothing to go back to. */
export const NO_BACK: StepId[] = ['welcome', 'premium', 'done'];
/** Steps after the account exists: going back past these would re-run sign-up. */
const AFTER_ACCOUNT: StepId[] = ['premium', 'done'];

/** The progress bar: shown from screen 3 on, `{ group, value 0–1 }`. */
export function progressOf(step: StepId, answers: Answers, mode: Mode, facts: ServerFacts = {}):
    { group: GroupId; value: number } | null {
    const group = GROUP_OF[step];
    if (!group) return null;
    const counted = flowSteps(answers, mode, facts).filter(s => GROUP_OF[s]);
    const i = counted.indexOf(step);
    if (i < 0) return null;
    return { group, value: (i + 1) / counted.length };
}

// ── validity / answers ───────────────────────────────────────────────────────

export const NAME_MAX = 40;
export const DEBT_NAME_MAX = 40;

/** Does this step have the answer it needs before Continue? */
export function stepAnswered(step: StepId, a: Answers): boolean {
    switch (step) {
        case 'name': return !!a.name && a.name.trim().length > 0;
        case 'reasons': return !!a.reasons && a.reasons.length > 0;
        case 'feeling': return !!a.feeling;
        case 'tithe':
            if (!a.tithe) return false;
            return a.tithe.choice !== 'custom'
                || (typeof a.tithe.ratePct === 'number' && a.tithe.ratePct > 0 && a.tithe.ratePct <= 100);
        case 'income': return typeof a.income === 'number' && a.income > 0;
        case 'expense': return a.expense !== undefined;
        case 'debtAsk': return !!a.debtChoice;
        case 'debtType': return !!a.debtKind && !!a.debtName && a.debtName.trim().length > 0;
        case 'debtDetails': return !!a.debt && a.debt.amountOwed > 0 && a.debt.minPayment >= 0
            && a.debt.dueDay >= 1 && a.debt.dueDay <= 31;
        case 'goalPick': return !!a.goalKind;
        case 'goalDetails': return !!a.goal;
        case 'commitment': return !!a.committed;
        default: return true;
    }
}

/**
 * Where a relaunch lands. The saved step if every step before it is answered; else
 * the first unanswered one before it; and if the saved step no longer applies (a fact
 * changed, the app version changed), the next step that does. An unknown or missing
 * step starts at the beginning.
 */
export function resumeStep(saved: StepId | null | undefined, answers: Answers, mode: Mode,
                           facts: ServerFacts = {}): StepId {
    const steps = flowSteps(answers, mode, facts);
    if (!saved) return steps[0];
    const order = canonicalSteps(answers);
    const at = order.indexOf(saved);
    if (at < 0) return steps[0];
    const target = steps.includes(saved) ? saved : (order.slice(at + 1).find(s => steps.includes(s)) ?? steps[steps.length - 1]);
    const before = steps.slice(0, steps.indexOf(target));
    return before.find(s => !stepAnswered(s, answers)) ?? target;
}

/** Can the back arrow leave this step? Not past the account's creation. */
export function canGoBack(step: StepId, answers: Answers, mode: Mode, facts: ServerFacts = {}): boolean {
    if (NO_BACK.includes(step) || AFTER_ACCOUNT.includes(step)) return false;
    return prevStep(step, answers, mode, facts) !== null;
}

/** Screen 5's answer picks screen 17's verse (dashboard:verse.<id>). */
export function verseFor(feeling: Feeling | undefined): string {
    if (feeling === 'hopeful') return 'proverbs-21-5';
    if (feeling === 'good') return 'luke-16-10';
    return 'philippians-4-6';
}

/** The tithe as user_settings stores it: a fraction, or null for "Not right now". */
export function titheRate(tithe: Answers['tithe']): number | null {
    if (!tithe || tithe.choice === 'none') return null;
    if (tithe.choice === 'ten') return 0.1;
    const pct = tithe.ratePct ?? 0;
    return pct > 0 ? Math.round(pct * 100) / 10000 : null;
}
