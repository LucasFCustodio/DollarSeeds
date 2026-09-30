/**
 * IncomeHero — "Am I okay?" in one number: what is left of this month's income.
 *
 * The number opens the income list; the + beside it opens income logging. Under it,
 * a bar of how much of the month's income is already spent — full and red once
 * spending passes income. It is also where an income bubble is dropped.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import AnimatedProgressBar from '../ui/AnimatedProgressBar';
import { IconPlus } from '../icons';
import { homeType } from './homeType';
import { useDropTarget } from './DropZones';

interface Props {
    left: number;
    income: number;
    spent: number;
    onAdd: () => void;
    onOpenIncome: () => void;
}

export default function IncomeHero({ left, income, spent, onAdd, onOpenIncome }: Props) {
    const { theme } = useTheme();
    const { formatMoney } = useLocale();
    const { t } = useTranslation('dashboard');
    const drop = useDropTarget('income');

    const over = spent > income;
    const pct = income > 0 ? Math.min(100, (spent / income) * 100) : (spent > 0 ? 100 : 0);

    return (
        <View
            ref={drop.ref}
            collapsable={false}
            style={[
                styles.wrap,
                drop.valid && { borderColor: drop.over ? theme.success : theme.border, backgroundColor: drop.over ? theme.successSoft : 'transparent' },
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
                        style={[homeType.large, { color: theme.ink }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.6}
                    >
                        {formatMoney(left)}
                    </Text>
                    <Text style={[homeType.small, { color: theme.ink3 }]}>{t('leftThisMonth')}</Text>
                </Pressable>
                <Pressable
                    onPress={onAdd}
                    accessibilityRole="button"
                    accessibilityLabel={t('hero.addIncomeA11y')}
                    hitSlop={8}
                    style={({ pressed }) => [styles.plus, { backgroundColor: theme.brand }, pressed && { opacity: 0.8 }]}
                >
                    <IconPlus size={18} color={theme.onBrand} />
                </Pressable>
            </View>
            <AnimatedProgressBar
                value={over ? 100 : pct}
                color={over ? theme.danger : theme.brand}
                bg={theme.borderSoft}
                height={8}
                style={styles.bar}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    // The border is always there (transparent at rest) so a drag highlight never
    // shifts the layout.
    wrap: { borderRadius: 18, borderWidth: 1.5, borderColor: 'transparent', marginHorizontal: -10, paddingHorizontal: 10, paddingVertical: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    amountHit: { flexShrink: 1 },
    plus: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    bar: { marginTop: 12 },
});
