/**
 * useMinToggle — the min-payment toggle's request, shared by the garden and the detail
 * screen. Off → on logs this cycle's minimum; on → off undoes it. The caller plays the
 * drops (garden) or queues them (detail) in `onChanged`.
 */
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { isAxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { useAnalytics } from '../../lib/analytics';
import { localDateISO, logPayment, undoMinimum, type Debt, type OneDebt } from '../../lib/debtFreedom';

export function useMinToggle(
    onChanged: (result: OneDebt, on: boolean) => void,
    /** After a refusal or failure, so the toggle shows the server's state again. */
    onStale: () => void,
) {
    const { t } = useTranslation('debts');
    const analytics = useAnalytics();
    const [pendingId, setPendingId] = useState<number | null>(null);
    const inFlight = useRef(false);

    const toggle = useCallback(async (debt: Debt) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setPendingId(debt.id);
        const turningOn = !debt.min_logged_this_cycle;
        try {
            if (turningOn) {
                const result = await logPayment(debt.id, { minimum: true, occurredOn: localDateISO() });
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                analytics.debtPaymentLogged({ debt_id: debt.id, kind: 'minimum', growth_step: result.debt.growth_step });
                analytics.debtMinToggled({ debt_id: debt.id, state: 'on' });
                onChanged(result, true);
            } else {
                const result = await undoMinimum(debt.id);
                Haptics.selectionAsync().catch(() => {});
                analytics.debtMinToggled({ debt_id: debt.id, state: 'off' });
                onChanged(result, false);
            }
        } catch (e) {
            const refused = isAxiosError(e) && e.response?.status === 409;
            if (!refused) console.error('min toggle failed', e);
            Alert.alert(refused ? (turningOn ? t('toggle.errAlready') : t('toggle.errClosed')) : t('toggle.errFailed'));
            onStale();
        } finally {
            inFlight.current = false;
            setPendingId(null);
        }
    }, [analytics, onChanged, onStale, t]);

    return { toggle, pendingId };
}
