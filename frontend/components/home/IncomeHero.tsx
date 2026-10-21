/**
 * IncomeHero — "Am I okay?" in one number: what is left of this month's income.
 *
 * The number opens the income list; the + beside it opens income logging. Under it,
 * a bar of what is LEFT of the month's income, so it agrees with the number: full at
 * the start of the month, draining as money is spent. The fill turns harvest at 20%
 * left or less; past zero there is no fill and the whole track turns harvest. It is
 * also where an income bubble is dropped.
 *
 * Sits on the green Analyze band: everything in it is onBrand.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import AnimatedProgressBar from '../ui/AnimatedProgressBar';
import { IconPlus } from '../icons';
import { GLASS, homeType } from './homeType';
import { useDropTarget } from './DropZones';

interface Props {
    /** The hero number: never below 0. */
    left: number;
    income: number;
    /** Spending (and a given tithe) has passed income: `left` is clamped at 0. */
    over: boolean;
    onAdd: () => void;
    onOpenIncome: () => void;
}

export default function IncomeHero({ left, income, over, onAdd, onOpenIncome }: Props) {
    const { theme } = useTheme();
    const { formatMoney } = useLocale();
    const { t } = useTranslation('dashboard');
    const drop = useDropTarget('income');

    const pct = over || income <= 0 ? 0 : Math.min(100, Math.max(0, (left / income) * 100));

    return (
        <View
            ref={drop.ref}
            collapsable={false}
            style={[
                styles.wrap,
                // The glass look, so the white amount stays readable under a drag.
                drop.valid && { borderColor: drop.over ? theme.onBrand : GLASS.border, backgroundColor: drop.over ? GLASS.fill : 'transparent' },
            ]}
        >
            <View style={styles.row}>
                <Pressable
                    onPress={onOpenIncome}
                    accessibilityRole="button"
                    accessibilityLabel={t('hero.a11y', { amount: formatMoney(left) })}
                    style={({ pressed }) => [styles.amountHit, pressed && { opacity: 0.6 }]}
                >
                    <Text
                        style={[homeType.large, { color: theme.onBrand }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.6}
                    >
                        {formatMoney(left)}
                    </Text>
                    <Text style={[homeType.small, { color: theme.onBrand }]}>{t('leftThisMonth')}</Text>
                </Pressable>
                <Pressable
                    onPress={onAdd}
                    accessibilityRole="button"
                    accessibilityLabel={t('hero.addIncomeA11y')}
                    hitSlop={8}
                    style={({ pressed }) => [styles.plus, { backgroundColor: theme.onBrand }, pressed && { opacity: 0.8 }]}
                >
                    <IconPlus size={18} color={theme.brand} />
                </Pressable>
            </View>
            <AnimatedProgressBar
                value={pct}
                color={pct <= LOW_PCT ? theme.harvest : theme.onBrand}
                bg={over ? theme.harvest : HERO_TRACK}
                height={8}
                style={styles.bar}
            />
        </View>
    );
}

const HERO_TRACK = 'rgba(255,255,255,0.2)';
/** At or below this much left, the fill turns harvest. */
const LOW_PCT = 20;

const styles = StyleSheet.create({
    // The border is always there (transparent at rest) so a drag highlight never
    // shifts the layout.
    wrap: { borderRadius: 18, borderWidth: 1.5, borderColor: 'transparent', marginHorizontal: -10, paddingHorizontal: 10, paddingVertical: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    amountHit: { flexShrink: 1 },
    plus: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    bar: { marginTop: 12 },
});
