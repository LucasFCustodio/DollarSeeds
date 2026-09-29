/**
 * CheckinSheet — the statement check-in: the statement balance and minimum, prefilled
 * with the app's current values. Saving makes the statement the app's truth (the
 * server writes a statement_adjustment for any difference). When the statement is
 * higher, a gentle note follows before the sheet closes.
 */
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import Button from '../ui/Button';
import InputField from '../ui/InputField';
import { useAnalytics } from '../../lib/analytics';
import { saveCheckin, type CheckinResult, type Debt } from '../../lib/debtFreedom';
import { useDebtFormat } from './format';
import Sheet, { sheetStyles } from './Sheet';

interface Props {
    debt: Debt | null;
    onClose: () => void;
    onSaved: (result: CheckinResult) => void;
}

export default function CheckinSheet({ debt, onClose, onSaved }: Props) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const { parseAmount, formatNumber } = useLocale();
    const f = useDebtFormat();
    const analytics = useAnalytics();
    const [balance, setBalance] = useState('');
    const [minimum, setMinimum] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [grewBy, setGrewBy] = useState<number | null>(null);

    useEffect(() => {
        if (!debt) return;
        const num = (v: number) => formatNumber(v, v % 1 ? 2 : 0).replace(/\s/g, '');
        setBalance(num(debt.current_balance));
        setMinimum(num(debt.min_payment));
        setError(null);
        setBusy(false);
        setGrewBy(null);
    }, [debt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = async () => {
        if (!debt) return;
        const statementBalance = parseAmount(balance);
        const minPayment = parseAmount(minimum);
        if (statementBalance == null || statementBalance < 0) {
            setError(t('form.errNumber', { field: t('checkin.statementBalance') }));
            return;
        }
        if (minPayment == null || minPayment < 0) {
            setError(t('form.errNumber', { field: t('checkin.minPayment') }));
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const result = await saveCheckin(debt.id, { statementBalance, minPayment });
            const grew = result.balance_change > 0.005;
            analytics.debtCheckinSaved({ debt_id: debt.id, balance_went_up: grew ? 1 : 0 });
            onSaved(result);
            if (grew) {
                setGrewBy(result.balance_change);
                setBusy(false);
            } else {
                onClose();
            }
        } catch (e) {
            console.error('saveCheckin failed', e);
            setError(t('checkin.errFailed'));
            setBusy(false);
        }
    };

    if (debt && grewBy != null) {
        const message = debt.debt_type === 'credit_card'
            ? t('checkin.grewCard', { amount: f.money(grewBy) })
            : t('checkin.grewOther', { amount: f.money(grewBy) });
        return (
            <Sheet visible onClose={onClose} closeLabel={t('checkin.ok')} title={t('checkin.grewTitle')} subtitle={debt.name}>
                <View style={[{ backgroundColor: theme.harvestSoft, borderColor: theme.harvest, borderWidth: 1, borderRadius: 14, padding: 14 }]}>
                    <Text style={{ color: theme.ink, fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22 }}>{message}</Text>
                </View>
                <View style={sheetStyles.buttons}>
                    <Button color={theme.brand} label={t('checkin.ok')} variant="primary" size="lg" fullWidth onPress={onClose} />
                </View>
            </Sheet>
        );
    }

    return (
        <Sheet visible={!!debt} onClose={onClose} closeLabel={t('checkin.cancel')}
            title={t('checkin.title')} subtitle={debt?.name}>
            {debt ? (
                <Text style={[sheetStyles.body, { color: theme.ink2, fontFamily: Fonts.sans }]}>
                    {t('checkin.body', { name: debt.name })}
                </Text>
            ) : null}
            <InputField icon={null} maxLength={undefined} label={t('checkin.statementBalance')}
                placeholder={f.money(0)} isNumeric value={balance} onChangeText={setBalance} />
            <InputField icon={null} maxLength={undefined} label={t('checkin.minPayment')}
                placeholder={f.money(0)} isNumeric value={minimum} onChangeText={setMinimum} />

            {error ? <Text style={[sheetStyles.error, { color: theme.danger, fontFamily: Fonts.sansMedium }]}>{error}</Text> : null}

            <View style={sheetStyles.buttons}>
                <Button color={theme.brand} label={t('checkin.save')} variant="primary" size="lg" fullWidth disabled={busy} onPress={submit} />
                <Button color={theme.brand} label={t('checkin.cancel')} variant="ghost" size="md" fullWidth onPress={onClose} />
            </View>
        </Sheet>
    );
}
