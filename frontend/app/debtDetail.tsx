/**
 * debtDetail — everything about one Debt Freedom debt, opened by tapping its plant
 * or card. Statement check-in, Edit, Delete (confirmed). Payments are logged from the
 * garden only (the min-payment switch and Extra). All figures are server-computed.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { Fonts, useTheme } from '../context/ThemeContext';
import { useLocale } from '../context/LocaleContext';
import { DEBT_FREEDOM_ENABLED } from '../constants/features';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import BackHeader, { HeaderIconButton } from '../components/debts/BackHeader';
import { IconGearMascot } from '../components/icons';
import CheckinSheet from '../components/debts/CheckinSheet';
import { useDebtFormat } from '../components/debts/format';
import { deleteDebt, fetchDebt, type DebtDetail, type DebtTransaction } from '../lib/debtFreedom';

const VERSE_COUNT = 5;

export default function DebtDetailRoute() {
    if (!DEBT_FREEDOM_ENABLED) return <Redirect href="/(tabs)" />;
    return <DebtDetailScreen />;
}

function DebtDetailScreen() {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const { formatNumber } = useLocale();
    const f = useDebtFormat();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { id: idParam } = useLocalSearchParams<{ id: string }>();
    const id = Number(idParam);

    const [data, setData] = useState<DebtDetail | null>(null);
    const [error, setError] = useState(false);
    const [checkingIn, setCheckingIn] = useState(false);
    const [verse] = useState(() => Math.floor(Math.random() * VERSE_COUNT));

    const load = useCallback(() => {
        fetchDebt(id)
            .then(d => { setData(d); setError(false); })
            .catch(e => { console.error('fetchDebt failed', e); setError(true); });
    }, [id]);

    useFocusEffect(load);

    const confirmDelete = () => {
        if (!data) return;
        Alert.alert(t('detail.deleteTitle', { name: data.debt.name }), t('detail.deleteBody'), [
            { text: t('detail.cancel'), style: 'cancel' },
            {
                text: t('detail.delete'),
                style: 'destructive',
                onPress: async () => {
                    try {
                        await deleteDebt(id);
                        router.back();
                    } catch (e) {
                        console.error('deleteDebt failed', e);
                        Alert.alert(t('detail.errDelete'));
                    }
                },
            },
        ]);
    };

    if (!data) {
        return (
            <View style={[styles.fill, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
                <BackHeader title="" backLabel={t('actions.back')} />
                {error ? (
                    <Text style={[styles.center, { color: theme.ink2, fontFamily: Fonts.sans }]}>{t('detail.errLoad')}</Text>
                ) : (
                    <ActivityIndicator color={theme.brand} style={{ marginTop: 40 }} />
                )}
            </View>
        );
    }

    const d = data.debt;
    const paidOff = d.status === 'paid_off';
    const missing = t('label.missing');
    const rollover = Math.max(0, d.suggested_payment - d.min_payment);
    const usage = d.debt_type === 'credit_card' && d.credit_limit ? d.current_balance / d.credit_limit : null;
    const edit = () => router.push({ pathname: '/debtForm', params: { id: String(d.id) } });

    return (
        <View style={[styles.fill, { backgroundColor: theme.bg }]}>
            <View style={{ paddingTop: insets.top }}>
                <BackHeader
                    eyebrow={t('detail.position', { position: d.position, total: d.total })}
                    title={d.name}
                    backLabel={t('actions.back')}
                    right={(
                        // Edit, as the home screen's settings gear (in ink instead of white).
                        <HeaderIconButton label={t('detail.edit')} onPress={edit}>
                            <IconGearMascot size={18} color={theme.ink} />
                        </HeaderIconButton>
                    )}
                />
            </View>
            <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}>
                <Card theme={theme} padding={18}>
                    <Text style={[styles.eyebrow, { color: theme.ink3, fontFamily: Fonts.monoSemiBold }]}>
                        {paidOff ? t('detail.paidOffOn', { date: f.fullDate(d.paid_off_at) }) : t('detail.balance')}
                    </Text>
                    {!paidOff ? (
                        <Text style={[styles.big, { color: theme.ink, fontFamily: Fonts.serif }]}>{f.money(d.current_balance)}</Text>
                    ) : null}
                    <Text style={[styles.meta, { color: theme.ink2, fontFamily: Fonts.sansSemiBold }]}>
                        {t('detail.minimumLine', { amount: f.money(d.min_payment) })}
                    </Text>
                    <Text style={[styles.meta, { color: theme.ink2, fontFamily: Fonts.sansSemiBold }]}>
                        {t('label.pctPaid', { pct: f.pct(d.pct_paid) })}
                        {!paidOff ? `  ·  ${t('detail.estPayoff')} ` : ''}
                        {!paidOff ? (
                            <Text style={{ color: d.est_payoff_month ? theme.ink2 : theme.danger }}>{f.monthYear(d.est_payoff_month)}</Text>
                        ) : null}
                    </Text>
                    {!paidOff ? (
                        <View style={styles.checkin}>
                            <Button color={theme.brand} label={t('detail.checkin')} variant="secondary" fullWidth onPress={() => setCheckingIn(true)} />
                        </View>
                    ) : null}
                </Card>

                {!paidOff && !d.due_day ? (
                    <View style={[styles.prompt, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}>
                        <Text style={{ color: theme.danger, fontFamily: Fonts.sansSemiBold, fontSize: 14, lineHeight: 20 }}>{t('detail.addDueDay')}</Text>
                        <View style={styles.promptCta}>
                            <Button color={theme.danger} label={t('detail.addDueDayCta')} variant="outline" size="sm" onPress={edit} />
                        </View>
                    </View>
                ) : null}

                <Card theme={theme} padding={6} style={styles.card}>
                    <Row label={t('detail.type')} value={d.debt_type ? t(`type.${d.debt_type}`) : missing} dim={!d.debt_type} />
                    <Row label={t('detail.lender')} value={d.lender ?? missing} dim={!d.lender} />
                    {d.pay_url ? (
                        <Pressable onPress={() => WebBrowser.openBrowserAsync(d.pay_url as string)} accessibilityRole="link">
                            <Row label={t('detail.payOnline')} value={d.pay_url.replace(/^https?:\/\//, '')} link />
                        </Pressable>
                    ) : null}
                    <Row label={t('detail.original')} value={f.money(d.original_balance)} />
                    <Row label={t('detail.started')} value={f.fullDate(d.created_at)} />
                    <Row label={t('detail.apr')} value={t('detail.aprValue', { apr: formatNumber(d.apr, d.apr % 1 ? 2 : 0) })} />
                    {!paidOff ? (
                        <Row label={t('detail.suggested')} value={f.money(d.suggested_payment)}
                            hint={rollover > 0 ? t('detail.suggestedHint', { amount: f.money(rollover) }) : undefined} />
                    ) : null}
                    <Row label={t('detail.due')} value={d.due_day ? t('detail.dueValue', { day: d.due_day }) : missing} danger={!d.due_day && !paidOff} />
                    <Row label={t('detail.lateFee')} value={d.late_fee != null ? f.money(d.late_fee) : missing} dim={d.late_fee == null} />
                    <Row label={t('detail.autopay')} value={d.autopay == null ? missing : d.autopay ? t('form.yes') : t('form.no')} dim={d.autopay == null} />
                    {!paidOff ? (
                        <>
                            <Row label={t('detail.monthlyInterest')} value={f.money(d.monthly_interest)} />
                            <Row label={t('detail.interestRemaining')} value={d.interest_remaining == null ? missing : f.money(d.interest_remaining)} danger={d.interest_remaining == null} />
                        </>
                    ) : null}
                    {d.debt_type === 'credit_card' ? (
                        <>
                            <Row label={t('detail.creditLimit')} value={d.credit_limit != null ? f.money(d.credit_limit) : missing} dim={d.credit_limit == null} />
                            {usage != null ? <Row label={t('detail.usage')} value={t('detail.usageValue', { pct: Math.round(usage * 100) })} /> : null}
                        </>
                    ) : null}
                    {!paidOff ? (
                        <Row label={t('detail.rollsInto')} value={data.rolls_into ? data.rolls_into.name : t('detail.rollsIntoNone')} last />
                    ) : null}
                </Card>

                <Text style={[styles.section, { color: theme.ink2, fontFamily: Fonts.monoSemiBold }]}>{t('detail.history')}</Text>
                <Card theme={theme} padding={6}>
                    {data.transactions.length === 0 ? (
                        <Text style={[styles.empty, { color: theme.ink3, fontFamily: Fonts.sans }]}>{t('detail.historyEmpty')}</Text>
                    ) : data.transactions.map((tx, i) => (
                        <View key={tx.id} style={[styles.tx, i < data.transactions.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.borderSoft }]}>
                            <View style={styles.flex}>
                                <Text style={{ color: theme.ink, fontFamily: Fonts.sansSemiBold, fontSize: 14 }}>{t(`kind.${tx.kind}`)}</Text>
                                <Text style={{ color: theme.ink3, fontFamily: Fonts.mono, fontSize: 11, marginTop: 2 }}>{f.fullDate(tx.occurred_on)}</Text>
                            </View>
                            <Text style={{ color: txColor(tx, theme), fontFamily: Fonts.sansSemiBold, fontSize: 15 }}>
                                {raisesBalance(tx) ? '+' : '−'}
                                {f.money(Math.abs(tx.amount))}
                            </Text>
                        </View>
                    ))}
                </Card>

                {d.notes ? (
                    <>
                        <Text style={[styles.section, { color: theme.ink2, fontFamily: Fonts.monoSemiBold }]}>{t('detail.notes')}</Text>
                        <Card theme={theme} padding={16}>
                            <Text style={{ color: theme.ink, fontFamily: Fonts.sans, fontSize: 15, lineHeight: 21 }}>{d.notes}</Text>
                        </Card>
                    </>
                ) : null}

                <View style={[styles.verse, { backgroundColor: theme.harvestSoft, borderColor: theme.harvest }]}>
                    <Text style={{ color: theme.ink, fontFamily: Fonts.serifItalic, fontSize: 18, lineHeight: 24 }}>
                        {t(`verse.${verse}.text`)}
                    </Text>
                    <Text style={{ color: theme.ink2, fontFamily: Fonts.monoSemiBold, fontSize: 11, marginTop: 8, letterSpacing: 1 }}>
                        {t(`verse.${verse}.ref`)}
                    </Text>
                </View>

                <View style={styles.delete}>
                    <Button color={theme.danger} label={t('detail.delete')} variant="dangerSoft" fullWidth onPress={confirmDelete} />
                </View>
            </ScrollView>
            <CheckinSheet debt={checkingIn ? d : null} onClose={() => setCheckingIn(false)} onSaved={load} />
        </View>
    );
}

/** Whether a history row put money ON the balance (shown "+"). The signed kinds carry
 *  their direction in the amount. */
