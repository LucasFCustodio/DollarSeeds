/**
 * Group 2 · Your Month (screens 7–10): income, the split, the first expense, and
 * (only after one is logged) the updated containers.
 *
 * The split's numbers are the server's (POST /onboarding/preview/, or the account's
 * own dashboard in signed-in mode when this month's income already exists) — nothing
 * here computes a budget.
 */
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { ft } from '../../constants/responsive';
import { MONTHS } from '../../constants/months';
import { CURRENCIES } from '../../constants/currencies';
import Card from '../ui/Card';
import Sheet from '../ui/Sheet';
import SplitContainers from '../home/SplitContainers';
import { DropZoneProvider } from '../home/DropZones';
import { Field, PrimaryButton, TextLink } from './controls';
import StepLayout, { type StepProps } from './StepLayout';

/** Money the user types: the locale's parser, positive only. */
function useAmount() {
    const { parseAmount } = useLocale();
    return (v: string) => {
        const n = v.trim() ? parseAmount(v) : null;
        return n !== null && n > 0 ? Math.round(n * 100) / 100 : null;
    };
}

export function IncomeStep({ a, set, next, busy }: StepProps) {
    const { t } = useTranslation('onboarding');
    const { formatNumber, currency } = useLocale();
    const currencySymbol = CURRENCIES[currency].symbol;
    const amount = useAmount();
    const [value, setValue] = useState(a.income ? formatNumber(a.income, Number.isInteger(a.income) ? 0 : 2) : '');
    const parsed = amount(value);
    const go = () => { if (parsed === null) return; set({ income: parsed }); next(); };
    return (
        <StepLayout
            pose="thinking"
            bubble={t('income.question')}
            subtitle={t('income.subtitle')}
            footer={<PrimaryButton label={t('income.button')} onPress={go} disabled={parsed === null} busy={busy} />}
        >
            <Field
                accessibilityLabel={t('income.question')}
                value={value}
                onChangeText={setValue}
                validate={v => (amount(v) === null ? t('income.errAmount') : null)}
                placeholder={t('income.placeholder')}
                keyboardType="decimal-pad"
                prefix={currencySymbol}
                maxLength={12}
                autoFocus={!a.income}
            />
        </StepLayout>
    );
}

export function SplitStep({ next, name, split, busy }: StepProps) {
    const { t } = useTranslation('onboarding');
    const { theme } = useTheme();
    const { formatMoney, monthLabel } = useLocale();
    const month = monthLabel(MONTHS[new Date().getMonth()]);
    const rows = split ? [
        { key: 'needs', label: t('split.needs'), amount: split.needs, color: theme.needs, soft: theme.needsSoft },
        { key: 'wants', label: t('split.wants'), amount: split.wants, color: theme.wants, soft: theme.wantsSoft },
        { key: 'goals', label: t('split.goals'), amount: split.goals, color: theme.goals, soft: theme.goalsSoft },
    ] : [];
    return (
        <StepLayout
            pose="excited"
            bubble={t('split.bubble')}
            title={t('split.title', { name })}
            footer={<PrimaryButton label={t('split.button')} onPress={next} disabled={!split} busy={busy} />}
        >
            {!split ? <ActivityIndicator color={theme.brand} style={styles.loading} /> : (
                <>
                    {split.tithe.enabled && split.tithe.amount > 0 ? (
                        <Card theme={theme} depth={3} padding={14} style={[styles.row, { backgroundColor: theme.harvestSoft }]}>
                            <View style={styles.rowText}>
                                <Text style={[styles.rowLabel, { color: theme.ink }]}>{t('split.tithe')}</Text>
                                <Text style={[styles.rowHint, { color: theme.ink2 }]}>
                                    {t('split.titheRate', { pct: Math.round(split.tithe.rate * 1000) / 10 })}
                                </Text>
                            </View>
                            <Text style={[styles.rowAmount, { color: theme.harvestInk }]}>{formatMoney(split.tithe.amount)}</Text>
                        </Card>
                    ) : null}
                    {rows.map(r => (
                        <Card key={r.key} theme={theme} depth={3} padding={14} style={styles.row}>
                            <View style={[styles.dot, { backgroundColor: r.soft, borderColor: r.color }]} />
                            <Text style={[styles.rowLabel, styles.rowText, { color: theme.ink }]}>{r.label}</Text>
                            <Text style={[styles.rowAmount, { color: r.color }]}>{formatMoney(r.amount)}</Text>
                        </Card>
                    ))}
                    <Text style={[styles.note, { color: theme.ink2 }]}>{t('split.note', { month })}</Text>
                </>
            )}
        </StepLayout>
    );
}

