/**
 * The onboarding (ONBOARDING_REWORK.md) — a conversation with Benny that gives the
 * user a real taste of the app before sign-up: their month split, their goal and
 * debt with believable dates, and money connected to their walk with God.
 *
 * TWO MODES, one flow (lib/onboardingFlow.ts):
 *   new        logged out, first launch. Every answer waits on the phone; sign-up
 *              (screen 19) creates the account and the plan is written then.
 *   signed_in  an account that has never done this onboarding (every pre-rework
 *              account, once), or the dev replay. Steps whose data the account
 *              already has are skipped, and each answer is written as it is given.
 *
 * WHAT SURVIVES A KILL. After every step and around every write, the answers, the
 * step and each write's state are saved to the phone (lib/onboardingStore.ts), so a
 * relaunch resumes on the same step with every answer intact (`resumeStep`). Writes
 * go through lib/onboardingWrites.ts, which never duplicates the income, expense,
 * debt or goal when a sequence is interrupted and resumed.
 *
 * This file only orchestrates. The screens are in components/onboarding/.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useOnboarding } from '../context/OnboardingContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useAnalytics, type OnboardingAnswerProps } from '../lib/analytics';
import {
    GROUP_OF, canGoBack, nextStep, prevStep, progressOf, resumeStep,
    type Answers, type Mode, type ServerFacts, type StepId,
} from '../lib/onboardingFlow';
import { pendingWrites, runWrites, type WriteItem, type WriteStates } from '../lib/onboardingWrites';
import { loadDashboardSplit, loadFacts, previewPlan, writeApi, type PlanPreview } from '../lib/onboardingApi';
import { clearSaved, loadSaved, saveSaved } from '../lib/onboardingStore';
import { ProgressHeader, PrimaryButton } from '../components/onboarding/controls';
import StepLayout, { type StepProps } from '../components/onboarding/StepLayout';
import {
    FeelingStep, NameStep, PromiseStep, ReasonsStep, TitheStep, WelcomeStep,
} from '../components/onboarding/HeartSteps';
import { ExpenseStep, IncomeStep, SplitStep } from '../components/onboarding/MonthSteps';
import {
    DebtAskStep, DebtDetailsStep, DebtPreviewStep, DebtTypeStep, GoalDetailsStep, GoalPickStep, GoalPreviewStep,
} from '../components/onboarding/HarvestSteps';
import {
    CommitmentStep, DoneStep, PlanStep, PremiumStep, SignupStep,
} from '../components/onboarding/GardenSteps';

/** Steps after which the account exists: a saved `new` flow there stays `new`. */
const ACCOUNT_STEPS: StepId[] = ['signup', 'premium', 'done'];
/** Steps that show numbers from the preview endpoint. */
const PREVIEW_STEPS: StepId[] = ['split', 'expense', 'debtPreview', 'goalDetails', 'goalPreview', 'plan'];

/** The answers to screens 4, 5, 10, 11 and 14, as category keys (never a name or figure). */
function answerProps(step: StepId, a: Answers): OnboardingAnswerProps {
    switch (step) {
        case 'reasons': return { reasons: (a.reasons ?? []).join(',') };
        case 'feeling': return a.feeling ? { feeling: a.feeling } : {};
        case 'debtAsk': return a.debtChoice ? { debts: a.debtChoice } : {};
        case 'debtType': return a.debtKind ? { debt_type: a.debtKind } : {};
        case 'goalPick': return a.goalKind ? { goal_type: a.goalKind } : {};
        default: return {};
    }
}

