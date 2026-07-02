/**
 * PiggyBankScreen — General Savings + Goal Funding Source
 *
 * Behaviour:
 * ✅ Fetch balance, history, active goals, completed goals on focus
 * ✅ General Savings goal auto-seeded on first load (pinned card, no delete)
 * ✅ POST deposit / withdrawal to /savings/transaction/ (source='income')
 * ✅ POST transfer from General Savings → specific goal to /savings/transfer/
 * ✅ Funding source chips shown when depositing to a specific (non-general) goal
 * ✅ PATCH goal to completed on withdrawal with a linked goal
 * ✅ POST new goal to /savings/goal/
 * ✅ DELETE transaction + DELETE goal (with current_month redistribution)
 * ✅ Negative-balance alert on withdrawal
 * ✅ Active / Completed tabs
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    View, Text, ScrollView, Pressable,
    TextInput, StyleSheet, Alert,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import axios from 'axios';

import { useAuth } from '../../context/AuthContext';
import { useTheme, shadow } from '../../context/ThemeContext';
import { useAnalytics } from '../../lib/analytics';
import HeroBg from '../../components/ui/HeroBg';
import AnimatedAmount from '../../components/ui/AnimatedAmount';
import AnimatedProgressBar from '../../components/ui/AnimatedProgressBar';
import Card from '../../components/ui/Card';
import {
    SavingsJar, IconPlus, IconArrow, IconSavingsGoalMascot, IconDebtMascot,
    IconTrash, IconCheck, IconSavings,
} from '../../components/icons';

// ─── Constants ────────────────────────────────────────────────────────────────
const BASE = 'https://dollarseeds-1.onrender.com';
const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];
const MONTH_ABBRS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Types ────────────────────────────────────────────────────────────────────
type Transaction = {
    id: number; title: string; amount: number;
    type: 'deposit' | 'withdrawal'; day: number; month: string;
    source?: string;
    // Set by the backend when this entry is a collapsed General Savings → goal
    // transfer (both legs share a transfer_group). Deleting it removes both legs.
    is_transfer?: boolean;
};
type Goal = {
    id: number; title: string;
    target_amount: number | null;
    target_month: string | null;
    target_year: number | null;
    allocated_amount: number; created_at: string;
    is_general: boolean;
    goal_type: 'saving' | 'debt';
    // Auto-managed Reconciliation debt goal (rollover feature). When present,
    // `outstanding` = money you'd saved but later spent, still to be repaid.
    is_reconciliation?: boolean;
    outstanding?: number;
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
    const analytics = useAnalytics();
    const today = new Date();
    const currentMonth = MONTHS[today.getMonth()];

    // ── Remote data ───────────────────────────────────────────────────────────
    const [balance, setBalance]               = useState(0);
    const [history, setHistory]               = useState<Transaction[]>([]);
    const [goals, setGoals]                   = useState<Goal[]>([]);        // specific goals only
    const [generalGoal, setGeneralGoal]       = useState<Goal | null>(null); // pinned General Savings
    const [reconGoal, setReconGoal]           = useState<Goal | null>(null); // auto-managed Reconciliation debt
    const [completedGoals, setCompletedGoals] = useState<Goal[]>([]);

    // ── UI state ──────────────────────────────────────────────────────────────
    const [activeTab,    setActiveTab]    = useState<'active' | 'completed'>('active');
    const [activeForm,   setActiveForm]   = useState<'deposit' | 'withdrawal' | null>(null);
    const [showGoalForm, setShowGoalForm] = useState(false);

    // Transaction form
    const [txAmount,      setTxAmount]      = useState('');
    const [txGoalId,      setTxGoalId]      = useState<number | null>(null);
    // 'income' = this month's income · 'general' = transfer from General Savings ·
    // a month name = fund from that earlier open month's leftover income.
    const [fundingSource, setFundingSource] = useState<string>('income');
    // Earlier OPEN months with > $0 income, eligible as funding sources (task: let a
    // goal be funded from a prior month's leftover income, booked to that month).
    const [fundingMonths, setFundingMonths] = useState<{ month: string; income: number }[]>([]);

    // Goal creation form
    const [goalType,   setGoalType]   = useState<'saving' | 'debt'>('saving');
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
            const allGoals: Goal[] = goalRes.data.data ?? [];
            setGeneralGoal(allGoals.find(g => g.is_general) ?? null);
            setReconGoal(allGoals.find(g => g.is_reconciliation) ?? null);
            // Specific goals exclude both the pinned General Savings and the
            // auto-managed Reconciliation goal (each rendered in its own card).
            setGoals(allGoals.filter(g => !g.is_general && !g.is_reconciliation));
            setCompletedGoals(completedRes.data.data);
        } catch (e) { console.error('Savings fetch error:', e); }

        // Funding months is an optional enhancement (prior-month goal funding). Fetch
        // it separately so a failure — e.g. an older backend without this endpoint —
        // can never break the core Goals tab load. Degrades to "this month's income".
        try {
            const fundRes = await axios.get(
                `${BASE}/income/funding-months/?user_id=${user?.id}&current_month=${currentMonth}`
            );
            setFundingMonths(fundRes.data.data ?? []);
        } catch (e) { setFundingMonths([]); }
    };

    useFocusEffect(useCallback(() => { fetchData(); }, []));

    // Pre-fill + open the goal form when arriving from a suggestion
    // (e.g. Firm Foundation "Set these up" in Settings). Fires once per arrival.
    const params = useLocalSearchParams();
    const prefilledRef = useRef(false);
    useEffect(() => {
        if (params.createGoal && !prefilledRef.current) {
            prefilledRef.current = true;
            if (params.goalType === 'debt' || params.goalType === 'saving') setGoalType(params.goalType);
            if (typeof params.title === 'string' && params.title) setGoalTitle(params.title);
            if (typeof params.amount === 'string' && params.amount) setGoalAmount(params.amount);
            setShowGoalForm(true);
        }
    }, [params.createGoal]);

    // ── Derived ───────────────────────────────────────────────────────────────
    // All goals shown as chips in the form (General Savings first, then specific goals).
    // Both savings and debt goals are valid deposit/transfer destinations, so this
    // intentionally includes every non-general goal regardless of goal_type.
    // The Reconciliation goal only matters while there's a balance still owed.
    const reconOutstanding = reconGoal?.outstanding ?? 0;
    const reconActive = !!reconGoal && reconOutstanding > 0;

    const allGoalsForChips: Goal[] = [
        ...(generalGoal ? [generalGoal] : []),
        ...goals,
        // Allow paying down the Reconciliation debt like any other goal.
        ...(reconActive ? [reconGoal as Goal] : []),
    ];

    // Split specific goals by type for the two grouped sections in the Active view.
    const savingsGoals = goals.filter(g => g.goal_type !== 'debt');
    const debtGoals    = goals.filter(g => g.goal_type === 'debt');

    // Jar fill: use first specific goal's target; fallback $3,000
    const firstGoalWithTarget = goals.find(g => g.target_amount);
    const jarMax = firstGoalWithTarget?.target_amount ?? 3000;
    const jarFill = balance > 0 ? Math.min(1, balance / jarMax) : 0.05;
    const isDeposit = activeForm === 'deposit';

    // Is the currently-selected goal the General Savings pool?
    const isGeneralSelected = txGoalId !== null && txGoalId === generalGoal?.id;

    // Funding options when depositing to a SPECIFIC (non-general) goal:
    //  • this month's income (always)
    //  • each earlier OPEN month with leftover income (booked to that month)
    //  • General Savings, when it holds money to draw from
    const generalHasMoney = (generalGoal?.allocated_amount ?? 0) > 0;
    const fundingOptions: { key: string; label: string }[] = [
        { key: 'income', label: "This month's income" },
        ...fundingMonths.map(m => ({ key: m.month, label: `${m.month} income ($${fmtAmt(m.income)})` })),
        ...(generalHasMoney
            ? [{ key: 'general', label: `From General Savings ($${fmtAmt(generalGoal?.allocated_amount ?? 0)})` }]
            : []),
    ];

    // Show the picker only when there's a real choice beyond "this month's income".
    const showFundingSource =
        isDeposit &&
        txGoalId !== null &&
        !isGeneralSelected &&
        fundingOptions.length > 1;

    // ── Handlers ──────────────────────────────────────────────────────────────
    const toggleForm = (type: 'deposit' | 'withdrawal') => {
        if (activeForm === type) {
            setActiveForm(null); setTxAmount(''); setTxGoalId(null); setFundingSource('income');
        } else {
            setActiveForm(type); setTxAmount(''); setTxGoalId(null); setFundingSource('income');
        }
    };

    const selectGoalChip = (id: number) => {
        const next = txGoalId === id ? null : id;
        setTxGoalId(next);
        // Reset funding source when goal selection changes
        setFundingSource('income');
    };

    const doSubmitTransaction = async () => {
        const parsed = parseFloat(txAmount);
        if (!txAmount || isNaN(parsed) || parsed <= 0) return;

        const selectedGoal = allGoalsForChips.find(g => g.id === txGoalId) ?? null;

        try {
            if (
                isDeposit &&
                fundingSource === 'general' &&
                txGoalId !== null &&
                !isGeneralSelected &&
                generalGoal !== null
            ) {
                // ── Transfer: General Savings → specific goal ──────────────
                await axios.post(`${BASE}/savings/transfer/`, {
                    user_id: user?.id,
                    amount: parsed,
                    to_goal_id: txGoalId,
                    general_goal_id: generalGoal.id,
                    day: today.getDate(),
                    month: currentMonth,
                    to_goal_title: selectedGoal?.title ?? 'Savings goal',
                });
                // Funding a specific goal via transfer (goal_id only, never the amount).
                if (selectedGoal?.goal_type === 'debt') {
                    analytics.debtGoalFunded({ goal_id: txGoalId });
                } else {
                    analytics.savingsGoalFunded({ goal_id: txGoalId });
                }
            } else {
                // ── Normal deposit / withdrawal ────────────────────────────
                // Funding a deposit from an earlier open month books it against that
                // month's Goals budget (fundingSource holds the month name). Otherwise
                // ('income') it lands in the current month, same as before.
                const bookMonth =
                    isDeposit && fundingSource !== 'income' && fundingSource !== 'general'
                        ? fundingSource
                        : currentMonth;
                await axios.post(`${BASE}/savings/transaction/`, {
                    user_id: user?.id,
                    title: selectedGoal?.title ?? (isDeposit ? 'Deposit' : 'Withdrawal'),
                    amount: parsed,
                    type: activeForm,
                    day: today.getDate(),
                    month: bookMonth,
                    goal_id: txGoalId ?? null,
                    source: 'income',
                });
                // A deposit into a specific (non-general, non-reconciliation) goal counts
                // as funding it — same event family as the transfer branch above.
                if (isDeposit && selectedGoal && !selectedGoal.is_general && !selectedGoal.is_reconciliation) {
                    if (selectedGoal.goal_type === 'debt') {
                        analytics.debtGoalFunded({ goal_id: selectedGoal.id });
                    } else {
                        analytics.savingsGoalFunded({ goal_id: selectedGoal.id });
                    }
                }
                // Mark goal complete on withdrawal (not for General Savings or the
                // auto-managed Reconciliation goal, which is never "completed" by hand)
                if (activeForm === 'withdrawal' && selectedGoal && !selectedGoal.is_general && !selectedGoal.is_reconciliation) {
                    await axios.patch(`${BASE}/savings/goal/${selectedGoal.id}/complete?user_id=${user?.id}`);
                    analytics.goalCompleted({ goal_id: selectedGoal.id, goal_type: selectedGoal.goal_type });
                }
            }
            setTxAmount(''); setTxGoalId(null); setActiveForm(null); setFundingSource('income');
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
                goal_type: goalType,
            });
            // Fire BEFORE the goalType reset below. No amounts — just which kind of goal.
            if (goalType === 'debt') analytics.debtGoalCreated();
            else analytics.savingsGoalCreated();
            setShowGoalForm(false); setGoalTitle(''); setGoalAmount(''); setGoalType('saving');
            fetchData();
        } catch (error: any) {
            if (error?.response?.status === 400) setGoalError('A goal with this name already exists.');
            else console.error('Goal create error:', error);
        }
    };

    // A 409 means the transaction's month is closed (rollover feature) — read-only
    // until the user reopens it from the dashboard.
    const deleteTransaction = async (tx: Transaction) => {
        try {
            await axios.delete(`${BASE}/savings/transaction/${tx.id}?user_id=${user?.id}`);
            // A transfer touches two goals' funded amounts (General Savings + the
            // destination), so refetch everything to keep the goal cards in sync.
            if (tx.is_transfer) { fetchData(); return; }
            setHistory(prev => prev.filter(t => t.id !== tx.id));
            const balRes = await axios.get(`${BASE}/savings/balance/?user_id=${user?.id}`);
            setBalance(balRes.data.balance);
        } catch (e: any) {
            if (e?.response?.status === 409) {
                Alert.alert('Month closed', `Cannot delete from closed month. Reopen ${tx.month} to edit`);
            } else { console.error('Delete transaction error:', e); }
        }
    };

    const deleteGoal = async (id: number) => {
        try {
            await axios.delete(
                `${BASE}/savings/goal/${id}?user_id=${user?.id}&current_month=${currentMonth}`
            );
            // Full refresh so General Savings balance updates if funds were redistributed
            fetchData();
        } catch (e: any) {
            if (e?.response?.status === 409) {
                Alert.alert('Month closed', `Cannot delete from closed month. Reopen ${currentMonth} to edit`);
            } else { console.error('Delete goal error:', e); }
        }
    };

    // Renders one active goal card. Savings and debt goals use identical mechanics
    // (progress = allocated / target, complete when fully funded); only the accent
    // color and verb differ so debt reads as "paying down" rather than "saving up".
    const renderGoalCard = (g: Goal) => {
        const isDebt = g.goal_type === 'debt';
        const accent     = isDebt ? theme.danger : theme.goals;
        const accentSoft = isDebt ? theme.dangerSoft : theme.goalsSoft;
        const target = g.target_amount ?? 0;
        const pct = target > 0 ? Math.min(100, (g.allocated_amount / target) * 100) : 0;
        const monthsLeft = g.target_month && g.target_year
            ? getMonthsLeft(g.target_month, g.target_year)
            : 0;
        const weekly = g.target_month && g.target_year
            ? getWeeklyRate(target, g.allocated_amount, g.target_month, g.target_year, g.created_at)
            : 0;
        const achieved = target > 0 && g.allocated_amount >= target;
        const barColor = achieved ? theme.success : accent;

        return (
            <Card key={g.id} theme={theme} depth={5} padding={16} style={{ marginBottom: 12 }}>
                {/* Header row */}
                <View style={styles.goalHeader}>
                    <View style={[styles.goalIconTile, { backgroundColor: accentSoft }]}>
                        {isDebt ? (
                            <IconDebtMascot size={22} accent={achieved ? theme.success : accent} paper={accentSoft} />
                        ) : (
                            <IconSavingsGoalMascot size={22} accent={achieved ? theme.success : accent} paper={accentSoft} />
                        )}
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.goalTitle, { color: theme.ink }]}>{g.title}</Text>
                        {achieved ? (
                            <Text style={[styles.goalMeta, { color: theme.success }]}>
                                {isDebt ? 'Debt cleared! 🎉' : 'Goal achieved! 🎉'}
                            </Text>
                        ) : (
                            <Text style={[styles.goalMeta, { color: theme.ink3 }]}>
                                {isDebt ? 'Pay' : 'Save'} ${weekly.toFixed(0)}/week · {monthsLeft}mo left
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
                        {' '}of ${fmtAmt(target)}{isDebt ? ' paid' : ''}
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
    };

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
                        {allGoalsForChips.length > 0 && (
                            <>
                                <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>
                                    {isDeposit ? 'WHICH GOAL' : 'GOAL COMPLETED'}
                                </Text>
                                <View style={styles.chipWrap}>
                                    {allGoalsForChips.map(g => {
                                        const active = txGoalId === g.id;
                                        return (
                                            <Pressable
                                                key={g.id}
                                                onPress={() => selectGoalChip(g.id)}
                                                style={({ pressed }) => [
                                                    styles.chip,
                                                    g.is_general && styles.chipGeneral,
                                                    {
                                                        backgroundColor: active
                                                            ? (g.is_general ? theme.brand : theme.goals)
                                                            : theme.surface,
                                                        borderColor: active
                                                            ? (g.is_general ? theme.brand : theme.goals)
                                                            : (g.is_general ? theme.brand : theme.border),
                                                    },
                                                    pressed && { opacity: 0.8 },
                                                ]}
                                            >
                                                <Text style={[
                                                    styles.chipText,
                                                    { color: active ? '#fff' : (g.is_general ? theme.brand : theme.ink2) },
                                                ]}>
                                                    {g.title}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </>
                        )}

                        {/* Funding source — only for deposits to a specific (non-general) goal */}
                        {showFundingSource && (
                            <>
                                <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>
                                    FUNDING SOURCE
                                </Text>
                                <View style={[styles.chipWrap, { marginBottom: 16 }]}>
                                    {fundingOptions.map(opt => {
                                        const active = fundingSource === opt.key;
                                        return (
                                            <Pressable
                                                key={opt.key}
                                                onPress={() => setFundingSource(opt.key)}
                                                style={({ pressed }) => [
                                                    styles.chip,
                                                    {
                                                        backgroundColor: active ? theme.brand : theme.surface,
                                                        borderColor: active ? theme.brand : theme.border,
                                                    },
                                                    pressed && { opacity: 0.8 },
                                                ]}
                                            >
                                                <Text style={[
                                                    styles.chipText,
                                                    { color: active ? '#fff' : theme.ink2 },
                                                ]}>
                                                    {opt.label}
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
                                    {isDeposit
                                        ? (fundingSource === 'general' ? 'Transfer' : 'Plant Seed')
                                        : 'Withdraw'
                                    }
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={() => {
                                    setActiveForm(null); setTxAmount('');
                                    setTxGoalId(null); setFundingSource('income');
                                }}
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
                                            ${fmtAmt(g.allocated_amount ?? 0)} of ${fmtAmt(g.target_amount ?? 0)} · {g.target_month} {g.target_year}
                                        </Text>
                                    </View>
                                </View>
                            </Card>
                        ))}
                    </View>

                ) : (

                    /* ── Active goals ────────────────────────────── */
                    <>
                        {/* ── Savings section ─────────────────────── */}
                        <Text style={[styles.sectionLabel, { color: theme.ink3, marginTop: 18 }]}>
                            SAVINGS
                        </Text>

                        {/* ── General Savings pinned card ────────── */}
                        {generalGoal && (
                            <Card
                                theme={theme}
                                depth={6}
                                padding={16}
                                style={[styles.generalCard, { borderColor: theme.brand }]}
                            >
                                <View style={styles.goalHeader}>
                                    <View style={[styles.goalIconTile, { backgroundColor: theme.brandSoft }]}>
                                        <IconSavings size={22} color={theme.brand} accent={theme.brand2} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.goalTitle, { color: theme.brand }]}>
                                            General Savings
                                        </Text>
                                        <Text style={[styles.goalMeta, { color: theme.ink3 }]}>
                                            ALWAYS ON · No target
                                        </Text>
                                    </View>
                                    {/* No delete button for General Savings */}
                                </View>
                                <View style={styles.goalAmtRow}>
                                    <Text style={[styles.goalSaved, { color: theme.brand }]}>
                                        ${fmtAmt(generalGoal.allocated_amount)}
                                    </Text>
                                    <Text style={[styles.goalOf, { color: theme.ink3 }]}>
                                        {' '}available
                                    </Text>
                                </View>
                            </Card>
                        )}

                        {savingsGoals.length === 0 && !showGoalForm && (
                            <Text style={[styles.emptyText, { color: theme.ink3 }]}>
                                No savings goals yet. Plant your first one!
                            </Text>
                        )}

                        {savingsGoals.map(renderGoalCard)}

                        {/* ── Debt section ────────────────────────── */}
                        <Text style={[styles.sectionLabel, { color: theme.ink3, marginTop: 24 }]}>
                            DEBT
                        </Text>

                        {/* Auto-managed Reconciliation goal — shown only while a balance
                            is owed. Money you'd already saved but later spent. */}
                        {reconActive && reconGoal && (() => {
                            const owed = reconGoal.target_amount ?? 0;
                            const repaid = reconGoal.allocated_amount ?? 0;
                            const pct = owed > 0 ? Math.min(100, (repaid / owed) * 100) : 0;
                            return (
                                <Card theme={theme} depth={5} padding={16} style={[styles.reconCard, { borderColor: theme.harvest }]}>
                                    <View style={styles.goalHeader}>
                                        <View style={[styles.goalIconTile, { backgroundColor: theme.dangerSoft }]}>
                                            <IconArrow size={20} color={theme.danger} dir="up" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <View style={styles.reconTitleRow}>
                                                <Text style={[styles.goalTitle, { color: theme.ink }]}>Reconciliation</Text>
                                                <View style={[styles.autoBadge, { backgroundColor: theme.harvest }]}>
                                                    <Text style={[styles.autoBadgeText, { color: theme.brand }]}>AUTO</Text>
                                                </View>
                                            </View>
                                            <Text style={[styles.reconExplain, { color: theme.ink2 }]}>
                                                Money you'd already saved but later spent — repay to restore your savings.
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.goalAmtRow}>
                                        <Text style={[styles.goalSaved, { color: theme.danger }]}>
                                            ${fmtAmt(reconOutstanding)}
                                        </Text>
                                        <Text style={[styles.goalOf, { color: theme.ink3 }]}>
                                            {' '}left to repay · ${fmtAmt(repaid)} of ${fmtAmt(owed)}
                                        </Text>
                                    </View>
                                    <AnimatedProgressBar
                                        value={pct}
                                        color={theme.success}
                                        bg={theme.borderSoft}
                                        height={7}
                                    />
                                </Card>
                            );
                        })()}

                        {debtGoals.length === 0 && !reconActive ? (
                            <Text style={[styles.emptyText, { color: theme.ink3 }]}>
                                No debts tracked. Add one to start paying it down!
                            </Text>
                        ) : debtGoals.map(renderGoalCard)}

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
                                <Text style={[styles.formTitle, { color: theme.ink }]}>
                                    {goalType === 'debt' ? 'New debt to pay off' : 'New savings goal'}
                                </Text>

                                {/* Goal type selector */}
                                <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>GOAL TYPE</Text>
                                <View style={[styles.chipWrap, { marginBottom: 16 }]}>
                                    {([
                                        { key: 'saving', label: 'Savings', accent: theme.goals },
                                        { key: 'debt',   label: 'Debt',    accent: theme.danger },
                                    ] as const).map(opt => {
                                        const active = goalType === opt.key;
                                        return (
                                            <Pressable
                                                key={opt.key}
                                                onPress={() => setGoalType(opt.key)}
                                                style={[
                                                    styles.chip,
                                                    {
                                                        backgroundColor: active ? opt.accent : theme.surface,
                                                        borderColor: active ? opt.accent : theme.border,
                                                    },
                                                ]}
                                            >
                                                <Text style={[styles.chipText, { color: active ? '#fff' : theme.ink2 }]}>
                                                    {opt.label}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>
                                    {goalType === 'debt' ? 'DEBT NAME' : 'GOAL NAME'}
                                </Text>
                                <TextInput
                                    style={[styles.textInput, {
                                        backgroundColor: theme.surfaceSoft,
                                        borderColor: theme.border,
                                        color: theme.ink,
                                    }]}
                                    placeholder={goalType === 'debt' ? 'Credit card, Car loan…' : 'Emergency fund, New laptop…'}
                                    placeholderTextColor={theme.ink3}
                                    value={goalTitle}
                                    onChangeText={t => { setGoalTitle(t); setGoalError(''); }}
                                    maxLength={30}
                                />
                                {goalError !== '' && (
                                    <Text style={[styles.errorText, { color: theme.danger }]}>{goalError}</Text>
                                )}

                                <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>
                                    {goalType === 'debt' ? 'TOTAL TO PAY OFF' : 'TARGET AMOUNT'}
                                </Text>
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
                            {/* A transfer is net-zero to the balance, so it renders in a
                                neutral brand color with no +/− sign — unlike deposits
                                (green, down) and withdrawals (red, up). */}
                            <View style={[
                                styles.txIconTile,
                                {
                                    backgroundColor: tx.is_transfer
                                        ? theme.brandSoft
                                        : tx.type === 'deposit'
                                            ? theme.goalsSoft
                                            : theme.dangerSoft,
                                },
                            ]}>
                                <IconArrow
                                    size={16}
                                    color={tx.is_transfer
                                        ? theme.brand2
                                        : tx.type === 'deposit' ? theme.goals : theme.danger}
                                    dir={tx.is_transfer ? 'right' : tx.type === 'deposit' ? 'down' : 'up'}
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
                                {
                                    color: tx.is_transfer
                                        ? theme.brand2
                                        : tx.type === 'deposit' ? theme.success : theme.danger,
                                },
                            ]}>
                                {tx.is_transfer ? '' : tx.type === 'deposit' ? '+' : '−'}${tx.amount.toFixed(2)}
                            </Text>
                            <Pressable onPress={() => deleteTransaction(tx)} hitSlop={10}>
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
    chipGeneral: {
        borderWidth: 1.5,
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

    // General Savings card
    generalCard: {
        marginBottom: 12,
        borderWidth: 1.5,
    },

    // Reconciliation (auto debt) card
    reconCard: {
        marginBottom: 12,
        borderWidth: 1.5,
    },
    reconTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    autoBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    autoBadgeText: { fontFamily: 'JetBrainsMono-SemiBold', fontSize: 8, letterSpacing: 1 },
    reconExplain: { fontFamily: 'Geist-Regular', fontSize: 11, marginTop: 3, lineHeight: 16 },

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
