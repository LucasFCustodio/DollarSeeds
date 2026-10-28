/**
 * Group 3 · Your Harvest (screens 10–16): the first debt and the first goal. Their
 * order is set by screen 4 (lib/onboardingFlow.ts).
 *
 * The payoff date, "minimum barely covers the interest", the goal's monthly minimum
 * and its on-pace date all come from POST /onboarding/preview/ — the same functions
 * the Debts and Goals tabs use.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Trans, useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { ft } from '../../constants/responsive';
import { MONTHS } from '../../constants/months';
import { DEBT_KINDS, DEBT_NAME_MAX, GOAL_KINDS, stepAnswered, type DebtKind, type GoalKind } from '../../lib/onboardingFlow';
import Card from '../ui/Card';
import GoalForm from '../goals/GoalForm';
import PlantView, { type PlantViewHandle } from '../debts/PlantView';
import { IconScripture } from '../icons';
import CardIcon, { type CardIconName } from './cardIcons';
import { CardGrid, Field, PrimaryButton, TapCard } from './controls';
import StepLayout, { type StepProps } from './StepLayout';

/** 'YYYY-MM' (the debt projection) or a month name + year, in the app's language. */
export function usePlanDate() {
    const { monthYear, monthLabel } = useLocale();
    return {
        fromKey: (key: string | null | undefined) => {
            const m = key ? /^(\d{4})-(\d{2})/.exec(key) : null;
            return m ? monthYear(MONTHS[Number(m[2]) - 1], Number(m[1])) : '';
        },
        /** "March" this year, "March 2027" after it. */
        fromMonth: (month: string, year: number) =>
            year === new Date().getFullYear() ? monthLabel(month) : monthYear(month, year),
    };
}

// ── Debts ────────────────────────────────────────────────────────────────────

const DEBT_CHOICES = ['yes', 'free', 'later'] as const;

export function DebtAskStep({ a, set, next }: StepProps) {
    const { t } = useTranslation('onboarding');
    const { theme } = useTheme();
    const choice = a.debtChoice;
    return (
        <StepLayout
            pose={choice === 'free' ? 'excited' : 'gentle'}
            bubble={choice ? t(`debtAsk.reaction.${choice}`) : t('debtAsk.question')}
            title={choice ? t('debtAsk.question') : undefined}
            subtitle={t('debtAsk.subtitle')}
            footer={<PrimaryButton label={t('chrome.continue')} onPress={next} disabled={!choice} />}
        >
            {DEBT_CHOICES.map(c => (
                <TapCard
                    key={c}
                    label={t(`debtAsk.options.${c}`)}
                    icon={<CardIcon name={c} color={theme.brand} soft={theme.goalsSoft} />}
                    selected={choice === c}
                    onPress={() => set({ debtChoice: c })}
                />
            ))}
        </StepLayout>
    );
}

export function DebtTypeStep({ a, set, next }: StepProps) {
    const { t } = useTranslation('onboarding');
    const { theme } = useTheme();
    const kinds = Object.keys(DEBT_KINDS) as DebtKind[];
    // The name follows the type until the user makes it their own.
    const typedName = useRef(!!a.debtName && a.debtKind !== undefined && a.debtName !== t(`debtType.options.${a.debtKind}`));
    const pick = (k: DebtKind) => {
        set(typedName.current ? { debtKind: k } : { debtKind: k, debtName: t(`debtType.options.${k}`) });
    };
    return (
        <StepLayout
            pose="planting"
            bubble={t('debtType.question')}
            footer={<PrimaryButton label={t('debtType.button')} onPress={next} disabled={!stepAnswered('debtType', a)} />}
        >
            <CardGrid>
                {kinds.map(k => (
                    <TapCard
                        key={k}
                        compact
                        label={t(`debtType.options.${k}`)}
                        icon={<CardIcon name={k as CardIconName} color={theme.brand} soft={theme.needsSoft} size={36} />}
                        selected={a.debtKind === k}
                        onPress={() => pick(k)}
                    />
                ))}
            </CardGrid>
            {a.debtKind ? (
                <View style={styles.gap}>
                    <Field
                        label={t('debtType.nameLabel')}
                        value={a.debtName ?? ''}
                        onChangeText={v => { typedName.current = true; set({ debtName: v }); }}
                        validate={v => (v.trim() ? null : t('debtType.errName'))}
                        maxLength={DEBT_NAME_MAX}
                        autoCapitalize="words"
                    />
                </View>
            ) : null}
        </StepLayout>
    );
}

