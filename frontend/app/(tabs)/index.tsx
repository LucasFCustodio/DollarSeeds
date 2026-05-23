import { View, Text, StyleSheet, ScrollView, Modal, Pressable } from 'react-native';
import DollarSeedsLogo from '../../assets/images/DollarSeeds-logo.svg';
import React, { useState, useCallback, useRef } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';

const VERSES = [
    { text: "The wise store up choice food and olive oil, but fools gulp theirs down.", ref: "Proverbs 21:20" },
    { text: "Whoever can be trusted with very little can also be trusted with much.", ref: "Luke 16:10" },
    { text: "Dishonest money dwindles away, but whoever gathers money little by little makes it grow.", ref: "Proverbs 13:11" },
    { text: "Honor the Lord with your wealth, with the firstfruits of all your crops; then your barns will be filled to overflowing.", ref: "Proverbs 3:9-10" },
    { text: "Remember the Lord your God, for it is he who gives you the ability to produce wealth.", ref: "Deuteronomy 8:18" },
    { text: "Seek first the kingdom of God and his righteousness, and all these things will be given to you.", ref: "Matthew 6:33" },
    { text: "And my God will meet all your needs according to the riches of his glory in Christ Jesus.", ref: "Philippians 4:19" },
    { text: "The rich rule over the poor, and the borrower is slave to the lender.", ref: "Proverbs 22:7" },
];

interface DashboardData {
    total_income: number;
    budgets: { needs: number; wants: number; goals: number; };
    expenses: { needs: number; wants: number; goals: number; };
    compliance_score: { overall: number | null; needs: number; wants: number; goals: number; };
}

