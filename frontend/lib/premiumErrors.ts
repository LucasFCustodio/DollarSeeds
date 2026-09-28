/**
 * premiumErrors — the client half of the backend's `PremiumRequired` 403.
 *
 * Every premium refusal arrives as `403 {"code": "...", "detail": "..."}`. `detail` is a
 * finished ENGLISH sentence, and some of them state the free allowance as a number
 * ("keeps one goal"), so rendering it would both skip translation and freeze a number
 * the server is meant to be able to change. It exists for logs, and for a build that
 * doesn't know the code yet. This build knows the codes: it translates BY CODE, from
 * `premium:errors.<code>`, and never shows `detail`.
 *
 * These are BACKSTOPS. Screens hide or lock what the allowances say is unavailable
 * before the tap; the 403 covers entitlement changing between render and tap, and a
 * render made while the allowances were still unknown.
 */
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSubscription } from '../context/SubscriptionContext';

export const PREMIUM_CODES = [
    'premium_required',
    'goal_limit_reached',
    'goal_locked',
    'budget_type_locked',
] as const;

export type PremiumCode = (typeof PREMIUM_CODES)[number];

/**
 * The code of a premium 403, or null for any other failure. An unrecognised code on a
 * 403 still counts — it is a premium refusal this build predates — and is shown with
 * the fallback sentence rather than as a generic error.
 */
export function premiumErrorCode(err: any): string | null {
    const res = err?.response;
    if (res?.status !== 403) return null;
    const code = res.data?.code;
    return typeof code === 'string' && code ? code : null;
}

/**
 * `showUpsell(code)` — an Alert with the translated refusal and a "See Premium" button
 * that opens the paywall. The user chooses to go there; a refusal never pushes the
 * full paywall at them unasked.
 */
export function usePremiumUpsell() {
    const { t } = useTranslation('premium');
    const { openPaywall } = useSubscription();

    const message = useCallback((code: string) =>
        (PREMIUM_CODES as readonly string[]).includes(code)
            ? t(`errors.${code}`)
            : t('errors.fallback'),
    [t]);

    const showUpsell = useCallback((code: string) => {
        Alert.alert(t('upsell.title'), message(code), [
            { text: t('upsell.notNow'), style: 'cancel' },
            { text: t('upsell.seePremium'), onPress: openPaywall },
        ]);
    }, [t, message, openPaywall]);

    return { showUpsell, message };
}