function containers(a: StepProps['a'], split: StepProps['split']) {
    const logged = a.expense ?? null;
    return {
        budgets: { needs: split?.needs ?? 0, wants: split?.wants ?? 0, goals: split?.goals ?? 0 },
        spent: {
            needs: logged?.category === 'needs' ? logged.amount : 0,
            wants: logged?.category === 'wants' ? logged.amount : 0,
            goals: 0,
        },
    };
}

/** Screen 9: the question stays in the bubble. Logging moves on to screen 10. */
export function ExpenseStep({ a, set, next, split, busy }: StepProps) {
    const { t } = useTranslation('onboarding');
    const [open, setOpen] = useState<'needs' | 'wants' | null>(null);
    const logged = a.expense ?? null;
    const { budgets, spent } = containers(a, split);
    return (
        <StepLayout
            pose="pointing"
            bubble={t('expense.question')}
            subtitle={t('expense.subtitle')}
            footer={<>
                {/* Enabled only on a return visit, once the expense is logged. */}
                <PrimaryButton label={t('expense.button')} onPress={next} disabled={!logged} busy={busy} />
                {logged ? null : <TextLink label={t('expense.skip')} onPress={() => { set({ expense: null }); next(); }} />}
            </>}
        >
            <DropZoneProvider renderGhost={() => null}>
                <SplitContainers budgets={budgets} spent={spent} onOpen={() => {}} onAdd={setOpen} />
            </DropZoneProvider>
            <QuickExpenseSheet
                category={open}
                initial={logged}
                onClose={() => setOpen(null)}
                onLog={e => { set({ expense: e }); setOpen(null); next(); }}
            />
        </StepLayout>
    );
}

/** Screen 10: the containers with the expense taken off, no + buttons. */
export function ExpenseDoneStep({ a, next, split, busy }: StepProps) {
    const { t } = useTranslation('onboarding');
    const { budgets, spent } = containers(a, split);
    return (
        <StepLayout
            pose="thumbs-up"
            bubble={t('expense.reaction')}
            footer={<PrimaryButton label={t('expense.button')} onPress={next} busy={busy} />}
        >
            <DropZoneProvider renderGhost={() => null}>
                <SplitContainers budgets={budgets} spent={spent} onOpen={() => {}} />
            </DropZoneProvider>
        </StepLayout>
    );
}

/** The short version of the + logging page: what, and how much. The category is the
 *  + that was tapped; the sub-category is "Other" and the date is today, unasked. */
function QuickExpenseSheet({ category, initial, onClose, onLog }: {
    category: 'needs' | 'wants' | null;
    initial: { title: string; amount: number; category: 'needs' | 'wants' } | null;
    onClose: () => void;
    onLog: (e: { category: 'needs' | 'wants'; title: string; amount: number }) => void;
}) {
    const { t } = useTranslation('onboarding');
    const { formatNumber } = useLocale();
    const amount = useAmount();
    const same = initial && initial.category === category;
    const [title, setTitle] = useState(same ? initial.title : '');
    const [how, setHow] = useState(same ? formatNumber(initial.amount, 2) : '');
    const parsed = amount(how);
    const valid = title.trim().length > 0 && parsed !== null;
    return (
        <Sheet
            visible={category !== null}
            onClose={onClose}
            closeLabel={t('expense.sheet.close')}
            title={category === 'wants' ? t('expense.sheet.titleWants') : t('expense.sheet.titleNeeds')}
        >
            <View style={styles.sheet}>
                <Field
                    label={t('expense.sheet.what')}
                    value={title}
                    onChangeText={setTitle}
                    validate={v => (v.trim() ? null : t('expense.sheet.errWhat'))}
                    placeholder={t('expense.sheet.whatPlaceholder')}
                    maxLength={40}
                    autoFocus
                    autoCapitalize="sentences"
                />
                <Field
                    label={t('expense.sheet.how')}
                    value={how}
                    onChangeText={setHow}
                    validate={v => (amount(v) === null ? t('expense.sheet.errHow') : null)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    maxLength={10}
                />
                <PrimaryButton
                    label={t('expense.sheet.button')}
                    disabled={!valid}
                    onPress={() => category && parsed !== null && onLog({ category, title: title.trim(), amount: parsed })}
                />
            </View>
        </Sheet>
    );
}

const styles = StyleSheet.create({
    loading: { marginTop: 24 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowText: { flex: 1 },
    dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
    rowLabel: { fontFamily: Fonts.sansSemiBold, fontSize: ft(16) },
    rowHint: { fontFamily: Fonts.sans, fontSize: ft(13) },
    rowAmount: { fontFamily: Fonts.serif, fontSize: ft(26, 1.25) },
    note: { fontFamily: Fonts.sans, fontSize: ft(13), lineHeight: ft(19), marginTop: 6 },
    sheet: { paddingTop: 4, paddingBottom: 8 },
});