export default function DashboardScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { theme, isDark, toggleTheme } = useTheme();

    const [currentMonth, setCurrentMonth] = useState('April');
    const [monthIndex, setMonthIndex] = useState(3);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    const [dashboardData, setDashboardData] = useState<DashboardData>({
        total_income: 0,
        budgets: { needs: 0, wants: 0, goals: 0 },
        expenses: { needs: 0, wants: 0, goals: 0 },
        compliance_score: { overall: null, needs: 10, wants: 10, goals: 10 },
    });
    const [piggyBankBalance, setPiggyBankBalance] = useState(0);
    const [showScriptureModal, setShowScriptureModal] = useState(false);
    const [currentVerse, setCurrentVerse] = useState(VERSES[0]);
    const verseShownMonthsRef = useRef<Set<string>>(new Set());

    useFocusEffect(
        useCallback(() => { fetchDashboardData(); }, [currentMonth])
    );

    const decreaseMonth = () => {
        const i = monthIndex === 0 ? 11 : monthIndex - 1;
        setMonthIndex(i); setCurrentMonth(months[i]);
    };
    const increaseMonth = () => {
        const i = monthIndex === 11 ? 0 : monthIndex + 1;
        setMonthIndex(i); setCurrentMonth(months[i]);
    };

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) console.error('Error logging out:', error.message);
    };

    const fetchDashboardData = async () => {
        if (!user?.id) return;
        try {
            const BASE = 'http://10.0.0.13:8000';
            const [dashRes, piggyRes] = await Promise.all([
                axios.get(`${BASE}/dashboard/${currentMonth}?user_id=${user?.id}`),
                axios.get(`${BASE}/savings/balance/?user_id=${user?.id}`),
            ]);
            const data: DashboardData = dashRes.data;
            setDashboardData(data);
            setPiggyBankBalance(piggyRes.data.balance);

            const allGreen =
                data.total_income > 0 &&
                data.expenses.needs <= data.budgets.needs &&
                data.expenses.wants <= data.budgets.wants &&
                data.expenses.goals <= data.budgets.goals;

            if (allGreen && !verseShownMonthsRef.current.has(currentMonth)) {
                verseShownMonthsRef.current.add(currentMonth);
                setCurrentVerse(VERSES[Math.floor(Math.random() * VERSES.length)]);
                setShowScriptureModal(true);
            }
        } catch (error) {
            if (error instanceof Error) console.error('Error fetching dashboard data:', error.message);
        }
    };

    const calculateProgress = (spent: number, budget: number) => {
        if (!budget || budget === 0) return '0%';
        return `${Math.min((spent / budget) * 100, 100)}%`;
    };

    const checkOverspend = (spent: number, budget: number) =>
        budget > 0 && (spent / budget) * 100 > 100;

    const getScoreColor = (score: number | null) => {
        if (score === null) return theme.textMuted;
        if (score >= 8.0) return theme.success;
        if (score >= 5.0) return theme.needs;
        return theme.danger;
    };

    const getScoreLabel = (score: number | null) => {
        if (score === null) return 'Log income to see your score';
        if (score >= 9.0) return 'Excellent stewardship!';
        if (score >= 7.0) return 'Good discipline — keep it up';
        if (score >= 5.0) return 'Some areas need attention';
        return 'Budget needs adjustment';
    };

    const score = dashboardData.compliance_score?.overall ?? null;
    const scoreColor = getScoreColor(score);

    const categories = [
        {
            key: 'needs' as const,
            label: '50% Needs',
            color: theme.needs,
            softColor: theme.needsSoft,
            spent: dashboardData.expenses.needs,
            budget: dashboardData.budgets.needs,
            btnLabel: 'View Need Expenses',
        },
        {
            key: 'wants' as const,
            label: '30% Wants',
            color: theme.wants,
            softColor: theme.wantsSoft,
            spent: dashboardData.expenses.wants,
            budget: dashboardData.budgets.wants,
            btnLabel: 'View Want Expenses',
        },
        {
            key: 'goals' as const,
            label: '20% Goals',
            color: theme.goals,
            softColor: theme.goalsSoft,
            spent: dashboardData.expenses.goals,
            budget: dashboardData.budgets.goals,
            btnLabel: 'View Debt Expenses',
        },
    ];

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>

            {/* Faith Verse Modal */}
            <Modal visible={showScriptureModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
                        <Text style={styles.modalEmoji}>🙏</Text>
                        <Text style={[styles.modalTitle, { color: theme.text }]}>Well done, faithful steward!</Text>
                        <Text style={[styles.modalVerse, { color: theme.textSecondary }]}>"{currentVerse.text}"</Text>
                        <Text style={[styles.modalRef, { color: theme.textMuted }]}>— {currentVerse.ref}</Text>
                        <Button
                            label="Amen!"
                            variant="primary"
                            size="lg"
                            fullWidth
                            onPress={() => setShowScriptureModal(false)}
                        />
                    </View>
                </View>
            </Modal>

            {/* Logo — scrolls with content, not sticky */}
            <View style={[styles.logoRow, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
                <DollarSeedsLogo width={36} height={36} />
                <Text style={[styles.appName, { color: theme.text }]}>DollarSeeds</Text>

                {/* Top-right controls */}
                <View style={styles.headerControls}>
                    <Pressable
                        onPress={toggleTheme}
                        style={[styles.iconBtn, { backgroundColor: theme.inputBg }]}
                    >
                        <Text style={styles.iconBtnText}>{isDark ? '☀️' : '🌙'}</Text>
                    </Pressable>
                    <Pressable
                        onPress={handleLogout}
                        style={[styles.iconBtn, { backgroundColor: theme.dangerSoft }]}
                    >
                        <Text style={[styles.iconBtnLabel, { color: theme.danger }]}>Logout</Text>
                    </Pressable>
                </View>
            </View>

            {/* Month navigator + income hero */}
            <View style={[styles.heroCard, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
                <View style={styles.monthRow}>
                    <Pressable
                        onPress={decreaseMonth}
                        style={[styles.monthBtn, { backgroundColor: theme.actionSoft }]}
                    >
                        <Text style={[styles.monthBtnText, { color: theme.action }]}>‹</Text>
                    </Pressable>
                    <Text style={[styles.monthLabel, { color: theme.textSecondary }]}>
                        {currentMonth.toUpperCase()}
                    </Text>
                    <Pressable
                        onPress={increaseMonth}
                        style={[styles.monthBtn, { backgroundColor: theme.actionSoft }]}
                    >
                        <Text style={[styles.monthBtnText, { color: theme.action }]}>›</Text>
                    </Pressable>
                </View>

                <Text style={[styles.totalAmount, { color: theme.text }]}>
                    ${dashboardData.total_income.toLocaleString()}
                </Text>
                <Text style={[styles.totalLabel, { color: theme.textMuted }]}>Total Income Available</Text>

                {/* Budget Health Score */}
                <View style={[styles.scoreCard, { backgroundColor: theme.background, borderColor: scoreColor }]}>
                    <View style={styles.scoreRow}>
                        <Text style={[styles.scoreLabel, { color: theme.textMuted }]}>Budget Health</Text>
                        <Text style={[styles.scoreValue, { color: scoreColor }]}>
                            {score !== null ? `${score} / 10` : '—'}
                        </Text>
                    </View>
                    {score !== null && (
                        <View style={[styles.scoreBarBg, { backgroundColor: theme.border }]}>
                            <View style={[styles.scoreBarFill, {
                                width: `${(score / 10) * 100}%` as any,
                                backgroundColor: scoreColor,
                            }]} />
                        </View>
                    )}
                    <Text style={[styles.scoreHint, { color: scoreColor }]}>{getScoreLabel(score)}</Text>
                </View>

                {/* Action buttons */}
                <View style={styles.heroButtons}>
                    <Button
                        label="View Logged Income"
                        variant="primary"
                        size="lg"
                        fullWidth
                        onPress={() => router.push({
                            pathname: '/details',
                            params: { category: null, month: currentMonth, type: 'income' },
                        })}
                    />
                    <Button
                        label="📊  Spending Trends"
                        variant="outline"
                        size="md"
                        fullWidth
                        onPress={() => router.push('/trends' as any)}
                    />
                </View>
            </View>

            {/* 50/30/20 Category Cards */}
            <View style={styles.cardsContainer}>
                {categories.map(cat => {
                    const overspent = checkOverspend(cat.spent, cat.budget);
                    const barColor = overspent ? theme.danger : cat.color;
                    const isGoals = cat.key === 'goals';

                    return (
                        <View
                            key={cat.key}
                            style={[styles.card, { backgroundColor: theme.surface, borderTopColor: cat.color }]}
                        >
                            {/* Category header */}
                            <View style={styles.cardHeader}>
                                <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                                <Text style={[styles.cardTitle, { color: theme.text }]}>{cat.label}</Text>
                            </View>

                            <Text style={[styles.cardAmount, { color: theme.text }]}>
                                ${cat.spent} <Text style={[styles.cardBudget, { color: theme.textMuted }]}>/ ${cat.budget}</Text>
                            </Text>

                            <View style={[styles.progressBarBg, { backgroundColor: theme.border }]}>
                                <View style={[styles.progressBarFill, {
                                    backgroundColor: barColor,
                                    width: calculateProgress(cat.spent, cat.budget) as any,
                                }]} />
                            </View>

                            <Text style={[styles.cardSubText, { color: theme.textMuted }]}>
                                {isGoals ? 'Debt Spending' : 'Budgeted'}
                            </Text>

                            {isGoals && (
                                <Text style={[styles.piggyLine, { color: theme.goals }]}>
                                    🐷 Piggy Bank: ${piggyBankBalance.toFixed(2)}
                                </Text>
                            )}

                            {/* Card action buttons */}
                            <View style={styles.cardButtons}>
                                <Button
                                    label={cat.btnLabel}
                                    variant="outline"
                                    size="md"
                                    fullWidth
                                    color={cat.color}
                                    onPress={() => router.push({
                                        pathname: '/details',
                                        params: {
                                            category: cat.key.charAt(0).toUpperCase() + cat.key.slice(1),
                                            month: currentMonth,
                                            type: 'expense',
                                        },
                                    })}
                                />
                                {isGoals && (
                                    <Button
                                        label="Open Piggy Bank 🐷"
                                        variant="ghost"
                                        size="md"
                                        fullWidth
                                        color={theme.goals}
                                        onPress={() => router.push('/(tabs)/piggyBank' as any)}
                                    />
                                )}
                            </View>
                        </View>
                    );
                })}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },

    // Logo row
    logoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 52,
        paddingBottom: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 10,
    },

    appName: { fontSize: 20, fontWeight: '700', flex: 1 },
    headerControls: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    iconBtn: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconBtnText: { fontSize: 16 },
    iconBtnLabel: { fontSize: 13, fontWeight: '600' },

    // Hero card
    heroCard: {
        padding: 24,
        alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth,
        marginBottom: 16,
    },
    monthRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        marginBottom: 16,
    },
    monthBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    monthBtnText: { fontSize: 24, lineHeight: 28, fontWeight: '300' },
    monthLabel: { fontSize: 14, fontWeight: '700', letterSpacing: 1.5, minWidth: 120, textAlign: 'center' },
    totalAmount: { fontSize: 52, fontWeight: '800', letterSpacing: -1 },
    totalLabel: { fontSize: 13, marginBottom: 16 },

    // Score card
    scoreCard: {
        width: '100%',
        borderWidth: 1.5,
        borderRadius: 12,
        padding: 14,
        marginBottom: 20,
    },
    scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    scoreLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    scoreValue: { fontSize: 22, fontWeight: '800' },
    scoreBarBg: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
    scoreBarFill: { height: '100%', borderRadius: 3 },
    scoreHint: { fontSize: 12, fontStyle: 'italic' },

    heroButtons: { width: '100%', gap: 10 },

    // Budget category cards
    cardsContainer: { paddingHorizontal: 16, gap: 14, paddingBottom: 32 },
    card: {
        borderRadius: 14,
        borderTopWidth: 4,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    categoryDot: { width: 10, height: 10, borderRadius: 5 },
    cardTitle: { fontSize: 17, fontWeight: '700' },
    cardAmount: { fontSize: 26, fontWeight: '800', marginBottom: 2 },
    cardBudget: { fontSize: 18, fontWeight: '400' },
    progressBarBg: { height: 8, borderRadius: 4, overflow: 'hidden', marginVertical: 10 },
    progressBarFill: { height: '100%', borderRadius: 4 },
    cardSubText: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    piggyLine: { fontSize: 14, fontWeight: '600', marginBottom: 10 },
    cardButtons: { gap: 8, marginTop: 6 },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 28,
    },
    modalCard: {
        borderRadius: 18,
        padding: 28,
        alignItems: 'center',
        width: '100%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 10,
        gap: 8,
    },
    modalEmoji: { fontSize: 48, marginBottom: 4 },
    modalTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
    modalVerse: { fontSize: 15, fontStyle: 'italic', textAlign: 'center', lineHeight: 22 },
    modalRef: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
});