export function DebtDetailsStep({ a, set, next }: StepProps) {
    const { t } = useTranslation('onboarding');
    const { theme } = useTheme();
    const { parseAmount, formatNumber } = useLocale();
    const d = a.debt;
    const show = (v: number | null | undefined) => (v == null ? '' : formatNumber(v, Number.isInteger(v) ? 0 : 2));
    const [owe, setOwe] = useState(show(d?.amountOwed));
    const [min, setMin] = useState(show(d?.minPayment));
    const [due, setDue] = useState(d?.dueDay ? String(d.dueDay) : '');
    const [apr, setApr] = useState(show(d?.apr));

    const num = (v: string) => (v.trim() ? parseAmount(v) : null);
    const oweN = num(owe);
    const minN = num(min);
    const dueN = /^\d{1,2}$/.test(due.trim()) ? Number(due.trim()) : null;
    const aprN = num(apr);
    const okOwe = oweN !== null && oweN > 0;
    const okMin = minN !== null && minN >= 0;
    const okDue = dueN !== null && dueN >= 1 && dueN <= 31;
    const okApr = !apr.trim() || (aprN !== null && aprN >= 0 && aprN <= 100);
    const valid = okOwe && okMin && okDue && okApr;

    const go = () => {
        if (!valid) return;
        set({ debt: { amountOwed: oweN!, minPayment: minN!, dueDay: dueN!, apr: apr.trim() ? aprN : null } });
        next();
    };

    return (
        <StepLayout
            pose="thinking"
            bubble={t('debtDetails.bubble')}
            footer={<PrimaryButton label={t('debtDetails.button')} onPress={go} disabled={!valid} />}
        >
            <Field label={t('debtDetails.owe')} value={owe} onChangeText={setOwe} keyboardType="decimal-pad" maxLength={12}
                validate={v => { const n = num(v); return n !== null && n > 0 ? null : t('debtDetails.errOwe'); }} />
            <Field label={t('debtDetails.min')} value={min} onChangeText={setMin} keyboardType="decimal-pad" maxLength={10}
                validate={v => { const n = num(v); return n !== null && n >= 0 ? null : t('debtDetails.errMin'); }} />
            <Field label={t('debtDetails.due')} value={due} onChangeText={setDue} keyboardType="number-pad" maxLength={2}
                placeholder={t('debtDetails.duePlaceholder')}
                validate={v => { const n = Number(v.trim()); return /^\d{1,2}$/.test(v.trim()) && n >= 1 && n <= 31 ? null : t('debtDetails.errDue'); }} />
            <Field label={t('debtDetails.apr')} value={apr} onChangeText={setApr} keyboardType="decimal-pad" maxLength={6}
                validate={v => { if (!v.trim()) return null; const n = num(v); return n !== null && n >= 0 && n <= 100 ? null : t('debtDetails.errApr'); }}
                helper={
                    <Text style={[styles.helper, { color: theme.ink2 }]}>
                        <Trans i18nKey="onboarding:debtDetails.aprHelper" components={{ bold: <Text style={styles.bold} /> }} />
                    </Text>
                } />
        </StepLayout>
    );
}

export function DebtPreviewStep({ a, next, preview }: StepProps) {
    const { t } = useTranslation(['onboarding', 'dashboard']);
    const { theme } = useTheme();
    const dates = usePlanDate();
    const plant = useRef<PlantViewHandle>(null);
    const p = preview?.debt;
    useEffect(() => {
        const timer = setTimeout(() => plant.current?.playPlant(), 350);
        return () => clearTimeout(timer);
    }, []);
    const debt = (a.debtName ?? '').trim();
    const stalled = !!p && (!p.covers_interest || !p.payoff_month);
    return (
        <StepLayout
            pose="watering"
            bubble={t('onboarding:debtPreview.bubble')}
            footer={<PrimaryButton label={t('onboarding:debtPreview.button')} onPress={next} disabled={!p} />}
        >
            <View style={styles.plant}>
                <PlantView ref={plant} species={4} growthStep={1} state="growing" isFocus active width={150} />
            </View>
            {!p ? <ActivityIndicator color={theme.brand} /> : (
                <>
                    <Text accessibilityRole="header" style={[styles.title, { color: theme.ink }]}>
                        {stalled ? t('onboarding:debtPreview.stalled') : (
                            <Trans
                                i18nKey={p.before_interest ? 'onboarding:debtPreview.titleBeforeInterest' : 'onboarding:debtPreview.title'}
                                values={{ debt, date: dates.fromKey(p.payoff_month) }}
                                components={{ bold: <Text style={{ color: theme.brand }} /> }}
                            />
                        )}
                    </Text>
                    <Text style={[styles.subtitle, { color: theme.ink2 }]}>{t('onboarding:debtPreview.subtitle')}</Text>
                    <VerseCard id="proverbs-22-7" />
                </>
            )}
        </StepLayout>
    );
}

export function VerseCard({ id }: { id: string }) {
    const { t } = useTranslation('dashboard');
    const { theme } = useTheme();
    return (
        <Card theme={theme} depth={3} padding={16} style={[styles.verse, { backgroundColor: theme.brandSoft }]}>
            <IconScripture size={20} color={theme.brand} />
            <Text style={[styles.verseText, { color: theme.ink }]}>{t('scripture.quoted', { text: t(`verse.${id}.text`) })}</Text>
            <Text style={[styles.verseRef, { color: theme.ink2 }]}>— {t(`verse.${id}.ref`)}</Text>
        </Card>
    );
}

