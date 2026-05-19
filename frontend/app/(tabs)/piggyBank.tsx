import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import React, { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import SavingsContainer from '../../components/savings/SavingsContainer';

const BASE = 'http://10.0.0.13:8000';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

type SavingsTransaction = {
    id: number; title: string; amount: number;
    type: 'deposit' | 'withdrawal'; day: number; month: string;
};

type SavingsGoal = {
    id: number; title: string; target_amount: number;
    target_month: string; target_year: number;
    allocated_amount: number; created_at: string;
};

const getDeadline = (m: string, y: number) =>
    new Date(y, MONTHS.indexOf(m) + 1, 0);

const getDaysRemaining = (m: string, y: number) =>
    Math.max(0, Math.ceil((getDeadline(m, y).getTime() - Date.now()) / 86400000));

const getFixedRate = (target: number, createdAt: string, m: string, y: number) => {
    const totalDays = Math.max(1, Math.ceil(
        (getDeadline(m, y).getTime() - new Date(createdAt).getTime()) / 86400000
    ));
    return { perWeek: (target / totalDays) * 7, perMonth: (target / totalDays) * 30 };
};

export default function PiggyBankScreen() {
    const { user } = useAuth();
    const { theme } = useTheme();

    const [balance, setBalance] = useState(0);
    const [history, setHistory] = useState<SavingsTransaction[]>([]);
    const [activeForm, setActiveForm] = useState<'deposit' | 'withdrawal' | null>(null);
    const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
    const [goals, setGoals] = useState<SavingsGoal[]>([]);
    const [completedGoals, setCompletedGoals] = useState<SavingsGoal[]>([]);
    const [showGoalForm, setShowGoalForm] = useState(false);
    const [goalTitle, setGoalTitle] = useState('');
    const [goalAmount, setGoalAmount] = useState('');
    const [goalMonth, setGoalMonth] = useState(MONTHS[11]);
    const [goalYear, setGoalYear] = useState(2026);
    const [goalError, setGoalError] = useState('');

    const fetchData = async () => {
        try {
            const [balRes, histRes, goalRes, completedRes] = await Promise.all([
                axios.get(`${BASE}/savings/balance/?user_id=${user?.id}`),
                axios.get(`${BASE}/savings/history/?user_id=${user?.id}`),
                axios.get(`${BASE}/savings/goal/?user_id=${user?.id}`),
                axios.get(`${BASE}/savings/goal/completed/?user_id=${user?.id}`),
            ]);
            setBalance(balRes.data.balance);
            setHistory(histRes.data.data);
            setGoals(goalRes.data.data);
            setCompletedGoals(completedRes.data.data);
        } catch (e) { console.error('Error fetching savings data:', e); }
    };

    useFocusEffect(useCallback(() => { fetchData(); }, []));

    const deleteTransaction = async (id: number) => {
        try {
            await axios.delete(`${BASE}/savings/transaction/${id}?user_id=${user?.id}`);
            setHistory(prev => prev.filter(t => t.id !== id));
            const balRes = await axios.get(`${BASE}/savings/balance/?user_id=${user?.id}`);
            setBalance(balRes.data.balance);
        } catch (e) { console.error('Error deleting transaction:', e); }
    };

    const handleFormSuccess = () => { setActiveForm(null); fetchData(); };

    const submitGoal = async () => {
        const amount = parseFloat(goalAmount);
        if (!goalTitle.trim() || isNaN(amount) || amount <= 0) {
            Alert.alert('Missing info', 'Please enter a goal name and a valid target amount.');
            return;
        }
        setGoalError('');
        try {
            await axios.post(`${BASE}/savings/goal/`, {
                user_id: user?.id, title: goalTitle.trim(),
                target_amount: amount, target_month: goalMonth, target_year: goalYear,
            });
            setShowGoalForm(false); setGoalTitle(''); setGoalAmount('');
            fetchData();
        } catch (error: any) {
            if (error?.response?.status === 400) {
                setGoalError('A goal with this name already exists.');
            } else { console.error('Error creating goal:', error); }
        }
    };

    const deleteGoal = async (id: number) => {
        try {
            await axios.delete(`${BASE}/savings/goal/${id}?user_id=${user?.id}`);
            setGoals(prev => prev.filter(g => g.id !== id));
        } catch (e) { console.error('Error deleting goal:', e); }
    };

    const renderActiveGoalCards = () => goals.map(g => {
        const daysLeft = getDaysRemaining(g.target_month, g.target_year);
        const progress = Math.min(1, g.allocated_amount / g.target_amount);
        const { perWeek, perMonth } = getFixedRate(g.target_amount, g.created_at, g.target_month, g.target_year);
        const isAchieved = g.allocated_amount >= g.target_amount;
        const barColor = isAchieved ? theme.success : theme.action;

        return (
            <View key={g.id} style={[styles.goalCard, { backgroundColor: theme.surface, borderLeftColor: barColor }]}>
                <View style={styles.goalHeader}>
                    <Text style={[styles.goalTitle, { color: theme.text }]}>🎯 {g.title}</Text>
                    <Pressable onPress={() => deleteGoal(g.id)} hitSlop={8}>
                        <Text style={[styles.deleteIcon, { color: theme.textMuted }]}>✕</Text>
                    </Pressable>
                </View>
                <Text style={[styles.goalProgress, { color: theme.text }]}>
                    ${g.allocated_amount.toFixed(2)}
                    <Text style={[styles.goalProgressOf, { color: theme.textMuted }]}> / ${g.target_amount.toFixed(2)}</Text>
                </Text>
                <View style={[styles.barBg, { backgroundColor: theme.border }]}>
                    <View style={[styles.barFill, { width: `${progress * 100}%` as any, backgroundColor: barColor }]} />
                </View>
                {isAchieved ? (
                    <Text style={[styles.goalAchieved, { color: theme.success }]}>Goal achieved! 🎉</Text>
                ) : (
                    <>
                        <Text style={[styles.goalDeadline, { color: theme.textSecondary }]}>
                            Target: {g.target_month} {g.target_year} · {daysLeft} days left
                        </Text>
                        <Text style={[styles.goalRate, { color: theme.action }]}>
                            Save ${perWeek.toFixed(2)}/week · ${perMonth.toFixed(2)}/month
                        </Text>
                    </>
                )}
            </View>
        );
    });

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>

            {/* Tabs */}
            <View style={[styles.tabRow, { backgroundColor: theme.border }]}>
                {(['active', 'completed'] as const).map(tab => (
                    <Pressable
                        key={tab}
                        style={[styles.tab, activeTab === tab && [styles.tabActive, { backgroundColor: theme.surface }]]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, { color: activeTab === tab ? theme.text : theme.textMuted }]}>
                            {tab === 'active' ? 'Active Goals' : `Completed${completedGoals.length > 0 ? ` (${completedGoals.length})` : ''}`}
                        </Text>
                    </Pressable>
                ))}
            </View>

            {activeTab === 'completed' ? (
                <View style={styles.completedList}>
                    {completedGoals.length === 0 ? (
                        <Text style={[styles.emptyText, { color: theme.textMuted }]}>No completed goals yet. Keep saving!</Text>
                    ) : completedGoals.map(g => (
                        <View key={g.id} style={[styles.completedCard, { backgroundColor: theme.surface, borderLeftColor: theme.success }]}>
                            <View style={[styles.completedBadge, { backgroundColor: theme.success }]}>
                                <Text style={styles.completedBadgeText}>✓</Text>
                            </View>
                            <View style={styles.completedInfo}>
                                <Text style={[styles.completedTitle, { color: theme.success }]}>{g.title}</Text>
                                <Text style={[styles.completedAmount, { color: theme.textSecondary }]}>
                                    Goal: ${g.target_amount.toFixed(2)} · Saved: ${g.allocated_amount.toFixed(2)}
                                </Text>
                                <Text style={[styles.completedTarget, { color: theme.textMuted }]}>
                                    {g.target_month} {g.target_year}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>
            ) : (
                <>
                    {/* Balance hero */}
                    <View style={[styles.hero, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
                        <Text style={styles.piggyIcon}>🐷</Text>
                        <Text style={[styles.balanceLabel, { color: theme.textMuted }]}>YOUR PIGGY BANK</Text>
                        <Text style={[styles.balance, { color: theme.text }]}>${balance.toFixed(2)}</Text>
                        <Text style={[styles.balanceSub, { color: theme.textMuted }]}>Saved so far — keep it up!</Text>
                    </View>

                    {/* Goal cards */}
                    <View style={styles.section}>
                        {renderActiveGoalCards()}

                        <Pressable
                            style={[styles.addGoalBtn, { borderColor: theme.action }]}
                            onPress={() => { setShowGoalForm(!showGoalForm); setGoalError(''); }}
                        >
                            <Text style={[styles.addGoalBtnText, { color: theme.action }]}>
                                🎯 {goals.length > 0 ? 'Add Another Goal' : 'Set a Savings Goal'}
                            </Text>
                        </Pressable>

                        {showGoalForm && (
                            <View style={[styles.goalForm, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                <Text style={[styles.goalFormTitle, { color: theme.text }]}>New Savings Goal</Text>
                                <TextInput
                                    style={[styles.goalInput, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }]}
                                    placeholder="Goal name (e.g. New Car)"
                                    placeholderTextColor={theme.inputPlaceholder}
                                    value={goalTitle}
                                    onChangeText={t => { setGoalTitle(t); setGoalError(''); }}
                                    maxLength={30}
                                />
                                {goalError !== '' && (
                                    <Text style={[styles.goalError, { color: theme.danger }]}>{goalError}</Text>
                                )}
                                <TextInput
                                    style={[styles.goalInput, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }]}
                                    placeholder="Target amount (e.g. 5000)"
                                    placeholderTextColor={theme.inputPlaceholder}
                                    value={goalAmount}
                                    onChangeText={setGoalAmount}
                                    keyboardType="decimal-pad"
                                    maxLength={10}
                                />

                                <Text style={[styles.formLabel, { color: theme.textMuted }]}>Target Month</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                                    {MONTHS.map(m => (
                                        <Pressable
                                            key={m}
                                            style={[
                                                styles.chip,
                                                { borderColor: theme.border, backgroundColor: theme.inputBg },
                                                goalMonth === m && { backgroundColor: theme.action, borderColor: theme.action },
                                            ]}
                                            onPress={() => setGoalMonth(m)}
                                        >
                                            <Text style={[styles.chipText, { color: theme.textSecondary }, goalMonth === m && { color: '#fff' }]}>
                                                {m.slice(0, 3)}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </ScrollView>

                                <Text style={[styles.formLabel, { color: theme.textMuted }]}>Target Year</Text>
                                <View style={styles.yearRow}>
                                    {[2026, 2027, 2028].map(y => (
                                        <Pressable
                                            key={y}
                                            style={[
                                                styles.chip,
                                                { borderColor: theme.border, backgroundColor: theme.inputBg },
                                                goalYear === y && { backgroundColor: theme.action, borderColor: theme.action },
                                            ]}
                                            onPress={() => setGoalYear(y)}
                                        >
                                            <Text style={[styles.chipText, { color: theme.textSecondary }, goalYear === y && { color: '#fff' }]}>
                                                {y}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>

                                <View style={styles.formBtns}>
                                    <Pressable
                                        style={[styles.submitBtn, { backgroundColor: theme.action }]}
                                        onPress={submitGoal}
                                    >
                                        <Text style={styles.submitBtnText}>Save Goal</Text>
                                    </Pressable>
                                    <Pressable
                                        style={[styles.cancelBtn, { borderColor: theme.border }]}
                                        onPress={() => { setShowGoalForm(false); setGoalError(''); }}
                                    >
                                        <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
                                    </Pressable>
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Deposit / Withdraw */}
                    <View style={styles.actionRow}>
                        <Pressable
                            style={[
                                styles.actionBtn,
                                { backgroundColor: theme.goalsSoft, borderColor: activeForm === 'deposit' ? theme.goals : 'transparent' },
                            ]}
                            onPress={() => setActiveForm(activeForm === 'deposit' ? null : 'deposit')}
                        >
                            <Text style={[styles.actionBtnText, { color: theme.goals }]}>+ Set aside money</Text>
                        </Pressable>
                        <Pressable
                            style={[
                                styles.actionBtn,
                                { backgroundColor: theme.dangerSoft, borderColor: activeForm === 'withdrawal' ? theme.danger : 'transparent' },
                            ]}
                            onPress={() => setActiveForm(activeForm === 'withdrawal' ? null : 'withdrawal')}
                        >
                            <Text style={[styles.actionBtnText, { color: theme.danger }]}>- I bought it</Text>
                        </Pressable>
                    </View>

                    {activeForm && (
                        <SavingsContainer
                            transactionType={activeForm}
                            currentBalance={balance}
                            onSuccess={handleFormSuccess}
                            goals={goals as any}
                        />
                    )}

                    {/* History */}
                    <Text style={[styles.historyTitle, { color: theme.text }]}>History</Text>
                    {history.length === 0 && (
                        <Text style={[styles.emptyText, { color: theme.textMuted }]}>No transactions yet. Start saving!</Text>
                    )}
                    {history.map(tx => (
                        <View key={tx.id} style={[styles.txRow, { backgroundColor: theme.surface }]}>
                            <View style={styles.txLeft}>
                                <Text style={[styles.txTitle, { color: theme.text }]}>{tx.title}</Text>
                                <Text style={[styles.txDate, { color: theme.textMuted }]}>{tx.month} {tx.day}</Text>
                            </View>
                            <View style={styles.txRight}>
                                <Text style={[styles.txAmount, { color: tx.type === 'deposit' ? theme.success : theme.danger }]}>
                                    {tx.type === 'deposit' ? '+' : '-'}${tx.amount.toFixed(2)}
                                </Text>
                                <Pressable onPress={() => deleteTransaction(tx.id)} hitSlop={8}>
                                    <Text style={[styles.deleteIcon, { color: theme.textMuted }]}>✕</Text>
                                </Pressable>
                            </View>
                        </View>
                    ))}
                </>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, marginTop: 40 },
    content: { paddingBottom: 40, paddingTop: 20 },

    tabRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 4 },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    tabActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
    tabText: { fontSize: 13, fontWeight: '600' },

    completedList: { paddingHorizontal: 16 },
    completedCard: {
        flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 16,
        marginBottom: 10, borderLeftWidth: 4, gap: 14,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
    },
    completedBadge: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
    completedBadgeText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    completedInfo: { flex: 1 },
    completedTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
    completedAmount: { fontSize: 13, marginBottom: 2 },
    completedTarget: { fontSize: 12, fontStyle: 'italic' },

    hero: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 16 },
    piggyIcon: { fontSize: 52, marginBottom: 8 },
    balanceLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
    balance: { fontSize: 48, fontWeight: '800', letterSpacing: -1, marginBottom: 4 },
    balanceSub: { fontSize: 13, fontStyle: 'italic' },

    section: { paddingHorizontal: 16, marginBottom: 8 },

    goalCard: {
        borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 4,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
    },
    goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    goalTitle: { fontSize: 15, fontWeight: '700' },
    goalProgress: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
    goalProgressOf: { fontSize: 16, fontWeight: '400' },
    barBg: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
    barFill: { height: '100%', borderRadius: 4 },
    goalDeadline: { fontSize: 12, marginBottom: 2 },
    goalRate: { fontSize: 12, fontWeight: '600' },
    goalAchieved: { fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 4 },

    addGoalBtn: {
        borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 10,
        paddingVertical: 14, alignItems: 'center', marginBottom: 12,
    },
    addGoalBtnText: { fontWeight: '600', fontSize: 14 },

    goalForm: {
        borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
    },
    goalFormTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
    goalInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 10 },
    goalError: { fontSize: 12, marginTop: -6, marginBottom: 8, fontStyle: 'italic' },
    formLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
    chipScroll: { marginBottom: 10 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginRight: 6 },
    chipText: { fontSize: 13, fontWeight: '500' },
    yearRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    formBtns: { flexDirection: 'row', gap: 10 },
    submitBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    cancelBtn: { flex: 1, borderWidth: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    cancelBtnText: { fontWeight: '600', fontSize: 15 },

    actionRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 16 },
    actionBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 2 },
    actionBtnText: { fontWeight: '700', fontSize: 14 },

    historyTitle: { fontSize: 15, fontWeight: '700', paddingHorizontal: 16, marginTop: 8, marginBottom: 10 },
    emptyText: { textAlign: 'center', marginTop: 20, fontSize: 14 },
    txRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    },
    txLeft: { flex: 1 },
    txTitle: { fontSize: 14, fontWeight: '500' },
    txDate: { fontSize: 12, marginTop: 2 },
    txRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    txAmount: { fontSize: 15, fontWeight: '700' },
    deleteIcon: { fontSize: 14, padding: 4 },
});
