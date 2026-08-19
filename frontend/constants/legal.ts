/**
 * Legal — canonical disclaimer copy and policy links.
 *
 * Single source of truth so the wording stays identical everywhere it appears
 * (Lessons footer, Settings > About, the last onboarding step).
 */

/**
 * The disclaimer wording lives in `common:legal.disclaimerFull` /
 * `.disclaimerShort` — it is compliance copy shown in three places (Lessons footer,
 * Settings > About, the last onboarding step) and has to appear in the user's
 * language. Read it via useTranslation, not from here.
 */

// TODO(i18n): these pages are English-only, and the pt-BR paywall links to them.
// A Portuguese terms/privacy page needs a locale-aware URL here before pt-BR is
// promoted in the Brazilian App Store listing.
export const TERMS_URL = 'https://dollarseeds.netlify.app/terms';
export const PRIVACY_URL = 'https://dollarseeds.netlify.app/privacy';
