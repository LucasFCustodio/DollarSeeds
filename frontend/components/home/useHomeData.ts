/**
 * useHomeData — the home's state and requests, so app/(tabs)/index.tsx stays layout.
 *
 * Behaviour carried over unchanged from the previous home:
 *  - /dashboard/{month} on every focus and month change;
 *  - the "all green" scripture modal, once per month;
 *  - the tithe-given toggle (optimistic, in-flight guarded, refused on a closed month);
 *  - close-out and reopen, with the same warning and rating-prompt sequencing.
 *
 * New: /home/summary/ alongside the dashboard (never blocking — a failure renders the
 * home without it), and the pending bank transactions (lib/bankTransactions.ts).
 */
import { useCallback, useState } from 'react';
import { Alert, LayoutAnimation } from 'react-native';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { MONTHS } from '../../constants/months';
import { resolveBudgetType, splitLabel } from '../../constants/budgetTypes';
import { maybeRequestReview } from '../../lib/storeReview';
import { fetchHomeSummary, type HomeSummary } from '../../lib/homeSummary';
import {
    classifyPendingTransaction, getPendingTransactions, isBankConnected,
    type ClassifyTarget, type PendingTransaction,
} from '../../lib/bankTransactions';
import { randomVerse, VERSE_IDS, type VerseId } from './ScriptureModal';

const BASE = (__DEV__ && process.env.EXPO_PUBLIC_API_URL) || 'https://dollarseeds-1.onrender.com';

export interface DashboardData {
    total_income: number;
    // `given` = the user has confirmed this month's tithe actually left the account.
    // Optional because a backend deployed before the tithe-given migration omits it;
    // undefined is read as false, which is the pre-feature behaviour exactly.
    tithe?: { enabled: boolean; rate: number; amount: number; given?: boolean };
    budget_type?: { key: string; needs: number; wants: number; savings: number };
    // The user's LIVE split setting, not `budget_type` once a month is closed — that
    // one is the split the month was frozen with. Used to tell the user what
    // reopening a closed month would switch it to.
    live_budget_type?: string;
    // Rollover (end-of-month close-out) state for the displayed month. Purely
    // informational — source='rollover' is excluded from every budget/score number.
    rollover?: { closed: boolean; closed_at: string | null; amount: number; target: number };
    budgets: { needs: number; wants: number; goals: number };
    expenses: { needs: number; wants: number; goals: number };
    compliance_score: { overall: number | null; needs: number; wants: number; goals: number };
}

const EMPTY: DashboardData = {
    total_income: 0,
    budgets: { needs: 0, wants: 0, goals: 0 },
    expenses: { needs: 0, wants: 0, goals: 0 },
    compliance_score: { overall: null, needs: 10, wants: 10, goals: 10 },
};

// Which months have already shown the scripture modal. Module scope rather than a
// ref so it survives the screen remounting; it is per app launch, as before.
const verseShownMonths = new Set<string>();

