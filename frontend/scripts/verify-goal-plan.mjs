/**
 * verify-goal-plan — unit tests for the goal form's live numbers (lib/goalPlan.ts):
 * the default target date and the monthly minimum.
 *
 * Same house pattern as verify-goal-rate.mjs: a plain node script against the REAL
 * module (node strips the TypeScript), asserting and exiting non-zero. The minimum
 * cases mirror backend/tests/test_goals_v2.py, because the server stores the number
 * and the form previews it — the two must agree.
 *
 * Fixed dates only. `new Date(y, m, d)` is local time, like the phone's.
 *
 * Run: node scripts/verify-goal-plan.mjs
 */
import {
    defaultTargetDate, monthsLeft, monthlyMinimum, isBeforeThisMonth, budgetFit,
} from '../lib/goalPlan.ts';

let failures = 0;

function check(label, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) console.log(`  ok  ${label}: ${a}`);
    else { failures++; console.log(`  FAIL  ${label}: expected ${e}, got ${a}`); }
}

const OCT = new Date(2026, 9, 27);

console.log('\nDefault target date — 3 months after this one');
check('Oct 2026 → Jan 2027', defaultTargetDate(new Date(2026, 9, 1)), { month: 'January', year: 2027 });
check('Nov 2026 → Feb 2027', defaultTargetDate(new Date(2026, 10, 15)), { month: 'February', year: 2027 });
check('Dec 2026 → Mar 2027 (across the year)', defaultTargetDate(new Date(2026, 11, 31)), { month: 'March', year: 2027 });
check('Jan 2026 → Apr 2026', defaultTargetDate(new Date(2026, 0, 20)), { month: 'April', year: 2026 });
{
    const d = defaultTargetDate(OCT);
    check('the default makes four payments', monthsLeft(d.month, d.year, OCT), 4);
}

console.log('\nMonths left — inclusive, at least 1');
check('Oct → Jan', monthsLeft('January', 2027, OCT), 4);
check('target this month', monthsLeft('October', 2026, OCT), 1);
check('target in the past', monthsLeft('March', 2026, OCT), 1);
check('a year out', monthsLeft('October', 2027, OCT), 13);

console.log('\nMonthly minimum — ceil to the whole dollar');
check('$1,336 by January → $334', monthlyMinimum(1336, 0, 'January', 2027, OCT), 334);
check('$1,001 → $251 (rounds up)', monthlyMinimum(1001, 0, 'January', 2027, OCT), 251);
check('$1,200 → $300 (no float edge)', monthlyMinimum(1200, 0, 'January', 2027, OCT), 300);
check('$1,200.01 → $301', monthlyMinimum(1200.01, 0, 'January', 2027, OCT), 301);
check('saved comes off first', monthlyMinimum(1336, 336, 'January', 2027, OCT), 250);
check('saved reaches the target → none', monthlyMinimum(500, 500, 'January', 2027, OCT), null);
check('no target → none', monthlyMinimum(0, 0, 'January', 2027, OCT), null);
check('due this month → everything now', monthlyMinimum(450, 0, 'October', 2026, OCT), 450);

console.log('\nTarget can\'t be before this month');
check('September 2026 is before', isBeforeThisMonth('September', 2026, OCT), true);
check('October 2026 is not', isBeforeThisMonth('October', 2026, OCT), false);
check('January 2027 is not', isBeforeThisMonth('January', 2027, OCT), false);

console.log('\nBudget fit — context, never a block');
const ctx = { has_income: true, goals_budget: 400, goal_minimums: 100, debt_minimums: 45 };
check('share of the Goals budget', budgetFit(200, ctx), { share: 0.5, over: false });
check('over when everything would not fit', budgetFit(300, ctx), { share: 0.75, over: true });
check('no income → nothing to compare', budgetFit(200, { ...ctx, has_income: false }), { share: null, over: false });
check('no minimum yet', budgetFit(null, ctx), { share: null, over: false });

if (failures) {
    console.log(`\n${failures} failure(s)`);
    process.exit(1);
}
console.log('\nverify-goal-plan: all passed');
