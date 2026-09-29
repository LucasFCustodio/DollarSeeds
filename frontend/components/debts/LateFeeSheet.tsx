/**
 * LateFeeSheet — asked once a debt with `late_fee_pending_for` settles on screen: its
 * minimum wasn't logged by that due date, and it has no late fee on file. Save writes
 * the fee (and, with "Save for next time", stores it so it's added automatically);
 * "No fee / Skip" just clears the question.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import Button from '../ui/Button';
import InputField from '../ui/InputField';
import { IconCheck } from '../icons';
import { useAnalytics } from '../../lib/analytics';
import { answerLateFee, type Debt, type OneDebt } from '../../lib/debtFreedom';
import { useDebtFormat } from './format';
import Sheet, { sheetStyles } from './Sheet';

interface Props {
    debt: Debt | null;
    onClose: () => void;
    onAnswered: (result: OneDebt) => void;
}

export default function LateFeeSheet({ debt, onClose, onAnswered }: Props) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const { parseAmount } = useLocale();
    const f = useDebtFormat();
    const analytics = useAnalytics();
    const [amount, setAmount] = useState('');
    const [remember, setRemember] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (debt) {
            setAmount('');
            setRemember(true);
            setError(null);
            setBusy(false);
        }
    }, [debt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const send = async (fee: number | null) => {
        if (!debt?.late_fee_pending_for) return;
        setBusy(true);
        setError(null);
        try {
            const result = await answerLateFee(debt.id, { dueDate: debt.late_fee_pending_for, amount: fee, remember });
            analytics.debtLateFeeEntered({ debt_id: debt.id, outcome: fee ? 'saved' : 'skipped' });
            onAnswered(result);
        } catch (e) {
            console.error('answerLateFee failed', e);
            setError(t('lateFee.errFailed'));
            setBusy(false);
        }
    };

    const save = () => {
        const fee = parseAmount(amount);
        if (fee == null || fee <= 0) {
            setError(t('form.errNumber', { field: t('lateFee.amount') }));
            return;
        }
        send(fee);
    };

    const body = debt
        ? t(debt.debt_type === 'credit_card' ? 'lateFee.bodyCard' : 'lateFee.bodyOther',
            { date: f.dayMonthOf(debt.late_fee_pending_for) })
        : '';

    return (
        <Sheet visible={!!debt} onClose={onClose} closeLabel={t('checkin.cancel')}
            title={t('lateFee.title')} subtitle={debt?.name}>
            <Text style={[sheetStyles.body, { color: theme.ink2, fontFamily: Fonts.sans }]}>{body}</Text>
            <InputField icon={null} maxLength={undefined} label={t('lateFee.amount')}
                placeholder={f.money(0)} isNumeric value={amount} onChangeText={setAmount} />
            <Pressable
                onPress={() => setRemember(r => !r)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: remember }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}
            >
                <View style={{
                    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: theme.ink,
                    backgroundColor: remember ? theme.brand : theme.surface, alignItems: 'center', justifyContent: 'center',
                }}>
                    {remember ? <IconCheck size={14} color={theme.onBrand} /> : null}
                </View>
                <Text style={{ color: theme.ink, fontFamily: Fonts.sansSemiBold, fontSize: 15 }}>{t('lateFee.remember')}</Text>
            </Pressable>

            {error ? <Text style={[sheetStyles.error, { color: theme.danger, fontFamily: Fonts.sansMedium }]}>{error}</Text> : null}

            <View style={sheetStyles.buttons}>
                <Button color={theme.brand} label={t('lateFee.save')} variant="primary" size="lg" fullWidth disabled={busy} onPress={save} />
                <Button color={theme.brand} label={t('lateFee.skip')} variant="ghost" size="md" fullWidth disabled={busy} onPress={() => send(null)} />
            </View>
        </Sheet>
    );
}
