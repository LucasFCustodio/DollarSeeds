/**
 * PiggyBankScreen — visual revamp (DollarSeeds design system)
 *
 * Behaviour preserved:
 * ✅ Fetch balance, history, active goals, completed goals on focus
 * ✅ POST deposit / withdrawal to /savings/transaction/
 * ✅ PATCH goal to completed on withdrawal with a linked goal
 * ✅ POST new goal to /savings/goal/
 * ✅ DELETE transaction + DELETE goal
 * ✅ Negative-balance alert on withdrawal
 * ✅ Active / Completed tabs
 */
import React, { useState, useCallback } from 'react';
import {
    View, Text, ScrollView, Pressable,
    TextInput, StyleSheet, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';

import { useAuth } from '../../context/AuthContext';
import { useTheme, shadow } from '../../context/ThemeContext';
import HeroBg from '../../components/ui/HeroBg';
import AnimatedAmount from '../../components/ui/AnimatedAmount';
import AnimatedProgressBar from '../../components/ui/AnimatedProgressBar';
import Card from '../../components/ui/Card';
import {
    SavingsJar, IconPlus, IconArrow, IconTarget,
    IconTrash, IconCheck,
} from '../../components/icons';

// ─── Constants ────────────────────────────────────────────────────────────────
const BASE = 'http://10.0.0.13:8000';
const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];
const MONTH_ABBRS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Types ────────────────────────────────────────────────────────────────────
type Transaction = {
    id: number; title: string; amount: number;
    type: 'deposit' | 'withdrawal'; day: number; month: string;
};
type Goal = {
    id: number; title: string; target_amount: number;
    target_month: string; target_year: number;
    allocated_amount: number; created_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getDeadline = (m: string, y: number) => new Date(y, MONTHS.indexOf(m) + 1, 0);

const getMonthsLeft = (m: string, y: number) =>
    Math.max(0, Math.ceil((getDeadline(m, y).getTime() - Date.now()) / (30 * 86_400_000)));

const getWeeklyRate = (target: number, allocated: number, m: string, y: number, createdAt: string) => {
    const remaining = Math.max(0, target - allocated);
    const totalDays = Math.max(1, Math.ceil(
        (getDeadline(m, y).getTime() - new Date(createdAt).getTime()) / 86_400_000
    ));
    return (remaining / totalDays) * 7;
};

const fmtAmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ─── Component ────────────────────────────────────────────────────────────────
export default function PiggyBankScreen() {
    const { user } = useAuth();
    const { theme } = useTheme();
    const today = new Date();

    // ── Remote data ───────────────────────────────────────────────────────────
    const [balance, setBalance]               = useState(0);
    const [history, setHistory]               = useState<Transaction[]>([]);
    const [goals, setGoals]                   = useState<Goal[]>([]);
    const [completedGoals, setCompletedGoals] = useState<Goal[]>([]);

    // ── UI state ──────────────────────────────────────────────────────────────
    const [activeTab,    setActiveTab]    = useState<'active' | 'completed'>('active');
    const [activeForm,   setActiveForm]   = useState<'deposit' | 'withdrawal' | null>(null);
    const [showGoalForm, setShowGoalForm] = useState(false);

    // Transaction form
    const [txAmount, setTxAmount] = useState('');
    const [txGoalId, setTxGoalId] = useState<number | null>(null);

    // Goal creation form
    const [goalTitle,  setGoalTitle]  = useState('');
    const [goalAmount, setGoalAmount] = useState('');
    const [goalMonth,  setGoalMonth]  = useState(MONTHS[today.getMonth()]);
    const [goalYear,   setGoalYear]   = useState(today.getFullYear());
    const [goalError,  setGoalError]  = useState('');

    // ── Fetch ─────────────────────────────────────────────────────────────────
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
        } catch (e) { console.error('Savings fetch error:', e); }
    };

    useFocusEffect(useCallback(() => { fetchData(); }, []));

    // ── Handlers ──────────────────────────────────────────────────────────────
    const toggleForm = (type: 'deposit' | 'withdrawal') => {
        if (activeForm === type) {
            setActiveForm(null); setTxAmount(''); setTxGoalId(null);
        } else {
            setActiveForm(type); setTxAmount(''); setTxGoalId(null);
        }
    };

    const doSubmitTransaction = async () => {
        const parsed = parseFloat(txAmount);
        if (!txAmount || isNaN(parsed) || parsed <= 0) return;

        const selectedGoal = goals.find(g => g.id === txGoalId) ?? null;

        try {
            await axios.post(`${BASE}/savings/transaction/`, {
                user_id: user?.id,
                title: selectedGoal?.title ?? (activeForm === 'deposit' ? 'Deposit' : 'Withdrawal'),
                amount: parsed,
                type: activeForm,
                day: today.getDate(),
                month: MONTHS[today.getMonth()],
                goal_id: txGoalId ?? null,
            });
            if (activeForm === 'withdrawal' && selectedGoal) {
                await axios.patch(`${BASE}/savings/goal/${selectedGoal.id}/complete?user_id=${user?.id}`);
            }
            setTxAmount(''); setTxGoalId(null); setActiveForm(null);
            fetchData();
        } catch (err) { console.error('Transaction error:', err); }
    };

    const submitTransaction = () => {
        const parsed = parseFloat(txAmount);
        if (!txAmount || isNaN(parsed) || parsed <= 0) return;
        if (activeForm === 'withdrawal' && parsed > balance) {
            Alert.alert(
                'Heads up!',
                `You only have $${balance.toFixed(2)} saved. Your balance will go negative.\n\nAre you sure?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Continue', style: 'destructive', onPress: doSubmitTransaction },
                ],
            );
        } else {
            doSubmitTransaction();
        }
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
                user_id: user?.id, title: goalTitle.trim(),
                target_amount: amount, target_month: goalMonth, target_year: goalYear,
            });
            setShowGoalForm(false); setGoalTitle(''); setGoalAmount('');
            fetchData();
        } catch (error: any) {
            if (error?.response?.status === 400) setGoalError('A goal with this name already exists.');
            else console.error('Goal create error:', error);
        }
    };

    const deleteTransaction = async (id: number) => {
        try {
            await axios.delete(`${BASE}/savings/transaction/${id}?user_id=${user?.id}`);
            setHistory(prev => prev.filter(t => t.id !== id));
            const balRes = await axios.get(`${BASE}/savings/balance/?user_id=${user?.id}`);
            setBalance(balRes.data.balance);
        } catch (e) { console.error('Delete transaction error:', e); }
    };

    const deleteGoal = async (id: number) => {
        try {
            await axios.delete(`${BASE}/savings/goal/${id}?user_id=${user?.id}`);
            setGoals(prev => prev.filter(g => g.id !== id));
        } catch (e) { console.error('Delete goal error:', e); }
    };

    // Jar fill: use first goal target as max, fallback $3,000
    const jarMax = goals.length > 0 ? goals[0].target_amount : 3000;
    const jarFill = balance > 0 ? Math.min(1, balance / jarMax) : 0.05;
    const isDeposit = activeForm === 'deposit';

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.bg }}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            {/* ── Hero ─────────────────────────────────────────────── */}
            <HeroBg brand={theme.brand} brand2={theme.brand2} style={{ paddingBottom: 50 }}>
                <View style={[styles.heroInner, { zIndex: 1 }]}>

                    {/* Top row: label + plus btn */}
                    <View style={styles.heroTopRow}>
                        <Text style={styles.heroEyebrow}>SAVINGS</Text>
                        <Pressable
                            onPress={() => {
                                setShowGoalForm(true);
                                setActiveForm(null);
                            }}
                            style={({ pressed }) => [styles.circleBtn, pressed && { opacity: 0.7 }]}
                        >
                            <IconPlus size={18} color="#fff" />
                        </Pressable>
                    </View>

                    {/* Jar + balance */}
                    <View style={styles.jarRow}>
                        <SavingsJar fill={jarFill} size={92} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.heroBalanceLabel}>SEEDS PLANTED</Text>
                            <AnimatedAmount value={balance} size={48} color="#fff" decimals={2} />
                            <Text style={styles.heroTagline}>Little by little, it grows</Text>
                        </View>
                    </View>

                    {/* Action buttons */}
                    <View style={styles.actionRow}>
                        <Pressable
                            onPress={() => toggleForm('deposit')}
                            style={({ pressed }) => [
                                styles.actionBtn,
                                {
                                    backgroundColor: activeForm === 'deposit'
                                        ? 'rgba(255,255,255,0.28)'
                                        : 'rgba(255,255,255,0.16)',
                                    borderColor: 'rgba(255,255,255,0.22)',
                                },
                                pressed && { opacity: 0.85 },
                            ]}
                        >
                            <IconPlus size={15} color="#fff" />
                            <Text style={styles.actionBtnText}>Set aside</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => toggleForm('withdrawal')}
                            style={({ pressed }) => [
                                styles.actionBtn,
                                {
                                    backgroundColor: activeForm === 'withdrawal'
                                        ? 'rgba(255,255,255,0.22)'
                                        : 'rgba(0,0,0,0.18)',
                                    borderColor: 'rgba(255,255,255,0.18)',
                                },
                                pressed && { opacity: 0.85 },
                            ]}
                        >
                            <Text style={styles.actionBtnText}>I bought it</Text>
                        </Pressable>
                    </View>

                </View>
            </HeroBg>

            <View style={styles.content}>

                {/* ── Inline transaction form ───────────────────────── */}
                {activeForm !== null && (
                    <Card theme={theme} depth={5} padding={20} style={styles.txForm}>
                        <Text style={[styles.formTitle, { color: theme.ink }]}>
                            {isDeposit ? 'Set aside money' : 'I bought it'}
                        </Text>

                        {/* Amount */}
                        <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>AMOUNT</Text>
                        <View style={[styles.amountInputRow, {
                            backgroundColor: theme.surfaceSoft, borderColor: theme.border,
                        }]}>
                            <Text style={[styles.dollarSign, { color: theme.ink2 }]}>$</Text>
                            <TextInput
                                style={[styles.amountField, { color: theme.ink }]}
                                value={txAmount}
                                onChangeText={setTxAmount}
                                placeholder="0"
                                placeholderTextColor={theme.ink3}
                                keyboardType="decimal-pad"
                                returnKeyType="done"
                                selectionColor={theme.brand}
                            />
                        </View>

                        {/* Goal chips */}
                        {goals.length > 0 && (
                            <>
                                <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>
                                    {isDeposit ? 'WHICH GOAL' : 'GOAL COMPLETED'}
                                </Text>
                                <View style={styles.chipWrap}>
                                    {goals.map(g => {
                                        const active = txGoalId === g.id;
                                        return (
                                            <Pressable
                                                key={g.id}
                                                onPress={() => setTxGoalId(active ? null : g.id)}
                                                style={({ pressed }) => [
                                                    styles.chip,
                                                    {
                                                        backgroundColor: active ? theme.goals : theme.surface,
                                                        borderColor: active ? theme.goals : theme.border,
                                                    },
                                                    pressed && { opacity: 0.8 },
                                                ]}
                                            >
                                                <Text style={[
                                                    styles.chipText,
                                                    { color: active ? '#fff' : theme.ink2 },
                                                ]}>
                                                    {g.title}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </>
                        )}

                        {/* Submit / Cancel */}
                        <View style={styles.formBtnRow}>
                            <Pressable
                                onPress={submitTransaction}
                                style={({ pressed }) => [
                                    styles.submitBtn,
                                    { backgroundColor: isDeposit ? theme.goals : theme.danger },
                                    pressed && { opacity: 0.85 },
                                ]}
                            >
                                <IconCheck size={15} color="#fff" />
                                <Text style={styles.submitBtnText}>
                                    {isDeposit ? 'Plant Seed' : 'Withdraw'}
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={() => { setActiveForm(null); setTxAmount(''); setTxGoalId(null); }}
                                style={({ pressed }) => [
                                    styles.cancelBtn, { borderColor: theme.border },
                                    pressed && { opacity: 0.7 },
                                ]}
                            >
                                <Text style={[styles.cancelBtnText, { color: theme.ink2 }]}>Cancel</Text>
                            </Pressable>
                        </View>
                    </Card>
                )}

                {/* ── Tabs ─────────────────────────────────────────── */}
                <View style={[styles.tabPill, {
                    backgroundColor: theme.surfaceSoft,
                    borderColor: theme.borderSoft,
                }]}>
                    {(['active', 'completed'] as const).map(t => (
                        <Pressable
                            key={t}
                            onPress={() => setActiveTab(t)}
                            style={[
                                styles.tabItem,
                                activeTab === t && [
                                    styles.tabItemActive,
                                    { backgroundColor: theme.surface, ...(shadow(2) as object) },
                                ],
                            ]}
                        >
                            <Text style={[
                                styles.tabText,
                                { color: activeTab === t ? theme.ink : theme.ink3 },
                            ]}>
                                {t === 'active'
                                    ? 'Active goals'
                                    : `Completed${completedGoals.length > 0 ? ` (${completedGoals.length})` : ''}`}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {activeTab === 'completed' ? (

                    /* ── Completed goals ─────────────────────────── */
                    <View style={{ marginTop: 16 }}>
                        {completedGoals.length === 0 ? (
                            <Text style={[styles.emptyText, { color: theme.ink3 }]}>
                                No completed goals yet. Keep saving!
                            </Text>
                        ) : completedGoals.map(g => (
                            <Card key={g.id} theme={theme} depth={4} padding={16} style={{ marginBottom: 12 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={[styles.goalIconTile, { backgroundColor: theme.goalsSoft }]}>
                                        <IconCheck size={18} color={theme.goals} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.goalTitle, { color: theme.goals }]}>{g.title}</Text>
                                        <Text style={[styles.goalMeta, { color: theme.ink3 }]}>
                                            ${fmtAmt(g.allocated_amount)} of ${fmtAmt(g.target_amount)} · {g.target_month} {g.target_year}
                                        </Text>
                                    </View>
                                </View>
                            </Card>
                        ))}
                    </View>

                ) : (

                    /* ── Active goals ────────────────────────────── */
                    <>
                        <Text style={[styles.sectionLabel, { color: theme.ink3, marginTop: 18 }]}>
                            GROWING NOW
                        </Text>

                        {goals.length === 0 && !showGoalForm && (
                            <Text style={[styles.emptyText, { color: theme.ink3 }]}>
                                No goals yet. Plant your first one!
                            </Text>
                        )}

                        {goals.map(g => {
                            const pct = Math.min(100, (g.allocated_amount / g.target_amount) * 100);
                            const monthsLeft = getMonthsLeft(g.target_month, g.target_year);
                            const weekly = getWeeklyRate(
                                g.target_amount, g.allocated_amount,
                                g.target_month, g.target_year, g.created_at,
                            );
                            const achieved = g.allocated_amount >= g.target_amount;
                            const barColor = achieved ? theme.success : theme.goals;

                            return (
                                <Card key={g.id} theme={theme} depth={5} padding={16} style={{ marginBottom: 12 }}>
                                    {/* Header row */}
                                    <View style={styles.goalHeader}>
                                        <View style={[styles.goalIconTile, { backgroundColor: theme.goalsSoft }]}>
                                            <IconTarget size={22} color={achieved ? theme.success : theme.goals} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.goalTitle, { color: theme.ink }]}>{g.title}</Text>
                                            {achieved ? (
                                                <Text style={[styles.goalMeta, { color: theme.success }]}>
                                                    Goal achieved! 🎉
                                                </Text>
                                            ) : (
                                                <Text style={[styles.goalMeta, { color: theme.ink3 }]}>
                                                    Save ${weekly.toFixed(0)}/week · {monthsLeft}mo left
                                                </Text>
                                            )}
                                        </View>
                                        <Pressable onPress={() => deleteGoal(g.id)} hitSlop={10}>
                                            <IconTrash size={14} color={theme.ink3} />
                                        </Pressable>
                                    </View>

                                    {/* Saved / target */}
                                    <View style={styles.goalAmtRow}>
                                        <Text style={[styles.goalSaved, { color: theme.ink }]}>
                                            ${fmtAmt(g.allocated_amount)}
                                        </Text>
                                        <Text style={[styles.goalOf, { color: theme.ink3 }]}>
                                            {' '}of ${fmtAmt(g.target_amount)}
                                        </Text>
                                    </View>

                                    <AnimatedProgressBar
                                        value={pct}
                                        color={barColor}
                                        bg={theme.borderSoft}
                                        height={7}
                                    />
                                </Card>
                            );
                        })}

                        {/* Plant new goal */}
                        <Pressable
                            onPress={() => { setShowGoalForm(!showGoalForm); setGoalError(''); }}
                            style={({ pressed }) => [
                                styles.plantBtn, { borderColor: theme.border },
                                pressed && { opacity: 0.7 },
                            ]}
                        >
                            <IconPlus size={16} color={theme.brand} />
                            <Text style={[styles.plantBtnText, { color: theme.brand }]}>
                                Plant a new goal
                            </Text>
                        </Pressable>

                        {/* Goal creation form */}
                        {showGoalForm && (
                            <Card theme={theme} depth={4} padding={18} style={{ marginBottom: 16 }}>
                                <Text style={[styles.formTitle, { color: theme.ink }]}>New savings goal</Text>

                                <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>GOAL NAME</Text>
                                <TextInput
                                    style={[styles.textInput, {
                                        backgroundColor: theme.surfaceSoft,
                                        borderColor: theme.border,
                                        color: theme.ink,
                                    }]}
                                    placeholder="Emergency fund, New laptop…"
                                    placeholderTextColor={theme.ink3}
                                    value={goalTitle}
                                    onChangeText={t => { setGoalTitle(t); setGoalError(''); }}
                                    maxLength={30}
                                />
                                {goalError !== '' && (
                                    <Text style={[styles.errorText, { color: theme.danger }]}>{goalError}</Text>
                                )}

                                <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>TARGET AMOUNT</Text>
                                <TextInput
                                    style={[styles.textInput, {
                                        backgroundColor: theme.surfaceSoft,
                                        borderColor: theme.border,
                                        color: theme.ink,
                                    }]}
                                    placeholder="5,000"
                                    placeholderTextColor={theme.ink3}
                                    value={goalAmount}
                                    onChangeText={setGoalAmount}
                                    keyboardType="decimal-pad"
                                    maxLength={10}
                                />

                                <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>TARGET MONTH</Text>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    style={{ marginBottom: 14 }}
                                    contentContainerStyle={{ flexDirection: 'row', gap: 8 }}
                                >
                                    {MONTH_ABBRS.map((abbr, i) => {
                                        const active = goalMonth === MONTHS[i];
                                        return (
                                            <Pressable
                                                key={abbr}
                                                onPress={() => setGoalMonth(MONTHS[i])}
                                                style={[
                                                    styles.chip,
                                                    {
                                                        backgroundColor: active ? theme.brand : theme.surface,
                                                        borderColor: active ? theme.brand : theme.border,
                                                    },
                                                ]}
                                            >
                                                <Text style={[styles.chipText, { color: active ? '#fff' : theme.ink2 }]}>
                                                    {abbr}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>

                                <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>TARGET YEAR</Text>
                                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                                    {[today.getFullYear(), today.getFullYear() + 1, today.getFullYear() + 2].map(y => {
                                        const active = goalYear === y;
                                        return (
                                            <Pressable
                                                key={y}
                                                onPress={() => setGoalYear(y)}
                                                style={[
                                                    styles.chip,
                                                    {
                                                        backgroundColor: active ? theme.brand : theme.surface,
                                                        borderColor: active ? theme.brand : theme.border,
                                                    },
                                                ]}
                                            >
                                                <Text style={[styles.chipText, { color: active ? '#fff' : theme.ink2 }]}>
                                                    {y}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                <View style={styles.formBtnRow}>
                                    <Pressable
                                        onPress={submitGoal}
                                        style={({ pressed }) => [
                                            styles.submitBtn, { backgroundColor: theme.brand },
                                            pressed && { opacity: 0.85 },
                                        ]}
                                    >
                                        <IconCheck size={15} color="#fff" />
                                        <Text style={styles.submitBtnText}>Save Goal</Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={() => { setShowGoalForm(false); setGoalError(''); }}
                                        style={({ pressed }) => [
                                            styles.cancelBtn, { borderColor: theme.border },
                                            pressed && { opacity: 0.7 },
                                        ]}
                                    >
                                        <Text style={[styles.cancelBtnText, { color: theme.ink2 }]}>Cancel</Text>
                                    </Pressable>
                                </View>
                            </Card>
                        )}
                    </>
                )}

                {/* ── Recent activity ──────────────────────────────── */}
                <Text style={[styles.sectionLabel, { color: theme.ink3, marginTop: 24 }]}>
                    RECENT ACTIVITY
                </Text>

                {history.length === 0 && (
                    <Text style={[styles.emptyText, { color: theme.ink3 }]}>
                        No transactions yet. Start saving!
                    </Text>
                )}

                {history.map(tx => (
                    <Card key={tx.id} theme={theme} depth={2} padding={14} style={{ marginBottom: 8 }}>
                        <View style={styles.txRow}>
                            <View style={[
                                styles.txIconTile,
                                {
                                    backgroundColor: tx.type === 'deposit'
                                        ? theme.goalsSoft
                                        : theme.dangerSoft,
                                },
                            ]}>
                                <IconArrow
                                    size={16}
                                    color={tx.type === 'deposit' ? theme.goals : theme.danger}
                                    dir={tx.type === 'deposit' ? 'down' : 'up'}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.txTitle, { color: theme.ink }]}>{tx.title}</Text>
                                <Text style={[styles.txDate, { color: theme.ink3 }]}>
                                    {tx.month.slice(0, 3)} {tx.day}
                                </Text>
                            </View>
                            <Text style={[
                                styles.txAmt,
                                { color: tx.type === 'deposit' ? theme.success : theme.danger },
                            ]}>
                                {tx.type === 'deposit' ? '+' : '−'}${tx.amount.toFixed(2)}
                            </Text>
                            <Pressable onPress={() => deleteTransaction(tx.id)} hitSlop={10}>
                                <IconTrash size={14} color={theme.ink3} />
                            </Pressable>
                        </View>
                    </Card>
                ))}

            </View>
        </ScrollView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    // Hero
    heroInner: {
        paddingHorizontal: 22,
        paddingTop: 52,
    },
    heroTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    heroEyebrow: {
        color: 'rgba(255,255,255,0.7)',
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: 11,
        letterSpacing: 1.6,
    },
    circleBtn: {
        width: 38,
        height: 38,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    jarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 18,
        marginBottom: 22,
    },
    heroBalanceLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: 11,
        letterSpacing: 1.6,
        marginBottom: 2,
    },
    heroTagline: {
        color: 'rgba(255,255,255,0.7)',
        fontFamily: 'InstrumentSerif-Italic',
        fontSize: 12,
        marginTop: 4,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 10,
    },
    actionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
    },
    actionBtnText: {
        color: '#fff',
        fontFamily: 'Geist-SemiBold',
        fontSize: 13,
    },

    // Content wrapper
    content: {
        paddingHorizontal: 18,
        paddingTop: 24,
    },

    // Transaction form
    txForm: {
        marginBottom: 20,
    },
    formTitle: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: 20,
        letterSpacing: -0.3,
        marginBottom: 16,
    },
    fieldLabel: {
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: 10,
        letterSpacing: 1.6,
        marginBottom: 8,
        marginTop: 2,
    },
    amountInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 14,
        marginBottom: 16,
    },
    dollarSign: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: 22,
        marginRight: 4,
    },
    amountField: {
        flex: 1,
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: 32,
        lineHeight: 44,
        paddingVertical: 10,
        letterSpacing: -0.5,
    },
    chipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 18,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
    },
    chipText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 12,
    },
    formBtnRow: {
        flexDirection: 'row',
        gap: 10,
    },
    submitBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        paddingVertical: 13,
        borderRadius: 12,
    },
    submitBtnText: {
        color: '#fff',
        fontFamily: 'Geist-SemiBold',
        fontSize: 14,
    },
    cancelBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 13,
        borderRadius: 12,
        borderWidth: 1,
    },
    cancelBtnText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 14,
    },

    // Tabs
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
        fontSize: 13,
        textTransform: 'capitalize',
    },

    // Section label
    sectionLabel: {
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: 10,
        letterSpacing: 1.6,
        marginBottom: 10,
    },

    // Goal cards
    goalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    goalIconTile: {
        width: 42,
        height: 42,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    goalTitle: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 14,
        letterSpacing: -0.1,
    },
    goalMeta: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: 11,
        marginTop: 2,
    },
    goalAmtRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 8,
    },
    goalSaved: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: 26,
        letterSpacing: -0.5,
    },
    goalOf: {
        fontFamily: 'Geist-Regular',
        fontSize: 13,
    },

    // Plant new goal button
    plantBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderRadius: 14,
        paddingVertical: 14,
        marginBottom: 12,
    },
    plantBtnText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 13,
    },

    // Goal creation form inputs
    textInput: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        fontFamily: 'Geist-Regular',
        marginBottom: 14,
    },
    errorText: {
        fontFamily: 'Geist-Regular',
        fontSize: 12,
        marginTop: -10,
        marginBottom: 10,
        fontStyle: 'italic',
    },

    // Transaction history
    txRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    txIconTile: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    txTitle: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 13,
    },
    txDate: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: 11,
        marginTop: 2,
    },
    txAmt: {
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: 14,
    },

    // Empty state
    emptyText: {
        fontFamily: 'InstrumentSerif-Italic',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 12,
        marginBottom: 16,
    },
});
