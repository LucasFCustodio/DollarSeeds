/**
 * TransactionsScreen — unified Expense / Income logging.
 *
 * A pinned segmented toggle (Expense | Income) at the top swaps between the
 * two form containers, which render in `embedded` mode (no internal header).
 * An optional `type` route param preselects the form (used by the dashboard
 * quick actions).
 */
import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, shadow } from '../../context/ThemeContext';
import { ft } from '../../constants/responsive';
import ExpenseContainer from '../../components/expense/ExpenseContainer';
import IncomeContainer from '../../components/income/IncomeContainer';

type TxType = 'expense' | 'income';

export default function TransactionsScreen() {
    const { theme } = useTheme();
    const { t } = useTranslation('transactions');
    const { type } = useLocalSearchParams<{ type?: string }>();
    const [active, setActive] = useState<TxType>(type === 'income' ? 'income' : 'expense');

    // This tab stays mounted, so the useState initializer only runs once. When the
    // dashboard quick actions re-navigate here with a `type` param (e.g. Log Income),
    // sync the active form to it on focus so it doesn't get stuck on the prior choice.
    useFocusEffect(
        useCallback(() => {
            if (type === 'income' || type === 'expense') setActive(type);
        }, [type])
    );

    return (
        <View style={{ flex: 1, backgroundColor: theme.bg }}>
            {/* ── Header + segmented toggle ─────────────────────────────── */}
            <View style={styles.header}>
                <Text style={[styles.title, { color: theme.ink }]}>{t('tab.title')}</Text>
                <Text style={[styles.subtitle, { color: theme.ink3 }]}>{t('tab.subtitle')}</Text>

                <View style={[styles.tabPill, { backgroundColor: theme.surfaceSoft, borderColor: theme.borderSoft }]}>
                    {(['expense', 'income'] as const).map(kind => (
                        <Pressable
                            key={kind}
                            onPress={() => setActive(kind)}
                            style={[
                                styles.tabItem,
                                active === kind && [
                                    styles.tabItemActive,
                                    { backgroundColor: theme.surface, ...(shadow(2) as object) },
                                ],
                            ]}
                        >
                            <Text style={[styles.tabText, { color: active === kind ? theme.ink : theme.ink3 }]}>
                                {kind === 'expense' ? t('tab.toggleExpense') : t('tab.toggleIncome')}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </View>

            {/* ── Active form ───────────────────────────────────────────── */}
            {active === 'expense' ? <ExpenseContainer embedded /> : <IncomeContainer embedded />}
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: 20,
        paddingTop: 54,
        paddingBottom: 12,
    },
    title: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: ft(26, 1.3),
        letterSpacing: -0.5,
        lineHeight: ft(30, 1.3),
    },
    subtitle: {
        fontFamily: 'InstrumentSerif-Italic',
        fontSize: ft(12, 1.18),
        marginTop: 2,
        marginBottom: 16,
    },
    tabPill: {
        flexDirection: 'row',
        borderRadius: 14,
        borderWidth: 1,
        padding: 4,
    },
    tabItem: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 10,
    },
    tabItemActive: {},
    tabText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: ft(13, 1.2),
        // No textTransform: 'capitalize'. It existed to title-case the raw route keys
        // ('expense' -> 'Expense'), which the catalogue now supplies already cased. On
        // Android capitalize also upper-cases EVERY word, which is wrong for any
        // multi-word label in a language that doesn't title-case.
    },
});