function raisesBalance(tx: DebtTransaction) {
    switch (tx.kind) {
        case 'interest':
        case 'late_fee':
        case 'minimum_reversal':
            return true;
        case 'balance_edit':
        case 'statement_adjustment':
            return tx.amount > 0;
        default:
            return false;
    }
}

function txColor(tx: DebtTransaction, theme: ReturnType<typeof useTheme>['theme']) {
    if (tx.kind === 'interest' || tx.kind === 'late_fee') return theme.danger;
    if (tx.kind === 'payment_minimum' || tx.kind === 'payment_extra') return theme.success;
    return theme.ink2;
}

function Row({ label, value, hint, danger, dim, link, last }: {
    label: string; value: string; hint?: string; danger?: boolean; dim?: boolean; link?: boolean; last?: boolean;
}) {
    const { theme } = useTheme();
    const color = danger ? theme.danger : link ? theme.brand : dim ? theme.ink3 : theme.ink;
    return (
        <View style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: theme.borderSoft }]}>
            <View style={styles.rowTop}>
                <Text style={{ color: theme.ink2, fontFamily: Fonts.sans, fontSize: 14 }}>{label}</Text>
                <Text numberOfLines={1} style={{ color, fontFamily: Fonts.sansSemiBold, fontSize: 14, flexShrink: 1, textAlign: 'right', textDecorationLine: link ? 'underline' : 'none' }}>
                    {value}
                </Text>
            </View>
            {hint ? <Text style={{ color: theme.ink3, fontFamily: Fonts.sans, fontSize: 12, marginTop: 4 }}>{hint}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    flex: { flex: 1 },
    center: { textAlign: 'center', marginTop: 40 },
    body: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
    eyebrow: { fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase' },
    big: { fontSize: 48, lineHeight: 56 },
    meta: { fontSize: 14 },
    checkin: { marginTop: 14 },
    card: {},
    section: { fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', marginTop: 8, marginLeft: 4 },
    row: { paddingHorizontal: 12, paddingVertical: 12 },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    tx: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12 },
    empty: { padding: 14, fontSize: 14 },
    verse: { borderRadius: 18, borderWidth: 1, padding: 18, marginTop: 8 },
    prompt: { borderRadius: 16, borderWidth: 1, padding: 14 },
    promptCta: { marginTop: 10, alignItems: 'flex-start' },
    delete: { marginTop: 8 },
});
