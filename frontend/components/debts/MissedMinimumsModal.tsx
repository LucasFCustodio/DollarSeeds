/**
 * MissedMinimumsModal — "View all min payments", opened from a debt whose toggle
 * container became MissedMinsButton (it owes minimums for passed cycles).
 *
 * The home's OverdueModal frame: a centred card, 88% of the width, sized to its rows
 * up to 70% of the height and scrolling past that; closes on the backdrop, the × or
 * Android back. One row per month, oldest at the top:
 *
 *   September minimum        $50   [switch]
 *   was due Sep 14
 *   …
 *   November minimum         $50   [switch]     ← the current cycle, last
 *   due Nov 14
 *
 * A missed month's switch logs its minimum late (`cycle_due_date`); switching it back
 * off takes it back. Months logged while the modal is open stay listed (switched on)
 * so they can be undone, and so do late minimums from earlier visits this cycle
 * (`late_minimums`). The current cycle's row is the ordinary toggle.
 *
 * The parent owns the requests (useMinToggle) and the live debt, and closes this when
 * the last missed month is logged — see `missedCyclesOf`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, shadow, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { MONTHS } from '../../constants/months';
import { IconClose } from '../icons';
import { PAINTED_OUTLINE } from '../home/PaintedCard';
import { missedCyclesOf, type Debt, type MissedCycle } from '../../lib/debtFreedom';
import { useDebtFormat } from './format';
import { MinSwitch } from './MinToggle';

const MAX_HEIGHT = 0.7;

interface Props {
    /** The live debt; null hides the modal. */
    debt: Debt | null;
    pendingValueFor: (id: number, cycle?: string | null) => boolean | null;
    /** Without a due date: the current cycle's minimum. */
    onToggle: (debt: Debt, cycleDueDate?: string) => void;
    onClose: () => void;
}

type Row = { due: string; amount: number; current: boolean };

export default function MissedMinimumsModal({ debt, pendingValueFor, onToggle, onClose }: Props) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const { height } = useWindowDimensions();

    // Every month listed since this debt's modal opened, with its amount, so a month
    // logged here keeps its row (switched on) after the server stops listing it.
    const [seen, setSeen] = useState<Map<string, number>>(new Map());
    const debtId = debt?.id ?? null;
    useEffect(() => { setSeen(new Map()); }, [debtId]);
    useEffect(() => {
        if (!debt) return;
        const add = [...missedCyclesOf(debt), ...(debt.late_minimums ?? [])];
        setSeen(prev => {
            if (add.every(c => prev.has(c.due_date))) return prev;
            const next = new Map(prev);
            add.forEach((c: MissedCycle) => { if (!next.has(c.due_date)) next.set(c.due_date, c.amount); });
            return next;
        });
    }, [debt]);

    const rows = useMemo<Row[]>(() => {
        if (!debt) return [];
        const past = [...seen.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([due, amount]) => ({ due, amount, current: false }));
        const current = debt.current_cycle_due_date
            ? [{ due: debt.current_cycle_due_date, amount: Math.min(debt.min_payment, debt.current_balance), current: true }]
            : [];
        return [...past, ...current];
    }, [debt, seen]);

    const missed = useMemo(() => new Set(debt ? missedCyclesOf(debt).map(c => c.due_date) : []), [debt]);

    return (
        <Modal visible={!!debt} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.overlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose}
                    accessibilityRole="button" accessibilityLabel={t('missed.close')} />
                <View style={[
                    styles.card,
                    { backgroundColor: theme.surface, borderColor: theme.ink, maxHeight: height * MAX_HEIGHT },
                    shadow(8) as object,
                ]}>
                    <View style={styles.header}>
                        <View style={styles.flex}>
                            <Text accessibilityRole="header" style={[styles.title, { color: theme.ink, fontFamily: Fonts.sansSemiBold }]}>
                                {t('missed.title')}
                            </Text>
                            {debt ? (
                                <Text numberOfLines={1} style={[styles.subtitle, { color: theme.ink2, fontFamily: Fonts.sans }]}>
                                    {debt.name}
                                </Text>
                            ) : null}
                        </View>
                        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button"
                            accessibilityLabel={t('missed.close')}
                            style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}>
                            <IconClose size={18} color={theme.ink2} />
                        </Pressable>
                    </View>
                    {debt ? (
                        <ScrollView style={styles.scroll} contentContainerStyle={styles.rows}>
                            {rows.map(r => {
                                const pending = pendingValueFor(debt.id, r.current ? null : r.due);
                                const logged = r.current ? debt.min_logged_this_cycle : !missed.has(r.due);
                                // A month the server no longer lists as missed or as
                                // late-and-undoable can't change here any more.
                                const fixed = !r.current && logged
                                    && !(debt.late_minimums ?? []).some(c => c.due_date === r.due);
                                return (
                                    <MonthRow
                                        key={r.due}
                                        row={r}
                                        on={pending ?? logged}
                                        pending={pending != null}
                                        fixed={fixed}
                                        onChange={() => onToggle(debt, r.current ? undefined : r.due)}
                                    />
                                );
                            })}
                        </ScrollView>
                    ) : null}
                </View>
            </View>
        </Modal>
    );
}

function MonthRow({ row, on, pending, fixed, onChange }: {
    row: Row; on: boolean; pending: boolean; fixed: boolean; onChange: () => void;
}) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const { monthLabel } = useLocale();
    const f = useDebtFormat();
    const month = monthLabel(MONTHS[Number(row.due.slice(5, 7)) - 1]);
    const title = t('missed.monthMinimum', { month });
    const when = row.current
        ? t('missed.due', { date: f.dayMonthOf(row.due) })
        : t('missed.wasDue', { date: f.dayMonthOf(row.due) });
    const amount = f.money(row.amount);
    const owed = !row.current && !on;
    return (
        <View style={[styles.row, { backgroundColor: owed ? theme.harvestSoft : on ? theme.brandSoft : theme.bg }]}>
            <View style={styles.flex}>
                <Text numberOfLines={1} style={[styles.month, { color: theme.ink, fontFamily: Fonts.sansSemiBold }]}>{title}</Text>
                <Text style={[styles.when, { color: theme.ink2, fontFamily: Fonts.sans }]}>{when}</Text>
            </View>
            <Text style={[styles.amount, { color: theme.ink, fontFamily: Fonts.sansSemiBold }]}>{amount}</Text>
            <MinSwitch
                on={on}
                pending={pending || fixed}
                onChange={onChange}
                a11yLabel={t('missed.rowA11y', { month: title, date: when, amount })}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    card: { width: '88%', borderRadius: 18, borderWidth: PAINTED_OUTLINE, padding: 16 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
    flex: { flex: 1 },
    title: { fontSize: 17 },
    subtitle: { fontSize: 13, marginTop: 2 },
    scroll: { flexGrow: 0, flexShrink: 1 },
    rows: { gap: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingVertical: 10, paddingLeft: 12, paddingRight: 8 },
    month: { fontSize: 15 },
    when: { fontSize: 13, marginTop: 2 },
    amount: { fontSize: 15 },
});
