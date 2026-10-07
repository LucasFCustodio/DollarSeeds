/**
 * Home — built around the Core Journey. Everything on it answers one of the
 * questions the user brings to the app:
 *
 *   Analyze   "Am I okay?"          income left, overdue status, next debt payment, tithe
 *   Plan      "What's next?"        close-out, splits, logging
 *   Envision  "Where is this going?" encouragement, the Envision dashboard
 *
 * The top band is the painted watercolour wash (PaintedBand), its bottom corners
 * curving up over the cream. Plan and Envision share the cream `bg` and run on as one
 * surface, so the green stays reserved for the top. Envision always renders: its
 * dashboard has an empty state for every row.
 *
 * A good visit can take 20 seconds, as long as the user leaves encouraged and with a
 * reason to come back. This file is layout only: state and requests live in
 * components/home/useHomeData.ts, the pieces in components/home/.
 *
 * Every debt element renders only with DEBT_FREEDOM_ENABLED on AND at least one
 * active debt; with it off the home is complete without them.
 */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { shadow, useTheme } from '../../context/ThemeContext';
import { DEBT_FREEDOM_ENABLED } from '../../constants/features';
import type { SplitKey } from '../../lib/homeSummary';
import { useHomeData } from '../../components/home/useHomeData';
import { DropZoneProvider, useDropZones } from '../../components/home/DropZones';
import HomeTopBar from '../../components/home/HomeTopBar';
import IncomeHero from '../../components/home/IncomeHero';
import OverdueStatus from '../../components/home/OverdueStatus';
import TitheEnvelope from '../../components/home/TitheEnvelope';
import { ClosedLine, CloseOutCard } from '../../components/home/CloseOut';
import NextPaymentCard from '../../components/home/NextPaymentCard';
import SplitContainers from '../../components/home/SplitContainers';
import LoggingArea, { BubbleFace } from '../../components/home/LoggingArea';
import ConnectBankPrompt from '../../components/home/ConnectBankPrompt';
import { EncouragementCard } from '../../components/home/Encouragement';
import EnvisionDashboard from '../../components/home/EnvisionDashboard';
import ScriptureModal from '../../components/home/ScriptureModal';
import PaintedBand from '../../components/home/PaintedBand';
import {
    BAND_OVERLAP, BAND_PAD, BAND_RADIUS, CARD_GAP, HOME_PAD, SECTION_GAP,
} from '../../components/home/homeType';

/** The top band's bottom corner radius (as the old HeroBg's). */
const HERO_RADIUS = 32;

const SPLIT_CATEGORY: Record<SplitKey, string> = { needs: 'Needs', wants: 'Wants', goals: 'Goals' }; // i18n-canonical

export default function HomeScreen() {
    return (
        <GestureHandlerRootView style={styles.fill}>
            <DropZoneProvider renderGhost={tx => <BubbleFace tx={tx} />}>
                <Home />
            </DropZoneProvider>
        </GestureHandlerRootView>
    );
}

