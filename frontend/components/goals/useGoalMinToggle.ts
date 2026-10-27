/**
 * useGoalMinToggle — the goal card's monthly-minimum switch, adapted from the debts'
 * useMinToggle. Off → on logs this month's minimum; on → off DELETES it (the server
 * keeps at most one minimum row per goal per month, however often it is toggled).
 *
 * One in-flight guard covers every card, so two minimum requests never overlap.
 * While one runs, the switch shows where it is going and snaps back if refused.
 */
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { isAxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { useLocale } from '../../context/LocaleContext';
import { premiumErrorCode, usePremiumUpsell } from '../../lib/premiumErrors';
import { isMonthClosedDetail } from '../../lib/serverStrings';
import { logGoalMinimum, undoGoalMinimum } from '../../lib/goals';

type Pending = { id: number; value: boolean };

export function useGoalMinToggle(onChanged: () => void) {
    const { t } = useTranslation('goals');
    const { serverError } = useLocale();
    const { showUpsell } = usePremiumUpsell();
    const [pending, setPending] = useState<Pending | null>(null);
    const inFlight = useRef(false);

    const toggle = useCallback(async (goalId: number, currentlyOn: boolean) => {
        if (inFlight.current) return;
        inFlight.current = true;
        const turningOn = !currentlyOn;
        setPending({ id: goalId, value: turningOn });
        try {
            if (turningOn) {
                await logGoalMinimum(goalId);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            } else {
                await undoGoalMinimum(goalId);
                Haptics.selectionAsync().catch(() => {});
            }
        } catch (e) {
            const code = premiumErrorCode(e);
            if (code) {
                showUpsell(code);
            } else {
                const detail = isAxiosError(e) ? e.response?.data?.detail : undefined;
                const refused = isAxiosError(e) && e.response?.status === 409;
                if (!refused) console.error('goal minimum toggle failed', e);
                Alert.alert(
                    refused && isMonthClosedDetail(detail) ? serverError(detail)
                        : refused && typeof detail === 'string' ? serverError(detail)
                        : t('minimum.errFailed'),
                );
            }
        } finally {
            inFlight.current = false;
            // The list refetch is what settles the switch, in both outcomes.
            await Promise.resolve(onChanged());
            setPending(null);
        }
    }, [onChanged, serverError, showUpsell, t]);

    const pendingValueFor = useCallback(
        (id: number) => (pending && pending.id === id ? pending.value : null),
        [pending],
    );

    return { toggle, pendingValueFor };
}
