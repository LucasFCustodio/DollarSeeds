/**
 * PiggyBankScreen — General Savings + Goal Funding Source
 *
 * Behaviour:
 * ✅ Fetch balance, history, active goals, completed goals on focus
 * ✅ General Savings goal auto-seeded on first load (pinned card, no delete)
 * ✅ POST deposit to /savings/transaction/ (source='income')
 * ✅ POST transfer from General Savings → specific goal to /savings/transfer/
 * ✅ Funding source chips shown when depositing to a specific (non-general) goal
 * ✅ POST new goal to /savings/goal/ · PATCH edits via the per-card gear icon
 * ✅ One-tap completion (arrow on the card) → POST /savings/goal/{id}/finish
 * ✅ DELETE transaction + DELETE goal (with current_month redistribution)
 * ✅ Confirmations on complete + delete · Active / Completed tabs
 * ✅ Free tier: locked goals render grayed (delete only), the add-goal affordance shows
 *    an inline upsell at the cap, and every goal write handles the premium 403s
 * ✅ Every new goal is a savings goal. Debts live on the Debts tab; the old debt goals
 *    are retired (the server leaves out the ones holding $0, and refuses new money into
 *    the rest), so a legacy one still holding money renders as a delete-only card
 *
 * GOALS V2 (this build sends goals_v2; GOALS_REWORK.md). Each card adds the monthly-minimum
 *    switch, "Add my extra payment" and an "on pace for" line, all server-computed. The
 *    create form is components/goals/GoalForm. General Savings is switched off
 *    (SHOW_GENERAL_SAVINGS), and Ready to Replant shows while it holds money.
 *
 * FREE TIER. Two server answers drive it, and neither is re-derived here:
 *  - `locked` on each goal from GET /savings/goal/ — which goal is the active one is
 *    the server's rule (the oldest eligible goal), not ours. The list already arrives
 *    oldest-first for this build, so it is rendered in the order it comes.
 *  - `max_goals` / `goals_used` from GET /me/entitlements/ — the cap message states
 *    those numbers and no others, so changing the free allowance needs no release.
 * The UI prevents what it knows is refused; the 403s (goal_limit_reached, goal_locked)
 * are handled anyway, because entitlement can change between render and tap.
 *
 * A deposit is the ONLY transaction the user writes by hand. Money leaves savings by
 * completing a goal, which withdraws that goal's balance server-side — so to spend from
 * the pool you create a goal, fund it (from income or General Savings), and complete it.
 * Withdrawal rows still exist in the data model (goal completion, transfers, rollover
 * all write them); there is simply no hand-written withdrawal form.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    View, Text, ScrollView, Pressable,
    TextInput, StyleSheet, Alert, Modal, Switch,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import axios from 'axios';

import { Trans, useTranslation } from 'react-i18next';

import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { premiumErrorCode, usePremiumUpsell } from '../../lib/premiumErrors';
import { useLocale } from '../../context/LocaleContext';
import { MONTHS } from '../../constants/months';
import { CURRENCIES } from '../../constants/currencies';
import { useTheme, shadow } from '../../context/ThemeContext';
import { ft, tv } from '../../constants/responsive';
import { useAnalytics } from '../../lib/analytics';
import { maybeRequestReview } from '../../lib/storeReview';
import { isBeforeThisMonth } from '../../lib/goalPlan';
import { localDateISO } from '../../lib/debtFreedom';
import type { GoalV2Fields } from '../../lib/goals';
import GoalForm from '../../components/goals/GoalForm';
import GoalMinToggle from '../../components/goals/GoalMinToggle';
import ExtraPaymentSheet from '../../components/goals/ExtraPaymentSheet';
import ReplantCard from '../../components/goals/ReplantCard';
import { MonthChips, YearPicker } from '../../components/goals/DatePickers';
import { useGoalMinToggle } from '../../components/goals/useGoalMinToggle';
import HeroBg from '../../components/ui/HeroBg';
import AnimatedAmount from '../../components/ui/AnimatedAmount';
import AnimatedProgressBar from '../../components/ui/AnimatedProgressBar';
import Card from '../../components/ui/Card';
import {
    SavingsJar, IconPlus, IconArrow, IconSavingsGoalMascot, IconDebtMascot,
    IconTrash, IconCheck, IconSavings, IconGearMascot, IconLock,
} from '../../components/icons';

// ─── Constants ────────────────────────────────────────────────────────────────
const BASE = (__DEV__ && process.env.EXPO_PUBLIC_API_URL) || 'https://dollarseeds-1.onrender.com';

// ─── Types ────────────────────────────────────────────────────────────────────
type Transaction = {
    id: number; title: string; amount: number;
    type: 'deposit' | 'withdrawal'; day: number; month: string;
    source?: string;
    // Set by the backend when this entry is a collapsed General Savings → goal
    // transfer (both legs share a transfer_group). Deleting it removes both legs.
    is_transfer?: boolean;
    // goals_v2: false for an entry that would put money back into General Savings
    // (which this build never shows) or undo Ready to Replant's own money.
    deletable?: boolean;
};
type Goal = GoalV2Fields & {
    id: number; title: string;
    target_amount: number | null;
    target_month: string | null;
    target_year: number | null;
    allocated_amount: number; created_at: string;
    is_general: boolean;
    // 'debt' is the Reconciliation goal, or a retired debt goal an older build created.
    goal_type: 'saving' | 'debt';
    // Auto-managed Reconciliation debt goal (rollover feature). When present,
    // `outstanding` = money you'd saved but later spent, still to be repaid.
    is_reconciliation?: boolean;
    outstanding?: number;
    // Snapshot taken when the goal was completed. allocated_amount is computed as
    // deposits − withdrawals, and completing withdraws everything, so it drops to $0 —
    // this is what the goal actually held. Null on goals completed before the snapshot
    // column existed, hence the allocated_amount fallback in the Completed tab.
    completed_amount?: number | null;
    completed_at?: string | null;
    // Free tier (`limits` builds only): true = this goal is past the free allowance.
    // It can be deleted and nothing else — the server refuses every other write with
    // 403 goal_locked. Absent means unlocked. Never true for General Savings or the
    // Reconciliation goal.
    locked?: boolean;
};

// ─── General Savings ──────────────────────────────────────────────────────────
// This build sends goals_v2 and shows no General Savings anywhere (GOALS_REWORK.md
// §5a): no card, no deposits into it, no transfers out of it. Its code stays — switched
// off, not deleted — until the minimum supported version is raised and the old builds
// that still read it are gone; that cleanup is a separate change. Flipping this back
// to true would also need the server to stop treating this build as goals_v2.
const SHOW_GENERAL_SAVINGS = false;

// ─── Component ────────────────────────────────────────────────────────────────
export default function PiggyBankScreen() {
    const { user } = useAuth();
    const { theme } = useTheme();
    const analytics = useAnalytics();
    const {
        formatMoney: fmtMoney, formatNumber, parseAmount, monthAbbr, monthLabel,
        currency, serverTitle, serverError,
    } = useLocale();
    const { t } = useTranslation('goals');
    const { t: tc } = useTranslation('common');
    const { t: tp } = useTranslation('premium');
    const { allowances, premiumActive, refreshEntitlement, openPaywall } = useSubscription();
    const { showUpsell } = usePremiumUpsell();
    const currencySymbol = CURRENCIES[currency].symbol;
    const today = new Date();
    const currentMonth: string = MONTHS[today.getMonth()];

    // ── Remote data ───────────────────────────────────────────────────────────
    const [balance, setBalance]               = useState(0);
    const [history, setHistory]               = useState<Transaction[]>([]);
    const [goals, setGoals]                   = useState<Goal[]>([]);        // specific goals only
    const [generalGoal, setGeneralGoal]       = useState<Goal | null>(null); // pinned General Savings
    const [reconGoal, setReconGoal]           = useState<Goal | null>(null); // auto-managed Reconciliation debt
    const [completedGoals, setCompletedGoals] = useState<Goal[]>([]);

    // ── UI state ──────────────────────────────────────────────────────────────
    const [activeTab,    setActiveTab]    = useState<'active' | 'completed'>('active');
    // Deposits are the only transaction a user writes by hand. Money leaves savings by
    // completing a goal (which withdraws the goal's balance server-side), so there is no
    // withdrawal form: to spend from the pool you make a goal, fund it, and complete it.
    const [showTxForm,   setShowTxForm]   = useState(false);
    const [showGoalForm, setShowGoalForm] = useState(false);

    // Deposit form
    const [txAmount,      setTxAmount]      = useState('');
    const [txGoalId,      setTxGoalId]      = useState<number | null>(null);
    // 'income' = this month's income · 'general' = transfer from General Savings ·
    // a month name = fund from that earlier open month's leftover income.
    const [fundingSource, setFundingSource] = useState<string>('income');
    // Earlier OPEN months with > $0 income, eligible as funding sources (task: let a
    // goal be funded from a prior month's leftover income, booked to that month).
    const [fundingMonths, setFundingMonths] = useState<{ month: string; income: number }[]>([]);

    // Goal creation form. components/goals/GoalForm owns its own fields; only a
    // suggestion's prefill (Firm Foundation, the home's "Add a goal") lives here.
    const [prefillTitle,  setPrefillTitle]  = useState('');
    const [prefillAmount, setPrefillAmount] = useState('');

    // Ready to Replant (goals_v2): money from removed goals. Shown only while > $0.
    const [replantGoal, setReplantGoal] = useState<Goal | null>(null);
    // The goal whose "Add my extra payment" sheet is open; null = closed.
    const [extraGoal, setExtraGoal] = useState<Goal | null>(null);

    // Goal edit modal (gear icon on a goal card). Non-null = open.
    const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
    const [editTitle,   setEditTitle]   = useState('');
    const [editAmount,  setEditAmount]  = useState('');
    const [editMonth,   setEditMonth]   = useState<string>(MONTHS[today.getMonth()]);
    const [editYear,    setEditYear]    = useState(today.getFullYear());
    const [editAuto,    setEditAuto]    = useState(false);
    const [editError,   setEditError]   = useState('');

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const scrollRef = useRef<ScrollView>(null);
    // Where the cap upsell sits: its own y inside the content column, plus the column's
    // y inside the ScrollView (onLayout is relative to the parent, not the scroller).
    const contentY = useRef(0);
    const capY = useRef(0);

    const fetchData = async () => {
        // goals_used moves with every create / delete / complete, and the cap message
        // renders it, so re-read the allowances alongside the list. Never throws.
        void refreshEntitlement();
        try {
            const [balRes, histRes, goalRes, completedRes] = await Promise.all([
                axios.get(`${BASE}/savings/balance/?user_id=${user?.id}`),
                axios.get(`${BASE}/savings/history/?user_id=${user?.id}`),
                // `today` is the phone's date: it decides which month's minimum the
                // cards show and when an automatic minimum is due.
                axios.get(`${BASE}/savings/goal/?user_id=${user?.id}&today=${localDateISO()}`),
                axios.get(`${BASE}/savings/goal/completed/?user_id=${user?.id}`),
            ]);
            setBalance(balRes.data.balance);
            setHistory(histRes.data.data);
            const allGoals: Goal[] = goalRes.data.data ?? [];
            setGeneralGoal(allGoals.find(g => g.is_general) ?? null);
            setReconGoal(allGoals.find(g => g.is_reconciliation) ?? null);
            setReplantGoal(allGoals.find(g => g.is_replant) ?? null);
            // Specific goals exclude the pinned General Savings, the auto-managed
            // Reconciliation goal and Ready to Replant (each rendered on its own).
            setGoals(allGoals.filter(g => !g.is_general && !g.is_reconciliation && !g.is_replant));
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

    // A purchase (or a lapse noticed on foreground) changes which goals are locked, and
    // the paywall is a modal over this screen, so no focus event follows it.
    const seenPremium = useRef(premiumActive);
    useEffect(() => {
        if (seenPremium.current === premiumActive) return;
        seenPremium.current = premiumActive;
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [premiumActive]);

    // Pre-fill + open the goal form when arriving from a suggestion (e.g. Firm
    // Foundation "Set these up" in Settings, or the home's "Add a goal"). Fires once
    // per arrival: the params are cleared once consumed, so the next arrival — even
    // with this tab still mounted — opens the form again. There is no goal-type
    // param: every goal created here is a savings goal (debts: the Debts tab).
    const params = useLocalSearchParams();
    const router = useRouter();
    useEffect(() => {
        if (!params.createGoal) return;
        setPrefillTitle(typeof params.title === 'string' ? params.title : '');
        setPrefillAmount(typeof params.amount === 'string' ? params.amount : '');
        setShowGoalForm(true);
        router.setParams({ createGoal: undefined, title: undefined, amount: undefined });
    }, [params.createGoal]);

    // The home's Envision dashboard opens this tab on Completed (`tab=completed`).
    // Consumed once and cleared, like `debtId` on the Debts tab. Only a tab chosen
    // this way is put back to Active when the user leaves, so every other way in
    // still opens on Active and a tab the user picked by hand is left alone.
    const openedOnCompleted = useRef(false);
    useEffect(() => {
        if (params.tab !== 'completed') return;
        openedOnCompleted.current = true;
        setActiveTab('completed');
        router.setParams({ tab: undefined });
    }, [params.tab, router]);
    // Runs on blur only (no deps), so clearing the param above doesn't trigger it.
    useFocusEffect(useCallback(() => () => {
        if (!openedOnCompleted.current) return;
        openedOnCompleted.current = false;
        setActiveTab('active');
    }, []));

    // ── Derived ───────────────────────────────────────────────────────────────
    // Savings goals, and the retired debt goals an older build left holding money
    // (the server lists those so money is never hidden; it refuses new money into them).
    const savingsGoals    = goals.filter(g => g.goal_type !== 'debt');
    const legacyDebtGoals = goals.filter(g => g.goal_type === 'debt');

    // All goals shown as chips in the form (General Savings first, then specific goals).
    // The Reconciliation goal only matters while there's a balance still owed.
    const reconOutstanding = reconGoal?.outstanding ?? 0;
    const reconActive = !!reconGoal && reconOutstanding > 0;

    // A locked goal can't receive money, and neither can a retired debt goal, so neither
    // is ever offered as a destination.
    const goalChips: Goal[] = [
        ...(generalGoal ? [generalGoal] : []),
        ...savingsGoals.filter(g => !g.locked),
        // Allow paying down the Reconciliation debt like any other goal — repaying it is
        // a plain deposit (see _recon_summary: repaid = Σ deposits).
        ...(reconActive ? [reconGoal as Goal] : []),
    ];

    // goals_v2: the monthly-minimum switch on each card. The list refetch settles it.
    const { toggle: toggleMin, pendingValueFor: pendingMinFor } = useGoalMinToggle(fetchData);

    // The hero's number. Without General Savings on screen, /savings/balance/ (every
    // savings row, General Savings included) would show money the tab no longer lists,
    // so it is what the listed goals and Ready to Replant hold.
    const replantBalance = replantGoal?.allocated_amount ?? 0;
    const heroBalance = SHOW_GENERAL_SAVINGS
        ? balance
        : goals.reduce((sum, g) => sum + (g.allocated_amount ?? 0), 0) + replantBalance;

    // Active, unlocked savings goals: where Ready to Replant can plant money.
    const plantable = savingsGoals.filter(g => !g.locked);

    // Jar fill: use first specific goal's target; fallback $3,000
    const firstGoalWithTarget = savingsGoals.find(g => g.target_amount);
    const jarMax = firstGoalWithTarget?.target_amount ?? 3000;
    const jarFill = heroBalance > 0 ? Math.min(1, heroBalance / jarMax) : 0.05;

    // ── Free-tier cap ─────────────────────────────────────────────────────────
    // Unknown allowances (not loaded, or an older backend) mean no cap on screen; the
    // server still refuses with goal_limit_reached, which GoalForm shows in place.
    const maxGoals = allowances?.maxGoals ?? null;
    const goalsUsed = allowances?.goalsUsed ?? 0;
    const atGoalCap = maxGoals !== null && goalsUsed >= maxGoals;
    const capMessage = maxGoals === null ? '' : goalsUsed > maxGoals
        ? tp('goalCap.over', { count: goalsUsed - maxGoals, max: maxGoals })
        : tp('goalCap.reached', { count: maxGoals });

    // Both "new goal" buttons land here. At the cap there is no form to open, so show
    // where the upsell is instead of pushing the paywall over the screen.
    const openGoalForm = (toggle: boolean) => {
        if (atGoalCap) {
            setActiveTab('active');
            setShowGoalForm(false);
            scrollRef.current?.scrollTo({ y: Math.max(0, contentY.current + capY.current - 160), animated: true });
            return;
        }
        setShowGoalForm(toggle ? !showGoalForm : true);
    };

    // Is the currently-selected goal the General Savings pool?
    const isGeneralSelected = txGoalId !== null && txGoalId === generalGoal?.id;

    // Funding options when depositing to a SPECIFIC (non-general) goal:
    //  • this month's income (always)
    //  • each earlier OPEN month with leftover income (booked to that month)
    //  • General Savings, when it holds money to draw from
    const generalHasMoney = (generalGoal?.allocated_amount ?? 0) > 0;
    const fundingOptions: { key: string; label: string }[] = [
        { key: 'income', label: t('funding.thisMonth') },
        // `m.month` is a canonical English month name and stays that way in `key` —
        // it is posted back to the API. Only the label is translated.
        ...fundingMonths.map(m => ({
            key: m.month,
            label: t('funding.pastMonth', { month: monthLabel(m.month), amount: fmtMoney(m.income) }),
        })),
        ...(generalHasMoney
            ? [{ key: 'general', label: t('funding.fromGeneral', { amount: fmtMoney(generalGoal?.allocated_amount ?? 0) }) }]
            : []),
    ];

    // Show the picker only when there's a real choice beyond "this month's income".
    const showFundingSource =
        txGoalId !== null &&
        !isGeneralSelected &&
        fundingOptions.length > 1;

    // ── Handlers ──────────────────────────────────────────────────────────────
    const closeTxForm = () => {
        setShowTxForm(false); setTxAmount(''); setTxGoalId(null); setFundingSource('income');
    };

    const toggleTxForm = () => {
        if (showTxForm) { closeTxForm(); return; }
        setShowTxForm(true); setTxAmount(''); setTxGoalId(null); setFundingSource('income');
    };

    const selectGoalChip = (id: number) => {
        const next = txGoalId === id ? null : id;
        setTxGoalId(next);
        // Reset funding source when goal selection changes
        setFundingSource('income');
    };

    const submitTransaction = async () => {
        const parsed = parseAmount(txAmount) ?? NaN;
        if (!txAmount || isNaN(parsed) || parsed <= 0) return;

        const selectedGoal = goalChips.find(g => g.id === txGoalId) ?? null;

        try {
            if (
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
                    // Goes into savings_transactions.title, which the backend and older
                    // binaries read as English; serverTitle() maps it at render.
                    to_goal_title: selectedGoal?.title ?? 'Savings goal', // i18n-canonical
                });
                // Funding a specific goal via transfer (goal_id only, never the amount).
                analytics.savingsGoalFunded({ goal_id: txGoalId });
            } else {
                // ── Deposit ───────────────────────────────────────────────
                // Funding from an earlier open month books it against that month's Goals
                // budget (fundingSource holds the month name). Otherwise ('income') it
                // lands in the current month.
                const bookMonth =
                    fundingSource !== 'income' && fundingSource !== 'general'
                        ? fundingSource
                        : currentMonth;
                await axios.post(`${BASE}/savings/transaction/`, {
                    user_id: user?.id,
                    title: selectedGoal?.title ?? 'Deposit',
                    amount: parsed,
                    type: 'deposit',
                    day: today.getDate(),
                    month: bookMonth,
                    goal_id: txGoalId ?? null,
                    source: 'income',
                });
                // A deposit into a specific (non-general, non-reconciliation) goal counts
                // as funding it — same event family as the transfer branch above.
                if (selectedGoal && !selectedGoal.is_general && !selectedGoal.is_reconciliation) {
                    analytics.savingsGoalFunded({ goal_id: selectedGoal.id });
                }
            }
            closeTxForm();
            fetchData();
        } catch (err) {
            const code = premiumErrorCode(err);
            if (code) {
                // The goal locked between render and tap. Refresh so it grays out.
                showUpsell(code);
                fetchData();
            } else console.error('Transaction error:', err);
        }
    };

    const onGoalCreated = () => {
        analytics.savingsGoalCreated();
        setShowGoalForm(false); setPrefillTitle(''); setPrefillAmount('');
        fetchData();
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
            const code = premiumErrorCode(e);
            if (code) {
                // A transaction on a locked goal. The goal itself can still be deleted.
                showUpsell(code);
            } else if (e?.response?.status === 409) {
                Alert.alert(t('alert.monthClosedTitle'), t('alert.cannotDelete', { month: monthLabel(tx.month) }));
            } else { console.error('Delete transaction error:', e); }
        }
    };

    const doDeleteGoal = async (id: number) => {
        try {
            await axios.delete(
                `${BASE}/savings/goal/${id}?user_id=${user?.id}&current_month=${currentMonth}&today=${localDateISO()}`
            );
            // Full refresh: whatever the goal held beyond this month's budget is now in
            // Ready to Replant, which may appear for the first time.
            fetchData();
        } catch (e: any) {
            if (e?.response?.status === 409) {
                Alert.alert(t('alert.monthClosedTitle'), t('alert.cannotDelete', { month: monthLabel(currentMonth) }));
            } else { console.error('Delete goal error:', e); }
        }
    };

    const deleteGoal = (g: Goal) => {
        Alert.alert(
            t('alert.removeGoalTitle'),
            // One whole interpolated sentence, not concatenated fragments — the clause
            // order differs in Portuguese and a split body cannot be reordered.
            t('alert.removeBodyReplant', { title: serverTitle(g.title) }),
            [
                { text: tc('action.cancel'), style: 'cancel' },
                { text: t('alert.remove'), style: 'destructive', onPress: () => doDeleteGoal(g.id) },
            ],
        );
    };

    // ── Complete a goal (the arrow on the card) ───────────────────────────────
    // The server withdraws whatever the goal holds and snapshots it, so the user never
    // types an amount or picks a goal from a list — this replaces "I bought it" for
    // specific goals.
    const doCompleteGoal = async (g: Goal) => {
        try {
            await axios.post(`${BASE}/savings/goal/${g.id}/finish`, {
                user_id: user?.id,
                day: today.getDate(),
                month: currentMonth,
            });
            analytics.goalCompleted({ goal_id: g.id, goal_type: g.goal_type });
            fetchData();

            // A positive moment: a savings goal reached, or a debt paid off. The
            // confirmation Alert is already dismissed by the time we get here, so
            // nothing is being interrupted.
            //
            // maybeRequestReview owns the throttling (60 days, never on a first
            // session) and swallows every failure. It is a NO-OP in dev builds and
            // TestFlight — see lib/storeReview.ts. Not awaited: the list refresh
            // above is what the user is waiting on.
            void maybeRequestReview('goal_completed');
        } catch (e: any) {
            const code = premiumErrorCode(e);
            if (code) {
                showUpsell(code);
                fetchData();
            } else if (e?.response?.status === 409) {
                Alert.alert(t('alert.monthClosedTitle'), t('alert.cannotComplete', { month: monthLabel(currentMonth) }));
            } else {
                // Don't fail silently — a swallowed error here looks like the button did
                // nothing, or worse, like it half-worked.
                console.error('Complete goal error:', e);
                Alert.alert(
                    t('alert.completeFailedTitle'),
                    // `detail` is English prose from the backend — map it, don't print it.
                    serverError(e?.response?.data?.detail ?? tc('state.genericError')),
                );
            }
        }
    };

    const completeGoal = (g: Goal) => {
        const saved  = g.allocated_amount ?? 0;
        const target = g.target_amount ?? 0;
        const short  = target > 0 && saved < target;

        const moved = t('alert.completeMoved', {
            amount: fmtMoney(saved), title: serverTitle(g.title),
        });
        const shortBody = t('alert.completeShortSaving', { saved: fmtMoney(saved), target: fmtMoney(target), moved });
        Alert.alert(
            t('alert.completeGoalTitle'),
            short ? shortBody : moved,
            [
                { text: tc('action.cancel'), style: 'cancel' },
                { text: t('alert.completeConfirm'), style: 'destructive', onPress: () => doCompleteGoal(g) },
            ],
        );
    };

    // ── Edit a goal (the gear on the card) ────────────────────────────────────
    const openEditGoal = (g: Goal) => {
        setEditingGoal(g);
        setEditTitle(g.title);
        setEditAmount(String(g.target_amount ?? ''));
        setEditMonth(g.target_month ?? currentMonth);
        setEditYear(g.target_year ?? today.getFullYear());
        setEditAuto(!!g.auto_minimum);
        setEditError('');
    };

    const submitEditGoal = async () => {
        if (!editingGoal) return;
        const amount = parseAmount(editAmount) ?? NaN;
        if (!editTitle.trim() || isNaN(amount) || amount <= 0) {
            setEditError(t('alert.editValidation'));
            return;
        }
        const dateChanged = editMonth !== editingGoal.target_month || editYear !== editingGoal.target_year;
        if (dateChanged && isBeforeThisMonth(editMonth, editYear, today)) {
            setEditError(t('form.errPast'));
            return;
        }
        try {
            await axios.patch(`${BASE}/savings/goal/${editingGoal.id}`, {
                user_id: user?.id,
                title: editTitle.trim(),
                target_amount: amount,
                target_month: editMonth,
                target_year: editYear,
                auto_minimum: editAuto,
                today: localDateISO(),
            });
            const edited = { ...editingGoal, title: editTitle.trim(), target_amount: amount };
            setEditingGoal(null);
            fetchData();
            // A target at or below what's already saved means the goal is done: hand
            // over to the usual completion confirmation.
            if (amount <= (edited.allocated_amount ?? 0)) completeGoal(edited);
        } catch (e: any) {
            const code = premiumErrorCode(e);
            if (code) {
                setEditingGoal(null);
                showUpsell(code);
                fetchData();
            } else if (e?.response?.status === 400) {
                setEditError(serverError(e.response.data?.detail ?? tc('serverError.goalNameTaken')));
            } else {
                console.error('Edit goal error:', e);
                setEditError(serverError(e?.response?.data?.detail ?? tc('state.genericError')));
            }
        }
    };

    // Month / year pickers for the edit modal (components/goals/DatePickers, shared
    // with the goal form). A month before this one can't be picked for this year.
    const renderMonthChips = (selected: string, onSelect: (m: string) => void) => (
        <MonthChips
            selected={selected}
            onSelect={onSelect}
            isDisabled={m => editYear === today.getFullYear() && isBeforeThisMonth(m, editYear, today)
                && m !== editingGoal?.target_month}
        />
    );

    const renderYearChips = (selected: number, onSelect: (y: number) => void) => (
        <YearPicker selected={selected} onSelect={onSelect} />
    );

    // Renders one active savings goal card (progress = allocated / target, complete
    // when fully funded).
    // A LOCKED goal (free tier) renders grayed: no pace, no gear, no completion arrow,
    // and it is left out of the deposit chips. Its trash stays at full strength — a goal
    // the user can't fund has to be one they can obviously get rid of.
    const renderLockedGoalCard = (g: Goal) => {
        const target = g.target_amount ?? 0;
        const pct = target > 0 ? Math.min(100, (g.allocated_amount / target) * 100) : 0;
        return (
            <Card
                key={g.id}
                theme={theme}
                depth={2}
                padding={16}
                style={{ marginBottom: 12, backgroundColor: theme.surfaceSoft }}
            >
                <View style={styles.goalHeader} accessibilityLabel={tp('goalLock.a11y')}>
                    <View style={[styles.goalIconTile, styles.lockedDim, { backgroundColor: theme.borderSoft }]}>
                        <IconSavingsGoalMascot size={22} accent={theme.ink3} paper={theme.borderSoft} />
                    </View>
                    <View style={[{ flex: 1 }, styles.lockedDim]}>
                        <View style={styles.lockedTitleRow}>
                            <Text style={[styles.goalTitle, { color: theme.ink2, flexShrink: 1 }]}>{serverTitle(g.title)}</Text>
                            <View style={[styles.lockBadge, { backgroundColor: theme.border }]}>
                                <IconLock size={10} color={theme.ink2} />
                                <Text style={[styles.lockBadgeText, { color: theme.ink2 }]}>{tp('goalLock.badge')}</Text>
                            </View>
                        </View>
                        <Text style={[styles.goalMeta, { color: theme.ink3 }]}>{tp('goalLock.meta')}</Text>
                    </View>
                    <View style={styles.goalActions}>
                        <Pressable
                            onPress={() => deleteGoal(g)}
                            hitSlop={10}
                            accessibilityLabel={t('alert.removeGoalTitle')}
                        >
                            <IconTrash size={16} color={theme.danger} />
                        </Pressable>
                    </View>
                </View>

                <View style={[styles.goalAmtRow, styles.lockedDim]}>
                    <Text style={[styles.goalSaved, { color: theme.ink2 }]}>
                        {fmtMoney(g.allocated_amount)}
                    </Text>
                    <Text style={[styles.goalOf, { color: theme.ink3 }]}>
                        {t('card.ofTargetSaving', { target: fmtMoney(target) })}
                    </Text>
                </View>

                <View style={styles.lockedDim}>
                    <AnimatedProgressBar value={pct} color={theme.ink3} bg={theme.border} height={7} />
                </View>

                <Pressable onPress={openPaywall} hitSlop={8} style={({ pressed }) => [styles.unlockLink, pressed && { opacity: 0.6 }]}>
                    <Text style={[styles.unlockText, { color: theme.brand }]}>{tp('goalLock.unlock')}</Text>
                </Pressable>
            </Card>
        );
    };

    // A retired debt goal an older build left holding money: listed so the money is
    // visible, and deletable (its money goes to General Savings, as for any goal), but
    // it takes no new money, so it has no pace, gear or completion arrow.
    const renderLegacyDebtCard = (g: Goal) => (
        <Card key={g.id} theme={theme} depth={2} padding={16} style={{ marginBottom: 12 }}>
            <View style={styles.goalHeader}>
                <View style={[styles.goalIconTile, { backgroundColor: theme.borderSoft }]}>
                    <IconDebtMascot size={22} accent={theme.ink3} paper={theme.borderSoft} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.goalTitle, { color: theme.ink }]}>{serverTitle(g.title)}</Text>
                    <Text style={[styles.goalMeta, { color: theme.ink3 }]}>{t('legacyDebt.meta')}</Text>
                </View>
                <View style={styles.goalActions}>
                    <Pressable onPress={() => deleteGoal(g)} hitSlop={10} accessibilityLabel={t('alert.removeGoalTitle')}>
                        <IconTrash size={16} color={theme.danger} />
                    </Pressable>
                </View>
            </View>
            <View style={styles.goalAmtRow}>
                <Text style={[styles.goalSaved, { color: theme.ink }]}>{fmtMoney(g.allocated_amount)}</Text>
                <Text style={[styles.goalOf, { color: theme.ink3 }]}>{t('legacyDebt.held')}</Text>
            </View>
        </Card>
    );

    // One active goal card (prompts/GOAL_CARD_REDESIGN.md), top to bottom:
    //   name · complete / edit / delete
    //   "On track for March: right on time · Save $104/month"
    //   saved, of target
    //   progress
    //   [Add $90 for October  ◯] [+ Extra]   — or, once fully funded, "Complete my goal"
    // Every number is the server's: the stored minimum, the toggle's amount (capped to
    // what is left to save), and the pace.
    const renderGoalCard = (g: Goal) => {
        if (g.locked) return renderLockedGoalCard(g);
        const target = g.target_amount ?? 0;
        const pct = target > 0 ? Math.min(100, (g.allocated_amount / target) * 100) : 0;
        const funded = target > 0 && g.allocated_amount >= target;
        const minimum = g.monthly_minimum ?? null;
        const hasToggle = (g.minimum_amount ?? 0) > 0 || !!g.minimum_logged;
        const pace = g.on_pace;
        // Keyed: react-i18next 14 hands this element back in a list as-is, and React 19
        // warns about an unkeyed list child. "bold" is the tag name Trans looks it up by.
        const bold = <Text key="bold" style={styles.goalLineStrong} />;

        let line: React.ReactNode = null;
        if (funded) {
            line = t('card.goalAchieved');
        } else if (pace && minimum !== null) {
            const status = pace.months_early > 0
                ? t('card.status.early', { count: pace.months_early })
                : pace.months_early < 0
                    ? t('card.status.behind', { count: -pace.months_early })
                    : t('card.status.onTime');
            line = (
                <Trans
                    i18nKey="goals:card.paceLine"
                    values={{ month: monthLabel(pace.month), status, amount: fmtMoney(minimum) }}
                    components={{ bold }}
                />
            );
        } else if (minimum !== null && minimum > 0) {
            line = t('card.saveOnly', { amount: fmtMoney(minimum) });
        }

        return (
            <Card key={g.id} theme={theme} depth={5} padding={16} style={{ marginBottom: 12 }}>
                {/* 1. Name, then complete / edit / delete */}
                <View style={styles.goalTopRow}>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.goalName, { color: theme.ink }]}>
                        {serverTitle(g.title)}
                    </Text>
                    <View style={styles.goalActions}>
                        {/* Any time, so a goal can still be completed early. */}
                        <Pressable onPress={() => completeGoal(g)} hitSlop={10}
                            accessibilityRole="button" accessibilityLabel={t('card.completeGoalA11y')}>
                            <IconCheck size={16} color={theme.ink3} />
                        </Pressable>
                        <Pressable onPress={() => openEditGoal(g)} hitSlop={10}
                            accessibilityRole="button" accessibilityLabel={t('editGoal.titleSaving')}>
                            <IconGearMascot size={14} color={theme.ink3} />
                        </Pressable>
                        <Pressable onPress={() => deleteGoal(g)} hitSlop={10}
                            accessibilityRole="button" accessibilityLabel={t('alert.removeGoalTitle')}>
                            <IconTrash size={14} color={theme.ink3} />
                        </Pressable>
                    </View>
                </View>

                {/* 2. Pace and the monthly amount, in one line that may wrap */}
                {line ? (
                    <Text style={[styles.goalLine, { color: funded ? theme.success : theme.ink2 }]}>{line}</Text>
                ) : null}

                {/* 3. Saved, of target */}
                <View style={styles.goalAmtRow}>
                    <Text style={[styles.goalSaved, { color: theme.ink }]}>
                        {fmtMoney(g.allocated_amount)}
                    </Text>
                    <Text style={[styles.goalOf, { color: theme.ink3 }]}>
                        {t('card.ofTargetSaving', { target: fmtMoney(target) })}
                    </Text>
                </View>

                {/* 4. Progress, in the Goals emerald */}
                <AnimatedProgressBar value={pct} color={theme.goals} bg={theme.borderSoft} height={7} />

                {/* 5. This month's amount and an extra payment — or, once the goal holds
                    its whole target, the one thing left to do. */}
                {funded ? (
                    <Pressable
                        onPress={() => completeGoal(g)}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.completeGoalBtn, { backgroundColor: theme.goals }, pressed && { opacity: 0.85 }]}
                    >
                        <IconCheck size={15} color={theme.onBrand} />
                        <Text style={[styles.completeGoalText, { color: theme.onBrand }]}>{t('card.completeMyGoal')}</Text>
                    </Pressable>
                ) : (
                    <View style={styles.habitRow}>
                        {hasToggle ? (
                            <GoalMinToggle
                                title={serverTitle(g.title)}
                                logged={!!g.minimum_logged}
                                amount={g.minimum_amount ?? 0}
                                auto={!!g.auto_minimum}
                                pendingValue={pendingMinFor(g.id)}
                                onChange={() => toggleMin(g.id, !!g.minimum_logged)}
                            />
                        ) : null}
                        <Pressable
                            onPress={() => setExtraGoal(g)}
                            accessibilityRole="button"
                            accessibilityLabel={t('extra.button')}
                            style={({ pressed }) => [styles.extraHalf, { borderColor: theme.brand }, pressed && { opacity: 0.7 }]}
                        >
                            <Text numberOfLines={1} style={[styles.extraBtnText, { color: theme.brand }]}>{t('card.extraShort')}</Text>
                        </Pressable>
                    </View>
                )}
            </Card>
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
        <ScrollView
            ref={scrollRef}
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
                        <Text style={styles.heroEyebrow}>{t('hero.eyebrow')}</Text>
                        <Pressable
                            onPress={() => {
                                openGoalForm(false);
                                closeTxForm();
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
                            <Text style={styles.heroBalanceLabel}>{t('hero.balanceLabel')}</Text>
                            <AnimatedAmount value={heroBalance} size={tv(48, 68)} color="#fff" decimals={2} />
                            <Text style={styles.heroTagline}>{t('hero.tagline')}</Text>
                        </View>
                    </View>

                    {/* Action button — depositing is the only hand-written transaction.
                        goals_v2: gone; each card has its own extra-payment button instead. */}
                    {SHOW_GENERAL_SAVINGS && <View style={styles.actionRow}>
                        <Pressable
                            onPress={toggleTxForm}
                            style={({ pressed }) => [
                                styles.actionBtn,
                                {
                                    backgroundColor: showTxForm
                                        ? 'rgba(255,255,255,0.28)'
                                        : 'rgba(255,255,255,0.16)',
                                    borderColor: 'rgba(255,255,255,0.22)',
                                },
                                pressed && { opacity: 0.85 },
                            ]}
                        >
                            <IconPlus size={15} color="#fff" />
                            <Text style={styles.actionBtnText}>{t('hero.setAside')}</Text>
                        </Pressable>
                    </View>}

                </View>
            </HeroBg>

            <View style={styles.content} onLayout={e => { contentY.current = e.nativeEvent.layout.y; }}>

                {/* ── Inline deposit form ───────────────────────────── */}
                {SHOW_GENERAL_SAVINGS && showTxForm && (
                    <Card theme={theme} depth={5} padding={20} style={styles.txForm}>
                        <Text style={[styles.formTitle, { color: theme.ink }]}>
                            {t('depositForm.title')}
                        </Text>

                        {/* Amount */}
                        <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>{t('depositForm.amountLabel')}</Text>
                        <View style={[styles.amountInputRow, {
                            backgroundColor: theme.surfaceSoft, borderColor: theme.border,
                        }]}>
                            <Text style={[styles.dollarSign, { color: theme.ink2 }]}>{currencySymbol}</Text>
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
                        {goalChips.length > 0 && (
                            <>
                                <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>
                                    {t('depositForm.whichGoal')}
                                </Text>
                                <View style={styles.chipWrap}>
                                    {goalChips.map(g => {
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
                                                    {serverTitle(g.title)}
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
                                    {t('depositForm.fundingSource')}
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
                                    { backgroundColor: theme.goals },
                                    pressed && { opacity: 0.85 },
                                ]}
                            >
                                <IconCheck size={15} color="#fff" />
                                <Text style={styles.submitBtnText}>
                                    {fundingSource === 'general' ? t('depositForm.transfer') : t('depositForm.plantSeed')}
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={closeTxForm}
                                style={({ pressed }) => [
                                    styles.cancelBtn, { borderColor: theme.border },
                                    pressed && { opacity: 0.7 },
                                ]}
                            >
                                <Text style={[styles.cancelBtnText, { color: theme.ink2 }]}>{tc('action.cancel')}</Text>
                            </Pressable>
                        </View>
                    </Card>
                )}

                {/* ── Tabs ─────────────────────────────────────────── */}
                <View style={[styles.tabPill, {
                    backgroundColor: theme.surfaceSoft,
                    borderColor: theme.borderSoft,
                }]}>
                    {(['active', 'completed'] as const).map(tab => (
                        <Pressable
                            key={tab}
                            onPress={() => setActiveTab(tab)}
                            style={[
                                styles.tabItem,
                                activeTab === tab && [
                                    styles.tabItemActive,
                                    { backgroundColor: theme.surface, ...(shadow(2) as object) },
                                ],
                            ]}
                        >
                            <Text style={[
                                styles.tabText,
                                { color: activeTab === tab ? theme.ink : theme.ink3 },
                            ]}>
                                {tab === 'active'
                                    ? t('tabs.active')
                                    : completedGoals.length > 0
                                        ? t('tabs.completedCount', { count: completedGoals.length })
                                        : t('tabs.completed')}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {activeTab === 'completed' ? (

                    /* ── Completed goals ─────────────────────────── */
                    <View style={{ marginTop: 16 }}>
                        {completedGoals.length === 0 ? (
                            <Text style={[styles.emptyText, { color: theme.ink3 }]}>
                                {t('empty.completed')}
                            </Text>
                        ) : completedGoals.map(g => (
                            <Card key={g.id} theme={theme} depth={4} padding={16} style={{ marginBottom: 12 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={[styles.goalIconTile, { backgroundColor: theme.goalsSoft }]}>
                                        <IconCheck size={18} color={theme.goals} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.goalTitle, { color: theme.goals }]}>{serverTitle(g.title)}</Text>
                                        <Text style={[styles.goalMeta, { color: theme.ink3 }]}>
                                            {/* completed_amount is the snapshot taken at completion; older
                                                goals predate the column, so fall back to the computed value. */}
                                            {t('card.completedMetaSaving', {
                                                amount: fmtMoney(g.completed_amount ?? g.allocated_amount ?? 0),
                                                target: fmtMoney(g.target_amount ?? 0),
                                                month: monthLabel(g.target_month ?? ''), year: g.target_year,
                                            })}
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
                            {t('section.savings')}
                        </Text>

                        {/* ── Ready to Replant (goals_v2) — only while it holds money ── */}
                        {replantBalance > 0.005 && (
                            <ReplantCard balance={replantBalance} goals={plantable} onPlanted={fetchData} />
                        )}

                        {/* ── General Savings pinned card (switched off: SHOW_GENERAL_SAVINGS) ── */}
                        {SHOW_GENERAL_SAVINGS && generalGoal && (
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
                                            {tc('serverTitle.General Savings')}
                                        </Text>
                                        <Text style={[styles.goalMeta, { color: theme.ink3 }]}>
                                            {t('general.meta')}
                                        </Text>
                                    </View>
                                    {/* No delete button for General Savings */}
                                </View>
                                <View style={styles.goalAmtRow}>
                                    <Text style={[styles.goalSaved, { color: theme.brand }]}>
                                        {fmtMoney(generalGoal.allocated_amount)}
                                    </Text>
                                    <Text style={[styles.goalOf, { color: theme.ink3 }]}>
                                        {t('general.available')}
                                    </Text>
                                </View>
                            </Card>
                        )}

                        {savingsGoals.length === 0 && !showGoalForm && (
                            <Text style={[styles.emptyText, { color: theme.ink3 }]}>
                                {t('empty.savings')}
                            </Text>
                        )}

                        {savingsGoals.map(renderGoalCard)}

                        {/* ── Debt section: only what the app still manages here — the
                            Reconciliation goal, and retired debt goals holding money.
                            Debts themselves live on the Debts tab. ─── */}
                        {(reconActive || legacyDebtGoals.length > 0) && (
                            <Text style={[styles.sectionLabel, { color: theme.ink3, marginTop: 24 }]}>
                                {t('section.debt')}
                            </Text>
                        )}

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
                                                <Text style={[styles.goalTitle, { color: theme.ink }]}>{tc('serverTitle.Reconciliation')}</Text>
                                                <View style={[styles.autoBadge, { backgroundColor: theme.harvest }]}>
                                                    <Text style={[styles.autoBadgeText, { color: theme.brand }]}>{t('recon.badge')}</Text>
                                                </View>
                                            </View>
                                            <Text style={[styles.reconExplain, { color: theme.ink2 }]}>
                                                {t('recon.explain')}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.goalAmtRow}>
                                        <Text style={[styles.goalSaved, { color: theme.danger }]}>
                                            {fmtMoney(reconOutstanding)}
                                        </Text>
                                        <Text style={[styles.goalOf, { color: theme.ink3 }]}>
                                            {t('recon.progress', { repaid: fmtMoney(repaid), owed: fmtMoney(owed) })}
                                        </Text>
                                    </View>
                                    <AnimatedProgressBar
                                        value={pct}
                                        color={theme.success}
                                        bg={theme.borderSoft}
                                        height={7}
                                    />
                                    {/* Repaying it is an extra payment like any other (the
                                        deposit form it used to go through is gone). */}
                                    <Pressable
                                        onPress={() => setExtraGoal(reconGoal)}
                                        accessibilityRole="button"
                                        style={({ pressed }) => [styles.extraBtn, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                                    >
                                        <IconPlus size={14} color={theme.brand} />
                                        <Text style={[styles.extraBtnText, { color: theme.brand }]}>{t('extra.button')}</Text>
                                    </Pressable>
                                </Card>
                            );
                        })()}

                        {legacyDebtGoals.map(renderLegacyDebtCard)}

                        {/* Plant new goal. At the free cap it stays visible but inert, with
                            the upsell right under it — the numbers are the server's. */}
                        <View onLayout={e => { capY.current = e.nativeEvent.layout.y; }}>
                            <Pressable
                                onPress={() => openGoalForm(true)}
                                style={({ pressed }) => [
                                    styles.plantBtn, { borderColor: theme.border },
                                    atGoalCap && { marginBottom: 10 },
                                    pressed && { opacity: 0.7 },
                                ]}
                            >
                                {atGoalCap
                                    ? <IconLock size={15} color={theme.ink3} />
                                    : <IconPlus size={16} color={theme.brand} />}
                                <Text style={[styles.plantBtnText, { color: atGoalCap ? theme.ink3 : theme.brand }]}>
                                    {t('newGoal.button')}
                                </Text>
                            </Pressable>

                            {atGoalCap && (
                                <View style={[styles.capCard, { backgroundColor: theme.harvestSoft }]}>
                                    <Text style={[styles.capText, { color: theme.ink }]}>{capMessage}</Text>
                                    <Pressable onPress={openPaywall} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.6 }}>
                                        <Text style={[styles.unlockText, { color: theme.brand }]}>{tp('goalCap.cta')}</Text>
                                    </Pressable>
                                </View>
                            )}
                        </View>

                        {/* Goal creation form — never at the cap, including when a deep
                            link (the Firm Foundation suggestion) asked for it. */}
                        {showGoalForm && !atGoalCap && (
                            <GoalForm
                                initialTitle={prefillTitle}
                                initialAmount={prefillAmount}
                                onCreated={onGoalCreated}
                                onCancel={() => setShowGoalForm(false)}
                                // At the cap after all (the allowances were unknown or
                                // stale): the form says so in place; refreshing lets the
                                // cap message with the server's numbers take its place.
                                onPremiumError={() => fetchData()}
                            />
                        )}
                    </>
                )}

                {/* ── Recent activity ──────────────────────────────── */}
                <Text style={[styles.sectionLabel, { color: theme.ink3, marginTop: 24 }]}>
                    {t('section.recentActivity')}
                </Text>

                {history.length === 0 && (
                    <Text style={[styles.emptyText, { color: theme.ink3 }]}>
                        {t('empty.history')}
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
                                <Text style={[styles.txTitle, { color: theme.ink }]}>{serverTitle(tx.title)}</Text>
                                <Text style={[styles.txDate, { color: theme.ink3 }]}>
                                    {monthAbbr(tx.month)} {tx.day}
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
                                {tx.is_transfer ? '' : tx.type === 'deposit' ? '+' : '−'}{fmtMoney(tx.amount, 2)}
                            </Text>
                            {tx.deletable !== false ? (
                                <Pressable onPress={() => deleteTransaction(tx)} hitSlop={10}>
                                    <IconTrash size={14} color={theme.ink3} />
                                </Pressable>
                            ) : <View style={{ width: 14 }} />}
                        </View>
                    </Card>
                ))}

            </View>
        </ScrollView>

        <ExtraPaymentSheet
            goal={extraGoal}
            onClose={() => setExtraGoal(null)}
            onAdded={() => {
                if (extraGoal && !extraGoal.is_reconciliation) analytics.savingsGoalFunded({ goal_id: extraGoal.id });
                setExtraGoal(null);
                fetchData();
            }}
        />

        {/* ── Edit goal modal (gear icon on a goal card) ────────────── */}
        <Modal
            visible={editingGoal !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setEditingGoal(null)}
        >
            <View style={styles.modalOverlay}>
                <View style={[styles.modalCard, { backgroundColor: theme.surface, ...(shadow(9) as object) }]}>
                    <Text style={[styles.modalTitle, { color: theme.ink }]}>
                        {t('editGoal.titleSaving')}
                    </Text>

                    <ScrollView keyboardShouldPersistTaps="handled">
                        <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>
                            {t('newGoal.nameLabelSaving')}
                        </Text>
                        <TextInput
                            style={[styles.textInput, {
                                backgroundColor: theme.surfaceSoft,
                                borderColor: theme.border,
                                color: theme.ink,
                            }]}
                            placeholderTextColor={theme.ink3}
                            value={editTitle}
                            onChangeText={next => { setEditTitle(next); setEditError(''); }}
                            maxLength={30}
                        />
                        {editError !== '' && (
                            <Text style={[styles.errorText, { color: theme.danger }]}>{editError}</Text>
                        )}

                        <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>
                            {t('newGoal.amountLabelSaving')}
                        </Text>
                        <TextInput
                            style={[styles.textInput, {
                                backgroundColor: theme.surfaceSoft,
                                borderColor: theme.border,
                                color: theme.ink,
                            }]}
                            placeholder={formatNumber(5000)}
                            placeholderTextColor={theme.ink3}
                            value={editAmount}
                            onChangeText={next => { setEditAmount(next); setEditError(''); }}
                            keyboardType="decimal-pad"
                            maxLength={10}
                        />

                        <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>{t('newGoal.monthLabel')}</Text>
                        {renderMonthChips(editMonth, setEditMonth)}

                        <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>{t('newGoal.yearLabel')}</Text>
                        {renderYearChips(editYear, setEditYear)}

                        {editingGoal?.monthly_minimum != null && (
                            <>
                                <View style={styles.autoRow}>
                                    <Text style={[styles.autoLabel, { color: theme.ink }]}>{t('form.autoLabel')}</Text>
                                    <Switch
                                        value={editAuto}
                                        onValueChange={setEditAuto}
                                        trackColor={{ false: theme.border, true: theme.brand }}
                                        thumbColor={theme.surface}
                                        ios_backgroundColor={theme.border}
                                        accessibilityLabel={t('form.autoLabel')}
                                    />
                                </View>
                                <Text style={[styles.autoHint, { color: theme.ink3 }]}>{t('form.autoHint')}</Text>
                            </>
                        )}
                    </ScrollView>

                    <View style={styles.formBtnRow}>
                        <Pressable
                            onPress={submitEditGoal}
                            style={({ pressed }) => [
                                styles.submitBtn, { backgroundColor: theme.brand },
                                pressed && { opacity: 0.85 },
                            ]}
                        >
                            <IconCheck size={15} color="#fff" />
                            <Text style={styles.submitBtnText}>{t('editGoal.save')}</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => setEditingGoal(null)}
                            style={({ pressed }) => [
                                styles.cancelBtn, { borderColor: theme.border },
                                pressed && { opacity: 0.7 },
                            ]}
                        >
                            <Text style={[styles.cancelBtnText, { color: theme.ink2 }]}>{tc('action.cancel')}</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
        </>
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
        fontSize: ft(11, 1.25),
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
        fontSize: ft(11, 1.25),
        letterSpacing: 1.6,
        marginBottom: 2,
    },
    heroTagline: {
        color: 'rgba(255,255,255,0.7)',
        fontFamily: 'InstrumentSerif-Italic',
        fontSize: ft(12, 1.18),
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
        fontSize: ft(13, 1.2),
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
        fontSize: ft(20, 1.3),
        letterSpacing: -0.3,
        marginBottom: 16,
    },
    fieldLabel: {
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: ft(10, 1.25),
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
        fontSize: ft(22, 1.3),
        marginRight: 4,
    },
    amountField: {
        flex: 1,
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: ft(32, 1.3),
        lineHeight: ft(44, 1.3),
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
    // Fixed width so the snap interval is exact: 76 + 8 margin = YEAR_ITEM_W (84).
    yearItem: {
        width: 76,
        marginRight: 8,
        paddingVertical: 9,
        borderRadius: 999,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chipText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: ft(12, 1.18),
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
        fontSize: ft(14, 1.2),
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
        fontSize: ft(14, 1.2),
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
        fontSize: ft(13, 1.2),
        // No textTransform: 'capitalize' — the labels now come from the catalogue
        // already cased, and on Android capitalize title-cases every word, which is
        // wrong for "Metas ativas".
    },

    // Section label
    sectionLabel: {
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: ft(10, 1.25),
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
    autoBadgeText: { fontFamily: 'JetBrainsMono-SemiBold', fontSize: ft(8, 1.2), letterSpacing: 1 },
    reconExplain: { fontFamily: 'Geist-Regular', fontSize: ft(11, 1.18), marginTop: 3, lineHeight: ft(16, 1.18) },

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
        fontSize: ft(14, 1.28),
        letterSpacing: -0.1,
    },
    goalTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    goalName: {
        flex: 1,
        fontFamily: 'Geist-Bold',
        fontSize: ft(16, 1.28),
        letterSpacing: -0.2,
    },
    goalLine: {
        fontFamily: 'Geist-Regular',
        fontSize: ft(12, 1.18),
        lineHeight: ft(17, 1.18),
        marginTop: 4,
        marginBottom: 10,
    },
    goalLineStrong: {
        fontFamily: 'Geist-SemiBold',
    },
    habitRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 14,
    },
    // "+ Extra": the same height and outline as the minimum toggle beside it, so the
    // two read as a pair, but one third of the row to the toggle's two thirds — its own
    // label is short and the toggle's needs the room. Alone (no toggle) it fills the row.
    extraHalf: {
        flex: 1,
        minHeight: 46,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
        borderRadius: 10,
        borderWidth: 1.5,
    },
    completeGoalBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        minHeight: 46,
        marginTop: 14,
        borderRadius: 10,
    },
    completeGoalText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: ft(14, 1.2),
    },
    extraBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 10,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
    },
    extraBtnText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: ft(13, 1.2),
    },
    autoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 6,
    },
    autoLabel: {
        flex: 1,
        fontFamily: 'Geist-SemiBold',
        fontSize: ft(14, 1.2),
    },
    autoHint: {
        fontFamily: 'Geist-Regular',
        fontSize: ft(12, 1.18),
        lineHeight: ft(17, 1.18),
        marginBottom: 14,
    },
    goalMeta: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: ft(11, 1.18),
        marginTop: 2,
    },
    goalAmtRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 8,
    },
    goalSaved: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: ft(26, 1.3),
        letterSpacing: -0.5,
    },
    goalOf: {
        fontFamily: 'Geist-Regular',
        fontSize: ft(13, 1.18),
    },
    goalActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },

    // Locked goal (free tier). The dim applies to the content only — never to the
    // trash, which has to stay an obvious way out.
    lockedDim: { opacity: 0.55 },
    lockedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    lockBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    lockBadgeText: { fontFamily: 'JetBrainsMono-SemiBold', fontSize: ft(8, 1.2), letterSpacing: 1 },
    unlockLink: { alignSelf: 'flex-start', marginTop: 12 },
    unlockText: { fontFamily: 'Geist-SemiBold', fontSize: ft(13, 1.18) },

    // Inline upsell under "new goal" at the free cap
    capCard: { borderRadius: 14, padding: 14, gap: 8, marginBottom: 16 },
    capText: { fontFamily: 'Geist-Regular', fontSize: ft(13, 1.18), lineHeight: ft(19, 1.18) },
    // Sits in the baseline-aligned amount row, so it opts out with alignSelf.
    completeBtn: {
        width: tv(44, 54),
        height: tv(32, 40),
        borderRadius: 10,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
    },

    // Edit goal modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalCard: {
        width: '100%',
        maxHeight: '85%',
        borderRadius: 22,
        padding: 22,
    },
    modalTitle: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: ft(22, 1.3),
        marginBottom: 14,
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
        fontSize: ft(13, 1.2),
    },

    // Goal creation form inputs
    textInput: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: ft(15, 1.18),
        fontFamily: 'Geist-Regular',
        marginBottom: 14,
    },
    errorText: {
        fontFamily: 'Geist-Regular',
        fontSize: ft(12, 1.18),
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
        fontSize: ft(13, 1.18),
    },
    txDate: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: ft(11, 1.18),
        marginTop: 2,
    },
    txAmt: {
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: ft(14, 1.18),
    },

    // Empty state
    emptyText: {
        fontFamily: 'InstrumentSerif-Italic',
        fontSize: ft(14, 1.18),
        textAlign: 'center',
        marginTop: 12,
        marginBottom: 16,
    },
});