function Home() {
    const router = useRouter();
    const { theme } = useTheme();
    const focused = useIsFocused();
    const insets = useSafeAreaInsets();
    const zones = useDropZones();
    const home = useHomeData();

    const { dashboard, summary, currentMonth } = home;
    const { total_income, budgets, expenses, tithe, rollover } = dashboard;

    // ── Tithe (unchanged math) ────────────────────────────────────────────────
    const titheActive = !!tithe?.enabled && (tithe?.amount ?? 0) > 0;
    const titheAmount = tithe?.amount ?? 0;
    const titheGiven = titheActive && !!tithe?.given;
    const monthClosed = !!rollover?.closed;
    const totalSpent = expenses.needs + expenses.wants + expenses.goals;
    // Until the tithe is given the money is still in the account, so it belongs in
    // "left this month"; once given it is gone. Subtracts from what is LEFT, never
    // from total_income — the income logged is a fact and does not move.
    const totalLeft = Math.max(0, total_income - totalSpent - (titheGiven ? titheAmount : 0));

    // ── Close-out (unchanged rule) ────────────────────────────────────────────
    // Offered for any un-closed month with income except the in-progress one.
    const showClosePrompt =
        !!rollover && !rollover.closed &&
        home.monthIndex !== new Date().getMonth() &&
        total_income > 0 &&
        !home.dismissedCloseout.has(currentMonth);

    // ── Debts: flag on AND at least one active debt ───────────────────────────
    const rawDebts = DEBT_FREEDOM_ENABLED ? summary?.debts ?? null : null;
    const debts = rawDebts && rawDebts.total_count > rawDebts.paid_count ? rawDebts : null;
    const goalsNear = summary?.goals_near_completion ?? [];
    const nextPayment = debts?.next_payment ?? null;
    // The next payment is already on the card; the list is only the others.
    const upcoming = (debts?.due_soon ?? []).filter(d => d.id !== nextPayment?.id);

    // ── Navigation ────────────────────────────────────────────────────────────
    const openSplit = (split: SplitKey) => router.push({
        pathname: '/details',
        params: { category: SPLIT_CATEGORY[split], month: currentMonth, type: 'expense' },
    });
    const openIncomeList = () => router.push({ pathname: '/details', params: { month: currentMonth, type: 'income' } } as any);
    const logExpense = (category?: 'needs' | 'wants') =>
        router.push({ pathname: '/logExpense', params: category ? { category } : {} } as any);
    const logIncome = () => router.push('/logIncome' as any);
    const openDebts = (debtId?: number) =>
        router.push({ pathname: '/(tabs)/debts', params: debtId != null ? { debtId: String(debtId) } : {} } as any);
    const addDebt = () => router.push('/debtForm' as any);
    const openCompletedGoals = () => router.push({ pathname: '/(tabs)/piggyBank', params: { tab: 'completed' } } as any);
    const addGoal = () => router.push({ pathname: '/(tabs)/piggyBank', params: { createGoal: '1' } } as any);

    return (
        <View style={[styles.fill, { backgroundColor: theme.bg }]}>
            {/* The top of the home is green, so the status bar content is light;
                only while the home is the focused tab. */}
            {focused ? <StatusBar style="light" /> : null}
            <ScrollView
                // Whatever shows past the last band on an overscroll matches it.
                style={[styles.fill, { backgroundColor: theme.bg }]}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                scrollEnabled={!zones?.dragging}
            >
                {/* The hero's top colour above it, for the pull-down bounce. */}
                <View style={[styles.overscroll, { backgroundColor: theme.paintedForest }]} />

                {/* ── Band 1 · Analyze: "Am I okay?" ────────────────────── */}
                <View style={styles.hero}>
                    {/* The field stays pinned at the bottom; a shorter band (no overdue
                        alert) crops the calm forest off the top. */}
                    <PaintedBand
                        anchor="bottom"
                        style={[styles.top, { paddingTop: insets.top + 8 }, shadow(6, theme.brand) as object]}
                    >
                        <HomeTopBar month={currentMonth} selected={home.monthIndex} onPickMonth={home.pickMonth} />
                        <View style={[styles.section, { gap: CARD_GAP + 8 }]}>
                            <IncomeHero
                                left={totalLeft}
                                income={total_income}
                                spent={totalSpent}
                                onAdd={logIncome}
                                onOpenIncome={openIncomeList}
                            />
                            {debts && debts.overdue_count > 0 ? (
                                <OverdueStatus count={debts.overdue_count} debts={debts.overdue} onOpenDebts={openDebts} />
                            ) : null}
                            {nextPayment ? (
                                <NextPaymentCard
                                    payment={nextPayment}
                                    upcoming={upcoming}
                                    onPrune={() => openDebts(nextPayment.id)}
                                />
                            ) : null}
                            {titheActive ? (
                                <TitheEnvelope
                                    amount={titheAmount}
                                    given={titheGiven}
                                    disabled={home.savingTitheGiven || monthClosed}
                                    onToggle={home.toggleTitheGiven}
                                />
                            ) : null}
                        </View>
                    </PaintedBand>
                </View>

                {/* ── Band 2 · Plan: "What's next?" ─────────────────────── */}
                <View style={[styles.band, styles.underHero, { backgroundColor: theme.bg }]}>
                    <View style={styles.stack}>
                        {showClosePrompt ? (
                            <CloseOutCard
                                month={currentMonth}
                                target={rollover?.target ?? 0}
                                closing={home.closingMonth}
                                onClose={home.closeMonth}
                                onDismiss={home.dismissCloseout}
                            />
                        ) : null}
                        {monthClosed ? (
                            <ClosedLine
                                month={currentMonth}
                                amount={rollover?.amount ?? 0}
                                busy={home.closingMonth}
                                onReopen={home.reopenMonth}
                            />
                        ) : null}
                        <SplitContainers budgets={budgets} spent={expenses} onOpen={openSplit} onAdd={logExpense} />
                        <LoggingArea
                            connected={home.bankConnected}
                            pending={home.pending}
                            onClassify={home.classify}
                            daysSinceLastLog={summary?.days_since_last_log ?? null}
                            onOpenExpense={() => logExpense()}
                        />
                        <ConnectBankPrompt connected={home.bankConnected} />
                    </View>
                </View>

                {/* ── Band 3 · Envision: "Where is this going?" ─────────── */}
                <View style={[styles.band, styles.raised, styles.last, { backgroundColor: theme.bg }]}>
                    <View style={styles.stack}>
                        <EncouragementCard debts={debts} goals={goalsNear} />
                        {/* Hidden when /home/progress/ failed (or isn't deployed yet);
                            the rest of the band renders without it. */}
                        {home.progress ? (
                            <EnvisionDashboard
                                progress={home.progress}
                                showDebts={DEBT_FREEDOM_ENABLED}
                                onOpenDebts={openDebts}
                                onAddDebt={addDebt}
                                onOpenCompletedGoals={openCompletedGoals}
                                onAddGoal={addGoal}
                            />
                        ) : null}
                    </View>
                </View>
            </ScrollView>

            {/* The status bar area stays green however far the page is scrolled. */}
            <View
                pointerEvents="none"
                style={[styles.statusBarFill, { height: insets.top, backgroundColor: theme.paintedForest }]}
            />

            <ScriptureModal verse={home.verse} visible={home.verseVisible} onClose={home.closeVerse} />
        </View>
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    // flexGrow lets the last band fill a short page, so no strip of another colour
    // is left under it.
    content: { flexGrow: 1 },
    overscroll: { position: 'absolute', left: 0, right: 0, top: -1000, height: 1000 },
    statusBarFill: { position: 'absolute', left: 0, right: 0, top: 0 },
    // Above the cream band, so the hero's curved corners sit over cream.
    hero: { zIndex: 1 },
    // What HeroBg gave the band: its padding and its curved bottom corners.
    top: {
        paddingHorizontal: HOME_PAD, paddingBottom: 36,
        borderBottomLeftRadius: HERO_RADIUS, borderBottomRightRadius: HERO_RADIUS,
    },
    band: { paddingHorizontal: HOME_PAD, paddingBottom: BAND_OVERLAP + BAND_PAD },
    // The cream band starts under the hero, so cream fills behind its curved corners.
    underHero: { marginTop: -HERO_RADIUS, paddingTop: HERO_RADIUS + BAND_PAD },
    raised: {
        marginTop: -BAND_OVERLAP,
        paddingTop: BAND_PAD,
        borderTopLeftRadius: BAND_RADIUS,
        borderTopRightRadius: BAND_RADIUS,
    },
    // Runs behind the floating tab bar to the end of the scroll content.
    last: { flexGrow: 1, paddingBottom: 120 },
    section: { marginTop: SECTION_GAP },
    stack: { gap: CARD_GAP },
});