export default function OnboardingScreen() {
    const { theme } = useTheme();
    const { t } = useTranslation('onboarding');
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const analytics = useAnalytics();
    const { user, initialized } = useAuth();
    const { status, replaying, markComplete } = useOnboarding();
    const { premiumActive, allowances, entitlementSettled } = useSubscription();

    const [ready, setReady] = useState(false);
    const [step, setStep] = useState<StepId>('welcome');
    const [answers, setAnswersState] = useState<Answers>({});
    const answersRef = useRef<Answers>({});
    const [writes, setWrites] = useState<WriteStates>({});
    const writesRef = useRef<WriteStates>({});
    const [mode, setMode] = useState<Mode>('new');
    const [facts, setFacts] = useState<ServerFacts>({});
    const [preview, setPreview] = useState<PlanPreview | null>(null);
    const [accountSplit, setAccountSplit] = useState<PlanPreview['split'] | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(false);
    const [afterSignup, setAfterSignup] = useState(false);
    const signupRunning = useRef(false);
    const booted = useRef(false);

    /** The facts every step decision uses: the boot-time snapshot, plus live premium. */
    const live = useMemo<ServerFacts>(() => ({ ...facts, premiumActive }), [facts, premiumActive]);

    const set = useCallback((patch: Partial<Answers>) => {
        answersRef.current = { ...answersRef.current, ...patch };
        setAnswersState(answersRef.current);
    }, []);

    // ── Boot: resume what is on the phone ────────────────────────────────────
    useEffect(() => {
        if (booted.current || !initialized) return;
        if (user && (status === 'unknown' || !entitlementSettled)) return;
        booted.current = true;
        (async () => {
            let saved = await loadSaved();
            if (user && status === 'done' && !replaying && !saved) {
                router.replace('/(tabs)');
                return;
            }
            // A signed-in flow left behind by an account that has since signed out
            // belongs to that account.
            if (!user && saved?.mode === 'signed_in') { await clearSaved(); saved = null; }
            let nextMode: Mode = saved?.mode ?? (user ? 'signed_in' : 'new');
            // Signed in through /auth part-way through the logged-out flow: carry on
            // signed in, so the account's own data is respected from here.
            if (user && nextMode === 'new' && saved && !ACCOUNT_STEPS.includes(saved.step)) nextMode = 'signed_in';

            let snapshot: ServerFacts = {};
            if (user && nextMode === 'signed_in') {
                snapshot = { ...(await loadFacts(user)), goalsUsed: allowances?.goalsUsed ?? 0 };
            }
            const a = saved?.answers ?? {};
            answersRef.current = a;
            writesRef.current = saved?.writes ?? {};
            setAnswersState(a);
            setWrites(writesRef.current);
            setMode(nextMode);
            setFacts(snapshot);
            setStep(resumeStep(saved?.step, a, nextMode, { ...snapshot, premiumActive }));
            setReady(true);
        })();
    }, [initialized, user, status, entitlementSettled]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Save after every change ───────────────────────────────────────────────
    useEffect(() => {
        if (ready) saveSaved({ step, answers, writes, mode });
    }, [ready, step, answers, writes, mode]);

    // ── Analytics: each screen seen ───────────────────────────────────────────
    useEffect(() => {
        if (ready) analytics.onboardingStepViewed({ step, group: GROUP_OF[step] ?? 'intro', mode });
    }, [ready, step]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── The numbers: the preview endpoint, or the account's own month ─────────
    const usesAccountMonth = mode === 'signed_in' && !!facts.hasIncomeThisMonth;
    const previewKey = JSON.stringify({
        income: answers.income ?? accountSplit?.income ?? 0, tithe: answers.tithe, goal: answers.goal,
        debt: answers.debtChoice === 'yes' ? answers.debt : null,
    });
    const [previewTry, setPreviewTry] = useState(0);
    const showsNumbers = PREVIEW_STEPS.includes(step);
    useEffect(() => {
        if (!ready || !showsNumbers) return;
        if (usesAccountMonth && !accountSplit) return;
        let alive = true;
        setLoadError(false);
        const a = answersRef.current;
        previewPlan({ ...a, income: a.income ?? accountSplit?.income ?? 0 })
            .then(p => { if (alive) setPreview(p); })
            .catch(() => { if (alive) setLoadError(true); });
        return () => { alive = false; };
    }, [ready, previewKey, showsNumbers, accountSplit?.income, previewTry]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        // Signed in with this month's income already logged: the split is the real one,
        // read after the tithe answer was written so it includes it.
        // Re-read on every numbers screen (a relaunch can land past the split).
        if (!ready || !usesAccountMonth || !showsNumbers) return;
        let alive = true;
        loadDashboardSplit().then(s => {
            if (!alive) return;
            if (s) setAccountSplit(s); else setLoadError(true);
        });
        return () => { alive = false; };
    }, [ready, usesAccountMonth, showsNumbers, step === 'split', previewTry]); // eslint-disable-line react-hooks/exhaustive-deps

    const split = usesAccountMonth ? accountSplit : preview?.split ?? null;

    // ── Writes ────────────────────────────────────────────────────────────────
    const flush = useCallback(async (skip: ReadonlySet<WriteItem> = new Set()): Promise<boolean> => {
        const a = answersRef.current;
        if (pendingWrites(a, writesRef.current, skip).length === 0) return true;
        setSaving(true);
        setSaveError(false);
        try {
            await runWrites(a, writesRef.current, writeApi, async states => {
                writesRef.current = states;
                setWrites(states);
                await saveSaved({ step, answers: a, writes: states, mode });
            }, skip);
            return true;
        } catch (err) {
            console.error('Onboarding write error:', err);
            setSaveError(true);
            return false;
        } finally {
            setSaving(false);
        }
    }, [step, mode]);

    // ── Moving ────────────────────────────────────────────────────────────────
    const next = useCallback(async () => {
        const a = answersRef.current;
        analytics.onboardingStepCompleted({ step, group: GROUP_OF[step] ?? 'intro', mode, ...answerProps(step, a) });
        // Signed in, each answer is written as it is given.
        if (user && !(await flush())) return;
        const n = nextStep(step, a, mode, live);
        if (n) setStep(n);
    }, [analytics, step, mode, user, flush, live]);

    const back = useCallback(() => {
        const p = prevStep(step, answersRef.current, mode, live);
        if (p) { setSaveError(false); setStep(p); }
    }, [step, mode, live]);

    // Sign-up landed (or the app relaunched signed in on this step): write the plan
    // in order, then go on once the new account's entitlement is known.
    useEffect(() => {
        if (!ready || step !== 'signup' || !user || saveError || signupRunning.current) return;
        signupRunning.current = true;
        (async () => {
            analytics.onboardingStepCompleted({ step: 'signup', group: 'garden', mode });
            // An account that already existed (Apple/Google into an old account): its
            // month's income is already logged, so this one is not added on top.
            const existing = await loadFacts(user);
            const ok = await flush(new Set<WriteItem>(existing.hasIncomeThisMonth ? ['income'] : []));
            signupRunning.current = false;
            if (ok) setAfterSignup(true);
        })();
    }, [ready, step, user, saveError]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!afterSignup || !entitlementSettled) return;
        setAfterSignup(false);
        setStep(nextStep('signup', answersRef.current, mode, { premiumActive }) ?? 'done');
    }, [afterSignup, entitlementSettled, premiumActive, mode]);

    const retry = () => {
        if (loadError) { setLoadError(false); setPreviewTry(n => n + 1); return; }
        setSaveError(false);
        if (step !== 'signup') next();
    };

    const finish = async () => {
        setSaving(true);
        analytics.onboardingCompleted({ mode });
        await clearSaved();
        await markComplete();
        setSaving(false);
        router.replace('/(tabs)');
    };

    const goToAuth = () => router.replace('/auth');

    // ── Render ────────────────────────────────────────────────────────────────
    const meta = user?.user_metadata ?? {};
    const name = answers.name?.trim()
        || String(meta.first_name ?? '').trim()
        || String(meta.full_name ?? '').trim().split(/\s+/)[0]
        || t('chrome.friend');

    if (!ready) {
        return (
            <View style={[styles.fill, styles.center, { backgroundColor: theme.bg }]}>
                <ActivityIndicator size="large" color={theme.brand} />
            </View>
        );
    }

    const props: StepProps = { a: answers, set, next, name, mode, split, preview, busy: saving };
    const progress = progressOf(step, answers, mode, live);
    const writingPlan = step === 'signup' && !!user;

    let body: React.ReactNode;
    if (saveError || loadError) {
        body = (
            <StepLayout
                pose="oops"
                bubble={saveError ? t('chrome.saveError') : t('chrome.loadError')}
                footer={<PrimaryButton label={t('chrome.tryAgain')} onPress={retry} busy={saving} />}
            />
        );
    } else if (writingPlan) {
        body = <StepLayout pose="planting" bubble={t('chrome.saving')}><ActivityIndicator color={theme.brand} /></StepLayout>;
    } else {
        body = renderStep(step, props, { goToAuth, finish });
    }

    return (
        <View style={[styles.fill, { backgroundColor: theme.bg, paddingTop: insets.top + 6 }]}>
            <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.header}>
                    <ProgressHeader
                        group={progress ? t(`chrome.groups.${progress.group}`) : null}
                        value={progress?.value ?? 0}
                        onBack={canGoBack(step, answers, mode, live) && !saving && !writingPlan ? back : null}
                        backLabel={t('chrome.back')}
                    />
                </View>
                {body}
            </KeyboardAvoidingView>
        </View>
    );
}

