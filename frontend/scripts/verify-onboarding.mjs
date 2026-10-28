/**
 * verify-onboarding — unit tests for the onboarding's flow and its writes
 * (lib/onboardingFlow.ts, lib/onboardingWrites.ts):
 *
 *   - the skip logic in signed-in mode;
 *   - the debt-before-goal ordering;
 *   - resuming from saved answers after a kill at every step;
 *   - retry-safe writes: no duplicates when a write sequence is interrupted, at every
 *     point, and resumed.
 *
 * Same house pattern as the other verify-* scripts: plain node against the REAL
 * modules (node strips the TypeScript), asserting and exiting non-zero.
 *
 * Run: node scripts/verify-onboarding.mjs
 */
import {
    flowSteps, nextStep, prevStep, resumeStep, progressOf, canGoBack, stepAnswered, verseFor, titheRate,
} from '../lib/onboardingFlow.ts';
import { WRITE_ORDER, runWrites, pendingWrites, allWritten } from '../lib/onboardingWrites.ts';

let failures = 0;

function check(label, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) console.log(`  ok  ${label}`);
    else { failures++; console.log(`  FAIL  ${label}: expected ${e}, got ${a}`); }
}

const has = (steps, s) => steps.includes(s);

// A user who answers everything, step by step, in the order the screens ask.
const ANSWERS_BY_STEP = {
    name: { name: 'Ana' },
    reasons: { reasons: ['debt', 'organized'] },
    feeling: { feeling: 'stressed' },
    tithe: { tithe: { choice: 'ten' } },
    income: { income: 3200 },
    expense: { expense: { category: 'needs', title: 'Groceries', amount: 84.2 } },
    debtAsk: { debtChoice: 'yes' },
    debtType: { debtKind: 'credit_card', debtName: 'Credit card' },
    debtDetails: { debt: { amountOwed: 1800, minPayment: 60, dueDay: 12, apr: null } },
    goalPick: { goalKind: 'phone' },
    goalDetails: { goal: { title: 'New phone', targetAmount: 900, savedAmount: 0, savedSource: null,
        targetMonth: 'March', targetYear: 2027, autoMinimum: false } },
    commitment: { committed: true },
};
const FULL = Object.assign({}, ...Object.values(ANSWERS_BY_STEP));

// ── Ordering ──────────────────────────────────────────────────────────────────
console.log('\nDebt before goal');
{
    const debtFirst = flowSteps({ reasons: ['debt'] }, 'new');
    check('"get out of debt" → debts first', debtFirst.indexOf('debtAsk') < debtFirst.indexOf('goalPick'), true);
    const goalFirst = flowSteps({ reasons: ['saving', 'honor'] }, 'new');
    check('otherwise → goals first', goalFirst.indexOf('goalPick') < goalFirst.indexOf('debtAsk'), true);
    check('before screen 4 is answered → goals first', flowSteps({}, 'new').indexOf('goalPick') < flowSteps({}, 'new').indexOf('debtAsk'), true);
    check('debt-first group 3 reads in order',
        debtFirst.slice(debtFirst.indexOf('debtAsk'), debtFirst.indexOf('commitment')),
        ['debtAsk', 'debtType', 'debtDetails', 'debtPreview', 'goalPick', 'goalDetails', 'goalPreview']);
    check('goal-first group 3 reads in order',
        goalFirst.slice(goalFirst.indexOf('goalPick'), goalFirst.indexOf('commitment')),
        ['goalPick', 'goalDetails', 'goalPreview', 'debtAsk', 'debtType', 'debtDetails', 'debtPreview']);
    check('debt-first: after "Any debts? → No" comes the goal', nextStep('debtAsk', { reasons: ['debt'], debtChoice: 'free' }, 'new'), 'goalPick');
    check('goal-first: after "Any debts? → Later" comes the commitment', nextStep('debtAsk', { debtChoice: 'later' }, 'new'), 'commitment');
    check('"Yes, I do" goes on to the debt type', nextStep('debtAsk', { debtChoice: 'yes' }, 'new'), 'debtType');
    check('debt-free hides the debt steps', ['debtType', 'debtDetails', 'debtPreview'].some(s => has(flowSteps({ debtChoice: 'free' }, 'new'), s)), false);
}

