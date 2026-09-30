/**
 * DebtCard — the card-view row: the same facts as the pot label, in a Card.
 */
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import Card from '../ui/Card';
import AnimatedProgressBar from '../ui/AnimatedProgressBar';
import type { Debt } from '../../lib/debtFreedom';
import { useDebtFormat } from './format';

function DebtCard({ debt, onPress }: { debt: Debt; onPress: (id: number) => void }) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const f = useDebtFormat();
    const paidOff = debt.status === 'paid_off';
    const missingDue = debt.missing.includes('due_day');
    const minDue = t('label.minDue', { min: f.money(debt.min_payment), date: '\u0000' });
    const [before, after = ''] = minDue.split('\u0000');

    return (
        <Card theme={theme} depth={4} padding={16} onPress={() => onPress(debt.id)} style={styles.card}>
            <View style={styles.top}>
                <Text style={[styles.eyebrow, { color: theme.ink3, fontFamily: Fonts.monoSemiBold }]}>
                    {t('detail.position', { position: debt.position, total: debt.total })}
                </Text>
                {debt.is_focus ? (
                    <View style={[styles.badge, { backgroundColor: theme.harvestSoft, borderColor: theme.harvest }]}>
                        <Text style={{ color: theme.brand, fontFamily: Fonts.sansSemiBold, fontSize: 11 }}>
                            {t('label.focus')}
                        </Text>
                    </View>
                ) : null}
            </View>
            <View style={styles.row}>
                <Text numberOfLines={1} style={[styles.name, { color: theme.ink, fontFamily: Fonts.sansSemiBold }]}>
                    {debt.name}
                </Text>
                <Text style={[styles.amount, { color: paidOff ? theme.success : theme.ink, fontFamily: Fonts.serif }]}>
                    {paidOff ? t('header.paidOff') : t('header.left', { amount: f.money(debt.current_balance) })}
                </Text>
            </View>
            {paidOff ? (
                <Text style={[styles.meta, { color: theme.ink2, fontFamily: Fonts.sans }]}>
                    {t('label.paidOffOn', { date: f.monthYear(debt.paid_off_at?.slice(0, 7)) })}
                </Text>
            ) : (
                <Text style={[styles.meta, { color: theme.ink2, fontFamily: Fonts.sans }]}>
                    {before}
                    <Text style={missingDue ? { color: theme.danger } : null}>
                        {missingDue ? t('label.missing') : f.dayMonthOf(debt.next_due_date)}
                    </Text>
                    {after}
                    {'  ·  '}
                    {t('label.pctPaid', { pct: f.pct(debt.pct_paid) })}
                </Text>
            )}
            <View style={styles.bar}>
                <AnimatedProgressBar value={Math.round(debt.pct_paid * 100)} color={theme.goals} bg={theme.borderSoft} height={6} />
            </View>
        </Card>
    );
}

export default memo(DebtCard);

const styles = StyleSheet.create({
    card: { marginHorizontal: 16, marginBottom: 12 },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    eyebrow: { fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase' },
    badge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
    row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    name: { fontSize: 16, flexShrink: 1 },
    amount: { fontSize: 22 },
    meta: { fontSize: 13, marginTop: 4 },
    bar: { marginTop: 10 },
});
