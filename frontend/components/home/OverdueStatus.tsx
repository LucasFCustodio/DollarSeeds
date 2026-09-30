/**
 * OverdueStatus — the status block. It exists only to say that a debt is overdue,
 * so it renders only then (the parent gates it on overdue_count > 0); tapping it
 * opens the Debts tab. Over-budget splits show on their own containers instead, and
 * upcoming payments live on the next-payment card.
 *
 * A solid brand block, the most important thing on the screen when it shows. On the
 * green hero it keeps its depth and a white hairline so it still reads as its own
 * block. The count comes from the server (/home/summary/); nothing is computed here.
 */
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { shadow, useTheme } from '../../context/ThemeContext';
import { IconBell } from '../icons';
import { homeType } from './homeType';

const STATUS_EDGE = 'rgba(255,255,255,0.12)';

export default function OverdueStatus({ count, onOpenDebts }: { count: number; onOpenDebts: () => void }) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    const text = t('status.overdue', { count });

    return (
        <Pressable
            onPress={onOpenDebts}
            accessibilityRole="button"
            accessibilityLabel={text}
            style={({ pressed }) => [
                styles.block,
                { backgroundColor: theme.brand, borderColor: STATUS_EDGE, ...(shadow(7) as object) },
                pressed && { transform: [{ scale: 0.98 }] },
            ]}
        >
            <IconBell size={16} color={theme.harvest} />
            <Text style={[homeType.small, styles.text, { color: theme.onBrand }]} numberOfLines={2}>{text}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    block: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 16, minHeight: 64,
    },
    text: { flexShrink: 1 },
});