// ── Signed-in skips ───────────────────────────────────────────────────────────
console.log('\nSigned-in mode skips');
{
    const none = flowSteps({}, 'signed_in', {});
    check('sign-up never shows signed in', has(none, 'signup'), false);
    check('sign-up shows in new mode', has(flowSteps({}, 'new'), 'signup'), true);
    check('nothing else is skipped for an empty account',
        none, flowSteps({}, 'new').filter(s => s !== 'signup'));
    check('name skipped when user_metadata has one', has(flowSteps({}, 'signed_in', { hasName: true }), 'name'), false);
    const income = flowSteps({}, 'signed_in', { hasIncomeThisMonth: true });
    check('income skipped when this month has income', has(income, 'income'), false);
    check('…the split still shows', has(income, 'split'), true);
    check('expense skipped when this month has one', has(flowSteps({}, 'signed_in', { hasExpenseThisMonth: true }), 'expense'), false);
    const debt = flowSteps({ debtChoice: 'yes' }, 'signed_in', { hasDebt: true });
    check('every debt step skipped with any debt', ['debtAsk', 'debtType', 'debtDetails', 'debtPreview'].filter(s => has(debt, s)), []);
    const goals = flowSteps({}, 'signed_in', { goalsUsed: 1 });
    check('every goal step skipped with goals_used > 0', ['goalPick', 'goalDetails', 'goalPreview'].filter(s => has(goals, s)), []);
    check('goals_used 0 keeps the goal steps', has(flowSteps({}, 'signed_in', { goalsUsed: 0 }), 'goalPick'), true);
    check('premium skipped for a subscriber, signed in', has(flowSteps({}, 'signed_in', { premiumActive: true }), 'premium'), false);
    check('premium skipped for a subscriber, new', has(flowSteps({}, 'new', { premiumActive: true }), 'premium'), false);
    check('the facts do not skip anything in new mode',
        flowSteps({}, 'new', { hasName: true, hasIncomeThisMonth: true, hasExpenseThisMonth: true, hasDebt: true, goalsUsed: 2 }),
        flowSteps({}, 'new'));
    const all = flowSteps({}, 'signed_in', { hasName: true, hasIncomeThisMonth: true, hasExpenseThisMonth: true,
        hasDebt: true, goalsUsed: 1, premiumActive: true });
    check('a full account sees only the heart, the split and the garden', all,
        ['welcome', 'promise', 'reasons', 'feeling', 'tithe', 'split', 'commitment', 'plan', 'done']);
    check('signed in: tithe → split when income exists', nextStep('tithe', {}, 'signed_in', { hasIncomeThisMonth: true }), 'split');
    check('signed in: back from split skips the income', prevStep('split', {}, 'signed_in', { hasIncomeThisMonth: true }), 'tithe');
}

// ── Progress, back, small rules ───────────────────────────────────────────────
console.log('\nProgress and back');
check('no bar on the welcome', progressOf('welcome', {}, 'new'), null);
check('no bar on the promise', progressOf('promise', {}, 'new'), null);
check('the bar names the group', progressOf('income', {}, 'new')?.group, 'month');
check('the bar ends full', progressOf('done', FULL, 'new')?.value, 1);
check('no back on the welcome', canGoBack('welcome', {}, 'new'), false);
check('back on the name', canGoBack('name', {}, 'new'), true);
check('no back once the account exists', [canGoBack('premium', FULL, 'new'), canGoBack('done', FULL, 'new')], [false, false]);
check('verse: stressed', verseFor('stressed'), 'philippians-4-6');
check('verse: overwhelmed', verseFor('overwhelmed'), 'philippians-4-6');
check('verse: hopeful', verseFor('hopeful'), 'proverbs-21-5');
check('verse: pretty good', verseFor('good'), 'luke-16-10');
check('tithe 10%', titheRate({ choice: 'ten' }), 0.1);
check('tithe 12.5%', titheRate({ choice: 'custom', ratePct: 12.5 }), 0.125);
check('tithe none', titheRate({ choice: 'none' }), null);
check('custom tithe needs a %', stepAnswered('tithe', { tithe: { choice: 'custom' } }), false);
check('a blank name is not an answer', stepAnswered('name', { name: '   ' }), false);
check('"I haven\'t spent anything yet" is an answer', stepAnswered('expense', { expense: null }), true);

// ── Resume after a kill at every step ─────────────────────────────────────────
console.log('\nResume after a kill at every step');
for (const mode of ['new', 'signed_in']) {
    const answers = {};
    for (const step of flowSteps(FULL, mode)) {
        // What is on the phone when the app dies on `step`: every earlier answer.
        const saved = JSON.parse(JSON.stringify({ step, answers }));
        const back = resumeStep(saved.step, saved.answers, mode);
        if (back !== step) { failures++; console.log(`  FAIL  ${mode} · killed on ${step}: resumed on ${back}`); }
        if (JSON.stringify(saved.answers) !== JSON.stringify(answers)) {
            failures++; console.log(`  FAIL  ${mode} · killed on ${step}: answers changed`);
        }
        Object.assign(answers, ANSWERS_BY_STEP[step] ?? {});
    }
    console.log(`  ok  ${mode}: every step resumes on itself with every answer intact`);
}
{
    const missingName = { ...FULL };
    delete missingName.name;
    check('a missing earlier answer resumes on it', resumeStep('plan', missingName, 'new'), 'name');
    check('nothing saved → the welcome', resumeStep(null, {}, 'new'), 'welcome');
    check('an unknown step → the welcome', resumeStep('oldTourStep', {}, 'new'), 'welcome');
    check('a step that stopped applying → the next one',
        resumeStep('income', { ...FULL }, 'signed_in', { hasIncomeThisMonth: true }), 'split');
    check('saved on sign-up, then signed in elsewhere → premium', resumeStep('signup', FULL, 'signed_in'), 'premium');
}

