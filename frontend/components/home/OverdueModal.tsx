/**
 * OverdueModal — every overdue debt, opened from the top bar's OverdueAlert pill.
 *
 * A centred surface card (88% of the width, up to 70% of the height, scrolling
 * inside past that) on a dimmed backdrop. Closes on a backdrop tap, the × button or
 * the Android back button.
 *
 *   "{n} debts need attention"
 *   one harvestSoft row per debt, in the server's order (longest overdue first):
 *     {name}             $min   [Review]
 *     was due {date}            Pay now      ← only with a safe pay_url
 *     ("{n} missed since {date}" when several months are owed: the date is the oldest)
 *
 * Only the name truncates. When "was due {date}" can't fit beside the amount and the
 * buttons (it would wrap), every row moves its amount under the date instead of
 * shrinking anything; one row needing it switches them all, so the rows stay aligned.
 *
 * A backend without debts.overdue (or an empty list against overdue_count > 0) gets
 * the heading and a single Review button to the Debts tab.
 */
import React, { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, shadow, useTheme } from '../../context/ThemeContext';
import { ft } from '../../constants/responsive';
import { IconClose } from '../icons';
import type { OverdueDebt } from '../../lib/homeSummary';
import { isSafeExternal } from '../../lib/announcements';
import { useDebtFormat } from '../debts/format';
import { PAINTED_OUTLINE } from './PaintedCard';
import { homeType } from './homeType';

const MAX_HEIGHT = 0.7;

interface Props {
    visible: boolean;
    count: number;
    debts?: OverdueDebt[];
    onClose: () => void;
    /** Closes the modal and opens the Debts tab, on that debt when given. */
    onReview: (debtId?: number) => void;
}

export default function OverdueModal({ visible, count, debts, onClose, onReview }: Props) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    const { height } = useWindowDimensions();
    const [stacked, setStacked] = useState(false);

    const list = debts ?? [];

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.overlay}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={t('overdueAlert.close')}
                />
                <View style={[
                    styles.card,
                    { backgroundColor: theme.surface, borderColor: theme.ink, maxHeight: height * MAX_HEIGHT },
                    shadow(8) as object,
                ]}>
                    <View style={styles.header}>
                        <Text accessibilityRole="header" style={[homeType.small, styles.heading, { color: theme.ink }]}>
                            {t('overdueAlert.title', { count: list.length || count })}
                        </Text>
                        <Pressable
                            onPress={onClose}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel={t('overdueAlert.close')}
                            style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
                        >
                            <IconClose size={18} color={theme.ink2} />
                        </Pressable>
                    </View>
                    {list.length > 0 ? (
                        <ScrollView style={styles.scroll} contentContainerStyle={styles.rows}>
                            {list.map(d => (
                                <DebtRow
                                    key={d.id}
                                    debt={d}
                                    stacked={stacked}
                                    onWraps={() => setStacked(true)}
                                    onReview={() => onReview(d.id)}
                                />
                            ))}
                        </ScrollView>
                    ) : (
                        <ReviewButton
                            label={t('overdueAlert.review')}
                            a11y={t('overdueAlert.reviewA11y')}
                            onPress={() => onReview()}
                            style={styles.fallback}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
}

function DebtRow({ debt, stacked, onWraps, onReview }: {
    debt: OverdueDebt;
    stacked: boolean;
    /** "was due {date}" needed a second line beside the amount. */
    onWraps: () => void;
    onReview: () => void;
}) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    const f = useDebtFormat();
    const amount = f.money(debt.min_payment);
    const payUrl = debt.pay_url && isSafeExternal(debt.pay_url) ? debt.pay_url : null;

    const amountText = <Text style={[homeType.medium, styles.amount, { color: theme.ink }]}>{amount}</Text>;

    return (
        <View style={[styles.row, { backgroundColor: theme.harvestSoft }]}>
            <View
                style={styles.left}
                accessible
                accessibilityLabel={t('overdueAlert.a11y', { name: debt.name, amount, date: f.fullDate(debt.missed_due_date) })}
            >
                <Text style={[homeType.medium, { color: theme.ink }]} numberOfLines={1}>{debt.name}</Text>
                <Text
                    style={[homeType.small, { color: theme.ink2 }]}
                    onTextLayout={e => { if (!stacked && e.nativeEvent.lines.length > 1) onWraps(); }}
                >
                    {(debt.missed_count ?? 1) > 1
                        ? t('overdueAlert.wasDueMany', { date: f.dayMonthOf(debt.missed_due_date), count: debt.missed_count })
                        : t('overdueAlert.wasDue', { date: f.dayMonthOf(debt.missed_due_date) })}
                </Text>
                {stacked ? amountText : null}
            </View>
            {stacked ? null : amountText}
            <View style={styles.actions}>
                <ReviewButton
                    label={t('overdueAlert.review')}
                    a11y={t('overdueAlert.reviewDebtA11y', { name: debt.name })}
                    onPress={onReview}
                />
                {payUrl ? (
                    <Pressable
                        onPress={() => { Linking.openURL(payUrl).catch(onReview); }}
                        hitSlop={8}
                        accessibilityRole="link"
                        accessibilityLabel={t('overdueAlert.payA11y', { name: debt.name })}
                        style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
                    >
                        <Text style={[homeType.verySmallEmphasis, { color: theme.brand }]}>{t('overdueAlert.payNow')}</Text>
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}

/** NextPaymentCard's Prune button. */
function ReviewButton({ label, a11y, onPress, style }: {
    label: string; a11y: string; onPress: () => void; style?: object;
}) {
    const { theme } = useTheme();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={a11y}
            style={({ pressed }) => [styles.review, { backgroundColor: theme.brand }, style, pressed && { opacity: 0.8 }]}
        >
            <Text style={[styles.reviewText, { color: theme.onBrand }]}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    // The other modals' dimmed backdrop.
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    card: { width: '88%', borderRadius: 18, borderWidth: PAINTED_OUTLINE, padding: 16 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    heading: { flex: 1, fontFamily: Fonts.sansSemiBold },
    // Sized to its rows until the card's maxHeight, then scrolls.
    scroll: { flexGrow: 0, flexShrink: 1 },
    rows: { gap: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 12 },
    left: { flex: 1, gap: 2 },
    amount: { flexShrink: 0 },
    actions: { alignItems: 'center', gap: 6 },
    fallback: { alignSelf: 'flex-start' },
    review: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
    reviewText: { fontFamily: Fonts.sansSemiBold, fontSize: ft(13) },
});
