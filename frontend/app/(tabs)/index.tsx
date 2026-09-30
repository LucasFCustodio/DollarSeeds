/**
 * Home — built around the Core Journey. Everything on it answers one of the
 * questions the user brings to the app:
 *
 *   Analyze   "Am I okay?"          income left, status, tithe
 *   Plan      "What's next?"        close-out, next debt payment, splits, logging
 *   Envision  "Where is this going?" debts paid, encouragement, the focus plant
 *
 * A good visit can take 20 seconds, as long as the user leaves encouraged and with a
 * reason to come back. This file is layout only: state and requests live in
 * components/home/useHomeData.ts, the pieces in components/home/.
 *
 * Every debt element renders only with DEBT_FREEDOM_ENABLED on AND at least one
 * active debt; with it off the home is complete without them.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useTheme } from '../../context/ThemeContext';
import { DEBT_FREEDOM_ENABLED } from '../../constants/features';
import type { SplitKey } from '../../lib/homeSummary';
import { useHomeData } from '../../components/home/useHomeData';
import { DropZoneProvider, useDropZones } from '../../components/home/DropZones';
import HomeTopBar from '../../components/home/HomeTopBar';
import MonthPickerSheet from '../../components/home/MonthPickerSheet';
import IncomeHero from '../../components/home/IncomeHero';
import StatusTitheRow from '../../components/home/StatusTitheRow';
import { ClosedLine, CloseOutCard } from '../../components/home/CloseOut';
import NextPaymentCard from '../../components/home/NextPaymentCard';
import SplitContainers from '../../components/home/SplitContainers';
import LoggingArea, { BubbleFace } from '../../components/home/LoggingArea';
import ConnectBankPrompt from '../../components/home/ConnectBankPrompt';
import { DebtsPaidLine, EncouragementCard } from '../../components/home/Encouragement';
import FocusPlant from '../../components/home/FocusPlant';
import ScriptureModal from '../../components/home/ScriptureModal';
import { CARD_GAP, HOME_PAD, SECTION_GAP } from '../../components/home/homeType';

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
    const insets = useSafeAreaInsets();
    const zones = useDropZones();
    const home = useHomeData();
    const [pickerOpen, setPickerOpen] = useState(false);

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

    return (
        <View style={[styles.fill, { backgroundColor: theme.bg }]}>
            <ScrollView
                style={styles.fill}
                contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 120, paddingHorizontal: HOME_PAD }}
                showsVerticalScrollIndicator={false}
                scrollEnabled={!zones?.dragging}
            >
                <HomeTopBar month={currentMonth} onOpenMonthPicker={() => setPickerOpen(true)} />

                {/* ── Analyze: "Am I okay?" ─────────────────────────────── */}
                <View style={[styles.section, { gap: CARD_GAP + 8 }]}>
                    <IncomeHero
                        left={totalLeft}
                        income={total_income}
                        spent={totalSpent}
                        onAdd={logIncome}
                        onOpenIncome={openIncomeList}
                    />
                    <StatusTitheRow
                        debts={debts}
                        overBudget={summary?.over_budget ?? []}
                        tithe={{
                            active: titheActive,
                            amount: titheAmount,
                            given: titheGiven,
                            disabled: home.savingTitheGiven || monthClosed,
                            onToggle: home.toggleTitheGiven,
                        }}
                        onOpenDebts={() => openDebts()}
                        onOpenSplit={openSplit}
                    />
                </View>

                {/* ── Plan: "What's next?" ──────────────────────────────── */}
                <View style={styles.section}>
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
                    {debts?.next_payment ? (
                        <NextPaymentCard payment={debts.next_payment} onPrune={() => openDebts(debts.next_payment!.id)} />
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

                {/* ── Envision: "Where is this going?" ──────────────────── */}
                {debts || goalsNear.length > 0 ? (
                    <View style={styles.section}>
                        {debts ? <DebtsPaidLine debts={debts} /> : null}
                        <EncouragementCard debts={debts} goals={goalsNear} />
                        <FocusPlant summary={debts ? summary : null} />
                    </View>
                ) : null}
            </ScrollView>

            <MonthPickerSheet
                visible={pickerOpen}
                selected={home.monthIndex}
                onPick={home.pickMonth}
                onClose={() => setPickerOpen(false)}
            />
            <ScriptureModal verse={home.verse} visible={home.verseVisible} onClose={home.closeVerse} />
        </View>
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    section: { marginTop: SECTION_GAP, gap: CARD_GAP },
});
