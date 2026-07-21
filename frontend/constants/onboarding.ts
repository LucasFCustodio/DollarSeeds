/**
 * Onboarding — first-run guided tour configuration.
 *
 * Single source of truth for the tour: storage keys, the dev account that can
 * replay it, the release cutoff, and the ordered step copy. Everything else
 * (context + overlay) reads from here so there are no magic strings elsewhere.
 */

import { DISCLAIMER_SHORT } from './legal';

// Per-user AsyncStorage key. The user id is appended so the "completed" flag is
// scoped to the account, not the device — matching how the app already keys
// per-user data.
export const ONBOARDING_STORAGE_PREFIX = 'onboarding_completed_';

export const onboardingKey = (userId: string) => `${ONBOARDING_STORAGE_PREFIX}${userId}`;

// Only this account sees the dev-only "Replay Onboarding Tour" button in Settings.
export const DEV_ACCOUNT_EMAIL = 'appletester@gmail.com';

// Accounts created before this date never auto-start the tour. This keeps the
// tour from surfacing for existing beta testers (who have no completed-flag yet)
// when they receive the build that adds onboarding — only genuinely new accounts
// created on/after this date see it. Bump this if you ever want to re-target.
export const ONBOARDING_RELEASE_DATE = '2026-07-09T00:00:00Z';

// Per-user AsyncStorage key for the mandatory starting-balance capture that runs
// once the tour is finished or skipped. Same per-account scoping as the tour flag.
export const STARTING_BALANCE_STORAGE_PREFIX = 'starting_balance_set_';

export const startingBalanceKey = (userId: string) =>
    `${STARTING_BALANCE_STORAGE_PREFIX}${userId}`;

// Per-user AsyncStorage key recording when the user last tapped "Skip for now" on
// the starting-balance gate. The gate is mandatory-by-default but must never trap
// the app (App Review requirement), so a skip suppresses it for a cooldown window
// rather than forever — the user is asked again later instead of being nagged
// every single launch.
export const STARTING_BALANCE_SKIP_PREFIX = 'starting_balance_skipped_at_';

export const startingBalanceSkipKey = (userId: string) =>
    `${STARTING_BALANCE_SKIP_PREFIX}${userId}`;

export const STARTING_BALANCE_SKIP_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

// Shared eligibility check for both first-run flows: only accounts created on/after
// the cutoff are "new". Beta accounts predate it and are never prompted.
export const isNewAccount = (createdAt?: string | null) => {
    if (!createdAt) return false;
    const created = new Date(createdAt).getTime();
    return !isNaN(created) && created >= new Date(ONBOARDING_RELEASE_DATE).getTime();
};

// A tab route the tour navigates to for a given step.
export type OnboardingRoute =
    | '/(tabs)'
    | '/(tabs)/transactions'
    | '/(tabs)/piggyBank'
    | '/(tabs)/lessons';

export type OnboardingStep = {
    route: OnboardingRoute;
    eyebrow: string;
    title: string;
    body: string;
    subnote?: string;
    // Quiet muted line under the card — used for the legal disclaimer on the last
    // step. Kept separate from `subnote`, which renders as a highlighted callout.
    footnote?: string;
};

// Ordered, linear tour. Derived from the user's handwritten draft, condensed for
// mobile: one short sentence per step with an optional secondary line.
export const ONBOARDING_STEPS: OnboardingStep[] = [
    {
        route: '/(tabs)',
        eyebrow: 'DASHBOARD',
        title: 'Welcome to DollarSeeds',
        body: "Go here to see your current income, what's left to spend, and how much money you have for each spending category",
    },
    {
        route: '/(tabs)/transactions',
        eyebrow: 'TRANSACTIONS',
        title: 'Add Your Income and Expenses',
        body: 'Enter an amount, pick a category, name it, choose a date, and save. New income is automatically split across all categories',
    },
    {
        route: '/(tabs)/piggyBank',
        eyebrow: 'GOALS',
        title: 'Track Your Goals',
        body: "Create a personal or debt goal. Add money to it from this month's income, or from your General Savings (GS). ",
        subnote: 'Add to GS whenever you have no specific saving goal. Money not spent will roll over into your GS at the end of the month',
    },
    {
        route: '/(tabs)/lessons',
        eyebrow: 'LESSONS',
        title: 'Grow in wisdom',
        body: 'Scripture-rooted video series on money, generosity, and stewardship, given by successful professionals.',
        subnote: "More series will be added as the app and its reach grows",
        footnote: DISCLAIMER_SHORT,
    },
];
