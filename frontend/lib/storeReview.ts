/**
 * storeReview — the effectful half of the rating prompt. Policy lives in
 * lib/reviewPrompt.ts (pure, unit-tested); this file does the storage reads and makes
 * the one native call.
 *
 * ── IT DOES NOTHING IN ANY BUILD YOU CAN TEST BY HAND ─────────────────────────
 * `StoreReview.requestReview()` is a NO-OP in development builds and in TestFlight.
 * The sheet only ever appears in a build installed from the App Store. Nothing here
 * is broken when you tap through a trigger on a dev client and see nothing happen —
 * that is the documented behaviour, and it is why `isAvailableAsync()` resolves false
 * on TestFlight. Verify the DECISION with `npm run verify-review-prompt`; the sheet
 * itself is only observable in production.
 *
 * ── AND IT TELLS YOU NOTHING AFTERWARDS ───────────────────────────────────────
 * There is no callback and no return value (see lib/reviewPrompt.ts). This function
 * resolves as soon as the request has been made, whether or not anything was shown.
 * Do not build anything on top of "did that work?" — the information does not exist.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

import {
    REVIEW_FIRST_SEEN_KEY,
    REVIEW_LAST_PROMPTED_KEY,
    shouldRequestReview,
    type ReviewTrigger,
} from './reviewPrompt';

/** A stored epoch-ms string, or null for absent/garbage. Never NaN. */
function readStamp(raw: string | null): number | null {
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

/**
 * Ask for the native review sheet if — and only if — the throttle allows it.
 *
 * Call it AFTER whatever celebration the moment already has. It never renders
 * anything of its own and never interrupts: the worst case is that iOS decides to
 * show its sheet over a screen the user is done looking at.
 *
 * Every failure is swallowed. A rating prompt is the least important thing the app
 * does, and a storage hiccup or an unavailable native module must not surface as an
 * error in the middle of completing a goal.
 *
 * @returns whether requestReview() was actually called — for the tests and the logs,
 *          NOT for whether the user saw or left a review, which is unknowable.
 */
export async function maybeRequestReview(trigger: ReviewTrigger): Promise<boolean> {
    try {
        const [lastRaw, firstRaw] = await AsyncStorage.multiGet([
            REVIEW_LAST_PROMPTED_KEY,
            REVIEW_FIRST_SEEN_KEY,
        ]).then(pairs => pairs.map(([, v]) => v));

        const now = Date.now();
        const firstSeenAt = readStamp(firstRaw);

        // First trigger ever on this device: record the moment and stay quiet. The
        // stamp is what makes "not on a user's first session" enforceable later.
        if (firstSeenAt === null) {
            await AsyncStorage.setItem(REVIEW_FIRST_SEEN_KEY, String(now));
            return false;
        }

        if (!shouldRequestReview(now, { lastPromptedAt: readStamp(lastRaw), firstSeenAt })) {
            return false;
        }

        // Apple's cap (3 per 365 days) is enforced on their side and is invisible to
        // us — this check only covers "can this platform/build show it at all".
        if (!(await StoreReview.isAvailableAsync())) return false;

        // Stamped BEFORE the call, not after. If the request throws or the app is
        // killed mid-sheet we still want the 60-day floor applied; the alternative
        // fails in the direction of asking again immediately.
        await AsyncStorage.setItem(REVIEW_LAST_PROMPTED_KEY, String(now));
        await StoreReview.requestReview();
        return true;
    } catch (err) {
        console.error('Review prompt error:', err, trigger);
        return false;
    }
}
