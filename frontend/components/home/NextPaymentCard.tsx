/**
 * NextPaymentCard — the next debt payment coming up, and a "Prune" shortcut to it.
 * The server picks the debt (nearest due date, focus first on a tie) and the focus
 * extra; this only renders them. Flag-gated by the parent.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { ft } from '../../constants/responsive';
import Card from '../ui/Card';
import type { NextPayment } from '../../lib/homeSummary';
import { useDebtFormat } from '../debts/format';
import { homeType } from './homeType';

export default function NextPaymentCard({ payment, onPrune }: { payment: NextPayment; onPrune: () => void }) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    const f = useDebtFormat();

    const amount = payment.is_focus && payment.focus_extra > 0
        ? t('nextPayment.withExtra', { min: f.money(payment.min_payment), extra: f.money(payment.focus_extra) })
        : f.money(payment.min_payment);

    return (
        <Card theme={theme} depth={6} padding={16}>
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
        </Card>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    left: { flex: 1 },
    amount: { marginTop: 4 },
    prune: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
    pruneText: { fontFamily: Fonts.sansSemiBold, fontSize: ft(13) },
});
