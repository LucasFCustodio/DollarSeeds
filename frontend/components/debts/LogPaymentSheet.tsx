/**
 * LogPaymentSheet — a bottom sheet: "Paid minimum" checkbox, and on the focus debt
 * only, an optional extra amount. The server enforces the focus-only rule too.
 */
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts, shadow, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import Button from '../ui/Button';
import InputField from '../ui/InputField';
import { IconCheck } from '../icons';
import { localDateISO, logPayment, type Debt, type PaymentResult } from '../../lib/debtFreedom';
import { useDebtFormat } from './format';

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
    const insets = useSafeAreaInsets();
    const [minimum, setMinimum] = useState(true);
    const [extra, setExtra] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (debt) {
            setMinimum(true);
            setExtra('');
            setError(null);
            setBusy(false);
        }
    }, [debt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = async () => {
        if (!debt) return;
        const extraAmount = debt.is_focus && extra.trim() ? parseAmount(extra) : null;
        if (extra.trim() && debt.is_focus && (extraAmount == null || extraAmount < 0)) {
            setError(t('form.errNumber', { field: t('payment.extra') }));
            return;
        }
        if (!minimum && !(extraAmount && extraAmount > 0)) {
            setError(t('payment.errNothing'));
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const result = await logPayment(debt.id, {
                minimum,
                extraAmount: extraAmount && extraAmount > 0 ? extraAmount : undefined,
                occurredOn: localDateISO(),
            });
            onLogged(result, !!(extraAmount && extraAmount > 0));
        } catch (e) {
            console.error('logPayment failed', e);
            setError(t('payment.errFailed'));
            setBusy(false);
        }
    };

    return (
        <Modal visible={!!debt} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('payment.cancel')} />
                {debt ? (
                    <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.ink, paddingBottom: 20 + insets.bottom, ...(shadow(10) as object) }]}>
                        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
                        <Text style={[styles.title, { color: theme.ink, fontFamily: Fonts.serif }]}>{t('payment.title')}</Text>
                        <Text style={[styles.sub, { color: theme.ink2, fontFamily: Fonts.sansSemiBold }]}>{debt.name}</Text>

                        <Pressable
                            onPress={() => setMinimum(m => !m)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: minimum }}
                            style={[styles.check, { borderColor: theme.border, backgroundColor: theme.surfaceSoft }]}
                        >
                            <View style={[styles.box, { borderColor: theme.ink, backgroundColor: minimum ? theme.brand : theme.surface }]}>
                                {minimum ? <IconCheck size={14} color={theme.onBrand} /> : null}
                            </View>
                            <Text style={{ color: theme.ink, fontFamily: Fonts.sansSemiBold, fontSize: 15, flex: 1 }}>
                                {t('payment.paidMinimum', { amount: f.money(Math.min(debt.min_payment, debt.current_balance)) })}
                            </Text>
                        </Pressable>

                        {debt.is_focus ? (
                            <>
                                <InputField icon={null} maxLength={undefined}
                                    label={t('payment.extra')}
                                    placeholder={f.money(0)}
                                    isNumeric
                                    value={extra}
                                    onChangeText={setExtra}
                                />
                                <Text style={[styles.hint, { color: theme.ink3, fontFamily: Fonts.sans }]}>{t('payment.extraHint')}</Text>
                            </>
                        ) : null}

                        {error ? <Text style={[styles.error, { color: theme.danger, fontFamily: Fonts.sansMedium }]}>{error}</Text> : null}

                        <View style={styles.buttons}>
                            <Button color={theme.brand} label={t('payment.submit')} variant="primary" size="lg" fullWidth disabled={busy} onPress={submit} />
                            <Button color={theme.brand} label={t('payment.cancel')} variant="ghost" size="md" fullWidth onPress={onClose} />
                        </View>
                    </View>
                ) : null}
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1.5, borderBottomWidth: 0, paddingHorizontal: 20, paddingTop: 10 },
    grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, marginBottom: 12 },
    title: { fontSize: 28 },
    sub: { fontSize: 14, marginBottom: 14 },
    check: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 6 },
    box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    hint: { fontSize: 12, marginTop: -2 },
    error: { fontSize: 13, marginTop: 10 },
    buttons: { gap: 6, marginTop: 16 },
});