// ── Goals ────────────────────────────────────────────────────────────────────

const GOAL_ICON: Record<GoalKind, CardIconName> = {
    emergency: 'emergency', phone: 'phone', vacation: 'vacation', car: 'car',
    home: 'home', wedding: 'wedding', gift: 'gift', other: 'something',
};

export function GoalPickStep({ a, set, next }: StepProps) {
    const { t } = useTranslation('onboarding');
    const { theme } = useTheme();
    return (
        <StepLayout
            pose="curious"
            bubble={a.goalKind ? t('goalPick.reaction') : t('goalPick.question')}
            title={a.goalKind ? t('goalPick.question') : undefined}
            subtitle={t('goalPick.subtitle')}
            footer={<PrimaryButton label={t('goalPick.button')} onPress={next} disabled={!a.goalKind} />}
        >
            <CardGrid>
                {GOAL_KINDS.map(k => (
                    <TapCard
                        key={k}
                        compact
                        label={t(`goalPick.options.${k}`)}
                        icon={<CardIcon name={GOAL_ICON[k]} color={theme.brand} soft={theme.goalsSoft} size={36} />}
                        selected={a.goalKind === k}
                        // A different goal starts its details over.
                        onPress={() => set(a.goalKind === k ? {} : { goalKind: k, goal: undefined })}
                    />
                ))}
            </CardGrid>
        </StepLayout>
    );
}

export function GoalDetailsStep({ a, set, next, split, mode }: StepProps) {
    const { t } = useTranslation('onboarding');
    const kind = a.goalKind;
    // Before sign-up there is no account to read the budget context from: it is the
    // preview's Goals budget and the debt minimum just entered. Signed in, the form
    // reads the account's own.
    const context = useMemo(() => mode === 'new' && split ? {
        has_income: split.income > 0,
        goals_budget: split.goals,
        goal_minimums: 0,
        debt_minimums: a.debtChoice === 'yes' && a.debt ? a.debt.minPayment : 0,
    } : undefined, [mode, split, a.debtChoice, a.debt]);
    return (
        <StepLayout pose="planting" bubble={t('goalDetails.bubble')}>
            <GoalForm
                requireAll
                initialTitle={kind && kind !== 'other' ? t(`goalPick.options.${kind}`) : ''}
                initialValues={a.goal}
                budgetContext={context}
                submitLabel={t('goalDetails.button')}
                onSubmitValues={values => { set({ goal: values }); next(); }}
            />
        </StepLayout>
    );
}

export function GoalPreviewStep({ a, next, preview }: StepProps) {
    const { t } = useTranslation('onboarding');
    const { theme } = useTheme();
    const { formatMoney } = useLocale();
    const dates = usePlanDate();
    const g = preview?.goal;
    const goal = a.goal;
    const date = g?.on_pace
        ? dates.fromMonth(g.on_pace.month, g.on_pace.year)
        : goal ? dates.fromMonth(goal.targetMonth, goal.targetYear) : '';
    return (
        <StepLayout
            pose={a.goalKind === 'phone' ? 'excited-phone' : 'excited'}
            bubble={t('goalPreview.bubble')}
            footer={<PrimaryButton label={t('goalPreview.button')} onPress={next} disabled={!g} />}
        >
            {!g || !goal ? <ActivityIndicator color={theme.brand} /> : (
                <>
                    <Text accessibilityRole="header" style={[styles.title, { color: theme.ink }]}>
                        <Trans
                            i18nKey="onboarding:goalPreview.title"
                            values={{ goal: goal.title, date }}
                            components={{ bold: <Text style={{ color: theme.brand }} /> }}
                        />
                    </Text>
                    <Text style={[styles.subtitle, { color: theme.ink2 }]}>
                        {t('goalPreview.subtitle', { amount: formatMoney(g.minimum) })}
                    </Text>
                </>
            )}
        </StepLayout>
    );
}

const styles = StyleSheet.create({
    gap: { marginTop: 8 },
    helper: { fontFamily: Fonts.sans, fontSize: ft(13), lineHeight: ft(18) },
    bold: { fontFamily: Fonts.sansSemiBold },
    plant: { alignItems: 'center', marginVertical: 4 },
    title: { fontFamily: Fonts.serif, fontSize: ft(30, 1.25), lineHeight: ft(35, 1.25), letterSpacing: -0.3 },
    subtitle: { fontFamily: Fonts.sans, fontSize: ft(15), lineHeight: ft(21) },
    verse: { gap: 8, marginTop: 8 },
    verseText: { fontFamily: Fonts.serifItalic, fontSize: ft(18, 1.2), lineHeight: ft(24, 1.2) },
    verseRef: { fontFamily: Fonts.mono, fontSize: ft(12) },
});
