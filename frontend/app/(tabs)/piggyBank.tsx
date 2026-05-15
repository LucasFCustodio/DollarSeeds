import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import React, { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import SavingsContainer from '../../components/savings/SavingsContainer';

const BASE = 'http://10.0.0.13:8000';
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type SavingsTransaction = {
    id: number;
    title: string;
    amount: number;
    type: 'deposit' | 'withdrawal';
    day: number;
    month: string;
};

type SavingsGoal = {
    id: number;
    title: string;
    target_amount: number;
    target_month: string;
    target_year: number;
    allocated_amount: number;
    created_at: string;
};

const getDeadline = (targetMonth: string, targetYear: number): Date => {
    const monthIndex = MONTHS.indexOf(targetMonth);
    return new Date(targetYear, monthIndex + 1, 0);
};

const getDaysRemaining = (targetMonth: string, targetYear: number): number => {
    const today = new Date();
    return Math.max(0, Math.ceil((getDeadline(targetMonth, targetYear).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
};

const getFixedRate = (targetAmount: number, createdAt: string, targetMonth: string, targetYear: number) => {
    const totalDays = Math.max(1, Math.ceil(
        (getDeadline(targetMonth, targetYear).getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
    ));
    return {
        perWeek: (targetAmount / totalDays) * 7,
        perMonth: (targetAmount / totalDays) * 30,
    };
};

export default function PiggyBankScreen() {
    const { user } = useAuth();
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
        } catch (error) {
            console.error('Error fetching savings data:', error);
        }
    };

    useFocusEffect(useCallback(() => { fetchData(); }, []));

    const deleteTransaction = async (id: number) => {
        try {
            await axios.delete(`${BASE}/savings/transaction/${id}?user_id=${user?.id}`);
            setHistory(prev => prev.filter(t => t.id !== id));
            const balRes = await axios.get(`${BASE}/savings/balance/?user_id=${user?.id}`);
            setBalance(balRes.data.balance);
        } catch (error) {
            console.error('Error deleting transaction:', error);
        }
    };

    const handleFormSuccess = () => {
        setActiveForm(null);
        fetchData();
    };

    const submitGoal = async () => {
        const amount = parseFloat(goalAmount);
        if (!goalTitle.trim() || isNaN(amount) || amount <= 0) {
            Alert.alert('Missing info', 'Please enter a goal name and a valid target amount.');
            return;
        }
        setGoalError('');
        try {
            await axios.post(`${BASE}/savings/goal/`, {
                user_id: user?.id,
                title: goalTitle.trim(),
                target_amount: amount,
                target_month: goalMonth,
                target_year: goalYear,
            });
            setShowGoalForm(false);
            setGoalTitle('');
            setGoalAmount('');
            fetchData();
        } catch (error: any) {
            if (error?.response?.status === 400) {
                setGoalError('A goal with this name already exists. Please choose a different name.');
            } else {
                console.error('Error creating goal:', error);
            }
        }
    };

    const deleteGoal = async (id: number) => {
        try {
            await axios.delete(`${BASE}/savings/goal/${id}?user_id=${user?.id}`);
            setGoals(prev => prev.filter(g => g.id !== id));
        } catch (error) {
            console.error('Error deleting goal:', error);
        }
    };

    const renderActiveGoalCards = () => goals.map(g => {
        const daysLeft = getDaysRemaining(g.target_month, g.target_year);
        const progress = Math.min(1, g.allocated_amount / g.target_amount);
        const { perWeek, perMonth } = getFixedRate(g.target_amount, g.created_at, g.target_month, g.target_year);
        const isAchieved = g.allocated_amount >= g.target_amount;

        return (
            <View key={g.id} style={styles.goalCard}>
                <View style={styles.goalHeader}>
                    <Text style={styles.goalTitle}>🎯 {g.title}</Text>
                    <TouchableOpacity onPress={() => deleteGoal(g.id)}>
                        <Text style={styles.goalDelete}>✕</Text>
                    </TouchableOpacity>
                </View>
                <Text style={styles.goalProgress}>
                    ${g.allocated_amount.toFixed(2)} / ${g.target_amount.toFixed(2)}
                </Text>
                <View style={styles.goalBarBg}>
                    <View style={[styles.goalBarFill, {
                        width: `${progress * 100}%` as any,
                        backgroundColor: isAchieved ? '#28a745' : '#1ca8eb',
                    }]} />
                </View>
                {isAchieved ? (
                    <Text style={styles.goalAchieved}>Goal achieved! 🎉</Text>
                ) : (
                    <>
                        <Text style={styles.goalDeadline}>
                            Target: {g.target_month} {g.target_year} · {daysLeft} days left
                        </Text>
                        <Text style={styles.goalRate}>
                            Save ${perWeek.toFixed(2)}/week · ${perMonth.toFixed(2)}/month to hit goal
                        </Text>
                    </>
                )}
            </View>
        );
    });

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>

            {/* Tab bar */}
            <View style={styles.tabRow}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'active' && styles.tabActive]}
                    onPress={() => setActiveTab('active')}
                >
                    <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>Active Goals</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'completed' && styles.tabActive]}
                    onPress={() => setActiveTab('completed')}
                >
                    <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>
                        Completed{completedGoals.length > 0 ? ` (${completedGoals.length})` : ''}
                    </Text>
                </TouchableOpacity>
            </View>

            {activeTab === 'completed' ? (
                /* ── Completed Goals View ── */
                <View style={styles.completedList}>
                    {completedGoals.length === 0 ? (
                        <Text style={styles.emptyText}>No completed goals yet. Keep saving!</Text>
                    ) : completedGoals.map(g => (
                        <View key={g.id} style={styles.completedCard}>
                            <View style={styles.completedBadge}>
                                <Text style={styles.completedBadgeText}>✓</Text>
                            </View>
                            <View style={styles.completedInfo}>
                                <Text style={styles.completedTitle}>{g.title}</Text>
                                <Text style={styles.completedAmount}>
                                    Goal: ${g.target_amount.toFixed(2)} · Saved: ${g.allocated_amount.toFixed(2)}
                                </Text>
                                <Text style={styles.completedTarget}>
                                    {g.target_month} {g.target_year}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>
            ) : (
                /* ── Active Goals View ── */
                <>
                    {/* Balance hero */}
                    <View style={styles.hero}>
                        <Text style={styles.piggyIcon}>🐷</Text>
                        <Text style={styles.balanceLabel}>Your Piggy Bank</Text>
                        <Text style={styles.balance}>${balance.toFixed(2)}</Text>
                        <Text style={styles.balanceSub}>Saved so far — keep it up!</Text>
                    </View>

                    {/* Goals */}
                    <View style={styles.goalSection}>
                        {renderActiveGoalCards()}

                        <TouchableOpacity
                            style={styles.setGoalBtn}
                            onPress={() => { setShowGoalForm(!showGoalForm); setGoalError(''); }}
                        >
                            <Text style={styles.setGoalBtnText}>
                                🎯 {goals.length > 0 ? 'Add Another Goal' : 'Set a Savings Goal'}
                            </Text>
                        </TouchableOpacity>

                        {showGoalForm && (
                            <View style={styles.goalForm}>
                                <Text style={styles.goalFormTitle}>New Savings Goal</Text>
                                <TextInput
                                    style={styles.goalInput}
                                    placeholder="Goal name (e.g. New Car)"
                                    value={goalTitle}
                                    onChangeText={(t) => { setGoalTitle(t); setGoalError(''); }}
                                    maxLength={30}
                                />
                                {goalError !== '' && (
                                    <Text style={styles.goalErrorText}>{goalError}</Text>
                                )}
                                <TextInput
                                    style={styles.goalInput}
                                    placeholder="Target amount (e.g. 5000)"
                                    value={goalAmount}
                                    onChangeText={setGoalAmount}
                                    keyboardType="decimal-pad"
                                    maxLength={10}
                                />
                                <Text style={styles.goalFormLabel}>Target Month</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                                    {MONTHS.map(m => (
                                        <TouchableOpacity
                                            key={m}
                                            style={[styles.chip, goalMonth === m && styles.chipActive]}
                                            onPress={() => setGoalMonth(m)}
                                        >
                                            <Text style={[styles.chipText, goalMonth === m && styles.chipTextActive]}>
                                                {m.slice(0, 3)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                                <Text style={styles.goalFormLabel}>Target Year</Text>
                                <View style={styles.yearRow}>
                                    {[2026, 2027, 2028].map(y => (
                                        <TouchableOpacity
                                            key={y}
                                            style={[styles.chip, goalYear === y && styles.chipActive]}
                                            onPress={() => setGoalYear(y)}
                                        >
                                            <Text style={[styles.chipText, goalYear === y && styles.chipTextActive]}>{y}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <View style={styles.goalFormBtns}>
                                    <TouchableOpacity style={styles.goalSubmitBtn} onPress={submitGoal}>
                                        <Text style={styles.goalSubmitBtnText}>Save Goal</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.goalCancelBtn} onPress={() => { setShowGoalForm(false); setGoalError(''); }}>
                                        <Text style={styles.goalCancelBtnText}>Cancel</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Deposit / Withdraw buttons */}
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={[styles.actionBtn, styles.depositBtn, activeForm === 'deposit' && styles.activeBtnBorder]}
                            onPress={() => setActiveForm(activeForm === 'deposit' ? null : 'deposit')}
                        >
                            <Text style={styles.actionBtnText}>+ Set aside money</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionBtn, styles.withdrawBtn, activeForm === 'withdrawal' && styles.activeBtnBorder]}
                            onPress={() => setActiveForm(activeForm === 'withdrawal' ? null : 'withdrawal')}
                        >
                            <Text style={styles.actionBtnText}>- I bought it</Text>
                        </TouchableOpacity>
                    </View>

                    {activeForm && (
                        <SavingsContainer
                            transactionType={activeForm}
                            currentBalance={balance}
                            onSuccess={handleFormSuccess}
                            goals={goals as any}
                        />
                    )}

                    {/* Transaction history */}
                    <Text style={styles.historyTitle}>History</Text>
                    {history.length === 0 && (
                        <Text style={styles.emptyText}>No transactions yet. Start saving!</Text>
                    )}
                    {history.map(tx => (
                        <View key={tx.id} style={styles.txRow}>
                            <View style={styles.txLeft}>
                                <Text style={styles.txTitle}>{tx.title}</Text>
                                <Text style={styles.txDate}>{tx.month} {tx.day}</Text>
                            </View>
                            <View style={styles.txRight}>
                                <Text style={[styles.txAmount, tx.type === 'deposit' ? styles.depositText : styles.withdrawText]}>
                                    {tx.type === 'deposit' ? '+' : '-'}${tx.amount.toFixed(2)}
                                </Text>
                                <TouchableOpacity onPress={() => deleteTransaction(tx.id)}>
                                    <Text style={styles.deleteBtn}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    content: { paddingBottom: 40, paddingTop: 40 },
    // Tabs
    tabRow: {
        flexDirection: 'row',
        marginHorizontal: 20,
        marginBottom: 16,
        borderRadius: 10,
        backgroundColor: '#e9ecef',
        padding: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
    },
    tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
    tabText: { fontSize: 14, fontWeight: '600', color: '#6c757d' },
    tabTextActive: { color: '#212529' },
    // Completed goals
    completedList: { paddingHorizontal: 20, paddingTop: 4 },
    completedCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#28a745',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
        gap: 14,
    },
    completedBadge: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#28a745',
        justifyContent: 'center',
        alignItems: 'center',
    },
    completedBadgeText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    completedInfo: { flex: 1 },
    completedTitle: { fontSize: 16, fontWeight: '700', color: '#28a745', marginBottom: 2 },
    completedAmount: { fontSize: 13, color: '#28a745', marginBottom: 2 },
    completedTarget: { fontSize: 12, color: '#6dbe85', fontStyle: 'italic' },
    // Hero
    hero: {
        backgroundColor: '#fff',
        alignItems: 'center',
        paddingVertical: 32,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        marginBottom: 16,
    },
    piggyIcon: { fontSize: 56, marginBottom: 8 },
    balanceLabel: { fontSize: 14, color: '#6c757d', textTransform: 'uppercase', letterSpacing: 1 },
    balance: { fontSize: 48, fontWeight: 'bold', color: '#212529', marginVertical: 6 },
    balanceSub: { fontSize: 13, color: '#adb5bd', fontStyle: 'italic' },
    // Active goal cards
    goalSection: { paddingHorizontal: 20, marginBottom: 8 },
    setGoalBtn: {
        borderWidth: 1.5,
        borderColor: '#1ca8eb',
        borderStyle: 'dashed',
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
        marginBottom: 12,
    },
    setGoalBtnText: { color: '#1ca8eb', fontWeight: '600', fontSize: 15 },
    goalCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#1ca8eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
    },
    goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    goalTitle: { fontSize: 16, fontWeight: '700', color: '#212529' },
    goalDelete: { color: '#adb5bd', fontSize: 16, padding: 4 },
    goalProgress: { fontSize: 20, fontWeight: 'bold', color: '#212529', marginBottom: 8 },
    goalBarBg: { height: 10, backgroundColor: '#e9ecef', borderRadius: 5, overflow: 'hidden', marginBottom: 8 },
    goalBarFill: { height: '100%', borderRadius: 5 },
    goalDeadline: { fontSize: 13, color: '#6c757d', marginBottom: 2 },
    goalRate: { fontSize: 13, fontWeight: '600', color: '#1ca8eb' },
    goalAchieved: { fontSize: 15, fontWeight: 'bold', color: '#28a745', textAlign: 'center', marginTop: 4 },
    // Goal form
    goalForm: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
    },
    goalFormTitle: { fontSize: 16, fontWeight: '700', color: '#212529', marginBottom: 12 },
    goalInput: {
        borderWidth: 1,
        borderColor: '#dee2e6',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        color: '#212529',
        marginBottom: 10,
    },
    goalErrorText: { fontSize: 13, color: '#dc3545', marginTop: -6, marginBottom: 8, fontStyle: 'italic' },
    goalFormLabel: { fontSize: 13, color: '#6c757d', fontWeight: '600', marginBottom: 6, marginTop: 4 },
    chipScroll: { marginBottom: 10 },
    chip: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#dee2e6',
        marginRight: 6,
        backgroundColor: '#f8f9fa',
    },
    chipActive: { backgroundColor: '#1ca8eb', borderColor: '#1ca8eb' },
    chipText: { fontSize: 13, color: '#6c757d', fontWeight: '500' },
    chipTextActive: { color: '#fff' },
    yearRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    goalFormBtns: { flexDirection: 'row', gap: 10 },
    goalSubmitBtn: { flex: 1, backgroundColor: '#1ca8eb', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    goalSubmitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    goalCancelBtn: { flex: 1, backgroundColor: '#f8f9fa', paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#dee2e6' },
    goalCancelBtnText: { color: '#6c757d', fontWeight: '600', fontSize: 15 },
    // Actions
    actionRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 16 },
    actionBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
    depositBtn: { backgroundColor: 'rgba(80, 200, 120, 0.2)' },
    withdrawBtn: { backgroundColor: 'rgba(255, 100, 100, 0.15)' },
    activeBtnBorder: { borderColor: '#343a40' },
    actionBtnText: { fontWeight: '600', color: '#343a40', fontSize: 14 },
    // History
    historyTitle: { fontSize: 16, fontWeight: '700', color: '#343a40', paddingHorizontal: 20, marginTop: 8, marginBottom: 10 },
    emptyText: { textAlign: 'center', color: '#adb5bd', marginTop: 20, fontSize: 14 },
    txRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#fff',
        marginHorizontal: 20,
        marginBottom: 8,
        padding: 14,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
    },
    txLeft: { flex: 1 },
    txTitle: { fontSize: 15, fontWeight: '500', color: '#212529' },
    txDate: { fontSize: 12, color: '#adb5bd', marginTop: 2 },
    txRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    txAmount: { fontSize: 16, fontWeight: '700' },
    depositText: { color: '#28a745' },
    withdrawText: { color: '#dc3545' },
    deleteBtn: { color: '#adb5bd', fontSize: 16, padding: 4 },
});
