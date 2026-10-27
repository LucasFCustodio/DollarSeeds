/**
 * MoneySourceChips — "Where is this money coming from?", asked wherever money goes
 * into a goal outside the minimum toggle: Amount saved up at creation, and an extra
 * payment.
 *
 *   From this month's budget   → source='income': counts against this month's Goals split
 *   From money I'd already saved → source='opening': the budget never sees it, and
 *                                nothing is taken from anywhere else in the app
 *
 * `value` null = not answered yet (the form asks before it saves).
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { MoneySource } from '../../lib/goals';
import { formStyles as styles } from './formStyles';

const SOURCES: MoneySource[] = ['income', 'opening'];

export default function MoneySourceChips({ value, onChange }: {
    value: MoneySource | null;
    onChange: (source: MoneySource) => void;
}) {
    const { t } = useTranslation('goals');
    const { theme } = useTheme();
    return (
        <>
            <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>{t('source.label')}</Text>
            <View style={styles.chipWrap} accessibilityRole="radiogroup">
                {SOURCES.map(source => {
                    const active = value === source;
                    return (
                        <Pressable
                            key={source}
                            onPress={() => onChange(source)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: active }}
                            style={({ pressed }) => [
                                styles.chip,
                                {
                                    backgroundColor: active ? theme.brand : theme.surface,
                                    borderColor: active ? theme.brand : theme.border,
                                },
                                pressed && { opacity: 0.8 },
                            ]}
                        >
                            <Text style={[styles.chipText, { color: active ? theme.onBrand : theme.ink2 }]}>
                                {source === 'income' ? t('source.budget') : t('source.saved')}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </>
    );
}
