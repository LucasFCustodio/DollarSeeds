/**
 * debtForm — create or edit a Debt Freedom debt.
 *
 * Create: `/debtForm`. Edit: `/debtForm?id=<id>`, same form, prefilled.
 * Six required fields (the due day since v2: billing cycles hang off it); the rest sit
 * under a collapsed "More details". On create the
 * garden scrolls to the new debt and plays the seed-planting animation, once.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../context/ThemeContext';
import { useLocale } from '../context/LocaleContext';
import { DEBT_FREEDOM_ENABLED } from '../constants/features';
import Button from '../components/ui/Button';
import InputField from '../components/ui/InputField';
import Dropdown from '../components/ui/Dropdown';
import BackHeader from '../components/debts/BackHeader';
import { IconChevronDown, IconChevronUp } from '../components/icons';
import { useAnalytics } from '../lib/analytics';
import { queueGardenAnimation } from '../lib/debtFreedomEvents';
import {
    createDebt, DEBT_TYPES, fetchDebt, updateDebt, type DebtInput, type DebtType,
} from '../lib/debtFreedom';

export default function DebtFormRoute() {
    if (!DEBT_FREEDOM_ENABLED) return <Redirect href="/(tabs)" />;
    return <DebtForm />;
}

type Tri = 'unset' | 'yes' | 'no';

function DebtForm() {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const { parseAmount, formatNumber } = useLocale();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const analytics = useAnalytics();
    const params = useLocalSearchParams<{ id?: string }>();
    const editId = params.id ? Number(params.id) : null;

    const [loading, setLoading] = useState(editId != null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [more, setMore] = useState(false);

    const [name, setName] = useState('');
    const [original, setOriginal] = useState('');
    const [current, setCurrent] = useState('');
    const [minPayment, setMinPayment] = useState('');
    const [apr, setApr] = useState('');
    const [debtType, setDebtType] = useState<DebtType | null>(null);
    const [lender, setLender] = useState('');
    const [dueDay, setDueDay] = useState('');
    const [payUrl, setPayUrl] = useState('');
    const [autopay, setAutopay] = useState<Tri>('unset');
    const [creditLimit, setCreditLimit] = useState('');
    const [lateFee, setLateFee] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (editId == null) return;
        const num = (v: number | null) => (v == null ? '' : formatNumber(v, v % 1 ? 2 : 0).replace(/\s/g, ''));
        fetchDebt(editId)
            .then(({ debt }) => {
                setName(debt.name);
                setOriginal(num(debt.original_balance));
                setCurrent(num(debt.current_balance));
                setMinPayment(num(debt.min_payment));
                setApr(num(debt.apr));
                setDebtType(debt.debt_type);
                setLender(debt.lender ?? '');
                setDueDay(debt.due_day ? String(debt.due_day) : '');
                setPayUrl(debt.pay_url ?? '');
                setAutopay(debt.autopay == null ? 'unset' : debt.autopay ? 'yes' : 'no');
                setCreditLimit(num(debt.credit_limit));
                setLateFee(num(debt.late_fee));
                setNotes(debt.notes ?? '');
                const hasMore = debt.debt_type || debt.lender || debt.pay_url
                    || debt.autopay != null || debt.credit_limit != null || debt.late_fee != null || debt.notes;
                setMore(!!hasMore);
            })
            .catch(e => {
                console.error('fetchDebt failed', e);
                setError(t('detail.errLoad'));
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editId]);

    const typeLabel = (v: DebtType) => t(`type.${v}`);
    const typeOptions = [t('form.notSet'), ...DEBT_TYPES.map(typeLabel)];
    const triOptions = [t('form.notSet'), t('form.yes'), t('form.no')];
    const triLabel = { unset: t('form.notSet'), yes: t('form.yes'), no: t('form.no') }[autopay];

    const submit = async () => {
        setError(null);
        if (!name.trim() || !original.trim() || !current.trim() || !minPayment.trim() || !apr.trim() || !dueDay.trim()) {
            setError(t('form.errRequired'));
            return;
        }
        const numbers: [string, string, number | null][] = [
            [t('form.original'), original, parseAmount(original)],
            [t('form.current'), current, parseAmount(current)],
            [t('form.minPayment'), minPayment, parseAmount(minPayment)],
            [t('form.apr'), apr, parseAmount(apr)],
        ];
        const bad = numbers.find(([, , n]) => n == null || n < 0);
        if (bad) {
            setError(t('form.errNumber', { field: bad[0] }));
            return;
        }
        const limit = creditLimit.trim() ? parseAmount(creditLimit) : null;
        if (creditLimit.trim() && (limit == null || limit < 0)) {
            setError(t('form.errNumber', { field: t('form.creditLimit') }));
            return;
        }
        const fee = lateFee.trim() ? parseAmount(lateFee) : null;
        if (lateFee.trim() && (fee == null || fee < 0)) {
            setError(t('form.errNumber', { field: t('form.lateFee') }));
            return;
        }
        const day = Number(dueDay.trim());
        if (!(Number.isInteger(day) && day >= 1 && day <= 31)) {
            setError(t('form.errDueDay'));
            return;
        }

        const input: DebtInput = {
            name: name.trim(),
            original_balance: numbers[0][2] as number,
            current_balance: numbers[1][2] as number,
            min_payment: numbers[2][2] as number,
            apr: numbers[3][2] as number,
            debt_type: debtType,
            lender: lender.trim() || null,
            due_day: day,
            pay_url: payUrl.trim() || null,
            autopay: autopay === 'unset' ? null : autopay === 'yes',
            credit_limit: limit,
            late_fee: fee,
            notes: notes.trim() || null,
        };

        setBusy(true);
        try {
            if (editId != null) {
                await updateDebt(editId, input);
            } else {
                const res = await createDebt(input);
                analytics.debtCreated({
                    debt_id: res.debt.id,
                    debt_type: input.debt_type ?? 'unset',
                    position: res.debt.position,
                    total: res.debt.total,
                });
                queueGardenAnimation({ kind: 'plant', debtId: res.debt.id });
            }
            router.back();
        } catch (e) {
            console.error('save debt failed', e);
            setError(t('form.errSave'));
            setBusy(false);
        }
    };

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ paddingTop: insets.top }}>
                <BackHeader title={editId != null ? t('form.titleEdit') : t('form.titleNew')} backLabel={t('actions.back')} />
            </View>
            {loading ? (
                <ActivityIndicator color={theme.brand} style={{ marginTop: 40 }} />
            ) : (
                <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
                    <InputField icon={null} isNumeric={false} label={t('form.name')} placeholder={t('form.namePlaceholder')} value={name} onChangeText={setName} maxLength={80} />
                    <InputField icon={null} maxLength={undefined} label={t('form.original')} placeholder="0" isNumeric value={original} onChangeText={setOriginal} />
                    <Text style={[styles.hint, { color: theme.ink3, fontFamily: Fonts.sans }]}>{t('form.originalHint')}</Text>
                    <InputField icon={null} maxLength={undefined} label={t('form.current')} placeholder="0" isNumeric value={current} onChangeText={setCurrent} />
                    <InputField icon={null} maxLength={undefined} label={t('form.minPayment')} placeholder="0" isNumeric value={minPayment} onChangeText={setMinPayment} />
                    <InputField icon={null} maxLength={undefined} label={t('form.apr')} placeholder="0" isNumeric value={apr} onChangeText={setApr} />
                    <InputField icon={null} label={t('form.dueDay')} placeholder={t('form.dueDayPlaceholder')} isNumeric value={dueDay} onChangeText={setDueDay} maxLength={2} />

                    <Pressable
                        onPress={() => setMore(m => !m)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: more }}
                        style={[styles.more, { borderColor: theme.border }]}
                    >
                        <Text style={{ color: theme.brand, fontFamily: Fonts.sansSemiBold, fontSize: 15 }}>
                            {more ? t('form.fewerDetails') : t('form.moreDetails')}
                        </Text>
                        {more ? <IconChevronUp size={18} color={theme.brand} /> : <IconChevronDown size={18} color={theme.brand} />}
                    </Pressable>

                    {more ? (
                        <View>
                            <Dropdown
                                label={t('form.type')}
                                options={typeOptions}
                                selectedValue={debtType ? typeLabel(debtType) : t('form.notSet')}
                                onSelect={(label: string) => setDebtType(DEBT_TYPES.find(v => typeLabel(v) === label) ?? null)}
                            />
                            <InputField icon={null} isNumeric={false} placeholder="" label={t('form.lender')} value={lender} onChangeText={setLender} maxLength={120} />
                            <InputField icon={null} isNumeric={false} label={t('form.payUrl')} placeholder={t('form.payUrlPlaceholder')} value={payUrl} onChangeText={setPayUrl} maxLength={400} />
                            <Dropdown
                                label={t('form.autopay')}
                                options={triOptions}
                                selectedValue={triLabel}
                                onSelect={(label: string) => setAutopay(label === t('form.yes') ? 'yes' : label === t('form.no') ? 'no' : 'unset')}
                            />
                            <InputField icon={null} maxLength={undefined} label={t('form.creditLimit')} placeholder="0" isNumeric value={creditLimit} onChangeText={setCreditLimit} />
                            <InputField icon={null} maxLength={undefined} label={t('form.lateFee')} placeholder="0" isNumeric value={lateFee} onChangeText={setLateFee} />
                            <Text style={[styles.hint, { color: theme.ink3, fontFamily: Fonts.sans }]}>{t('form.lateFeeHint')}</Text>
                            <InputField icon={null} isNumeric={false} placeholder="" label={t('form.notes')} value={notes} onChangeText={setNotes} maxLength={500} />
                        </View>
                    ) : null}

                    {error ? <Text style={[styles.error, { color: theme.danger, fontFamily: Fonts.sansMedium }]}>{error}</Text> : null}

                    <View style={styles.submit}>
                        <Button color={theme.brand}
                            label={editId != null ? t('form.saveEdit') : t('form.save')}
                            variant="primary"
                            size="lg"
                            fullWidth
                            disabled={busy}
                            onPress={submit}
                        />
                    </View>
                </ScrollView>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    body: { paddingHorizontal: 20, paddingTop: 4 },
    hint: { fontSize: 12, marginTop: -4, marginBottom: 4 },
    more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 14, marginVertical: 12 },
    error: { fontSize: 13, marginTop: 12 },
    submit: { marginTop: 20 },
});
