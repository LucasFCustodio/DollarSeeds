/**
 * BudgetTypeSelector — reusable picker for the 50/30/20-style budget splits.
 *
 * Used in Settings today; designed to drop into onboarding later. Purely
 * presentational: it renders the options from the BUDGET_TYPES single source of
 * truth and reports the chosen KEY. All colors come from useTheme() tokens.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { IconCheck } from '../icons';
import {
    BUDGET_TYPES, BUDGET_TYPE_ORDER, BudgetTypeKey, splitLabel,
} from '../../constants/budgetTypes';

interface Props {
    value: BudgetTypeKey;
    onSelect: (key: BudgetTypeKey) => void;
    disabled?: boolean;
}

export default function BudgetTypeSelector({ value, onSelect, disabled }: Props) {
    const { theme } = useTheme();
    // Names and taglines live in `common:budgetType` rather than a screen namespace
    // because the dashboard renders the same name in its split row.
    const { t } = useTranslation('common');

    return (
        <View style={{ gap: 10 }}>
            {BUDGET_TYPE_ORDER.map(key => {
                const def = BUDGET_TYPES[key];
                const selected = key === value;
                return (
                    <Pressable
                        key={key}
                        onPress={() => !disabled && onSelect(key)}
                        style={({ pressed }) => [
                            styles.option,
                            {
                                backgroundColor: selected ? theme.brandSoft : theme.surface,
                                borderColor: selected ? theme.brand : theme.border,
                            },
                            pressed && { opacity: 0.85 },
                        ]}
                    >
                        <View style={{ flex: 1 }}>
                            <View style={styles.titleRow}>
                                <Text style={[styles.name, { color: theme.ink }]}>
                                    {t(`budgetType.${key}.name`)}
                                </Text>
                                <Text style={[styles.split, { color: selected ? theme.brand : theme.ink3 }]}>
                                    {splitLabel(def)}
                                </Text>
                            </View>
                            <Text style={[styles.tagline, { color: theme.ink2 }]}>
                                {t(`budgetType.${key}.tagline`)}
                            </Text>

                            {/* Mini split bar for an at-a-glance feel of the proportions */}
                            <View style={[styles.bar, { backgroundColor: theme.borderSoft }]}>
                                <View style={{ flex: def.needs, backgroundColor: theme.needs }} />
                                <View style={{ flex: def.wants, backgroundColor: theme.wants }} />
                                <View style={{ flex: def.savings, backgroundColor: theme.goals }} />
                            </View>
                        </View>

                        <View style={[
                            styles.radio,
                            { borderColor: selected ? theme.brand : theme.border, backgroundColor: selected ? theme.brand : 'transparent' },
                        ]}>
                            {selected && <IconCheck size={12} color="#fff" />}
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1.5,
    },
    titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    name: { fontFamily: 'Geist-SemiBold', fontSize: 15, letterSpacing: -0.2 },
    split: { fontFamily: 'JetBrainsMono-SemiBold', fontSize: 12 },
    tagline: { fontFamily: 'Geist-Regular', fontSize: 12, marginTop: 2, lineHeight: 17 },
    bar: {
        flexDirection: 'row',
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        marginTop: 10,
    },
    radio: {
        width: 22, height: 22, borderRadius: 11,
        borderWidth: 2,
        alignItems: 'center', justifyContent: 'center',
    },
});
