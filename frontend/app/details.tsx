import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import React, { useState, useCallback } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter, Stack } from 'expo-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { premiumErrorCode, usePremiumUpsell } from '../lib/premiumErrors';
import { fetchMonthPayments } from '../lib/debtFreedom';
import { DEBT_FREEDOM_ENABLED } from '../constants/features';
const BASE = (__DEV__ && process.env.EXPO_PUBLIC_API_URL) || 'https://dollarseeds-1.onrender.com';

interface Expense {
    id: number; title: string; amount: number; day: number; category: string; month: string;
    // The Goals view blends three sources: legacy "Goals" expense rows,
    // income-sourced savings deposits and Debt Freedom payments. `kind` tells the
    // delete handler which endpoint to hit — a debt payment has none here: tapping it
    // opens the debt, which is where its payments are deleted. `note` is an optional
    // subtitle (e.g. "Set aside").
    kind?: 'expense' | 'savings' | 'debt';
    note?: string;
    /** kind 'debt' only: the debt the payment belongs to. */
    debtId?: number;
}
interface Income {
    id: number;
    /** What the user typed. NULL on rows where they left the field blank — the
     *  source is the fallback, resolved at render (see incomeLabel below). */
    title?: string | null;
    jobTitle?: string;
    source?: string;
    amount: number;
    jobType?: string;
    day: number;
    month: string;
}

const CATEGORY_COLOR: Record<string, string | undefined> = {
    Needs: undefined, // resolved at render time from theme
    Wants: undefined,
    Goals: undefined,
};

