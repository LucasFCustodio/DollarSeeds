/**
 * Onboarding constants. The flow itself is lib/onboardingFlow.ts; the device and
 * per-account storage keys are in lib/onboardingStore.ts, which follows the house
 * `<prefix>_<userId>` convention for per-account flags.
 */

// Only this account sees the dev-only "Replay Onboarding Tour" button in Settings.
export const DEV_ACCOUNT_EMAIL = 'appletester@gmail.com';
