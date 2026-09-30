/**
 * SplitContainers — Needs and Wants side by side, Savings full width under them.
 *
 * Each shows what is left of its budget, three examples, and a bar. Tapping one opens
 * its existing details screen (where "View all" and deleting live). Needs and Wants
 * carry a + for manual logging; Savings does not — money set aside is logged through
 * the Goals flows. Each is also a drop target for an expense bubble.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import Card from '../ui/Card';
import AnimatedProgressBar from '../ui/AnimatedProgressBar';
import { IconNeedsMascot, IconPlus, IconSavingsGoalMascot, IconWantsMascot } from '../icons';
import type { SplitKey } from '../../lib/homeSummary';
import { useDropTarget } from './DropZones';
import { CARD_GAP, homeType } from './homeType';

type Totals = Record<SplitKey, number>;

interface Props {
    budgets: Totals;
    spent: Totals;
    onOpen: (split: SplitKey) => void;
    onAdd: (split: 'needs' | 'wants') => void;
}

export default function SplitContainers({ budgets, spent, onOpen, onAdd }: Props) {
    return (
        <View style={styles.stack}>
            <View style={styles.row}>
                <SplitCard split="needs" budget={budgets.needs} spent={spent.needs} onOpen={onOpen} onAdd={onAdd} />
                <SplitCard split="wants" budget={budgets.wants} spent={spent.wants} onOpen={onOpen} onAdd={onAdd} />
            </View>
            <SplitCard split="goals" budget={budgets.goals} spent={spent.goals} onOpen={onOpen} />
        </View>
    );
}

function SplitCard({ split, budget, spent, onOpen, onAdd }: {
    split: SplitKey;
    budget: number;
    spent: number;
    onOpen: (split: SplitKey) => void;
    onAdd?: (split: 'needs' | 'wants') => void;
}) {
    const { theme } = useTheme();
    const { formatMoney } = useLocale();
    const { t } = useTranslation('dashboard');
    const drop = useDropTarget(split);

    const look = {
        needs: { Icon: IconNeedsMascot, color: theme.needs, soft: theme.needsSoft, examples: t('category.needsSub') },
        wants: { Icon: IconWantsMascot, color: theme.wants, soft: theme.wantsSoft, examples: t('category.wantsSub') },
        goals: { Icon: IconSavingsGoalMascot, color: theme.goals, soft: theme.goalsSoft, examples: t('category.goalsSub') },
    }[split];
    const { Icon } = look;

    const left = budget - spent;
    const over = left < 0;
    const pct = budget > 0 ? (spent / budget) * 100 : (spent > 0 ? 100 : 0);
    const name = t(`split.${split}`);
    const addable = split !== 'goals' && onAdd;

    return (
        <View ref={drop.ref} collapsable={false} style={split === 'goals' ? undefined : styles.half}>
            <Card
                theme={theme}
                depth={6}
                padding={12}
                onPress={() => onOpen(split)}
                style={drop.valid ? { borderColor: look.color, backgroundColor: drop.over ? look.soft : theme.surface } : undefined}
            >
                <View
                    style={styles.top}
                    accessible
                    accessibilityLabel={over
                        ? t('split.overA11y', { split: name, amount: formatMoney(-left) })
                        : t('split.leftA11y', { split: name, amount: formatMoney(left) })}
                >
                    <View style={[styles.tile, { backgroundColor: look.soft }]}>
                        <Icon size={22} accent={look.color} paper={look.soft} />
                    </View>
                    <Text
                        style={[homeType.medium, styles.amount, { color: over ? theme.danger : look.color }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.6}
                    >
                        {formatMoney(left)}
                    </Text>
                    {addable ? (
                        <Pressable
                            onPress={() => onAdd(split)}
                            accessibilityRole="button"
                            accessibilityLabel={t('split.addA11y', { split: name })}
                            hitSlop={10}
                            style={({ pressed }) => [styles.plus, { backgroundColor: theme.brand }, pressed && { opacity: 0.8 }]}
                        >
                            <IconPlus size={14} color={theme.onBrand} />
                        </Pressable>
                    ) : null}
                </View>
                <Text style={[homeType.verySmall, styles.examples, { color: theme.ink3 }]} numberOfLines={1}>
                    {look.examples}
                </Text>
                <AnimatedProgressBar
                    value={Math.min(100, pct)}
                    color={over ? theme.danger : look.color}
                    bg={theme.borderSoft}
                    height={6}
                />
            </Card>
        </View>
    );
}

const styles = StyleSheet.create({
    stack: { gap: CARD_GAP },
    row: { flexDirection: 'row', gap: CARD_GAP },
    half: { flex: 1 },
    top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    tile: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    amount: { flex: 1, textAlign: 'right' },
    plus: { width: 24, height: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    examples: { marginTop: 10, marginBottom: 8 },
});
