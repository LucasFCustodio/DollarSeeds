/**
 * Dashboard — DollarSeeds visual identity revamp
 *
 * Behavior checklist (all preserved):
 * ✅ Month navigation fetches fresh data on change
 * ✅ allGreen scripture modal fires once per month
 * ✅ Dark-mode toggle via toggleTheme()
 * ✅ Logout via supabase.auth.signOut()
 * ✅ Category cards navigate to /details with correct params
 * ✅ Spending Trends navigates to /trends
 * ✅ Piggy bank balance shown in Goals expanded state
 * ✅ Category card expand/collapse (inline accordion)
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    Pressable,
    Modal,
    StyleSheet,
    LayoutAnimation,
    Platform,
    UIManager,
    ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';

import { useAuth } from '../../context/AuthContext';
import { useTheme, shadow } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import AnimatedProgressBar from '../../components/ui/AnimatedProgressBar';
import AnimatedAmount from '../../components/ui/AnimatedAmount';
import HeroBg from '../../components/ui/HeroBg';
import { resolveBudgetType, splitLabel } from '../../constants/budgetTypes';
import {
    IconLeaf, IconSparkle, IconMoon, IconSun, IconBell,
    IconChevronLeft, IconChevronRight,
    IconNeeds, IconWants, IconGoals,
    IconExpense, IconIncome,
    IconScripture, IconTrend, IconSavings, IconUser,
} from '../../components/icons';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface DashboardData {
    total_income: number;
    tithe?: { enabled: boolean; rate: number; amount: number };
    budget_type?: { key: string; needs: number; wants: number; savings: number };
    // Rollover (end-of-month close-out) state for the displayed month. Purely
    // informational — source='rollover' is excluded from every budget/score number.
    rollover?: { closed: boolean; closed_at: string | null; amount: number; target: number };
    budgets: { needs: number; wants: number; goals: number };
    expenses: { needs: number; wants: number; goals: number };
    compliance_score: { overall: number | null; needs: number; wants: number; goals: number };
}

// ─── Scripture verse pool ─────────────────────────────────────────────────────
const VERSES = [
    { text: "The wise store up choice food and olive oil, but fools gulp theirs down.", ref: "Proverbs 21:20" },
    { text: "Whoever can be trusted with very little can also be trusted with much.", ref: "Luke 16:10" },
    { text: "Dishonest money dwindles away, but whoever gathers money little by little makes it grow.", ref: "Proverbs 13:11" },
    { text: "Honor the Lord with your wealth, with the firstfruits of all your crops.", ref: "Proverbs 3:9-10" },
    { text: "Remember the Lord your God, for it is he who gives you the ability to produce wealth.", ref: "Deuteronomy 8:18" },
    { text: "Seek first the kingdom of God and his righteousness, and all these things will be given to you.", ref: "Matthew 6:33" },
    { text: "And my God will meet all your needs according to the riches of his glory in Christ Jesus.", ref: "Philippians 4:19" },
    { text: "The rich rule over the poor, and the borrower is slave to the lender.", ref: "Proverbs 22:7" },
    { text: "Little by little, it grows.", ref: "Proverbs 13:11" },
];

// ─── Helper ──────────────────────────────────────────────────────────────────
function fmt$(n: number, decimals = 0): string {
    return Number(n || 0).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

// ─── Month abbreviation lookup ────────────────────────────────────────────────
const MONTH_ABBR: Record<string, string> = {
    January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr',
    May: 'May', June: 'Jun', July: 'Jul', August: 'Aug',
    September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec',
};

// ─── Real transaction type (expenses/details + savings/history) ──────────────
interface TxItem {
    id: number | string;
    title: string;
    sub_category: string;
    amount: number;
    day: number;
    month: string;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DashboardScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { theme, isDark, toggleTheme } = useTheme();

    // Month state
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const [monthIndex, setMonthIndex] = useState(new Date().getMonth());
    const currentMonth = months[monthIndex];

    // Data state
    const [dashboardData, setDashboardData] = useState<DashboardData>({
        total_income: 0,
        budgets: { needs: 0, wants: 0, goals: 0 },
        expenses: { needs: 0, wants: 0, goals: 0 },
        compliance_score: { overall: null, needs: 10, wants: 10, goals: 10 },
    });
    const [piggyBankBalance, setPiggyBankBalance] = useState(0);

    // Scripture modal state
    const [showScriptureModal, setShowScriptureModal] = useState(false);
    const [currentVerse, setCurrentVerse] = useState(VERSES[0]);
    const verseShownMonthsRef = useRef<Set<string>>(new Set());

    // Accordion state — which category is expanded
    const [expandedCat, setExpandedCat] = useState<'needs' | 'wants' | 'goals' | null>(null);

    // Rollover close-out state
    const [closingMonth, setClosingMonth] = useState(false);
    const [dismissedCloseout, setDismissedCloseout] = useState<Set<string>>(new Set());

    // Real transaction rows for the expanded accordion (null = not yet fetched)
    const [categoryTxs, setCategoryTxs] = useState<Record<'needs' | 'wants' | 'goals', TxItem[] | null>>({
        needs: null, wants: null, goals: null,
    });

    // ── Data fetching ──────────────────────────────────────────────────────────
    useFocusEffect(
        useCallback(() => { fetchDashboardData(); }, [currentMonth])
    );

    // Reset accordion + transaction cache whenever the month changes
    useEffect(() => {
        setExpandedCat(null);
        setCategoryTxs({ needs: null, wants: null, goals: null });
    }, [monthIndex]);

    const decreaseMonth = () => {
        const i = monthIndex === 0 ? 11 : monthIndex - 1;
        setMonthIndex(i);
    };
    const increaseMonth = () => {
        const i = monthIndex === 11 ? 0 : monthIndex + 1;
        setMonthIndex(i);
    };

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) console.error('Error logging out:', error.message);
    };

    const fetchDashboardData = async () => {
        if (!user?.id) return;
        try {
            const BASE = 'https://dollarseeds-1.onrender.com';
            const [dashRes, piggyRes] = await Promise.all([
                axios.get(`${BASE}/dashboard/${currentMonth}?user_id=${user.id}`),
                axios.get(`${BASE}/savings/balance/?user_id=${user.id}`),
            ]);
            const data: DashboardData = dashRes.data;
            setDashboardData(data);
            setPiggyBankBalance(piggyRes.data.balance);

            // Scripture modal: fires once per month when all categories are green
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
            if (error instanceof Error) console.error('Dashboard fetch error:', error.message);
        }
    };

    const handleCloseMonth = async () => {
        if (!user?.id || closingMonth) return;
        setClosingMonth(true);
        try {
            const BASE = 'https://dollarseeds-1.onrender.com';
            await axios.post(`${BASE}/rollover/close/`, { user_id: user.id, month: currentMonth });
            await fetchDashboardData();
        } catch (err) {
            console.error('Close month error:', err);
        } finally {
            setClosingMonth(false);
        }
    };

    const handleReopenMonth = async () => {
        if (!user?.id || closingMonth) return;
        setClosingMonth(true);
        try {
            const BASE = 'https://dollarseeds-1.onrender.com';
            await axios.post(`${BASE}/rollover/reopen/`, { user_id: user.id, month: currentMonth });
            await fetchDashboardData();
        } catch (err) {
            console.error('Reopen month error:', err);
        } finally {
            setClosingMonth(false);
        }
    };

    const CAT_API_MAP = { needs: 'Needs', wants: 'Wants', goals: 'Goals' } as const;

    const fetchCategoryTxs = async (catKey: 'needs' | 'wants' | 'goals') => {
        if (!user?.id) return;
        try {
            const BASE = 'https://dollarseeds-1.onrender.com';

            if (catKey === 'goals') {
                // Goals = expense "Goals" rows + savings deposits — fetch both in parallel
                const [expRes, savRes] = await Promise.all([
                    axios.get(`${BASE}/expenses/details/`, {
                        params: { month: currentMonth, category: 'Goals', user_id: user.id },
                    }),
                    axios.get(`${BASE}/savings/history/`, {
                        params: { user_id: user.id, month: currentMonth },
                    }),
                ]);
                const expItems: TxItem[] = (expRes.data.data ?? []).map((i: any) => ({
                    id: i.id,
                    title: i.title || i.sub_category,
                    sub_category: i.sub_category,
                    amount: i.amount,
                    day: i.day,
                    month: i.month,
                }));
                const savItems: TxItem[] = (savRes.data.data ?? [])
                    // Only income-sourced deposits count toward the Goals budget;
                    // transfers between goals are internal moves (matches the Goals
                    // detail view in details.tsx).
                    .filter((i: any) => i.type === 'deposit' && i.source === 'income')
                    .map((i: any) => ({
                        id: `sav-${i.id}`,
                        title: i.title,
                        sub_category: 'Savings',
                        amount: i.amount,
                        day: i.day,
                        month: i.month,
                    }));
                const merged = [...expItems, ...savItems]
                    .sort((a, b) => b.day - a.day)
                    .slice(0, 3);
                setCategoryTxs(prev => ({ ...prev, goals: merged }));
            } else {
                const res = await axios.get(`${BASE}/expenses/details/`, {
                    params: { month: currentMonth, category: CAT_API_MAP[catKey], user_id: user.id },
                });
                const items: TxItem[] = (res.data.data ?? []).map((i: any) => ({
                    id: i.id,
                    title: i.title || i.sub_category,
                    sub_category: i.sub_category,
                    amount: i.amount,
                    day: i.day,
                    month: i.month,
                }));
                const sorted = [...items].sort((a, b) => b.day - a.day).slice(0, 3);
                setCategoryTxs(prev => ({ ...prev, [catKey]: sorted }));
            }
        } catch (err) {
            console.error('Category tx fetch error:', err);
            setCategoryTxs(prev => ({ ...prev, [catKey]: [] }));
        }
    };

    // ── Derived values ─────────────────────────────────────────────────────────
    const { total_income, budgets, expenses, compliance_score, tithe } = dashboardData;
    const titheActive = !!tithe?.enabled && (tithe?.amount ?? 0) > 0;
    const activeBudgetType = resolveBudgetType(dashboardData.budget_type?.key);

    // ── Rollover close-out visibility ──────────────────────────────────────────
    // A month is "closeable" once it's over. We never prompt for the in-progress
    // month; for the month that just ended we wait until a few days in (≥ 4th), and
    // older un-closed months can be closed anytime they have income.
    const rollover = dashboardData.rollover;
    const realMonthIdx = new Date().getMonth();
    const prevMonthIdx = (realMonthIdx + 11) % 12;
    const isDisplayedMonthClosed = !!rollover?.closed;
    const showClosePrompt =
        !!rollover &&
        !rollover.closed &&
        monthIndex !== realMonthIdx &&             // not the in-progress month
        total_income > 0 &&                        // hides empty future months
        !dismissedCloseout.has(currentMonth) &&
        !(monthIndex === prevMonthIdx && new Date().getDate() < 4); // give the new month a few days
    const totalSpent = expenses.needs + expenses.wants + expenses.goals;
    const totalLeft = Math.max(0, total_income - totalSpent);
    const score = compliance_score?.overall ?? null;

    const getScoreLabel = (s: number | null) => {
        if (s === null) return 'Log income to see your score';
        if (s >= 9.0) return 'Excellent stewardship!';
        if (s >= 7.0) return 'Good discipline — keep it up';
        if (s >= 5.0) return 'Some areas need attention';
        return 'Budget needs adjustment';
    };

    // ── Category definitions ───────────────────────────────────────────────────
    const categories = [
        {
            key: 'needs' as const,
            label: 'Needs',
            pct: '50%',
            Icon: IconNeeds,
            color: theme.needs,
            soft: theme.needsSoft,
            spent: expenses.needs,
            budget: budgets.needs,
            sub: 'Rent, groceries, bills',
            navType: 'expense' as const,
        },
        {
            key: 'wants' as const,
            label: 'Wants',
            pct: '30%',
            Icon: IconWants,
            color: theme.wants,
            soft: theme.wantsSoft,
            spent: expenses.wants,
            budget: budgets.wants,
            sub: 'Lifestyle, treats, fun',
            navType: 'expense' as const,
        },
        {
            key: 'goals' as const,
            label: 'Goals',
            pct: '20%',
            Icon: IconGoals,
            color: theme.goals,
            soft: theme.goalsSoft,
            spent: expenses.goals,
            budget: budgets.goals,
            sub: 'Savings + debt paydown',
            navType: 'expense' as const,
        },
    ];

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.bg }}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
        >
            {/* ── Scripture Modal (reskinned) ────────────────────────────── */}
            <Modal visible={showScriptureModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <Card theme={theme} depth={8} style={styles.modalCard}>
                        {/* Icon tile */}
                        <View style={[styles.modalIconTile, { backgroundColor: theme.brandSoft }]}>
                            <IconScripture size={28} color={theme.brand} />
                        </View>
                        <Text style={[styles.modalTitle, { color: theme.ink }]}>
                            Well done, faithful steward!
                        </Text>
                        <Text style={[styles.modalVerse, { color: theme.ink2 }]}>
                            "{currentVerse.text}"
                        </Text>
                        <Text style={[styles.modalRef, { color: theme.ink3 }]}>
                            — {currentVerse.ref}
                        </Text>
                        <Button
                            label="Amen!"
                            variant="primary"
                            size="lg"
                            fullWidth
                            color={theme.brand}
                            onPress={() => setShowScriptureModal(false)}
                        />
                    </Card>
                </View>
            </Modal>

            {/* ── Gradient Hero ──────────────────────────────────────────── */}
            <HeroBg brand={theme.brand} brand2={theme.brand2}>
                <View style={styles.heroInner}>

                    {/* Top row: logo + wordmark + controls */}
                    <View style={styles.heroTopRow}>
                        {/* Logo tile + wordmark */}
                        <View style={styles.logoGroup}>
                            <View style={[styles.logoTile, { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
                                <IconLeaf size={22} color="#fff" />
                            </View>
                            <View>
                                <Text style={styles.wordmark}>DollarSeeds</Text>
                                <Text style={styles.subline}>
                                    {user?.email?.split('@')[0] ?? 'steward'} · steward
                                </Text>
                            </View>
                        </View>

                        {/* Control buttons */}
                        <View style={styles.heroControls}>
                            {/* Settings (tithing, preferences) */}
                            <Pressable
                                onPress={() => router.push('/settings' as any)}
                                style={({ pressed }) => [styles.glassBtn, pressed && { opacity: 0.7 }]}
                            >
                                <IconUser size={18} color="#fff" />
                            </Pressable>
                            {/* Dark/light toggle */}
                            <Pressable
                                onPress={toggleTheme}
                                style={({ pressed }) => [styles.glassBtn, pressed && { opacity: 0.7 }]}
                            >
                                {isDark
                                    ? <IconSun size={18} color="#fff" />
                                    : <IconMoon size={18} color="#fff" />
                                }
                            </Pressable>
                            {/* Logout (bell icon — hold to see logout; tap shows "Sign out" alert) */}
                            <Pressable
                                onPress={handleLogout}
                                style={({ pressed }) => [styles.glassBtn, pressed && { opacity: 0.7 }]}
                            >
                                <IconBell size={18} color="#fff" />
                                {/* Yellow notification dot */}
                                <View style={styles.bellDot} />
                            </Pressable>
                        </View>
                    </View>

                    {/* Month navigation row */}
                    <View style={styles.monthRow}>
                        <Pressable
                            onPress={decreaseMonth}
                            style={({ pressed }) => [styles.monthChevron, pressed && { opacity: 0.7 }]}
                        >
                            <IconChevronLeft size={16} color="#fff" />
                        </Pressable>
                        <View style={styles.monthCenter}>
                            <Text style={styles.monthEyebrow}>BUDGET MONTH</Text>
                            <Text style={styles.monthLabel}>{currentMonth} {new Date().getFullYear()}</Text>
                        </View>
                        <Pressable
                            onPress={increaseMonth}
                            style={({ pressed }) => [styles.monthChevron, pressed && { opacity: 0.7 }]}
                        >
                            <IconChevronRight size={16} color="#fff" />
                        </Pressable>
                    </View>

                    {/* Big amount */}
                    <View style={{ marginTop: 10 }}>
                        <Text style={styles.incomeEyebrow}>
                            ${fmt$(total_income)} · TOTAL INCOME
                        </Text>
                        <AnimatedAmount
                            value={totalLeft}
                            size={64}
                            color="#fff"
                        />
                        <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={styles.leftChip}>
                                <Text style={styles.leftChipText}>left this month</Text>
                            </View>
                            <Pressable
                                onPress={() => router.push({
                                    pathname: '/details',
                                    params: { month: currentMonth, type: 'income' },
                                } as any)}
                                style={({ pressed }) => [styles.viewIncomeBtn, pressed && { opacity: 0.7 }]}
                            >
                                <Text style={styles.viewIncomeBtnText}>View all Income</Text>
                                <IconChevronRight size={11} color="rgba(255,255,255,0.85)" />
                            </Pressable>
                        </View>
                    </View>

                    {/* Budget health pill */}
                    <View style={styles.healthPill}>
                        <IconSparkle size={14} color={theme.harvest} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.healthTitle}>
                                Budget Health · {score !== null ? `${score}/10` : '—/10'}
                            </Text>
                            <Text style={styles.healthHint}>
                                {getScoreLabel(score)}
                            </Text>
                        </View>
                        <View style={styles.healthBarTrack}>
                            <View
                                style={[
                                    styles.healthBarFill,
                                    {
                                        width: `${score !== null ? (score / 10) * 100 : 0}%`,
                                        backgroundColor: theme.harvest,
                                    },
                                ]}
                            />
                        </View>
                    </View>
                </View>
            </HeroBg>

            {/* ── Content area (overlaps hero by 16px) ──────────────────── */}
            <View style={[styles.contentArea, { marginTop: -16 }]}>

                {/* Close-out prompt — nudge to roll last month's leftover into savings */}
                {showClosePrompt && (
                    <View style={[styles.rolloverCard, { backgroundColor: theme.surface, borderColor: theme.brand2, ...shadow(7) }]}>
                        <View style={styles.rolloverHeaderRow}>
                            <View style={[styles.rolloverIconTile, { backgroundColor: theme.brandSoft }]}>
                                <IconSavings size={22} color={theme.brand} accent={theme.brand2} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.rolloverTitle, { color: theme.ink }]}>
                                    Ready to close out {currentMonth}?
                                </Text>
                                <Text style={[styles.rolloverSub, { color: theme.ink2 }]}>
                                    You have ${fmt$(rollover?.target ?? 0, 2)} left to move into General Savings.
                                </Text>
                            </View>
                            <Pressable
                                onPress={() => setDismissedCloseout(prev => new Set(prev).add(currentMonth))}
                                hitSlop={10}
                                style={({ pressed }) => pressed && { opacity: 0.6 }}
                            >
                                <Text style={[styles.rolloverDismiss, { color: theme.ink3 }]}>✕</Text>
                            </Pressable>
                        </View>
                        <Button
                            label={closingMonth ? 'Closing…' : `Close out & save $${fmt$(rollover?.target ?? 0)}`}
                            variant="primary"
                            size="md"
                            fullWidth
                            color={theme.brand}
                            disabled={closingMonth}
                            onPress={handleCloseMonth}
                        />
                    </View>
                )}

                {/* Closed-month banner — show the rolled-over amount + a subtle reopen */}
                {isDisplayedMonthClosed && (
                    <View style={[styles.rolloverClosedCard, { backgroundColor: theme.surfaceSoft, borderColor: theme.borderSoft }]}>
                        <View style={[styles.rolloverIconTile, { backgroundColor: theme.goalsSoft }]}>
                            <IconSavings size={20} color={theme.goals} accent={theme.brand2} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.rolloverClosedTitle, { color: theme.ink }]}>
                                {currentMonth} is closed
                            </Text>
                            <Text style={[styles.rolloverSub, { color: theme.ink2 }]}>
                                ${fmt$(rollover?.amount ?? 0, 2)} rolled into General Savings.
                            </Text>
                        </View>
                        <Pressable
                            onPress={handleReopenMonth}
                            disabled={closingMonth}
                            style={({ pressed }) => [styles.reopenBtn, { borderColor: theme.border }, pressed && { opacity: 0.6 }]}
                        >
                            <Text style={[styles.reopenBtnText, { color: theme.brand }]}>
                                {closingMonth ? '…' : 'Reopen'}
                            </Text>
                        </Pressable>
                    </View>
                )}

                {/* Scripture banner */}
                <Card
                    theme={theme}
                    depth={3}
                    padding={14}
                    style={[styles.scriptureBanner, { backgroundColor: theme.surfaceSoft }]}
                >
                    <View style={styles.scriptureBannerInner}>
                        <View style={[styles.scriptureIconTile, { backgroundColor: theme.brandSoft }]}>
                            <IconScripture size={18} color={theme.brand} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.scriptureVerse, { color: theme.ink }]}>
                                "Little by little, it grows."
                            </Text>
                            <Text style={[styles.scriptureRef, { color: theme.ink3 }]}>
                                Proverbs 13:11
                            </Text>
                        </View>
                    </View>
                </Card>

                {/* Section header */}
                <View style={styles.sectionHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.sectionTitle, { color: theme.ink }]}>
                            How your seeds are growing
                        </Text>
                        {/* Active budget split driving these numbers (from the API) */}
                        <View style={styles.budgetTypeRow}>
                            <View style={[styles.budgetTypeDot, { backgroundColor: theme.brand }]} />
                            <Text style={[styles.budgetTypeText, { color: theme.ink3 }]}>
                                {activeBudgetType.name} · {splitLabel(activeBudgetType)}
                            </Text>
                        </View>
                    </View>
                    <Pressable
                        onPress={() => router.push('/trends' as any)}
                        style={({ pressed }) => [styles.trendsBtn, pressed && { opacity: 0.7 }]}
                    >
                        <IconTrend size={14} color={theme.brand} />
                        <Text style={[styles.trendsBtnText, { color: theme.brand }]}>Trends</Text>
                    </Pressable>
                </View>

                {/* Tithe envelope — carved out FIRST, shown above the 50/30/20 split.
                    Only rendered when tithing is enabled; hidden entirely otherwise. */}
                {titheActive && (
                    <View style={[styles.titheCard, { backgroundColor: theme.surface, borderColor: theme.harvest, ...shadow(7) }]}>
                        <View style={[styles.titheIconTile, { backgroundColor: theme.harvest }]}>
                            <IconScripture size={26} color={theme.brand} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <View style={styles.titheTitleRow}>
                                <Text style={[styles.titheTitle, { color: theme.ink }]}>Tithe</Text>
                                <Text style={[styles.tithePct, { color: theme.ink3 }]}>
                                    {Math.round((tithe?.rate ?? 0.1) * 100)}%
                                </Text>
                            </View>
                            <Text style={[styles.titheSub, { color: theme.ink2 }]}>
                                Set aside first · before budgeting
                            </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.titheAmount, { color: theme.ink }]}>
                                ${fmt$(tithe?.amount ?? 0)}
                            </Text>
                            <Text style={[styles.titheAmountLabel, { color: theme.ink3 }]}>SET ASIDE</Text>
                        </View>
                    </View>
                )}

                {/* Category cards */}
                {categories.map(cat => (
                    <CategoryCard
                        key={cat.key}
                        cat={cat}
                        theme={theme}
                        expanded={expandedCat === cat.key}
                        txs={categoryTxs[cat.key]}
                        onToggle={() => {
                            LayoutAnimation.configureNext(
                                LayoutAnimation.create(320, 'easeInEaseOut', 'opacity')
                            );
                            const opening = expandedCat !== cat.key;
                            setExpandedCat(prev => prev === cat.key ? null : cat.key);
                            // Fetch real transactions on first open for this month
                            if (opening && categoryTxs[cat.key] === null) {
                                fetchCategoryTxs(cat.key);
                            }
                        }}
                        onNavigate={() => router.push({
                            pathname: '/details',
                            params: {
                                category: cat.key.charAt(0).toUpperCase() + cat.key.slice(1),
                                month: currentMonth,
                                type: cat.navType,
                            },
                        })}
                        piggyBalance={piggyBankBalance}
                    />
                ))}

                {/* Quick actions */}
                <View style={styles.quickActions}>
                    <Pressable
                        onPress={() => router.push({ pathname: '/(tabs)/transactions', params: { type: 'expense' } } as any)}
                        style={({ pressed }) => [
                            styles.quickActionPrimary,
                            { backgroundColor: theme.brand },
                            pressed && { transform: [{ scale: 0.97 }] },
                        ]}
                    >
                        <IconExpense size={16} color="#fff" />
                        <Text style={styles.quickActionPrimaryText}>Log Expense</Text>
                    </Pressable>
                    <Pressable
                        onPress={() => router.push({ pathname: '/(tabs)/transactions', params: { type: 'income' } } as any)}
                        style={({ pressed }) => [
                            styles.quickActionSecondary,
                            { backgroundColor: theme.surface, borderColor: theme.border },
                            pressed && { transform: [{ scale: 0.97 }] },
                        ]}
                    >
                        <IconIncome size={16} color={theme.brand} />
                        <Text style={[styles.quickActionSecondaryText, { color: theme.brand }]}>Log Income</Text>
                    </Pressable>
                </View>
            </View>
        </ScrollView>
    );
}