export default function DetailsScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { theme } = useTheme();
    const {
        formatMoney: fmtMoney, monthLabel: displayMonth, sourceLabel, serverTitle,
    } = useLocale();
    const { t } = useTranslation('details');
    const { t: tc } = useTranslation('common');
    const { showUpsell } = usePremiumUpsell();
    const { category, month, type } = useLocalSearchParams();
    const monthLabel = Array.isArray(month) ? month[0] : month;

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [income, setIncome] = useState<Income[]>([]);

    // A 409 means the month is closed (rollover feature) and is read-only until reopened.
    const isClosedMonthError = (e: any) => e?.response?.status === 409;
    const showClosedMonthAlert = () =>
        Alert.alert(
            t('monthClosed.title'),
            t('monthClosed.body', { month: displayMonth(monthLabel) }),
        );

    // On every focus, not just mount: a debt payment opened from this list can be
    // deleted on the debt's screen, and coming back must not show it still here.
    useFocusEffect(useCallback(() => {
        if (type === 'expense') fetchDetailedExpenses();
        else fetchDetailedIncome();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []));

    const getCategoryColor = () => {
        if (category === 'Needs') return theme.needs;
        if (category === 'Wants') return theme.wants;
        if (category === 'Goals') return theme.goals;
        return theme.action;
    };

    const fetchDetailedExpenses = async () => {
        try {
            if (category === 'Goals') {
                // Goals = legacy "Goals" expense rows + income-sourced savings deposits
                // + this month's Debt Freedom payments (the server counts all three in
                // the split). The payments are their own request, so a failure there
                // still shows the deposits.
                const [expRes, savRes, debtPayments] = await Promise.all([
                    axios.get(`${BASE}/expenses/details/`, { params: { month, category, user_id: user?.id } }),
                    axios.get(`${BASE}/savings/history/`, { params: { user_id: user?.id, month } }),
                    DEBT_FREEDOM_ENABLED
                        ? fetchMonthPayments(String(monthLabel)).catch(err => {
                            console.error('Error fetching debt payments:', err);
                            return [];
                        })
                        : Promise.resolve([]),
                ]);
                const expItems: Expense[] = (expRes.data.data ?? []).map((i: any) => ({
                    id: i.id, title: i.title || i.sub_category || t('fallback.goalExpense'),
                    amount: i.amount, day: i.day, month: i.month, category: 'Goals', kind: 'expense',
                }));
                // Only income-sourced deposits count toward the Goals budget; transfers
                // between goals (source='transfer') are internal moves — excluded so we
                // never delete one half of a paired transfer and corrupt the balance.
                const savItems: Expense[] = (savRes.data.data ?? [])
                    .filter((i: any) => i.type === 'deposit' && i.source === 'income')
                    .map((i: any) => ({
                        id: i.id, title: i.title || t('fallback.savingsDeposit'),
                        amount: i.amount, day: i.day, month: i.month, category: 'Goals',
                        kind: 'savings', note: t('fallback.setAside'),
                    }));
                const debtItems: Expense[] = debtPayments.map(p => ({
                    id: p.id, title: p.debt_name ?? t('fallback.debtPayment'),
                    amount: p.amount, day: Number(p.occurred_on.slice(8, 10)),
                    month: String(monthLabel), category: 'Goals',
                    kind: 'debt', note: t('fallback.debtPayment'), debtId: p.debt_id,
                }));
                // Newest first. The payments already arrive newest first and a stable
                // sort keeps that order within a day.
                setExpenses([...debtItems, ...expItems, ...savItems].sort((a, b) => b.day - a.day));
            } else {
                const res = await axios.get(
                    `${BASE}/expenses/details/?month=${month}&category=${category}&user_id=${user?.id}`
                );
                setExpenses((res.data.data ?? []).map((i: any) => ({ ...i, kind: 'expense' })));
            }
        } catch (e) { console.error('Error fetching detailed expenses:', e); }
    };

    const deleteExpense = async (item: Expense) => {
        try {
            if (item.kind === 'savings') {
                await axios.delete(`${BASE}/savings/transaction/${item.id}?user_id=${user?.id}`);
            } else {
                await axios.delete(`${BASE}/expenses/delete/${item.id}?user_id=${user?.id}`);
            }
            setExpenses(prev => prev.filter(e => !(e.id === item.id && e.kind === item.kind)));
        } catch (e) {
            // A set-aside row on a goal the free tier has locked: 403 goal_locked.
            const code = premiumErrorCode(e);
            if (code) showUpsell(code);
            else if (isClosedMonthError(e)) showClosedMonthAlert();
            else console.error('Error deleting item:', e);
        }
    };

    const fetchDetailedIncome = async () => {
        try {
            const res = await axios.get(
                `${BASE}/income/details/?month=${month}&user_id=${user?.id}`
            );
            const sorted = [...(res.data.data ?? [])].sort((a, b) => b.day - a.day);
            setIncome(sorted);
        } catch (e) { console.error('Error fetching detailed income:', e); }
    };

    const deleteIncome = async (id: number) => {
        try {
            await axios.delete(`${BASE}/income/delete/${id}?user_id=${user?.id}`);
            setIncome(prev => prev.filter(i => i.id !== id));
        } catch (e) {
            if (isClosedMonthError(e)) showClosedMonthAlert();
            else console.error('Error deleting income:', e);
        }
    };

    /**
     * What one income row is called.
     *
     * The user's own title wins; a blank one falls back to the source chip. Two
     * shapes of row reach this, and both must read correctly:
     *
     *   - NEW rows store NULL when the title was left blank (IncomeContainer).
     *   - OLD rows have the source string COPIED into `title`, because that is what
     *     the app used to POST. Those are indistinguishable from a user who typed
     *     "Paycheck" on purpose — and are not worth a backfill — so a title equal to
     *     its own source is treated as the copy it almost certainly is and rendered
     *     through `sourceLabel`. That keeps pt-BR showing "Salário" on rows created
     *     before this fix, instead of silently reverting them to English.
     *
     * User text is rendered verbatim: unlike savings titles it was never composed by
     * the server, so it must not go through `serverTitle`.
     */
    const incomeLabel = (item: Income): string => {
        const typed = item.title?.trim();
        if (typed && typed !== item.source) return typed;
        if (item.source) return sourceLabel(item.source);
        return item.jobTitle ?? t('fallback.income');
    };

    const accentColor = getCategoryColor();
    const items = type === 'expense' ? expenses : income;
    const isEmpty = items.length === 0;

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
                <Pressable
                    onPress={() => router.back()}
                    style={[styles.backBtn, { backgroundColor: theme.inputBg }]}
                >
                    <Text style={[styles.backBtnText, { color: theme.textSecondary }]}>{t('back')}</Text>
                </Pressable>

                <View style={[styles.titleAccent, { backgroundColor: accentColor }]} />
                <Text style={[styles.title, { color: theme.text }]}>
                    {category
                        ? t('titleCategory', {
                            month: displayMonth(monthLabel),
                            category: tc(`category.${String(category)}`, { defaultValue: String(category) }),
                        })
                        : t('titleIncome', { month: displayMonth(monthLabel) })}
                </Text>
            </View>

            <View style={styles.listContainer}>
                {isEmpty ? (
                    <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                        {type === 'expense' ? t('empty.expense') : t('empty.income')}
                    </Text>
                ) : type === 'expense' ? (
                    expenses.map(item => item.kind === 'debt' ? (
                        <Pressable
                            key={`debt-${item.id}`}
                            onPress={() => router.push({ pathname: '/debtDetail', params: { id: String(item.debtId) } })}
                            accessibilityRole="button"
                            accessibilityLabel={t('row.debtPaymentA11y', { name: item.title, amount: fmtMoney(item.amount, 2) })}
                            style={({ pressed }) => [
                                styles.row, { backgroundColor: theme.surface, borderColor: theme.border },
                                pressed && { opacity: 0.7 },
                            ]}
                        >
                            <View style={[styles.rowAccent, { backgroundColor: accentColor }]} />
                            <View style={styles.rowInfo}>
                                {/* The debt's own name, as the user typed it. */}
                                <Text style={[styles.rowTitle, { color: theme.text }]}>{item.title}</Text>
                                <Text style={[styles.rowDate, { color: theme.textMuted }]}>
                                    {t('row.noteAndDay', { note: item.note, day: item.day })}
                                </Text>
                            </View>
                            <Text style={[styles.rowAmount, { color: theme.text }]}>{fmtMoney(item.amount, 2)}</Text>
                            <View style={styles.openBtn}>
                                <Text style={[styles.openBtnText, { color: theme.textMuted }]}>›</Text>
                            </View>
                        </Pressable>
                    ) : (
                        <View key={`${item.kind}-${item.id}`} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                            <View style={[styles.rowAccent, { backgroundColor: accentColor }]} />
                            <View style={styles.rowInfo}>
                                <Text style={[styles.rowTitle, { color: theme.text }]}>{serverTitle(item.title)}</Text>
                                <Text style={[styles.rowDate, { color: theme.textMuted }]}>
                                    {item.note
                                        ? t('row.noteAndDay', { note: item.note, day: item.day })
                                        : t('row.day', { day: item.day })}
                                </Text>
                            </View>
                            <Text style={[styles.rowAmount, { color: theme.text }]}>{fmtMoney(item.amount, 2)}</Text>
                            <Pressable
                                onPress={() => deleteExpense(item)}
                                style={[styles.deleteBtn, { backgroundColor: theme.dangerSoft }]}
                                hitSlop={8}
                            >
                                <Text style={[styles.deleteBtnText, { color: theme.danger }]}>✕</Text>
                            </Pressable>
                        </View>
                    ))
                ) : (
                    income.map((item, index) => (
                        <View key={index} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                            <View style={[styles.rowAccent, { backgroundColor: accentColor }]} />
                            <View style={styles.rowInfo}>
                                <Text style={[styles.rowTitle, { color: theme.text }]}>
                                    {incomeLabel(item)}
                                </Text>
                                <Text style={[styles.rowDate, { color: theme.textMuted }]}>
                                    {t('row.day', { day: item.day })}
                                </Text>
                            </View>
                            <Text style={[styles.rowAmount, { color: theme.text }]}>{fmtMoney(item.amount, 2)}</Text>
                            <Pressable
                                onPress={() => deleteIncome(item.id)}
                                style={[styles.deleteBtn, { backgroundColor: theme.dangerSoft }]}
                                hitSlop={8}
                            >
                                <Text style={[styles.deleteBtnText, { color: theme.danger }]}>✕</Text>
                            </Pressable>
                        </View>
                    ))
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        padding: 20,
        paddingTop: 60,
        borderBottomWidth: StyleSheet.hairlineWidth,
        marginBottom: 16,
    },
    backBtn: {
        alignSelf: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        marginBottom: 16,
    },
    backBtnText: { fontSize: 14, fontWeight: '600' },
    titleAccent: { width: 40, height: 4, borderRadius: 2, marginBottom: 10 },
    title: { fontSize: 24, fontWeight: '800' },
    listContainer: { paddingHorizontal: 16, paddingBottom: 32 },
    emptyText: { textAlign: 'center', marginTop: 40, fontSize: 14 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        marginBottom: 10,
        overflow: 'hidden',
    },
    rowAccent: { width: 4, alignSelf: 'stretch' },
    rowInfo: { flex: 1, paddingVertical: 14, paddingHorizontal: 14 },
    rowTitle: { fontSize: 15, fontWeight: '600' },
    rowDate: { fontSize: 12, marginTop: 2 },
    rowAmount: { fontSize: 16, fontWeight: '700', paddingHorizontal: 10 },
    deleteBtn: {
        paddingHorizontal: 14,
        paddingVertical: 14,
        alignSelf: 'stretch',
        justifyContent: 'center',
    },
    deleteBtnText: { fontSize: 14, fontWeight: '700' },
    // Same footprint as the delete button, so the amounts line up down the list.
    openBtn: {
        paddingHorizontal: 16,
        alignSelf: 'stretch',
        justifyContent: 'center',
    },
    openBtnText: { fontSize: 22, fontWeight: '600' },
});
