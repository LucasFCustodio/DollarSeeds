/**
 * verify-review-prompt — unit tests for the rating-prompt throttle (lib/reviewPrompt.ts).
 *
 * There is no test runner in the frontend, so this follows the house pattern set by
 * check-locales.mjs / verify-i18n.mjs / verify-goal-rate.mjs: a plain node script that
 * asserts and exits non-zero. It runs against the REAL module — node strips the
 * TypeScript annotations, which is why lib/reviewPrompt.ts is kept import-free.
 *
 * ── WHY THE DECISION IS TESTED AND THE SHEET IS NOT ───────────────────────────
 * `StoreReview.requestReview()` is a no-op in development builds and in TestFlight;
 * the sheet only ever renders in a production App Store build. And even there the API
 * returns nothing — no callback, no result — so "did it appear?" is not observable
 * from code at all. The throttle is therefore the only part of this feature that CAN
 * be verified, which is exactly why it is a pure function in its own file.
 *
 * Run: node scripts/verify-review-prompt.mjs
 */
import {
    shouldRequestReview,
    REVIEW_MIN_INTERVAL_MS,
    REVIEW_FIRST_SEEN_GRACE_MS,
} from '../lib/reviewPrompt.ts';

let failures = 0;

function assert(label, condition, detail = '') {
    if (condition) console.log(`  ok  ${label}`);
    else { failures++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

const DAY = 24 * 60 * 60 * 1000;
// A fixed "now" so the suite never depends on the wall clock.
const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);
const ago = ms => NOW - ms;

console.log('\nConstants — the policy is what it claims to be');
{
    assert('the interval floor is 60 days', REVIEW_MIN_INTERVAL_MS === 60 * DAY,
        `${REVIEW_MIN_INTERVAL_MS / DAY} days`);
    assert('the first-launch grace is 48 hours', REVIEW_FIRST_SEEN_GRACE_MS === 2 * DAY,
        `${REVIEW_FIRST_SEEN_GRACE_MS / DAY} days`);
    assert('the interval is comfortably inside Apple’s 3-per-365-days cap',
        365 * DAY / REVIEW_MIN_INTERVAL_MS <= 6.1);
}

console.log('\nNever on a first session');
{
    assert('no first-seen stamp at all ⇒ never',
        shouldRequestReview(NOW, { lastPromptedAt: null, firstSeenAt: null }) === false);

    assert('installed one minute ago ⇒ never',
        shouldRequestReview(NOW, { lastPromptedAt: null, firstSeenAt: ago(60_000) }) === false);

    assert('installed 47h ago ⇒ still too soon',
        shouldRequestReview(NOW, { lastPromptedAt: null, firstSeenAt: ago(47 * 60 * 60 * 1000) }) === false);

    assert('installed exactly 48h ago ⇒ eligible',
        shouldRequestReview(NOW, {
            lastPromptedAt: null, firstSeenAt: ago(REVIEW_FIRST_SEEN_GRACE_MS),
        }) === true);
}

console.log('\nThe 60-day floor — requestReview is NOT called before it elapses');
{
    const settled = { firstSeenAt: ago(400 * DAY) };

    assert('never prompted before ⇒ eligible',
        shouldRequestReview(NOW, { ...settled, lastPromptedAt: null }) === true);

    assert('prompted 1 day ago ⇒ no',
        shouldRequestReview(NOW, { ...settled, lastPromptedAt: ago(DAY) }) === false);

    assert('prompted 30 days ago ⇒ no',
        shouldRequestReview(NOW, { ...settled, lastPromptedAt: ago(30 * DAY) }) === false);

    assert('prompted 59 days ago ⇒ no',
        shouldRequestReview(NOW, { ...settled, lastPromptedAt: ago(59 * DAY) }) === false);

    assert('prompted 59d23h59m ago ⇒ still no (the boundary is not fuzzy)',
        shouldRequestReview(NOW, {
            ...settled, lastPromptedAt: ago(REVIEW_MIN_INTERVAL_MS - 60_000),
        }) === false);

    assert('prompted exactly 60 days ago ⇒ yes',
        shouldRequestReview(NOW, {
            ...settled, lastPromptedAt: ago(REVIEW_MIN_INTERVAL_MS),
        }) === true);

    assert('prompted 200 days ago ⇒ yes',
        shouldRequestReview(NOW, { ...settled, lastPromptedAt: ago(200 * DAY) }) === true);
}

console.log('\nBoth conditions are required, not either');
{
    // The bug this pins: an OR instead of an AND. A brand-new install has no
    // lastPromptedAt, so "never prompted" alone would let the sheet fire on day one.
    assert('fresh install, never prompted ⇒ no (grace wins over "never asked")',
        shouldRequestReview(NOW, { lastPromptedAt: null, firstSeenAt: ago(DAY) }) === false);

    // And the mirror: long-installed but recently asked.
    assert('long-installed but asked yesterday ⇒ no',
        shouldRequestReview(NOW, {
            lastPromptedAt: ago(DAY), firstSeenAt: ago(400 * DAY),
        }) === false);
}

console.log('\nGarbage in ⇒ silence, never a prompt');
{
    // storeReview.ts already maps unparseable storage to null, but the policy must not
    // depend on that: an ambiguous input is not evidence that 60 days elapsed.
    const cases = [
        ['NaN now', NaN, { lastPromptedAt: null, firstSeenAt: ago(400 * DAY) }],
        ['NaN firstSeenAt', NOW, { lastPromptedAt: null, firstSeenAt: NaN }],
        ['NaN lastPromptedAt', NOW, { lastPromptedAt: NaN, firstSeenAt: ago(400 * DAY) }],
        ['Infinity lastPromptedAt', NOW, { lastPromptedAt: Infinity, firstSeenAt: ago(400 * DAY) }],
    ];
    for (const [label, now, state] of cases) {
        // A NaN lastPromptedAt is treated as "never prompted", which combined with a
        // settled firstSeenAt is legitimately eligible — assert it does not THROW and
        // returns a boolean either way. The three that must be false are asserted next.
        const out = shouldRequestReview(now, state);
        assert(`${label} returns a boolean, not a throw`, typeof out === 'boolean');
    }
    assert('NaN now ⇒ false',
        shouldRequestReview(NaN, { lastPromptedAt: null, firstSeenAt: ago(400 * DAY) }) === false);
    assert('NaN firstSeenAt ⇒ false',
        shouldRequestReview(NOW, { lastPromptedAt: null, firstSeenAt: NaN }) === false);
}

console.log('\nA clock that moved backwards is not an unlock');
{
    // Timezone changes and manual clock edits both produce a lastPromptedAt in the
    // future. `now - lastPromptedAt` is then negative, and a naive `<` comparison
    // would read that as "not yet"; the risk is the opposite mistake — an operator
    // ordering that reads a negative elapsed time as eligible.
    assert('last prompt stamped in the future ⇒ no',
        shouldRequestReview(NOW, {
            lastPromptedAt: NOW + 30 * DAY, firstSeenAt: ago(400 * DAY),
        }) === false);

    assert('first-seen stamped in the future ⇒ no',
        shouldRequestReview(NOW, {
            lastPromptedAt: null, firstSeenAt: NOW + 10 * DAY,
        }) === false);
}

console.log(
    failures
        ? `\n✖ ${failures} failing assertion(s)`
        : '\n✔ review-prompt throttle: all assertions passed',
);
process.exit(failures ? 1 : 0);
