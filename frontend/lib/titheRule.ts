/**
 * The tithe rate rule, for screens: a whole percentage from 10 to 100 (Settings, and
 * the onboarding's "Yes, a different amount"). The code is in lib/onboardingFlow.ts,
 * which has to stay import-free for its node unit tests; this is the name to import.
 */
export { TITHE_MAX_PCT, TITHE_MIN_PCT, titheRateIssue, type TitheRateIssue } from './onboardingFlow';
