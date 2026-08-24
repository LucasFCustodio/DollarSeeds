/**
 * reviewPrompt — WHEN the native App Store rating sheet may be asked for.
 *
 * ── THE API GIVES YOU NOTHING BACK ────────────────────────────────────────────
 * `StoreReview.requestReview()` returns a bare Promise<void>. There is no callback,
 * no return value, and no notification of any kind. You cannot detect whether the
 * sheet appeared, whether the user rated, whether they dismissed it, or whether iOS
 * silently swallowed the call because the user has already been asked three times
 * this year. Any logic shaped like "have they rated yet?" or "did that work?" is
 * UNIMPLEMENTABLE — do not write it, and do not add state that pretends to track it.
 *
 * All this module can honestly record is that we ASKED. That is what the throttle
 * below is built on, and it is why the throttle has to be conservative: a request
 * that iOS drops still burns nothing on Apple's side, but a request we make at a bad
 * moment is a moment we cannot have back.
 *
 * ── WHY OUR OWN THROTTLE ON TOP OF APPLE'S ────────────────────────────────────
 * Apple caps the sheet at 3 per user per 365 days. Those three slots are the whole
 * budget for the app's lifetime with that user, and they are spent by ASKING, not by
 * the user answering. So we spend them only after a genuinely positive moment
 * (a goal completed, a month closed out), at most once every 60 days, and never to
 * someone who installed the app minutes ago and has no opinion yet.
 *
 * ── WHY THIS FILE IMPORTS NOTHING ─────────────────────────────────────────────
 * Same reason as lib/goalRate.ts: it is the decision, separated from the effect, so
 * it can be unit-tested outside React Native — `npm run verify-review-prompt`. The
 * AsyncStorage reads and the actual `requestReview()` call live in lib/storeReview.ts.
 * Keep this file free of imports; node's type-stripping runs it directly.
 */

/** AsyncStorage key: epoch ms of the last time we CALLED requestReview(). */
export const REVIEW_LAST_PROMPTED_KEY = 'review_last_prompted_at';

/** AsyncStorage key: epoch ms of the first launch that ever considered prompting. */
export const REVIEW_FIRST_SEEN_KEY = 'review_first_seen_at';

/**
 * Both keys are DEVICE-global, not per-user, unlike the `<prefix>_<userId>` keys in
 * constants/onboarding.ts. Apple's own cap is per device+Apple ID and knows nothing
 * about DollarSeeds accounts, so scoping ours per account would let two accounts on
 * one phone spend two of the same three annual slots.
 */

/** Our own floor between two requests. Apple allows 3/year; this allows ~6. */
export const REVIEW_MIN_INTERVAL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

/**
 * How long after first launch the app stays silent. "Not on a user's first session"
 * is the requirement; elapsed time is the approximation, because React Native gives
 * no reliable session count without adding boot state whose only purpose is this.
 * 48h means the user has come back at least once on a different day — which is the
 * thing "second session" was standing in for anyway.
 */
export const REVIEW_FIRST_SEEN_GRACE_MS = 48 * 60 * 60 * 1000; // 48 hours

export type ReviewThrottleState = {
    /** Epoch ms of the last requestReview() call, or null if we never made one. */
    lastPromptedAt: number | null;
    /** Epoch ms first recorded on this device, or null on the very first check. */
    firstSeenAt: number | null;
};

/**
 * The whole policy, as a pure function.
 *
 * @param now   epoch ms — passed in rather than read, so the tests can move time.
 * @param state what AsyncStorage holds. Unparseable values arrive as null; see
 *              lib/storeReview.ts, which never lets a bad string through as NaN.
 *
 * Returns false — deliberately, in every ambiguous case:
 *
 *  - `firstSeenAt == null`  → this is the first launch that got here. Never prompt
 *                             on it; storeReview.ts stamps the key and returns.
 *  - clock moved backwards  → a negative elapsed time is not evidence that 60 days
 *                             passed. Treated as "too soon", not as "eligible".
 */
export function shouldRequestReview(now: number, state: ReviewThrottleState): boolean {
    if (!Number.isFinite(now)) return false;

    const { lastPromptedAt, firstSeenAt } = state;

    // First launch to reach a trigger — record it and stay quiet.
    if (firstSeenAt === null || !Number.isFinite(firstSeenAt)) return false;
    if (now - firstSeenAt < REVIEW_FIRST_SEEN_GRACE_MS) return false;

    // Never asked before, and past the grace window: this is the one eligible case
    // with no interval to check.
    if (lastPromptedAt === null || !Number.isFinite(lastPromptedAt)) return true;

    return now - lastPromptedAt >= REVIEW_MIN_INTERVAL_MS;
}

/**
 * The positive moments that may ask. Named rather than boolean so the call sites read
 * as intent and a future trigger has to be added here deliberately.
 */
export type ReviewTrigger = 'goal_completed' | 'month_closed';