export function useHomeData() {
    const { user } = useAuth();
    const { monthLabel } = useLocale();
    const { t } = useTranslation('dashboard');
    const { t: tc } = useTranslation('common');

    // MONTHS is the canonical English list — what gets sent and stored, never
    // translated. Display goes through monthLabel()/monthYear().
    const [monthIndex, setMonthIndex] = useState(new Date().getMonth());
    const currentMonth = MONTHS[monthIndex];

    const [dashboard, setDashboard] = useState<DashboardData>(EMPTY);
    const [summary, setSummary] = useState<HomeSummary | null>(null);
    const [pending, setPending] = useState<PendingTransaction[]>([]);
    // The verse outlives the modal's visibility so the fade-out still has text.
    const [verse, setVerse] = useState<VerseId>(VERSE_IDS[0]);
    const [verseVisible, setVerseVisible] = useState(false);
    const [savingTitheGiven, setSavingTitheGiven] = useState(false);
    const [closingMonth, setClosingMonth] = useState(false);
    const [dismissedCloseout, setDismissedCloseout] = useState<Set<string>>(new Set());

    const loadSummary = useCallback(() => {
        fetchHomeSummary(currentMonth)
            .then(setSummary)
            .catch(err => {
                // Never block the home on it: render without the summary's parts.
                console.error('Home summary fetch error:', err?.message ?? err);
                setSummary(null);
            });
    }, [currentMonth]);

    /**
     * @returns whether the allGreen scripture modal was opened by this fetch. The
     * close-out needs to know: the rating prompt must come after the celebration,
     * never over it.
     */
    const fetchDashboard = useCallback(async (): Promise<boolean> => {
        if (!user?.id) return false;
        loadSummary();
        try {
            const res = await axios.get(`${BASE}/dashboard/${currentMonth}?user_id=${user.id}`);
            const data: DashboardData = res.data;
            setDashboard(data);

            const allGreen =
                data.total_income > 0 &&
                data.expenses.needs <= data.budgets.needs &&
                data.expenses.wants <= data.budgets.wants &&
                data.expenses.goals <= data.budgets.goals;
            if (allGreen && !verseShownMonths.has(currentMonth)) {
                verseShownMonths.add(currentMonth);
                setVerse(randomVerse());
                setVerseVisible(true);
                return true;
            }
        } catch (error) {
            if (error instanceof Error) console.error('Dashboard fetch error:', error.message);
        }
        return false;
    }, [user?.id, currentMonth, loadSummary]);

    const loadPending = useCallback(() => {
        getPendingTransactions().then(setPending).catch(() => setPending([]));
    }, []);

    useFocusEffect(useCallback(() => {
        fetchDashboard();
        loadPending();
    }, [fetchDashboard, loadPending]));

    const pickMonth = useCallback((i: number) => {
        // A stale summary from the previous month must not show under the new one.
        if (i !== monthIndex) setSummary(null);
        setMonthIndex(i);
    }, [monthIndex]);

    const closeMonth = useCallback(async () => {
        if (!user?.id || closingMonth) return;
        setClosingMonth(true);
        try {
            await axios.post(`${BASE}/rollover/close/`, { user_id: user.id, month: currentMonth });
            const openedScripture = await fetchDashboard();
            // A positive moment: ask for the App Store rating — but only AFTER the
            // celebration, never over it. maybeRequestReview owns the throttling and
            // is a no-op in dev builds and TestFlight (lib/storeReview.ts).
            if (!openedScripture) void maybeRequestReview('month_closed');
        } catch (err) {
            console.error('Close month error:', err);
        } finally {
            setClosingMonth(false);
        }
    }, [user?.id, closingMonth, currentMonth, fetchDashboard]);

    const doReopen = useCallback(async () => {
        if (!user?.id) return;
        setClosingMonth(true);
        try {
            await axios.post(`${BASE}/rollover/reopen/`, { user_id: user.id, month: currentMonth });
            await fetchDashboard();
        } catch (err) {
            console.error('Reopen month error:', err);
        } finally {
            setClosingMonth(false);
        }
    }, [user?.id, currentMonth, fetchDashboard]);

    /**
     * Reopen a closed month, after warning what that costs: reopening un-freezes the
     * split and tithe it was closed with, so from then on the month follows whatever
     * Settings say NOW. We name the split it is about to adopt and let them back out.
     */
    const reopenMonth = useCallback(() => {
        if (!user?.id || closingMonth) return;
        const liveType = resolveBudgetType(dashboard.live_budget_type);
        Alert.alert(
            t('rollover.reopenTitle', { month: monthLabel(currentMonth) }),
            t('rollover.reopenWarning', {
                month: monthLabel(currentMonth),
                split: `${tc(`budgetType.${liveType.key}.name`)} · ${splitLabel(liveType)}`,
            }),
            [
                { text: tc('action.cancel'), style: 'cancel' },
                { text: t('rollover.reopen'), onPress: () => { void doReopen(); } },
            ],
        );
    }, [user?.id, closingMonth, dashboard.live_budget_type, currentMonth, monthLabel, t, tc, doReopen]);

    const dismissCloseout = useCallback(() => {
        setDismissedCloseout(prev => new Set(prev).add(currentMonth));
    }, [currentMonth]);

    /**
     * Mark this month's tithe as given (or un-mark it). Optimistic: the hero amount
     * is the whole point of the toggle, so it moves on the tap. The previous tithe is
     * restored on failure, which also puts the switch back.
     */
    const toggleTitheGiven = useCallback(async () => {
        if (!user?.id || savingTitheGiven) return;
        // A closed month is settled: its leftover was swept into General Savings with
        // the tithe carved out, so un-marking it here would show money that never moved.
        if (dashboard.rollover?.closed) return;
        const previous = dashboard.tithe;
        if (!previous) return;
        const next = !previous.given;

        setSavingTitheGiven(true);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setDashboard(prev => ({ ...prev, tithe: { ...prev.tithe!, given: next } }));
        try {
            await axios.post(`${BASE}/tithe/given/`, { user_id: user.id, month: currentMonth, given: next });
        } catch (err) {
            console.error('Tithe given toggle error:', err);
            setDashboard(prev => ({ ...prev, tithe: previous }));
        } finally {
            setSavingTitheGiven(false);
        }
    }, [user?.id, savingTitheGiven, dashboard.rollover?.closed, dashboard.tithe, currentMonth]);

    const classify = useCallback(async (tx: PendingTransaction, target: ClassifyTarget) => {
        try {
            await classifyPendingTransaction(tx.id, target);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setPending(prev => prev.filter(p => p.id !== tx.id));
            fetchDashboard();
        } catch (err) {
            console.error('Classify pending transaction error:', err);
        }
    }, [fetchDashboard]);

    return {
        monthIndex, currentMonth, pickMonth,
        dashboard, summary,
        bankConnected: isBankConnected(), pending, classify,
        verse, verseVisible, closeVerse: () => setVerseVisible(false),
        savingTitheGiven, toggleTitheGiven,
        closingMonth, closeMonth, reopenMonth, dismissedCloseout, dismissCloseout,
    };
}
