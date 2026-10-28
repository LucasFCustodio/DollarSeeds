/**
 * GoalForm — "Plant a new goal", as a STANDALONE component (GOALS_REWORK.md §1).
 *
 * Rendered on the Goals tab today, and inside an onboarding step later. It owns its
 * own state, its own request (POST /savings/goal/ with the goals_v2 fields) and its
 * own budget-context read, so a host only says what happens around it.
 *
 *   requireAll  — onboarding: every field must be answered explicitly. Amount saved up
 *                 must be typed (0 is a fine answer, blank is not) and the target month
 *                 and year start unpicked.
 *   onSubmitValues — onboarding, before the account exists: the form validates exactly
 *                 as always, then hands the values back instead of POSTing them (the
 *                 onboarding writes them after sign-up). The submit button stays
 *                 disabled until every field is valid.
 *   budgetContext — the share/warning context, given instead of read from the server
 *                 (before sign-up there is no account to read it from).
 *   bare + hideSubmit — onboarding: no card and no form title around the fields, and
 *                 no button of its own. The host's button submits through the ref
 *                 (`GoalFormHandle.submit`) and is enabled by `onValidityChange`.
 *
 * Fields: name (≤ 30, unique — the server's 400 says so), target (> 0), amount saved
 * up (optional here, ≥ 0 and below the target; reaching it means the goal is already
 * done, which the form says instead of saving), where that money comes from (only
 * when > 0), target month + year (default: three months after this one; never before
 * this month), and the automatic-minimum switch.
 *
 * As the user types it shows the monthly minimum the server will store (the same
 * formula — lib/goalPlan.ts), what share of this month's Goals budget that is when the
 * month has income, and a gentle note when every goal and debt minimum together would
 * not fit. That note never blocks saving.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import axios from 'axios';
import { Trans, useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { MONTHS } from '../../constants/months';
import { premiumErrorCode, usePremiumUpsell } from '../../lib/premiumErrors';
import { localDateISO } from '../../lib/debtFreedom';
import {
    budgetFit, defaultTargetDate, isBeforeThisMonth, monthlyMinimum,
} from '../../lib/goalPlan';
import { fetchBudgetContext, GOALS_BASE, type BudgetContext, type MoneySource } from '../../lib/goals';
import { IconCheck } from '../icons';
import Card from '../ui/Card';
import { MonthChips, YearPicker } from './DatePickers';
import MoneySourceChips from './MoneySourceChips';
import { formStyles as styles } from './formStyles';

export interface CreatedGoal {
    id: number;
    title: string;
}

/** What the form would POST, for a host that writes it later (onSubmitValues). */
export interface GoalFormValues {
    title: string;
    targetAmount: number;
    savedAmount: number;
    savedSource: MoneySource | null;
    targetMonth: string;
    targetYear: number;
    autoMinimum: boolean;
}

/** For a host that renders its own submit button (`hideSubmit`). */
export interface GoalFormHandle {
    submit: () => void;
}

interface Props {
    /** No card and no form title: the fields sit straight on the host's screen. */
    bare?: boolean;
    /** No submit button: the host submits through the ref. */
    hideSubmit?: boolean;
    /** Called whenever the form becomes valid or invalid (for the host's button). */
    onValidityChange?: (valid: boolean) => void;
    /** Onboarding: every field must be filled in explicitly. */
    requireAll?: boolean;
    initialTitle?: string;
    initialAmount?: string;
    /** Every field prefilled (an onboarding step the user came back to). */
    initialValues?: GoalFormValues;
    onCreated?: (goal: CreatedGoal) => void;
    onSubmitValues?: (values: GoalFormValues) => void;
    budgetContext?: BudgetContext | null;
    submitLabel?: string;
    /** Omit to hide the Cancel button (an onboarding step has its own navigation). */
    onCancel?: () => void;
    /** A premium refusal (goal_limit_reached), after the form has shown it in place. */
    onPremiumError?: (code: string) => void;
}

