import { View, Text, StyleSheet, ScrollView, Modal, TouchableOpacity } from 'react-native';
import React, { useState, useCallback, useRef } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from "axios"
import Button from "../../components/ui/Button"
import { useAuth } from '../../context/AuthContext';
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
    const [currentMonth, setCurrentMonth] = useState("April")
    const [monthIndex, setMonthIndex] = useState(3)
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

    const [dashboardData, setDashboardData] = useState<DashboardData>({
        total_income: 0,
        budgets: { needs: 0, wants: 0, goals: 0 },
        expenses: { needs: 0, wants: 0, goals: 0 },
        compliance_score: { overall: null, needs: 10, wants: 10, goals: 10 }
    })
    const [piggyBankBalance, setPiggyBankBalance] = useState(0)
    const [showScriptureModal, setShowScriptureModal] = useState(false)
    const [currentVerse, setCurrentVerse] = useState(VERSES[0])
    // Track which months have already shown the verse this session
    const verseShownMonthsRef = useRef<Set<string>>(new Set())

    useFocusEffect(
        useCallback(() => {
            fetchDashboardData();
        }, [currentMonth])
    );

    const decreaseMonth = () => {
        const newIndex = monthIndex === 0 ? 11 : monthIndex - 1;
        setMonthIndex(newIndex);
        setCurrentMonth(months[newIndex]);
    }

    const increaseMonth = () => {
        const newIndex = monthIndex === 11 ? 0 : monthIndex + 1;
        setMonthIndex(newIndex);
        setCurrentMonth(months[newIndex]);
    }

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) console.error("Error logging out:", error.message);
    };

    const fetchDashboardData = async () => {
        try {
            const BASE = `http://10.0.0.13:8000`;
            const [dashRes, piggyRes] = await Promise.all([
                axios.get(`${BASE}/dashboard/${currentMonth}?user_id=${user?.id}`),
                axios.get(`${BASE}/savings/balance/?user_id=${user?.id}`),
            ]);
            const data: DashboardData = dashRes.data;
            setDashboardData(data);
            setPiggyBankBalance(piggyRes.data.balance);

            // Show faith verse when all 3 categories are under budget for this month
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
            if (error instanceof Error) {
                console.error("Error fetching dashboard data:", error.message);
            } else {
                console.error("An unexpected error occurred:", error);
            }
        }
    };

    const calculateProgress = (spent: number, budget: number) => {
        if (!budget || budget == 0) return "0%"
        const percentage = (spent / budget) * 100
        return `${Math.min(percentage, 100)}%`;
    };

    const checkOverspend = (spent: number, budget: number) => {
        if (!budget || budget == 0) return false
        return (spent / budget) * 100 > 100;
    }

    const getScoreColor = (score: number | null) => {
        if (score === null) return '#adb5bd';
        if (score >= 8.0) return '#28a745';
        if (score >= 5.0) return '#ffc107';
        return '#dc3545';
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

    return (
        <ScrollView style={styles.container}>

            {/* Faith Verse Modal */}
            <Modal visible={showScriptureModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalEmoji}>🙏</Text>
                        <Text style={styles.modalTitle}>Well done, faithful steward!</Text>
                        <Text style={styles.modalVerse}>"{currentVerse.text}"</Text>
                        <Text style={styles.modalRef}>— {currentVerse.ref}</Text>
                        <TouchableOpacity style={styles.modalBtn} onPress={() => setShowScriptureModal(false)}>
                            <Text style={styles.modalBtnText}>Amen!</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Top Header Section */}
            <View style={styles.header}>
                <View style={{ width: '100%', alignItems: 'flex-end', marginBottom: 10 }}>
                    <Button
                        label="Logout"
                        rgbaColor="#f51127c0"
                        width="30%"
                        padding="8"
                        font="14"
                        onPress={handleLogout}
                    />
                </View>

                <View style={styles.monthContainer}>
                    <Button
                        label="<"
                        rgbaColor="rgba(28, 168, 235, 0.8)"
                        width={45}
                        padding="10"
                        font="20"
                        onPress={decreaseMonth}
                    />
                    <Text style={styles.headerTitle}>{currentMonth} Overview</Text>
                    <Button
                        label=">"
                        rgbaColor="rgba(28, 168, 235, 0.8)"
                        width={45}
                        padding="10"
                        font="20"
                        onPress={increaseMonth}
                    />
                </View>

                <Text style={styles.totalAmount}>${dashboardData.total_income}</Text>
                <Text style={styles.subText}>Total Income Available</Text>

                {/* Compliance Score Card */}
                <View style={[styles.scoreCard, { borderColor: scoreColor }]}>
                    <View style={styles.scoreRow}>
                        <Text style={styles.scoreLabel}>Budget Health</Text>
                        <Text style={[styles.scoreValue, { color: scoreColor }]}>
                            {score !== null ? `${score} / 10` : '—'}
                        </Text>
                    </View>
                    {score !== null && (
                        <View style={styles.scoreBarBg}>
                            <View style={[styles.scoreBarFill, {
                                width: `${(score / 10) * 100}%` as any,
                                backgroundColor: scoreColor
                            }]} />
                        </View>
                    )}
                    <Text style={[styles.scoreHint, { color: scoreColor }]}>{getScoreLabel(score)}</Text>
                </View>

                <View style={styles.headerButtons}>
                    <Button
                        label="View Logged Income"
                        rgbaColor="rgba(28, 168, 235, 0.8)"
                        width="80%"
                        padding="13"
                        font="17"
                        onPress={() => router.push({
                            pathname: "/details",
                            params: { category: null, month: currentMonth, type: "income" }
                        })}
                    />
                    <Button
                        label="📊 Spending Trends"
                        rgbaColor="rgba(108, 117, 125, 0.85)"
                        width="80%"
                        padding="10"
                        font="15"
                        onPress={() => router.push("/trends" as any)}
                    />
                </View>
            </View>

            {/* 50/30/20 Breakdown Cards */}
            <View style={styles.cardsContainer}>

                {/* 50% Needs */}
                <View style={[styles.card, { borderTopColor: '#ff9d5c' }]}>
                    <Text style={styles.cardTitle}>50% Needs</Text>
                    <Text style={styles.cardAmount}>${dashboardData.expenses.needs} / ${dashboardData.budgets.needs}</Text>
                    <View style={styles.progressBarBackground}>
                        <View style={[styles.progressBarFill, {
                            backgroundColor: checkOverspend(dashboardData.expenses.needs, dashboardData.budgets.needs) ? '#FF0000' : "#ff9d5c",
                            width: calculateProgress(dashboardData.expenses.needs, dashboardData.budgets.needs) as any
                        }]} />
                    </View>
                    <Text style={styles.cardSubText}>Budgeted</Text>
                    <Button
                        label="View Need Expenses"
                        rgbaColor="#ff9d5c"
                        width="90%"
                        padding="10"
                        font="15"
                        onPress={() => router.push({
                            pathname: "/details",
                            params: { category: "Needs", month: currentMonth, type: "expense" }
                        })}
                    />
                </View>

                {/* 30% Wants */}
                <View style={[styles.card, { borderTopColor: '#4ECDC4' }]}>
                    <Text style={styles.cardTitle}>30% Wants</Text>
                    <Text style={styles.cardAmount}>${dashboardData.expenses.wants} / ${dashboardData.budgets.wants}</Text>
                    <View style={styles.progressBarBackground}>
                        <View style={[styles.progressBarFill, {
                            backgroundColor: checkOverspend(dashboardData.expenses.wants, dashboardData.budgets.wants) ? '#FF0000' : "#4ECDC4",
                            width: calculateProgress(dashboardData.expenses.wants, dashboardData.budgets.wants) as any
                        }]} />
                    </View>
                    <Text style={styles.cardSubText}>Budgeted</Text>
                    <Button
                        label="View Want Expenses"
                        rgbaColor="#4ECDC4"
                        width="90%"
                        padding="10"
                        font="15"
                        onPress={() => router.push({
                            pathname: "/details",
                            params: { category: "Wants", month: currentMonth, type: "expense" }
                        })}
                    />
                </View>

                {/* 20% Goals (Debt + Piggy Bank) */}
                <View style={[styles.card, { borderTopColor: '#FFE66D' }]}>
                    <Text style={styles.cardTitle}>20% Goals</Text>
                    <Text style={styles.cardAmount}>${dashboardData.expenses.goals} / ${dashboardData.budgets.goals}</Text>
                    <View style={styles.progressBarBackground}>
                        <View style={[styles.progressBarFill, {
                            backgroundColor: checkOverspend(dashboardData.expenses.goals, dashboardData.budgets.goals) ? '#FF0000' : "#FFE66D",
                            width: calculateProgress(dashboardData.expenses.goals, dashboardData.budgets.goals) as any
                        }]} />
                    </View>
                    <Text style={styles.cardSubText}>Debt Spending</Text>
                    <Text style={styles.piggyBankLine}>🐷 Piggy Bank: ${piggyBankBalance.toFixed(2)}</Text>
                    <Button
                        label="View Debt Expenses"
                        rgbaColor="#FFE66D"
                        width="90%"
                        padding="10"
                        font="15"
                        onPress={() => router.push({
                            pathname: "/details",
                            params: { category: "Goals", month: currentMonth, type: "expense" }
                        })}
                    />
                    <Button
                        label="Open Piggy Bank 🐷"
                        rgbaColor="rgba(255, 200, 80, 0.85)"
                        width="90%"
                        padding="10"
                        font="15"
                        onPress={() => router.push("/(tabs)/piggyBank" as any)}
                    />
                </View>

            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    header: {
        backgroundColor: '#ffffff',
        padding: 30,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        marginTop: 20,
        marginBottom: 20,
    },
    monthContainer: {
        flexDirection: 'row',
        justifyContent: "space-around",
        alignItems: 'center',
        width: "100%"
    },
    headerTitle: {
        fontSize: 16,
        color: '#6c757d',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    totalAmount: {
        fontSize: 48,
        fontWeight: 'bold',
        color: '#212529',
        marginVertical: 10,
    },
    subText: { fontSize: 14, color: '#6c757d' },
    scoreCard: {
        width: '90%',
        borderWidth: 1.5,
        borderRadius: 10,
        padding: 12,
        marginVertical: 14,
        backgroundColor: '#f8f9fa',
    },
    scoreRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    scoreLabel: {
        fontSize: 13,
        color: '#6c757d',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    scoreValue: { fontSize: 22, fontWeight: 'bold' },
    scoreBarBg: {
        height: 8,
        backgroundColor: '#e9ecef',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 6,
    },
    scoreBarFill: { height: '100%', borderRadius: 4 },
    scoreHint: { fontSize: 12, fontStyle: 'italic' },
    headerButtons: { width: '100%', alignItems: 'center', gap: 8, marginTop: 4 },
    cardsContainer: { paddingHorizontal: 20, gap: 15, paddingBottom: 30 },
    card: {
        backgroundColor: '#ffffff',
        padding: 20,
        borderRadius: 12,
        borderTopWidth: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    cardTitle: { fontSize: 18, fontWeight: '600', color: '#343a40', marginBottom: 8 },
    cardAmount: { fontSize: 24, fontWeight: 'bold', color: '#212529' },
    cardSubText: { fontSize: 12, color: '#adb5bd', marginTop: 4 },
    progressBarBackground: {
        height: 10,
        backgroundColor: '#e9ecef',
        borderRadius: 5,
        marginVertical: 12,
        width: '100%',
        overflow: 'hidden',
    },
    progressBarFill: { height: '100%', borderRadius: 5 },
    piggyBankLine: { fontSize: 15, fontWeight: '600', color: '#a07800', marginBottom: 10 },
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
    },
    modalCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 28,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 8,
    },
    modalEmoji: { fontSize: 44, marginBottom: 10 },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#212529',
        marginBottom: 14,
        textAlign: 'center',
    },
    modalVerse: {
        fontSize: 15,
        color: '#495057',
        fontStyle: 'italic',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 10,
    },
    modalRef: { fontSize: 13, fontWeight: '600', color: '#6c757d', marginBottom: 20 },
    modalBtn: {
        backgroundColor: 'rgba(28, 168, 235, 0.85)',
        paddingVertical: 12,
        paddingHorizontal: 36,
        borderRadius: 8,
    },
    modalBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
