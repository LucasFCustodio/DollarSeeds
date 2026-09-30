/**
 * StatusTitheRow — the status block and the tithe envelope.
 *
 * While this month's tithe is not given, the two share a row (status 3 : tithe 2,
 * equal heights). Once it is given the envelope collapses to one line under a
 * full-width status block, and the line keeps the toggle reachable to undo. With
 * tithing off there is no envelope and no line.
 *
 * The status block is the most important thing on the screen, so it is a solid
 * brand block rather than a line of text. Every fact in it comes from the server
 * (/home/summary/); nothing is computed here.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { shadow, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import Card from '../ui/Card';
import { IconBell, IconCalendar, IconCheck, IconScripture, IconTrend } from '../icons';
import type { HomeDebts, OverBudget, SplitKey } from '../../lib/homeSummary';
import RotatingCard, { type RotatingItem } from './RotatingCard';
import TitheToggle from './TitheToggle';
import { CARD_GAP, homeType } from './homeType';

interface TitheState {
    /** Tithing on and a non-zero amount this month. */
    active: boolean;
    amount: number;
    given: boolean;
    disabled: boolean;
    onToggle: () => void;
}

interface Props {
    /** null when the debt flag is off or the user has no active debts. */
    debts: HomeDebts | null;
    overBudget: OverBudget[];
    tithe: TitheState;
    onOpenDebts: () => void;
    onOpenSplit: (split: SplitKey) => void;
}

const ICON = 16;

export default function StatusTitheRow({ debts, overBudget, tithe, onOpenDebts, onOpenSplit }: Props) {
    const { theme } = useTheme();
    const { formatMoney } = useLocale();
    const { t } = useTranslation('dashboard');

    const line = (icon: React.ReactNode, text: string) => (
        <View style={styles.line}>
            {icon}
            <Text style={[homeType.small, styles.lineText, { color: theme.onBrand }]} numberOfLines={2}>{text}</Text>
        </View>
    );

    const overdue = debts?.overdue_count ?? 0;
    const dueSoon = debts?.due_soon_count ?? 0;
    const items: (RotatingItem | false)[] = [
        overdue > 0 && {
            key: 'overdue',
            content: line(<IconBell size={ICON} color={theme.harvest} />, t('status.overdue', { count: overdue })),
            onPress: onOpenDebts,
            accessibilityLabel: t('status.overdue', { count: overdue }),
        },
        dueSoon > 0 && {
            key: 'dueSoon',
            content: line(<IconCalendar size={ICON} color={theme.onBrand} />, t('status.dueSoon', { count: dueSoon })),
            onPress: onOpenDebts,
            accessibilityLabel: t('status.dueSoon', { count: dueSoon }),
        },
        ...overBudget.map(o => {
            const text = t('status.overBudget', { split: t(`split.${o.split}`), amount: formatMoney(o.amount_over) });
            return {
                key: `over-${o.split}`,
                content: line(<IconTrend size={ICON} color={theme.harvest} />, text),
                onPress: () => onOpenSplit(o.split),
                accessibilityLabel: text,
            };
        }),
    ];
    const anything = items.some(Boolean);
    const allGood: RotatingItem = {
        key: 'allGood',
        content: line(<IconCheck size={ICON} color={theme.onBrand} />, t('status.allGood')),
    };

    const sharedRow = tithe.active && !tithe.given;

    const status = (
        <RotatingCard
            items={anything ? items : [allGood]}
            dotColor={theme.brand2}
            dotActiveColor={theme.onBrand}
            style={[
                styles.status,
                { backgroundColor: theme.brand, ...(shadow(7) as object) },
                sharedRow ? { flex: 3 } : null,
            ]}
        />
    );

    if (!tithe.active) return status;

    if (tithe.given) {
        return (
            <View>
                {status}
                <Pressable
                    onPress={tithe.onToggle}
                    disabled={tithe.disabled}
                    accessibilityRole="button"
                    accessibilityLabel={t('tithe.undoA11y')}
                    style={({ pressed }) => [styles.givenLine, pressed && { opacity: 0.6 }]}
                >
                    <IconCheck size={14} color={theme.success} />
                    <Text style={[homeType.small, styles.givenText, { color: theme.ink2 }]} numberOfLines={1}>
                        {t('tithe.givenLine', { amount: formatMoney(tithe.amount) })}
                    </Text>
                    <TitheToggle
                        theme={theme}
                        value
                        disabled={tithe.disabled}
                        onToggle={tithe.onToggle}
                        a11yLabel={t('tithe.givenToggleA11y')}
                    />
                </Pressable>
            </View>
        );
    }

    return (
        <View style={styles.row}>
            {status}
            <Card theme={theme} depth={6} padding={14} style={[styles.envelope, { borderColor: theme.harvest }]}>
                <View style={styles.envelopeTitle}>
                    <IconScripture size={14} color={theme.brand} />
                    <Text style={[homeType.small, { color: theme.ink2 }]} numberOfLines={1}>{t('tithe.title')}</Text>
                </View>
                <Text style={[homeType.medium, { color: theme.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    {formatMoney(tithe.amount)}
                </Text>
                <View style={styles.giveRow}>
                    <Text style={[homeType.small, { color: theme.ink2 }]} numberOfLines={1}>{t('tithe.give')}</Text>
                    <TitheToggle
                        theme={theme}
                        value={false}
                        disabled={tithe.disabled}
                        onToggle={tithe.onToggle}
                        a11yLabel={t('tithe.givenToggleA11y')}
                    />
                </View>
            </Card>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', gap: CARD_GAP, alignItems: 'stretch' },
    status: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 16, justifyContent: 'center', minHeight: 64 },
    line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    lineText: { flexShrink: 1 },
    envelope: { flex: 2, justifyContent: 'space-between', gap: 4 },
    envelopeTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    giveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 4 },
    givenText: { flex: 1 },
    givenLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingHorizontal: 4 },
});
