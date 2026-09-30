/**
 * CloseOut — the month-end close-out prompt, and the one-line "closed" note.
 * Behaviour and copy are the home's existing close-out/reopen; only the
 * presentation lives here. The parent owns the requests and the reopen warning.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { ft } from '../../constants/responsive';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { IconCheck, IconSavings } from '../icons';
import { homeType } from './homeType';

export function CloseOutCard({ month, target, closing, onClose, onDismiss }: {
    month: string;
    target: number;
    closing: boolean;
    onClose: () => void;
    onDismiss: () => void;
}) {
    const { theme } = useTheme();
    const { formatMoney, monthLabel } = useLocale();
    const { t } = useTranslation('dashboard');
    return (
        <Card theme={theme} depth={6} padding={16} style={[styles.card, { borderColor: theme.brand2 }]}>
            <View style={styles.header}>
                <View style={[styles.tile, { backgroundColor: theme.brandSoft }]}>
                    <IconSavings size={22} color={theme.brand} accent={theme.brand2} />
                </View>
                <View style={styles.flex}>
                    <Text style={[styles.title, { color: theme.ink }]}>
                        {t('rollover.closeTitle', { month: monthLabel(month) })}
                    </Text>
                    <Text style={[styles.sub, { color: theme.ink2 }]}>
                        {t('rollover.closeSub', { amount: formatMoney(target, 2) })}
                    </Text>
                </View>
                <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button"
                    accessibilityLabel={t('rollover.dismissA11y')}
                    style={({ pressed }) => pressed && { opacity: 0.6 }}>
                    <Text style={[styles.dismiss, { color: theme.ink3 }]}>✕</Text>
                </Pressable>
            </View>
            <Button
                label={closing ? t('rollover.closing') : t('rollover.closeButton', { amount: formatMoney(target) })}
                variant="primary"
                size="md"
                fullWidth
                color={theme.brand}
                disabled={closing}
                onPress={onClose}
            />
        </Card>
    );
}

export function ClosedLine({ month, amount, busy, onReopen }: {
    month: string;
    amount: number;
    busy: boolean;
    onReopen: () => void;
}) {
    const { theme } = useTheme();
    const { formatMoney, monthLabel } = useLocale();
    const { t } = useTranslation('dashboard');
    return (
        <View style={styles.closedLine}>
            <IconCheck size={14} color={theme.success} />
            <Text style={[homeType.small, styles.flex, { color: theme.ink2 }]} numberOfLines={2}>
                {t('rollover.closedLine', { month: monthLabel(month), amount: formatMoney(amount, 2) })}
            </Text>
            <Pressable onPress={onReopen} disabled={busy} hitSlop={10} accessibilityRole="button"
                style={({ pressed }) => pressed && { opacity: 0.6 }}>
                <Text style={[homeType.small, { color: theme.brand }]}>
                    {busy ? '…' : t('rollover.reopen')}
                </Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    card: { gap: 14 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    tile: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    flex: { flex: 1 },
    title: { fontFamily: Fonts.sansSemiBold, fontSize: ft(15, 1.28), letterSpacing: -0.2 },
    sub: { fontFamily: Fonts.sans, fontSize: ft(12, 1.18), marginTop: 3, lineHeight: ft(17, 1.18) },
    dismiss: { fontFamily: Fonts.sansSemiBold, fontSize: ft(14, 1.2), paddingHorizontal: 2 },
    closedLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
});
