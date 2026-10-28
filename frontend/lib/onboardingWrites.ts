/**
 * onboardingWrites — writing the onboarding's answers to the server, safe to retry
 * (ONBOARDING_REWORK.md §2).
 *
 * Before sign-up nothing can reach the server, so the answers wait on the phone. Once
 * an account exists they are written IN THIS ORDER: name → tithe → income → expense
 * → debt → goal. Each item has a state that is saved to the phone around its request:
 *
 *   started  saved BEFORE the request goes out
 *   done     saved the moment it succeeds
 *   skipped  the server already has it, or refused it for a reason a retry can't fix
 *
 * If the app dies mid-sequence, the next run resumes after the last `done`. An item
 * left `started` may or may not have reached the server (the response can be lost),
 * so before writing it again the runner ASKS whether it is already there
 * (`api.exists`). That is what keeps a resume from duplicating the income, expense,
 * debt or goal. The name and tithe are plain overwrites, so asking is unnecessary.
 *
 * A failure stops the run and is thrown to the caller, which shows Benny's kind
 * "I couldn't save your plan just yet" with Try again. Nothing is lost: the answers
 * and the states are already saved.
 *
 * Dependency-free: the requests are injected (`WriteApi`), so `npm run
 * verify-onboarding` drives this with a fake server under plain node.
 */
import type { Answers } from './onboardingFlow';

export const WRITE_ORDER = ['name', 'tithe', 'income', 'expense', 'debt', 'goal'] as const;
export type WriteItem = (typeof WRITE_ORDER)[number];
export type WriteState = 'started' | 'done' | 'skipped';
export type WriteStates = Partial<Record<WriteItem, WriteState>>;

/** 'done' = written; 'skipped' = the server won't take it and a retry can't change that
 *  (a free user who already has a debt, a goal over the free cap). */
export type WriteOutcome = 'done' | 'skipped';

export interface WriteApi {
    write: (item: WriteItem, answers: Answers) => Promise<WriteOutcome>;
    /** Did an earlier, interrupted request for this item land? */
    exists: (item: WriteItem, answers: Answers) => Promise<boolean>;
}

/** Items that only need a write because the user answered them. */
export function hasAnswerFor(item: WriteItem, a: Answers): boolean {
    switch (item) {
        case 'name': return !!a.name?.trim();
        case 'tithe': return !!a.tithe;
        case 'income': return typeof a.income === 'number' && a.income > 0;
        case 'expense': return !!a.expense;
        case 'debt': return a.debtChoice === 'yes' && !!a.debt;
        case 'goal': return !!a.goal;
    }
}

/** What is still to write, in order. `skip` = items the account already has. */
export function pendingWrites(a: Answers, states: WriteStates, skip: ReadonlySet<WriteItem> = new Set()): WriteItem[] {
    return WRITE_ORDER.filter(item =>
        hasAnswerFor(item, a) && !skip.has(item) && states[item] !== 'done' && states[item] !== 'skipped');
}

/** Name and tithe are overwrites: writing them twice changes nothing. */
const IDEMPOTENT: ReadonlySet<WriteItem> = new Set(['name', 'tithe']);

/**
 * Write everything still pending. `persist` is called with the new states after
 * every change and awaited, so a kill at any instant leaves them on the phone.
 * Resolves with the final states; rejects with the first failure.
 */
export async function runWrites(
    answers: Answers,
    initial: WriteStates,
    api: WriteApi,
    persist: (states: WriteStates) => Promise<void>,
    skip: ReadonlySet<WriteItem> = new Set(),
): Promise<WriteStates> {
    let states: WriteStates = { ...initial };
    const set = async (item: WriteItem, state: WriteState) => {
        states = { ...states, [item]: state };
        await persist(states);
    };
    for (const item of WRITE_ORDER) {
        if (skip.has(item) && hasAnswerFor(item, answers) && !states[item]) {
            await set(item, 'skipped');
        }
    }
    for (const item of pendingWrites(answers, states, skip)) {
        if (states[item] === 'started' && !IDEMPOTENT.has(item) && await api.exists(item, answers)) {
            await set(item, 'done');
            continue;
        }
        await set(item, 'started');
        const outcome = await api.write(item, answers);
        await set(item, outcome);
    }
    return states;
}

/** Every answered item has been handled. */
export function allWritten(a: Answers, states: WriteStates, skip: ReadonlySet<WriteItem> = new Set()): boolean {
    return pendingWrites(a, states, skip).length === 0;
}
