/**
 * LogPaymentSheet — the focus debt's "Extra" sheet: an extra amount on top of the
 * minimum (which has its own toggle). The server enforces the focus-only rule too.
 */
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import Button from '../ui/Button';
import InputField from '../ui/InputField';
import { localDateISO, logPayment, type Debt, type PaymentResult } from '../../lib/debtFreedom';
import { useDebtFormat } from './format';
import Sheet, { sheetStyles } from './Sheet';

interface Props {
    debt: Debt | null;
    onClose: () => void;
    onLogged: (result: PaymentResult, extra: boolean) => void;
}

export default function LogPaymentSheet({ debt, onClose, onLogged }: Props) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const { parseAmount } = useLocale();
    const f = useDebtFormat();
    const [extra, setExtra] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (debt) {
            setExtra('');
            setError(null);
            setBusy(false);
        }
    }, [debt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = async () => {
        if (!debt) return;
        const amount = extra.trim() ? parseAmount(extra) : null;
        if (extra.trim() && (amount == null || amount < 0)) {
            setError(t('form.errNumber', { field: t('payment.extra') }));
            return;
        }
        if (!(amount && amount > 0)) {
            setError(t('payment.errNothing'));
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const result = await logPayment(debt.id, { minimum: false, extraAmount: amount, occurredOn: localDateISO() });
            onLogged(result, true);
        } catch (e) {
            console.error('logPayment failed', e);
            setError(t('payment.errFailed'));
            setBusy(false);
        }
    };

    return (
        <Sheet visible={!!debt} onClose={onClose} closeLabel={t('payment.cancel')}
            title={t('payment.title')} subtitle={debt?.name}>
            <InputField icon={null} maxLength={undefined}
                label={t('payment.extra')}
                placeholder={f.money(0)}
                isNumeric
                value={extra}
                onChangeText={setExtra}
            />
            <Text style={[sheetStyles.hint, { color: theme.ink3, fontFamily: Fonts.sans }]}>{t('payment.extraHint')}</Text>

            {error ? <Text style={[sheetStyles.error, { color: theme.danger, fontFamily: Fonts.sansMedium }]}>{error}</Text> : null}

            <View style={sheetStyles.buttons}>
                <Button color={theme.brand} label={t('payment.submit')} variant="primary" size="lg" fullWidth disabled={busy} onPress={submit} />
                <Button color={theme.brand} label={t('payment.cancel')} variant="ghost" size="md" fullWidth onPress={onClose} />
            </View>
        </Sheet>
    );
}