const GoalForm = forwardRef<GoalFormHandle, Props>(function GoalForm({
    bare = false, hideSubmit = false, onValidityChange,
    requireAll = false, initialTitle = '', initialAmount = '', initialValues, onCreated, onSubmitValues,
    budgetContext, submitLabel, onCancel, onPremiumError,
}, ref) {
    const { t } = useTranslation('goals');
    const { t: tc } = useTranslation('common');
    const { theme } = useTheme();
    const { formatMoney, formatNumber, parseAmount, serverError } = useLocale();
    const { message: premiumMessage } = usePremiumUpsell();

    const today = useMemo(() => new Date(), []);
    const fallback = useMemo(() => defaultTargetDate(today), [today]);
    const thisYear = today.getFullYear();

    const iv = initialValues;
    const asInput = (v: number) => formatNumber(v, Number.isInteger(v) ? 0 : 2);
    const [title, setTitle] = useState(iv?.title ?? initialTitle);
    const [target, setTarget] = useState(iv ? asInput(iv.targetAmount) : initialAmount);
    const [saved, setSaved] = useState(iv ? asInput(iv.savedAmount) : '');
    const [source, setSource] = useState<MoneySource | null>(iv?.savedSource ?? null);
    const [month, setMonth] = useState<string | null>(iv?.targetMonth ?? (requireAll ? null : fallback.month));
    const [year, setYear] = useState<number | null>(iv?.targetYear ?? (requireAll ? null : fallback.year));
    const [auto, setAuto] = useState(iv?.autoMinimum ?? false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [ctx, setCtx] = useState<BudgetContext | null>(null);

    // The budget context is optional decoration: a failed read only drops the share
    // line and the warning, never the form.
    useEffect(() => {
        if (budgetContext !== undefined) return;
        let live = true;
        fetchBudgetContext().then(c => { if (live) setCtx(c); }).catch(() => {});
        return () => { live = false; };
    }, [budgetContext]);
    const context = budgetContext !== undefined ? budgetContext : ctx;

    useEffect(() => { if (!iv) setTitle(initialTitle); }, [initialTitle]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (!iv) setTarget(initialAmount); }, [initialAmount]); // eslint-disable-line react-hooks/exhaustive-deps

    const targetNum = target.trim() ? parseAmount(target) : null;
    const savedNum = saved.trim() ? parseAmount(saved) : 0;
    const alreadyDone = targetNum !== null && targetNum > 0 && savedNum !== null && savedNum >= targetNum;
    const minimum = month && year !== null && !alreadyDone
        ? monthlyMinimum(targetNum, savedNum, month, year, today)
        : null;
    const fit = budgetFit(minimum, context);

    // The same checks submit() runs, as one boolean: the deferred (onboarding) form
    // keeps its button disabled until they all pass.
    const valid = !!title.trim() && targetNum !== null && targetNum > 0
        && (!requireAll || !!saved.trim()) && savedNum !== null && savedNum >= 0 && !alreadyDone
        && (savedNum === 0 || !!source) && !!month && year !== null && !isBeforeThisMonth(month, year, today);

    // A month before this one can't be picked in this year; picking an earlier year's
    // month never happens (the year list starts at this year).
    const monthDisabled = (m: string) => year === thisYear && isBeforeThisMonth(m, thisYear, today);
    const pickYear = (y: number) => {
        setYear(y);
        if (month && isBeforeThisMonth(month, y, today)) setMonth(MONTHS[today.getMonth()]);
        setError('');
    };

    const submit = async () => {
        if (busy) return;
        if (!title.trim()) return setError(t('form.errName'));
        if (targetNum === null || !(targetNum > 0)) return setError(t('form.errTarget'));
        if (requireAll && !saved.trim()) return setError(t('form.errSavedRequired'));
        if (savedNum === null || savedNum < 0) return setError(t('form.errSaved'));
        if (alreadyDone) return setError('');           // the friendly line already says it
        if (savedNum > 0 && !source) return setError(t('form.errSource'));
        if (!month || year === null) return setError(t('form.errDate'));
        if (isBeforeThisMonth(month, year, today)) return setError(t('form.errPast'));

        if (onSubmitValues) {
            setError('');
            onSubmitValues({
                title: title.trim(), targetAmount: targetNum, savedAmount: savedNum,
                savedSource: savedNum > 0 ? source : null, targetMonth: month, targetYear: year,
                autoMinimum: auto,
            });
            return;
        }

        setBusy(true);
        setError('');
        try {
            const res = await axios.post(`${GOALS_BASE}/savings/goal/`, {
                title: title.trim(),
                target_amount: targetNum,
                target_month: month,
                target_year: year,
                goal_type: 'saving',
                saved_amount: savedNum,
                saved_source: savedNum > 0 ? source : null,
                auto_minimum: auto,
                today: localDateISO(),
            });
            const goal = res.data?.data?.[0];
            setTitle(''); setTarget(''); setSaved(''); setSource(null); setAuto(false);
            setMonth(requireAll ? null : fallback.month);
            setYear(requireAll ? null : fallback.year);
            onCreated?.({ id: goal?.id, title: goal?.title ?? title.trim() });
        } catch (e: any) {
            const code = premiumErrorCode(e);
            if (code) {
                setError(premiumMessage(code));
                onPremiumError?.(code);
            } else if (e?.response?.status === 400 || e?.response?.status === 409) {
                setError(serverError(e.response.data?.detail ?? tc('state.genericError')));
            } else {
                console.error('Goal create error:', e);
                setError(tc('state.genericError'));
            }
        } finally {
            setBusy(false);
        }
    };

    // The host's button always calls the latest submit (it closes over the fields).
    const submitRef = useRef(submit);
    submitRef.current = submit;
    useImperativeHandle(ref, () => ({ submit: () => { submitRef.current(); } }), []);
    useEffect(() => { onValidityChange?.(valid); }, [valid]); // eslint-disable-line react-hooks/exhaustive-deps

    const input = [styles.textInput, { backgroundColor: bare ? theme.surface : theme.surfaceSoft, borderColor: theme.border, color: theme.ink }];

    const fields = (
        <>
            <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>{t('newGoal.nameLabelSaving')}</Text>
            <TextInput
                style={input}
                placeholder={t('newGoal.namePlaceholderSaving')}
                placeholderTextColor={theme.ink3}
                value={title}
                onChangeText={next => { setTitle(next); setError(''); }}
                maxLength={30}
            />

            <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>{t('newGoal.amountLabelSaving')}</Text>
            <TextInput
                style={input}
                placeholder={formatNumber(5000)}
                placeholderTextColor={theme.ink3}
                value={target}
                onChangeText={next => { setTarget(next); setError(''); }}
                keyboardType="decimal-pad"
                maxLength={10}
            />

            <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>
                {requireAll ? t('form.savedLabelRequired') : t('form.savedLabel')}
            </Text>
            <TextInput
                style={input}
                placeholder={formatNumber(0)}
                placeholderTextColor={theme.ink3}
                value={saved}
                onChangeText={next => { setSaved(next); setError(''); }}
                keyboardType="decimal-pad"
                maxLength={10}
            />
            {alreadyDone ? (
                <Text style={[styles.hint, { color: theme.success }]}>{t('form.alreadyDone')}</Text>
            ) : null}
            {savedNum !== null && savedNum > 0 && !alreadyDone ? (
                <MoneySourceChips value={source} onChange={s => { setSource(s); setError(''); }} />
            ) : null}

            <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>{t('newGoal.monthLabel')}</Text>
            <MonthChips selected={month} onSelect={m => { setMonth(m); setError(''); }} isDisabled={monthDisabled} />

            <Text style={[styles.fieldLabel, { color: theme.ink3 }]}>{t('newGoal.yearLabel')}</Text>
            <YearPicker selected={year} onSelect={pickYear} anchor={fallback.year} />

            {minimum !== null ? (
                <View style={[styles.planBox, { backgroundColor: theme.goalsSoft }]}>
                    <Text style={[styles.planLine, { color: theme.ink }]}>
                        <Trans
                            i18nKey="goals:form.perMonth"
                            values={{ amount: formatMoney(minimum) }}
                            components={{ bold: <Text style={styles.planStrong} /> }}
                        />
                    </Text>
                    {fit.share !== null ? (
                        <Text style={[styles.planSmall, { color: theme.ink2 }]}>
                            {t('form.share', { pct: Math.max(1, Math.round(fit.share * 100)) })}
                        </Text>
                    ) : null}
                    {fit.over ? (
                        <Text style={[styles.planSmall, { color: theme.harvestInk }]}>{t('form.overBudget')}</Text>
                    ) : null}
                </View>
            ) : null}

            <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: theme.ink }]}>{t('form.autoLabel')}</Text>
                <Switch
                    value={auto}
                    onValueChange={setAuto}
                    trackColor={{ false: theme.border, true: theme.brand }}
                    thumbColor={theme.surface}
                    ios_backgroundColor={theme.border}
                    accessibilityLabel={t('form.autoLabel')}
                />
            </View>
            <Text style={[styles.hint, { color: theme.ink3, marginTop: 0 }]}>{t('form.autoHint')}</Text>

            {error !== '' ? (
                <Text style={[styles.errorText, { color: theme.danger, marginTop: 0 }]}>{error}</Text>
            ) : null}

            {hideSubmit ? null : <View style={styles.formBtnRow}>
                <Pressable
                    onPress={submit}
                    disabled={busy || (!!onSubmitValues && !valid)}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy || (!!onSubmitValues && !valid) }}
                    style={({ pressed }) => [
                        styles.submitBtn,
                        { backgroundColor: onSubmitValues && !valid ? theme.border : theme.brand },
                        (pressed || busy) && { opacity: 0.85 },
                    ]}
                >
                    <IconCheck size={15} color={onSubmitValues && !valid ? theme.ink3 : theme.onBrand} />
                    <Text style={[styles.submitBtnText, onSubmitValues && !valid ? { color: theme.ink3 } : null]}>
                        {submitLabel ?? t('form.submit')}
                    </Text>
                </Pressable>
                {onCancel ? (
                    <Pressable
                        onPress={() => { setError(''); onCancel(); }}
                        style={({ pressed }) => [styles.cancelBtn, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                    >
                        <Text style={[styles.cancelBtnText, { color: theme.ink2 }]}>{tc('action.cancel')}</Text>
                    </Pressable>
                ) : null}
            </View>}
        </>
    );

    if (bare) return <View>{fields}</View>;
    return (
        <Card theme={theme} depth={4} padding={18} style={{ marginBottom: 16 }}>
            <Text style={[styles.formTitle, { color: theme.ink }]}>{t('form.title')}</Text>
            {fields}
        </Card>
    );
});

export default GoalForm;