// ─── CategoryCard ─────────────────────────────────────────────────────────────
interface CategoryCardProps {
    cat: {
        key: 'needs' | 'wants' | 'goals';
        label: string;
        pct: string;
        Icon: React.ComponentType<{ size?: number; accent?: string }>;
        color: string;
        soft: string;
        spent: number;
        budget: number;
        sub: string;
    };
    theme: ReturnType<typeof useTheme>['theme'];
    expanded: boolean;
    txs: TxItem[] | null;
    onToggle: () => void;
    onNavigate: () => void;
    piggyBalance: number;
}

function CategoryCard({ cat, theme, expanded, txs, onToggle, onNavigate, piggyBalance }: CategoryCardProps) {
    const pct = cat.budget > 0 ? (cat.spent / cat.budget) * 100 : 0;
    const left = cat.budget - cat.spent;
    const over = pct > 100;
    const barColor = over ? theme.danger : cat.color;
    const { Icon } = cat;

    return (
        <View style={[styles.catCard, { backgroundColor: theme.surface, ...shadow(7) }]}>
            {/* Card header — tap to expand/collapse */}
            <Pressable
                onPress={onToggle}
                style={({ pressed }) => [styles.catCardHeader, pressed && { opacity: 0.85 }]}
            >
                <View style={[styles.catIconTile, { backgroundColor: cat.soft }]}>
                    <Icon size={28} accent={cat.color} />
                </View>

                <View style={{ flex: 1 }}>
                    <View style={styles.catTitleRow}>
                        <Text style={[styles.catTitle, { color: theme.ink }]}>{cat.label}</Text>
                        <Text style={[styles.catPct, { color: theme.ink3 }]}>{cat.pct}</Text>
                    </View>
                    <Text style={[styles.catSub, { color: theme.ink2 }]}>{cat.sub}</Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.catLeft, { color: over ? theme.danger : theme.ink }]}>
                        ${fmt$(Math.abs(left))}
                    </Text>
                    <Text style={[styles.catLeftLabel, { color: theme.ink3 }]}>
                        {over ? 'OVER' : 'LEFT'}
                    </Text>
                </View>
            </Pressable>

            {/* Progress + metadata */}
            <View style={styles.catProgress}>
                <AnimatedProgressBar
                    value={pct}
                    color={barColor}
                    bg={theme.borderSoft}
                    height={8}
                />
                <View style={styles.catMeta}>
                    <Text style={[styles.catMetaText, { color: theme.ink3 }]}>
                        ${fmt$(cat.spent)} spent
                    </Text>
                    <Text style={[styles.catMetaText, { color: theme.ink3 }]}>
                        of ${fmt$(cat.budget)}
                    </Text>
                </View>
            </View>

            {/* Expandable transaction list */}
            {expanded && (
                <View style={[styles.catExpanded, { backgroundColor: theme.surfaceSoft, borderTopColor: theme.borderSoft }]}>
                    {/* Loading state */}
                    {txs === null && (
                        <ActivityIndicator
                            size="small"
                            color={cat.color}
                            style={{ marginVertical: 14 }}
                        />
                    )}

                    {/* Real transaction rows (up to 3, most recent first) */}
                    {txs !== null && txs.length > 0 && txs.map((item, i) => (
                        <View
                            key={item.id}
                            style={[
                                styles.txRow,
                                i < txs.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.borderSoft },
                            ]}
                        >
                            <View style={[styles.txIconTile, { backgroundColor: cat.soft }]}>
                                <cat.Icon size={16} accent={cat.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.txName, { color: theme.ink }]} numberOfLines={1}>
                                    {item.title || item.sub_category}
                                </Text>
                                <Text style={[styles.txDate, { color: theme.ink3 }]}>
                                    {MONTH_ABBR[item.month] ?? ''} {item.day}
                                </Text>
                            </View>
                            <Text style={[styles.txAmount, { color: theme.ink2 }]}>
                                ${fmt$(item.amount, 2)}
                            </Text>
                        </View>
                    ))}

                    {/* Goals: show piggy bank total only when no individual transactions are loaded */}
                    {cat.key === 'goals' && txs !== null && txs.length === 0 && (
                        <View style={[styles.piggyRow, { backgroundColor: theme.brandSoft }]}>
                            <IconSavings size={20} color={theme.brand} accent={theme.brand2} />
                            <Text style={[styles.piggyLabel, { color: theme.brand }]}>Piggy bank balance</Text>
                            <Text style={[styles.piggyAmount, { color: theme.brand }]}>
                                ${fmt$(piggyBalance, 2)}
                            </Text>
                        </View>
                    )}

                    {/* "View all" — always shown; only element when no transactions logged */}
                    {txs !== null && (
                        <Pressable
                            onPress={onNavigate}
                            style={({ pressed }) => [
                                styles.viewAllBtn,
                                { borderTopColor: theme.borderSoft },
                                pressed && { opacity: 0.7 },
                            ]}
                        >
                            <Text style={[styles.viewAllText, { color: theme.brand }]}>
                                View all {cat.label.toLowerCase()} →
                            </Text>
                        </Pressable>
                    )}
                </View>
            )}
        </View>
    );
}


// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    // Hero
    heroInner: { paddingHorizontal: 22, paddingTop: 52, paddingBottom: 0, position: 'relative', zIndex: 1 },
    heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
    logoGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logoTile: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    wordmark: { color: '#fff', fontFamily: 'Geist-SemiBold', fontSize: 15, letterSpacing: -0.2 },
    subline: { color: 'rgba(255,255,255,0.65)', fontFamily: 'JetBrainsMono-Regular', fontSize: 11 },
    heroControls: { flexDirection: 'row', gap: 8 },
    glassBtn: {
        width: 38, height: 38, borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
        alignItems: 'center', justifyContent: 'center',
    },
    bellDot: {
        position: 'absolute', top: 7, right: 7,
        width: 7, height: 7, borderRadius: 3.5,
        backgroundColor: '#F4D35E',
    },

    // Month nav
    monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    monthChevron: {
        width: 38, height: 38, borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    monthCenter: { alignItems: 'center' },
    monthEyebrow: {
        color: 'rgba(255,255,255,0.65)',
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: 10,
        letterSpacing: 1.8,
    },
    monthLabel: {
        color: '#fff',
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: 18,
        marginTop: 2,
        letterSpacing: 0.2,
    },

    // Big amount
    incomeEyebrow: {
        color: 'rgba(255,255,255,0.7)',
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: 12,
        letterSpacing: 1.2,
        marginBottom: 4,
    },
    leftChip: {
        backgroundColor: 'rgba(255,255,255,0.18)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        alignSelf: 'flex-start',
    },
    leftChipText: {
        color: '#fff',
        fontFamily: 'Geist-SemiBold',
        fontSize: 11,
        letterSpacing: 0.6,
    },

    // Health pill
    healthPill: {
        marginTop: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'rgba(255,255,255,0.12)',
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    healthTitle: { color: '#fff', fontFamily: 'Geist-SemiBold', fontSize: 12 },
    healthHint: { color: 'rgba(255,255,255,0.7)', fontFamily: 'InstrumentSerif-Italic', fontSize: 11, marginTop: 1 },
    healthBarTrack: {
        width: 60,
        height: 5,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 999,
        overflow: 'hidden',
    },
    healthBarFill: { height: '100%', borderRadius: 999 },

    // Content area
    contentArea: { paddingHorizontal: 18 },

    // Rollover close-out card
    rolloverCard: {
        borderRadius: 18,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1.5,
        gap: 14,
    },
    rolloverHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    rolloverIconTile: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    rolloverTitle: { fontFamily: 'Geist-SemiBold', fontSize: 15, letterSpacing: -0.2 },
    rolloverSub: { fontFamily: 'Geist-Regular', fontSize: 12, marginTop: 3, lineHeight: 17 },
    rolloverDismiss: { fontFamily: 'Geist-SemiBold', fontSize: 14, paddingHorizontal: 2 },
    rolloverClosedCard: {
        borderRadius: 16,
        padding: 14,
        marginBottom: 16,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    rolloverClosedTitle: { fontFamily: 'Geist-SemiBold', fontSize: 14, letterSpacing: -0.2 },
    reopenBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
    reopenBtnText: { fontFamily: 'Geist-SemiBold', fontSize: 12 },

    // Scripture banner
    scriptureBanner: { marginBottom: 18 },
    scriptureBannerInner: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    scriptureIconTile: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    scriptureVerse: {
        fontFamily: 'InstrumentSerif-Italic',
        fontSize: 15,
        lineHeight: 20,
    },
    scriptureRef: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: 11,
        letterSpacing: 0.4,
        marginTop: 6,
    },

    // Section header
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    sectionTitle: { fontFamily: 'Geist-SemiBold', fontSize: 15, letterSpacing: -0.2 },
    budgetTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
    budgetTypeDot: { width: 6, height: 6, borderRadius: 3 },
    budgetTypeText: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, letterSpacing: 0.2 },
    trendsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    trendsBtnText: { fontFamily: 'Geist-SemiBold', fontSize: 12 },

    // Tithe envelope (above the 50/30/20 split)
    titheCard: {
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1.5,
    },
    titheIconTile: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    titheTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    titheTitle: { fontFamily: 'Geist-SemiBold', fontSize: 16, letterSpacing: -0.2 },
    tithePct: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11 },
    titheSub: { fontFamily: 'Geist-Regular', fontSize: 12, marginTop: 2 },
    titheAmount: { fontFamily: 'InstrumentSerif-Regular', fontSize: 22 },
    titheAmountLabel: { fontFamily: 'JetBrainsMono-SemiBold', fontSize: 10, letterSpacing: 1 },

    // Category card
    catCard: {
        borderRadius: 18,
        overflow: 'hidden',
        marginBottom: 12,
    },
    catCardHeader: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
    catIconTile: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    catTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    catTitle: { fontFamily: 'Geist-SemiBold', fontSize: 16, letterSpacing: -0.2 },
    catPct: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11 },
    catSub: { fontFamily: 'Geist-Regular', fontSize: 12, marginTop: 2 },
    catLeft: { fontFamily: 'InstrumentSerif-Regular', fontSize: 22 },
    catLeftLabel: { fontFamily: 'JetBrainsMono-SemiBold', fontSize: 10, letterSpacing: 1 },
    catProgress: { paddingHorizontal: 16, paddingBottom: 14 },
    catMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    catMetaText: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11 },

    // Expanded transaction rows
    catExpanded: { borderTopWidth: 1 },
    txRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        paddingHorizontal: 16,
    },
    txIconTile: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    txName: { fontFamily: 'Geist-Medium', fontSize: 13 },
    txDate: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, marginTop: 2 },
    txAmount: { fontFamily: 'Geist-Medium', fontSize: 13 },

    // Piggy row (inside Goals expanded)
    piggyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        margin: 12,
        padding: 12,
        borderRadius: 12,
    },
    piggyLabel: { flex: 1, fontFamily: 'Geist-SemiBold', fontSize: 12 },
    piggyAmount: { fontFamily: 'InstrumentSerif-Regular', fontSize: 18 },

    // "View all" link at bottom of expanded card
    viewAllBtn: { paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, alignItems: 'center' },
    viewAllText: { fontFamily: 'Geist-SemiBold', fontSize: 13 },

    // Quick actions
    quickActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
    quickActionPrimary: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 14,
        paddingHorizontal: 18,
        borderRadius: 14,
        ...shadow(5),
    },
    quickActionPrimaryText: { color: '#fff', fontFamily: 'Geist-SemiBold', fontSize: 14 },
    quickActionSecondary: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 14,
        paddingHorizontal: 18,
        borderRadius: 14,
        borderWidth: 1,
    },
    quickActionSecondaryText: { fontFamily: 'Geist-SemiBold', fontSize: 14 },

    // View all Income button (hero) — matches leftChip pill style
    viewIncomeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(255,255,255,0.18)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
    },
    viewIncomeBtnText: {
        color: '#fff',
        fontFamily: 'Geist-SemiBold',
        fontSize: 11,
        letterSpacing: 0.6,
    },

    // Scripture modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 28,
    },
    modalCard: { width: '100%', alignItems: 'center', gap: 8 },
    modalIconTile: {
        width: 56, height: 56, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 4,
    },
    modalTitle: { fontFamily: 'InstrumentSerif-Regular', fontSize: 22, textAlign: 'center' },
    modalVerse: {
        fontFamily: 'InstrumentSerif-Italic',
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
    },
    modalRef: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: 12,
        letterSpacing: 0.4,
        marginBottom: 8,
    },
});
