/**
 * ExtraPaymentSheet — "Add my extra payment" on a goal card (it replaces "Add money"
 * for this build). An amount, plus where the money comes from. It never changes the
 * goal's monthly minimum; it only moves "on pace for" earlier (the server's rule).
 */
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { isAxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { premiumErrorCode, usePremiumUpsell } from '../../lib/premiumErrors';
import { addExtraPayment, type MoneySource } from '../../lib/goals';
import Button from '../ui/Button';
import InputField from '../ui/InputField';
import Sheet, { sheetStyles } from '../ui/Sheet';
import MoneySourceChips from './MoneySourceChips';

interface Props {
    goal: { id: number; title: string } | null;
    onClose: () => void;
    onAdded: () => void;
}

export default function ExtraPaymentSheet({ goal, onClose, onAdded }: Props) {
    const { t } = useTranslation('goals');
    const { theme } = useTheme();
    const { parseAmount, serverError, serverTitle, formatMoney } = useLocale();
    const { showUpsell } = usePremiumUpsell();
    const [amount, setAmount] = useState('');
    const [source, setSource] = useState<MoneySource | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (goal) { setAmount(''); setSource(null); setError(null); setBusy(false); }
    }, [goal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = async () => {
        if (!goal || busy) return;
        const value = parseAmount(amount);
        if (value === null || !(value > 0)) return setError(t('extra.errAmount'));
        if (!source) return setError(t('form.errSource'));
        setBusy(true);
        setError(null);
        try {
            await addExtraPayment(goal.id, value, source);
            onAdded();
        } catch (e) {
            const code = premiumErrorCode(e);
            if (code) {
                onClose();
                showUpsell(code);
                return;
            }
            const detail = isAxiosError(e) ? e.response?.data?.detail : undefined;
            if (typeof detail === 'string') setError(serverError(detail));
            else { console.error('extra payment failed', e); setError(t('extra.errFailed')); }
        } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet visible={!!goal} onClose={onClose} closeLabel={t('extra.cancel')}
            title={t('extra.title')} subtitle={goal ? serverTitle(goal.title) : undefined}>
            <InputField icon={null} maxLength={undefined}
                label={t('extra.amountLabel')}
                placeholder={formatMoney(0)}
                isNumeric
                value={amount}
                onChangeText={(v: string) => { setAmount(v); setError(null); }}
            />
            <View style={{ height: 12 }} />
            <MoneySourceChips value={source} onChange={s => { setSource(s); setError(null); }} />
            <Text style={[sheetStyles.hint, { color: theme.ink3, fontFamily: Fonts.sans }]}>{t('extra.hint')}</Text>

            {error ? <Text style={[sheetStyles.error, { color: theme.danger, fontFamily: Fonts.sansMedium }]}>{error}</Text> : null}

            <View style={sheetStyles.buttons}>
                <Button color={theme.brand} label={t('extra.submit')} variant="primary" size="lg" fullWidth disabled={busy} onPress={submit} />
                <Button color={theme.brand} label={t('extra.cancel')} variant="ghost" size="md" fullWidth onPress={onClose} />
            </View>
        </Sheet>
    );
}