function renderStep(step: StepId, p: StepProps, actions: { goToAuth: () => void; finish: () => void }) {
    switch (step) {
        case 'welcome': return <WelcomeStep {...p} onHaveAccount={actions.goToAuth} />;
        case 'promise': return <PromiseStep {...p} />;
        case 'name': return <NameStep {...p} />;
        case 'reasons': return <ReasonsStep {...p} />;
        case 'feeling': return <FeelingStep {...p} />;
        case 'tithe': return <TitheStep {...p} />;
        case 'income': return <IncomeStep {...p} />;
        case 'split': return <SplitStep {...p} />;
        case 'expense': return <ExpenseStep {...p} />;
        case 'debtAsk': return <DebtAskStep {...p} />;
        case 'debtType': return <DebtTypeStep {...p} />;
        case 'debtDetails': return <DebtDetailsStep {...p} />;
        case 'debtPreview': return <DebtPreviewStep {...p} />;
        case 'goalPick': return <GoalPickStep {...p} />;
        case 'goalDetails': return <GoalDetailsStep {...p} />;
        case 'goalPreview': return <GoalPreviewStep {...p} />;
        case 'commitment': return <CommitmentStep {...p} />;
        case 'plan': return <PlanStep {...p} />;
        case 'signup': return <SignupStep {...p} onHaveAccount={actions.goToAuth} />;
        case 'premium': return <PremiumStep {...p} />;
        case 'done': return <DoneStep {...p} onDone={actions.finish} />;
    }
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center' },
    header: { paddingHorizontal: 20 },
});