// ── Retry-safe writes ─────────────────────────────────────────────────────────
console.log('\nRetry-safe writes');

/** A fake server: one list per item, and a way to make the Nth request fail. */
function fakeServer() {
    const rows = { name: [], tithe: [], income: [], expense: [], debt: [], goal: [] };
    const calls = [];
    let failAt = null;   // { call: n, landed: bool }
    let n = 0;
    return {
        rows, calls,
        failOn(call, landed) { failAt = { call, landed }; n = 0; },
        clear() { failAt = null; },
        api: {
            async write(item, a) {
                n++;
                calls.push(item);
                if (failAt && n === failAt.call && !failAt.landed) throw new Error('offline');
                const key = { name: a.name, tithe: a.tithe?.choice, income: a.income, expense: a.expense?.title,
                    debt: a.debtName, goal: a.goal?.title }[item];
                if (item === 'name' || item === 'tithe') rows[item] = [key];   // overwrites
                else rows[item].push(key);
                if (failAt && n === failAt.call && failAt.landed) throw new Error('response lost');
                return 'done';
            },
            async exists(item, a) {
                const key = { income: a.income, expense: a.expense?.title, debt: a.debtName, goal: a.goal?.title }[item];
                return rows[item].includes(key);
            },
        },
    };
}

const ONE_EACH = { name: 1, tithe: 1, income: 1, expense: 1, debt: 1, goal: 1 };
const counts = rows => Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length]));

{
    const srv = fakeServer();
    let saved = {};
    const final = await runWrites(FULL, {}, srv.api, async s => { saved = s; });
    check('writes in order', srv.calls, [...WRITE_ORDER]);
    check('one of each', counts(srv.rows), ONE_EACH);
    check('everything done', allWritten(FULL, final), true);
    check('what was saved is the final state', saved, final);
}

// A request fails at every position, before or after landing on the server; then
// the user taps Try again (a second run from what was saved).
for (const landed of [false, true]) {
    for (let call = 1; call <= WRITE_ORDER.length; call++) {
        const srv = fakeServer();
        let saved = {};
        const persist = async s => { saved = s; };
        srv.failOn(call, landed);
        let threw = false;
        try { await runWrites(FULL, {}, srv.api, persist); } catch { threw = true; }
        srv.clear();
        const final = await runWrites(FULL, saved, srv.api, persist);
        const ok = threw && JSON.stringify(counts(srv.rows)) === JSON.stringify(ONE_EACH) && allWritten(FULL, final);
        if (!ok) { failures++; console.log(`  FAIL  request ${call} ${landed ? 'landed, response lost' : 'never landed'}: ${JSON.stringify(counts(srv.rows))}`); }
    }
    console.log(`  ok  a failure at every request (${landed ? 'response lost' : 'offline'}), then Try again: one of each`);
}

// The app is KILLED at every save point: the persist call never returns, and the
// next launch runs again from whatever made it to the phone before.
{
    const srv0 = fakeServer();
    let total = 0;
    await runWrites(FULL, {}, srv0.api, async () => { total++; });
    for (let kill = 1; kill <= total; kill++) {
        const srv = fakeServer();
        let onPhone = {};
        let n = 0;
        try {
            await runWrites(FULL, {}, srv.api, async s => {
                n++;
                if (n === kill) throw new Error('killed');   // dies before this save lands
                onPhone = s;
            });
        } catch { /* the app died */ }
        await runWrites(FULL, onPhone, srv.api, async s => { onPhone = s; });
        if (JSON.stringify(counts(srv.rows)) !== JSON.stringify(ONE_EACH) || !allWritten(FULL, onPhone)) {
            failures++; console.log(`  FAIL  killed at save ${kill}: ${JSON.stringify(counts(srv.rows))}`);
        }
    }
    console.log(`  ok  killed at each of ${total} save points, relaunched: one of each`);
}

{
    const a = { ...FULL, expense: null, debtChoice: 'later', goal: undefined };
    check('only answered items are written', pendingWrites(a, {}), ['name', 'tithe', 'income']);
    const srv = fakeServer();
    const final = await runWrites(FULL, {}, srv.api, async () => {}, new Set(['income']));
    check('an item the account already has is skipped, not written', [srv.rows.income.length, final.income], [0, 'skipped']);
    const refused = fakeServer();
    refused.api.write = async item => item === 'debt' ? 'skipped' : 'done';
    const after = await runWrites(FULL, {}, refused.api, async () => {});
    check('a refused item is skipped and the rest still run', [after.debt, after.goal], ['skipped', 'done']);
    check('…and never retried', pendingWrites(FULL, after), []);
}

console.log(failures ? `\n${failures} failure(s)\n` : '\nAll onboarding checks passed.\n');
process.exit(failures ? 1 : 0);
