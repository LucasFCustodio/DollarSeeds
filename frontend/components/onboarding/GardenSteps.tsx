/**
 * Group 4 · Your Garden (screens 17–21): the commitment, the plan, sign-up, Premium
 * and the last screen.
 *
 * Sign-up reuses lib/authActions.ts (the same flows app/auth.tsx runs): Sign in with
 * Apple first, then Google, then email. Success needs nothing here — the session
 * lands in AuthContext and app/onboarding.tsx writes the plan.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { ft } from '../../constants/responsive';
import {
    signInWithApple, signInWithEmail, signInWithGoogle, signUpWithEmail,
} from '../../lib/authActions';
import { verseFor } from '../../lib/onboardingFlow';
import Card from '../ui/Card';
import MiniPlant from '../home/MiniPlant';
import { usePlanDate, VerseCard } from './HarvestSteps';
import CardIcon from './cardIcons';
import { Field, HoldButton, PrimaryButton, TextLink } from './controls';
import StepLayout, { type StepProps } from './StepLayout';

export function CommitmentStep({ a, set, next, name }: StepProps) {
    const { t } = useTranslation('onboarding');
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Arriving here (including by the back arrow) always starts with the hold undone:
    // a held button has no action of its own, so a kept `committed` would leave the
    // user with no way forward.
    useEffect(() => {
        if (a.committed) set({ committed: false });
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const commit = () => {
        set({ committed: true });
        // A breath before moving on: the moment is the point, not the button.
        timer.current = setTimeout(next, 1400);
    };
    return (
        <StepLayout
            pose="praying"
            bubble={a.committed ? t('commitment.held') : t('commitment.bubble')}
            title={t('commitment.title', { name })}
            subtitle={t('commitment.subtitle')}
            footer={<HoldButton label={t('commitment.hold')} done={!!a.committed} onComplete={commit} />}
        >
            <VerseCard id={verseFor(a.feeling)} />
        </StepLayout>
    );
}

export function PlanStep({ a, next, name, split, preview }: StepProps) {
    const { t } = useTranslation('onboarding');
    const { theme } = useTheme();
    const { formatMoney } = useLocale();
    const dates = usePlanDate();
    const debt = a.debtChoice === 'yes' && a.debt ? preview?.debt ?? null : null;
    const goal = a.goal ? preview?.goal ?? null : null;
    const debtName = (a.debtName ?? '').trim();
    const goalDate = goal?.on_pace
        ? dates.fromMonth(goal.on_pace.month, goal.on_pace.year)
        : a.goal ? dates.fromMonth(a.goal.targetMonth, a.goal.targetYear) : '';
    return (
        <StepLayout
            pose="proud"
            bubble={t('plan.bubble')}
            title={t('plan.title', { name })}
            footer={<PrimaryButton label={t('plan.button')} onPress={next} disabled={!split} />}
        >
            {split ? (
                <Card theme={theme} depth={3} padding={16} style={styles.card}>
                    <Text style={[styles.eyebrow, { color: theme.ink3 }]}>{t('plan.month')}</Text>
                    {split.tithe.enabled && split.tithe.amount > 0 ? (
                        <Text style={[styles.line, { color: theme.harvestInk }]}>
                            {t('plan.titheLine', { amount: formatMoney(split.tithe.amount) })}
                        </Text>
                    ) : null}
                    <Text style={[styles.line, { color: theme.ink }]}>
                        {t('plan.monthLine', {
                            needs: formatMoney(split.needs), wants: formatMoney(split.wants), goals: formatMoney(split.goals),
                        })}
                    </Text>
                </Card>
            ) : null}
            {debt ? (
                <Card theme={theme} depth={3} padding={16} style={[styles.card, styles.row]}>
                    <MiniPlant stage="started" size={34} />
                    <View style={styles.flex}>
                        <Text style={[styles.eyebrow, { color: theme.ink3 }]}>{t('plan.debt')}</Text>
                        <Text style={[styles.line, { color: theme.ink }]}>
                            {!debt.covers_interest || !debt.payoff_month
                                ? t('plan.debtStalled', { debt: debtName })
                                : t(debt.before_interest ? 'plan.debtLineBeforeInterest' : 'plan.debtLine',
                                    { debt: debtName, date: dates.fromKey(debt.payoff_month) })}
                        </Text>
                    </View>
                </Card>
            ) : null}
            {goal && a.goal ? (
                <Card theme={theme} depth={3} padding={16} style={[styles.card, styles.row]}>
                    <CardIcon name="saving" color={theme.goals} soft={theme.goalsSoft} size={34} />
                    <View style={styles.flex}>
                        <Text style={[styles.eyebrow, { color: theme.ink3 }]}>{t('plan.goal')}</Text>
                        <Text style={[styles.line, { color: theme.ink }]}>
                            {t('plan.goalLine', { goal: a.goal.title, date: goalDate })}
                        </Text>
                    </View>
                </Card>
            ) : null}
        </StepLayout>
    );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 6;

export function SignupStep({ busy, onHaveAccount }: StepProps & { onHaveAccount: () => void }) {
    const { t } = useTranslation('onboarding');
    const { theme } = useTheme();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [working, setWorking] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const emailError = (v: string) => (EMAIL_RE.test(v.trim()) ? null : t('signup.errEmail'));
    const passwordError = (v: string) => (v.length >= PASSWORD_MIN ? null : t('signup.errPassword'));
    const valid = !emailError(email) && !passwordError(password);

    /** Supabase's message → Benny's words. The raw text is English-only and terse. */
    const say = (message?: string) => {
        const m = (message ?? '').toLowerCase();
        if (m.includes('already')) return t('signup.errTaken');
        if (m.includes('password')) return t('signup.errPassword');
        if (m.includes('email') && !m.includes('confirm')) return t('signup.errEmail');
        return t('signup.errGeneric');
    };

    const run = async (fn: () => Promise<void>) => {
        if (working || busy) return;
        setWorking(true);
        setError(null);
        try { await fn(); } catch { setError(t('signup.errGeneric')); } finally { setWorking(false); }
    };

    const provider = (sign: typeof signInWithApple) => run(async () => {
        const outcome = await sign();
        if (outcome.status === 'error') setError(say(outcome.message));
    });

    const create = () => run(async () => {
        const outcome = await signUpWithEmail(email, password);
        if (outcome.status === 'error') setError(say(outcome.message));
        else if (outcome.status === 'confirm') setConfirming(true);
    });

    // After the confirmation link: sign in with what was just typed (kept in memory
    // only — never saved).
    const confirmed = () => run(async () => {
        const outcome = await signInWithEmail(email, password);
        if (outcome.status === 'error') {
            setError(/confirm/i.test(outcome.message ?? '') ? t('signup.confirmNotYet') : say(outcome.message));
        }
    });

    if (confirming) {
        return (
            <StepLayout
                pose={error ? 'oops' : 'waving'}
                bubble={error ?? t('signup.confirmTitle')}
                title={t('signup.confirmTitle')}
                subtitle={t('signup.confirmBody', { email: email.trim() })}
                footer={<PrimaryButton label={t('signup.confirmButton')} onPress={confirmed} busy={working || busy} />}
            />
        );
    }

    return (
        <StepLayout
            pose={error ? 'oops' : 'waving'}
            bubble={error ?? t('signup.bubble')}
            title={t('signup.title')}
            subtitle={t('signup.subtitle')}
            footer={<>
                <PrimaryButton label={t('signup.button')} onPress={create} disabled={!valid} busy={working || busy} />
                <TextLink label={t('signup.haveAccount')} onPress={onHaveAccount} />
            </>}
        >
            {Platform.OS === 'ios' ? (
                <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={14}
                    style={styles.apple}
                    onPress={() => provider(signInWithApple)}
                />
            ) : null}
            <PrimaryButtonOutline label={t('signup.google')} onPress={() => provider(signInWithGoogle)} />
            <Text style={[styles.or, { color: theme.ink3 }]}>{t('signup.or')}</Text>
            <Field
                label={t('signup.email')}
                value={email}
                onChangeText={setEmail}
                validate={emailError}
                keyboardType="email-address"
                autoCapitalize="none"
                textContentType="emailAddress"
                autoComplete="email"
            />
            <Field
                label={t('signup.password')}
                value={password}
                onChangeText={setPassword}
                validate={passwordError}
                secure
                showLabel={t('signup.showPassword')}
                hideLabel={t('signup.hidePassword')}
                autoCapitalize="none"
                textContentType="newPassword"
                autoComplete="new-password"
                returnKeyType="go"
                onSubmitEditing={() => valid && create()}
            />
        </StepLayout>
    );
}

