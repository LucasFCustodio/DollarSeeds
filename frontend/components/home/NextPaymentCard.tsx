/**
 * NextPaymentCard — the next debt payment coming up, and a "Prune" shortcut to it.
 * The server picks the debt (nearest due date, focus first on a tie) and the focus
 * extra; this only renders them. Flag-gated by the parent.
 *
 * Under it, the other payments due within 7 days as a bullet list ("2 payments
 * coming up:"). The parent passes them with the next payment already left out; with
 * none, that part does not render.
 *
 * The card's surface is painted art (PaintedCard); the Prune button stays solid
 * brand so it pops against the painting.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { ft } from '../../constants/responsive';
import PaintedCard from './PaintedCard';
import type { DueSoonDebt, NextPayment } from '../../lib/homeSummary';
import { useDebtFormat } from '../debts/format';
import { homeType } from './homeType';

export default function NextPaymentCard({ payment, upcoming, onPrune }: {
    payment: NextPayment;
    /** Due soon, excluding `payment` itself. */
    upcoming: DueSoonDebt[];
    onPrune: () => void;
}) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    const f = useDebtFormat();

    const amount = payment.is_focus && payment.focus_extra > 0
        ? t('nextPayment.withExtra', { min: f.money(payment.min_payment), extra: f.money(payment.focus_extra) })
        : f.money(payment.min_payment);

    return (
        <PaintedCard source={ART} borderColor={theme.ink} borderWidth={1.5} style={styles.card}>
            <View style={styles.row}>
                <View style={styles.left}>
                    <Text style={homeType.small} numberOfLines={1}>
                        <Text style={{ color: theme.ink2 }}>{payment.name}</Text>
                        <Text style={{ color: theme.ink3 }}>{t('nextPayment.due', { date: f.dayMonthOf(payment.due_date) })}</Text>
                    </Text>
                    <Text style={[homeType.medium, styles.amount, { color: theme.ink }]} numberOfLines={1}
                        adjustsFontSizeToFit minimumFontScale={0.75}>
                        {amount}
                    </Text>
                </View>
                <Pressable
                    onPress={onPrune}
                    accessibilityRole="button"
                    accessibilityLabel={t('nextPayment.pruneA11y', { name: payment.name })}
                    style={({ pressed }) => [styles.prune, { backgroundColor: theme.brand }, pressed && { opacity: 0.8 }]}
                >
                    <Text style={[styles.pruneText, { color: theme.onBrand }]}>{t('nextPayment.prune')}</Text>
                </Pressable>
            </View>
            {upcoming.length > 0 ? (
                <View style={styles.upcoming}>
                    <Text style={[homeType.small, { color: theme.ink2 }]}>
                        {t('nextPayment.comingUp', { count: upcoming.length })}
                    </Text>
                    {upcoming.map(d => (
                        <Text key={d.id} style={[homeType.small, styles.bullet]} numberOfLines={1}>
                            <Text style={{ color: theme.ink2 }}>{'•  '}{d.name}</Text>
                            <Text style={{ color: theme.ink3 }}>{t('nextPayment.due', { date: f.dayMonthOf(d.due_date) })}</Text>
                            <Text style={{ color: theme.ink2 }}>{' · '}{f.money(d.min_payment)}</Text>
                        </Text>
                    ))}
                </View>
            ) : null}
        </PaintedCard>
    );
}

const ART = require('../../assets/images/home/next-payment-bg.png');

const styles = StyleSheet.create({
    card: { padding: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    left: { flex: 1 },
    amount: { marginTop: 4 },
    upcoming: { marginTop: 12, gap: 2 },
    bullet: { marginLeft: 4 },
    prune: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
    pruneText: { fontFamily: Fonts.sansSemiBold, fontSize: ft(13) },
});
