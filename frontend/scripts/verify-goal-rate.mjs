/**
 * verify-goal-rate — unit tests for the goal card's $/week pace (lib/goalRate.ts).
 *
 * There is no test runner in the frontend, so this follows the house pattern set by
 * verify-i18n.mjs / check-locales.mjs: a plain node script that asserts and exits
 * non-zero. It runs against the REAL module — node strips the TypeScript annotations,
 * which is why lib/goalRate.ts is kept dependency-free and takes the deadline as a
 * Date rather than importing anything from React Native.
 *
 * The three cases named in the bug report are the first three below; the rest are the
 * edges that would otherwise put NaN or a nonsense figure on a card.
 *
 * Run: node scripts/verify-goal-rate.mjs
 */
import { readFileSync } from 'node:fs';

import { weeklyGoalRate, daysBetween } from '../lib/goalRate.ts';

let failures = 0;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

function check(label, actual, expected) {
    const ok = typeof expected === 'number' ? near(actual, expected) : actual === expected;
    if (ok) {
        console.log(`  ok  ${label}: ${typeof actual === 'number' ? actual.toFixed(4) : actual}`);
    } else {
        failures++;
        console.log(`  FAIL  ${label}: expected ${expected}, got ${actual}`);
    }
}

function assert(label, condition, detail = '') {
    if (condition) console.log(`  ok  ${label}`);
    else { failures++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

// A goal created 1 Jan 2026, due end of December 2026. monthEndDate('December', 2026)
// is `new Date(2026, 12, 0)` — local midnight on the 31st, mirrored here.
const CREATED = '2026-01-01T00:00:00.000Z';
const DEADLINE = new Date(2026, 11, 31);

console.log('\nB3 — allocating money must NOT change the rate');
{
    // Model the card the way piggyBank.tsx renders it: one goal, a run of deposits,
    // the pace recomputed from the refreshed row after each one. Under the old formula
    // this sequence fell steadily to $0; it must now be flat.
    const goal = { target_amount: 3000, created_at: CREATED, allocated_amount: 0 };
    const renderPace = g => weeklyGoalRate(g.target_amount, g.created_at, DEADLINE);

    const base = renderPace(goal);
    assert('rate is > 0 (otherwise the flatness assertions below pass vacuously)', base > 0);

    for (const deposit of [500, 1000, 1499, 1, 999999]) {
        goal.allocated_amount += deposit;
        assert(`rate unchanged after depositing $${deposit} ($${goal.allocated_amount} set aside)`,
            near(renderPace(goal), base));
    }

    // The structural half of the same guarantee. The property above holds trivially
    // *because* `allocated` is not a parameter, so pin that: reintroducing it — the
    // exact shape of the original bug — fails here instead of passing silently.
    check('weeklyGoalRate takes exactly (target, createdAt, deadline)', weeklyGoalRate.length, 3);

    const callSite = readFileSync(new URL('../app/(tabs)/piggyBank.tsx', import.meta.url), 'utf8');
    const signature = /const getWeeklyRate = \(([^)]*)\)/.exec(callSite);
    assert('the goal card helper does not accept an allocated argument',
        !!signature && !/allocated/i.test(signature[1]),
        signature ? signature[1] : 'getWeeklyRate not found in piggyBank.tsx');
}

console.log('\nB2 — editing the target MUST change the rate');
{
    const before = weeklyGoalRate(3000, CREATED, DEADLINE);
    const after = weeklyGoalRate(2000, CREATED, DEADLINE);
    assert('$3,000 → $2,000 lowers the rate', after < before);
    check('new rate is target / days * 7', after, (2000 / daysBetween(new Date(CREATED), DEADLINE)) * 7);
    check('rate scales linearly with the target', after, before * (2000 / 3000));

    // The specific shape of the old bug: once `allocated` passed the new target, the
    // max(0, target − allocated) clamp pinned the rate at $0 and editing the target
    // did nothing at all. There is no clamp to hit now.
    assert('a target below what is already saved still yields a real rate',
        weeklyGoalRate(1000, CREATED, DEADLINE) > 0);
}

console.log('\nB2/B3 — a goal created mid-period computes from created_at, not today');
{
    // Same target, same deadline, created six months later: half the window, so
    // roughly twice the weekly commitment. If the denominator were "today → deadline"
    // these two would be identical.
    const early = weeklyGoalRate(3000, '2026-01-01T00:00:00.000Z', DEADLINE);
    const late = weeklyGoalRate(3000, '2026-07-01T00:00:00.000Z', DEADLINE);
    assert('a later-created goal has a higher weekly rate', late > early);
    check('and it is exactly target / its own window * 7',
        late, (3000 / daysBetween(new Date('2026-07-01T00:00:00.000Z'), DEADLINE)) * 7);

    // Pinned to a literal so a future refactor that quietly swaps created_at for
    // Date.now() fails here rather than drifting with the calendar. Both ends are
    // built in UTC on purpose: with a local `new Date(2026, 11, 31)` deadline the
    // count lands on 364 or 365 depending on the machine's offset, and a test that
    // passes in one timezone and fails in another teaches you to ignore it.
    check('whole days from 2026-01-01 to 2026-12-31',
        daysBetween(new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 11, 31))), 364);
}

console.log('\nEdges — nothing may reach a card as NaN or as more than the goal');
{
    check('null target', weeklyGoalRate(null, CREATED, DEADLINE), 0);
    check('zero target', weeklyGoalRate(0, CREATED, DEADLINE), 0);
    check('negative target', weeklyGoalRate(-100, CREATED, DEADLINE), 0);
    check('undefined target', weeklyGoalRate(undefined, CREATED, DEADLINE), 0);
    check('invalid deadline', weeklyGoalRate(3000, CREATED, new Date('nope')), 0);

    const unparseable = weeklyGoalRate(3000, 'not-a-date', DEADLINE);
    assert('unparseable created_at falls back to now instead of NaN',
        Number.isFinite(unparseable) && unparseable > 0, String(unparseable));

    // Deadline already past / same day: max(1, days) would otherwise report 7× the
    // goal as a "weekly" pace.
    const overdue = weeklyGoalRate(3000, CREATED, new Date(2025, 0, 1));
    check('an overdue goal is capped at the target, not 7x it', overdue, 3000);
}

console.log(
    failures === 0
        ? '\n✔ all goal-rate checks passed\n'
        : `\n✘ ${failures} goal-rate check(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