/** The Google provider button: outlined, so the email form keeps the one filled
 *  primary button. */
function PrimaryButtonOutline({ label, onPress }: { label: string; onPress: () => void }) {
    const { theme } = useTheme();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            style={({ pressed }) => [styles.outline, { borderColor: theme.borderStrong, backgroundColor: theme.surface }, pressed && { opacity: 0.7 }]}
        >
            <Text style={[styles.outlineText, { color: theme.ink }]}>{label}</Text>
        </Pressable>
    );
}

export function PremiumStep({ a, next }: StepProps) {
    const { t } = useTranslation('onboarding');
    const { paywallVisible, openPaywallWith } = useSubscription();
    const opened = useRef(false);
    const planted = a.debtChoice === 'yes' && !!a.debt;
    const copy = { headline: t(planted ? 'premium.debtHeadline' : 'premium.planHeadline'), subtitle: t('premium.subtitle') };

    useEffect(() => {
        const timer = setTimeout(() => openPaywallWith(copy), 300);
        return () => clearTimeout(timer);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Closing the paywall (or buying) continues to the last screen.
    useEffect(() => {
        if (paywallVisible) opened.current = true;
        else if (opened.current) { opened.current = false; next(); }
    }, [paywallVisible]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <StepLayout
            pose="key"
            bubble={`${copy.headline} ${copy.subtitle}`}
            footer={<PrimaryButton label={t('chrome.continue')} onPress={next} />}
        />
    );
}

export function DoneStep({ name, onDone, busy }: StepProps & { onDone: () => void }) {
    const { t } = useTranslation(['onboarding', 'common']);
    const { theme } = useTheme();
    return (
        <StepLayout
            pose="waving"
            bubble={t('onboarding:done.bubble')}
            title={t('onboarding:done.title', { name })}
            subtitle={t('onboarding:done.subtitle')}
            footer={<PrimaryButton label={t('onboarding:done.button')} onPress={onDone} busy={busy} />}
        >
            {/* Compliance copy: shown on the onboarding's last step (constants/legal.ts). */}
            <Text style={[styles.legal, { color: theme.ink3 }]}>{t('common:legal.disclaimerShort')}</Text>
        </StepLayout>
    );
}

const styles = StyleSheet.create({
    card: { gap: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    flex: { flex: 1, gap: 4 },
    eyebrow: { fontFamily: Fonts.monoSemiBold, fontSize: ft(11), letterSpacing: 1.4, textTransform: 'uppercase' },
    line: { fontFamily: Fonts.sansSemiBold, fontSize: ft(16), lineHeight: ft(22) },
    apple: { width: '100%', height: 52 },
    outline: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
    outlineText: { fontFamily: Fonts.sansSemiBold, fontSize: ft(16) },
    legal: { fontFamily: Fonts.sans, fontSize: ft(12), lineHeight: ft(17), marginTop: 8 },
    or: { textAlign: 'center', fontFamily: Fonts.sans, fontSize: ft(13), marginVertical: 4 },
});
