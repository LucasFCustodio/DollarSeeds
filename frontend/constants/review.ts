/**
 * Review — where an explicit "Rate DollarSeeds" tap goes.
 *
 * This is NOT the native in-app sheet. That one is asked for by lib/storeReview.ts,
 * is capped by Apple at 3 per user per year, and cannot be triggered on demand.
 *
 * A user-initiated tap is a different thing entirely: Apple places no limit on it,
 * it is always allowed, and it is the path for the person who actually WANTS to leave
 * a review and went looking for the button. `?action=write-review` opens the App Store
 * page with the review composer already open, rather than dumping them on the listing
 * to find it themselves.
 *
 * The id matches `update_url` in app_config (migration 0005) — same app, one place
 * each. `StoreReview.storeUrl()` is deliberately not used: it reads
 * `expoConfig.ios.appStoreUrl`, which app.json does not set, and it cannot append the
 * write-review action anyway.
 */
export const APP_STORE_APP_ID = '6780037284';

export const APP_STORE_REVIEW_URL =
    `https://apps.apple.com/app/id${APP_STORE_APP_ID}?action=write-review`;
