import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import React, { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface Expense {
    id: number; title: string; amount: number; day: number; category: string; month: string;
}
interface Income {
    id: number;
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
    const { category, month, type } = useLocalSearchParams();

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [income, setIncome] = useState<Income[]>([]);

    useEffect(() => {
        if (type === 'expense') fetchDetailedExpenses();
        else fetchDetailedIncome();
    }, []);

    const getCategoryColor = () => {
        if (category === 'Needs') return theme.needs;
        if (category === 'Wants') return theme.wants;
        if (category === 'Goals') return theme.goals;
        return theme.action;
    };

    const fetchDetailedExpenses = async () => {
        try {
            const res = await axios.get(
                `http://10.0.0.13:8000/expenses/details/?month=${month}&category=${category}&user_id=${user?.id}`
            );
            setExpenses(res.data.data);
        } catch (e) { console.error('Error fetching detailed expenses:', e); }
    };

    const deleteExpense = async (id: number) => {
        try {
            await axios.delete(`http://10.0.0.13:8000/expenses/delete/${id}?user_id=${user?.id}`);
            setExpenses(prev => prev.filter(e => e.id !== id));
        } catch (e) { console.error('Error deleting expense:', e); }
    };

    const fetchDetailedIncome = async () => {
        try {
            const res = await axios.get(
                `http://10.0.0.13:8000/income/details/?month=${month}&user_id=${user?.id}`
            );
            const sorted = [...(res.data.data ?? [])].sort((a, b) => b.day - a.day);
            setIncome(sorted);
        } catch (e) { console.error('Error fetching detailed income:', e); }
    };

    const deleteIncome = async (id: number) => {
        try {
            await axios.delete(`http://10.0.0.13:8000/income/delete/${id}?user_id=${user?.id}`);
            setIncome(prev => prev.filter(i => i.id !== id));
        } catch (e) { console.error('Error deleting income:', e); }
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
                    <Text style={[styles.backBtnText, { color: theme.textSecondary }]}>← Back</Text>
                </Pressable>

                <View style={[styles.titleAccent, { backgroundColor: accentColor }]} />
                <Text style={[styles.title, { color: theme.text }]}>
                    {month} {category ? String(category) : 'Income'} Breakdown
                </Text>
            </View>

            <View style={styles.listContainer}>
                {isEmpty ? (
                    <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                        {type === 'expense' ? 'No expenses logged yet.' : 'No income logged yet.'}
                    </Text>
                ) : type === 'expense' ? (
                    expenses.map((item, index) => (
                        <View key={index} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                            <View style={[styles.rowAccent, { backgroundColor: accentColor }]} />
                            <View style={styles.rowInfo}>
                                <Text style={[styles.rowTitle, { color: theme.text }]}>{item.title}</Text>
                                <Text style={[styles.rowDate, { color: theme.textMuted }]}>Day {item.day}</Text>
                            </View>
                            <Text style={[styles.rowAmount, { color: theme.text }]}>${item.amount.toFixed(2)}</Text>
                            <Pressable
                                onPress={() => deleteExpense(item.id)}
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
                                <Text style={[styles.rowTitle, { color: theme.text }]}>{item.source ?? item.jobTitle ?? 'Income'}</Text>
                                <Text style={[styles.rowDate, { color: theme.textMuted }]}>Day {item.day}</Text>
                            </View>
                            <Text style={[styles.rowAmount, { color: theme.text }]}>${item.amount.toFixed(2)}</Text>
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
});
