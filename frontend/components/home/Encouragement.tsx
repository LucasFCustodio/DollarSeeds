/**
 * Envision — "Where is this going?": the debts-paid line and the encouragement card.
 *
 * Every item renders only when its data exists; the card hides when none do. The
 * debt items are flag-gated by the parent passing `debts = null`. Goals near
 * completion work for everyone.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { shadow, useTheme } from '../../context/ThemeContext';
import { MONTHS, useLocale } from '../../context/LocaleContext';
import { IconLeaf, IconSparkle, IconStar, IconTarget } from '../icons';
import type { GoalNearCompletion, HomeDebts } from '../../lib/homeSummary';
import { useDebtFormat } from '../debts/format';
import RotatingCard, { type RotatingItem } from './RotatingCard';
import { homeType } from './homeType';

export function DebtsPaidLine({ debts }: { debts: HomeDebts }) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    return (
        <Text style={[homeType.medium, { color: theme.ink }]}>
            {t('envision.debtsPaid', { paid: debts.paid_count, total: debts.total_count })}
        </Text>
    );
}

const ICON = 16;

export function EncouragementCard({ debts, goals }: { debts: HomeDebts | null; goals: GoalNearCompletion[] }) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    const { monthYear, serverTitle } = useLocale();
    const f = useDebtFormat();

    /** "2031-06" → "June 2031" */
    const longMonth = (ym: string) => {
        const [y, m] = ym.split('-').map(Number);
        return monthYear(MONTHS[(m || 1) - 1], y);
    };

    const line = (icon: React.ReactNode, text: string) => (
        <View style={styles.line}>
            {icon}
            <Text style={[homeType.small, styles.text, { color: theme.ink }]} numberOfLines={2}>{text}</Text>
        </View>
    );

    const focus = debts?.focus;
    const items: (RotatingItem | null | false | undefined)[] = [
        !!debts?.plan_est_payoff_month && {
            key: 'debtFree',
            content: line(<IconSparkle size={ICON} color={theme.harvest} />,
                t('envision.debtFreeBy', { date: longMonth(debts.plan_est_payoff_month) })),
        },
        debts?.almost_free && {
            key: `almost-${debts.almost_free.id}`,
            content: line(<IconLeaf size={ICON} color={theme.harvest} />,
                t('envision.almostFree', { name: debts.almost_free.name })),
        },
        focus && focus.focus_extra > 0 && {
            key: `extra-${focus.id}`,
            content: line(<IconStar size={ICON} color={theme.harvest} filled />,
                t('envision.focusExtra', { amount: f.money(focus.focus_extra), name: focus.name })),
        },
        ...goals.map(g => ({
            key: `goal-${g.id}`,
            content: line(<IconTarget size={ICON} color={theme.harvest} />,
                t('envision.goalNear', { goal: serverTitle(g.title), pct: Math.floor(g.pct * 100) })),
        })),
    ];

    if (!items.some(Boolean)) return null;

    return (
        <RotatingCard
            items={items}
            dotColor={theme.borderSoft}
            dotActiveColor={theme.harvest}
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.ink, ...(shadow(6) as object) }]}
        />
    );
}

const styles = StyleSheet.create({
    card: { borderRadius: 18, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 14 },
    line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    text: { flexShrink: 1 },
});
