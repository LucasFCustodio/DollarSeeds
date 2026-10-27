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
import React, { useEffect, useMemo, useState } from 'react';
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

interface Props {
    /** Onboarding: every field must be filled in explicitly. */
    requireAll?: boolean;
    initialTitle?: string;
    initialAmount?: string;
    onCreated: (goal: CreatedGoal) => void;
    /** Omit to hide the Cancel button (an onboarding step has its own navigation). */
    onCancel?: () => void;
    /** A premium refusal (goal_limit_reached), after the form has shown it in place. */
    onPremiumError?: (code: string) => void;
}

export default function GoalForm({
    requireAll = false, initialTitle = '', initialAmount = '', onCreated, onCancel, onPremiumError,
}: Props) {
    const { t } = useTranslation('goals');
    const { t: tc } = useTranslation('common');
    const { theme } = useTheme();
    const { formatMoney, formatNumber, parseAmount, serverError } = useLocale();
    const { message: premiumMessage } = usePremiumUpsell();

    const today = useMemo(() => new Date(), []);
    const fallback = useMemo(() => defaultTargetDate(today), [today]);
    const thisYear = today.getFullYear();

    const [title, setTitle] = useState(initialTitle);
    const [target, setTarget] = useState(initialAmount);
    const [saved, setSaved] = useState('');
    const [source, setSource] = useState<MoneySource | null>(null);
    const [month, setMonth] = useState<string | null>(requireAll ? null : fallback.month);
    const [year, setYear] = useState<number | null>(requireAll ? null : fallback.year);
    const [auto, setAuto] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [ctx, setCtx] = useState<BudgetContext | null>(null);

    // The budget context is optional decoration: a failed read only drops the share
    // line and the warning, never the form.
    useEffect(() => {
        let live = true;
        fetchBudgetContext().then(c => { if (live) setCtx(c); }).catch(() => {});
        return () => { live = false; };
    }, []);

    useEffect(() => { setTitle(initialTitle); }, [initialTitle]);
    useEffect(() => { setTarget(initialAmount); }, [initialAmount]);

    const targetNum = target.trim() ? parseAmount(target) : null;
    const savedNum = saved.trim() ? parseAmount(saved) : 0;
    const alreadyDone = targetNum !== null && targetNum > 0 && savedNum !== null && savedNum >= targetNum;
    const minimum = month && year !== null && !alreadyDone
        ? monthlyMinimum(targetNum, savedNum, month, year, today)
        : null;
    const fit = budgetFit(minimum, ctx);

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
            onCreated({ id: goal?.id, title: goal?.title ?? title.trim() });
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

    const input = [styles.textInput, { backgroundColor: theme.surfaceSoft, borderColor: theme.border, color: theme.ink }];

    return (
        <Card theme={theme} depth={4} padding={18} style={{ marginBottom: 16 }}>
            <Text style={[styles.formTitle, { color: theme.ink }]}>{t('form.title')}</Text>

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

            <View style={styles.formBtnRow}>
                <Pressable
                    onPress={submit}
                    disabled={busy}
                    style={({ pressed }) => [
                        styles.submitBtn, { backgroundColor: theme.brand },
                        (pressed || busy) && { opacity: 0.85 },
                    ]}
                >
                    <IconCheck size={15} color={theme.onBrand} />
                    <Text style={styles.submitBtnText}>{t('form.submit')}</Text>
                </Pressable>
                {onCancel ? (
                    <Pressable
                        onPress={() => { setError(''); onCancel(); }}
                        style={({ pressed }) => [styles.cancelBtn, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                    >
                        <Text style={[styles.cancelBtnText, { color: theme.ink2 }]}>{tc('action.cancel')}</Text>
                    </Pressable>
                ) : null}
            </View>
        </Card>
    );
}
