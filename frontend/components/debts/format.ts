/**
 * Display helpers for the Debts screens. Everything goes through the bound
 * formatters in LocaleContext and the `debts` catalogue — no hand-built dates or
 * currency strings (see i18n.md).
 */
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MONTHS, useLocale } from '../../context/LocaleContext';

/** Money with cents only when there are cents: $1,240 but $1,240.50. */
export function useDebtFormat() {
    const { t } = useTranslation('debts');
    const { formatMoney, monthAbbr, dayMonth, dayMonthYear } = useLocale();

    const money = useCallback(
        (v: number | null | undefined) => {
            const n = Number(v ?? 0);
            return formatMoney(n, Math.abs(n % 1) > 0.004 ? 2 : 0);
        },
        [formatMoney],
    );

    /** "2027-03" → "Mar 2027"; null → "--". */
    const monthYear = useCallback(
        (ym: string | null | undefined) => {
            if (!ym) return t('label.missing');
            const [y, m] = ym.split('-').map(Number);
            const name = MONTHS[(m || 1) - 1];
            return t('date.monthYearShort', { month: monthAbbr(name), year: y });
        },
        [t, monthAbbr],
    );

    /** "2026-10-14" (or a timestamp) → "Oct 14". */
    const dayMonthOf = useCallback(
        (iso: string | null | undefined) => {
            if (!iso) return t('label.missing');
            const [, m, d] = iso.slice(0, 10).split('-').map(Number);
            return dayMonth(MONTHS[m - 1], d);
        },
        [t, dayMonth],
    );

    /** "2026-10-14" → "Oct 14, 2026". */
    const fullDate = useCallback(
        (iso: string | null | undefined) => {
            if (!iso) return t('label.missing');
            const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
            return dayMonthYear(MONTHS[m - 1], d, y);
        },
        [t, dayMonthYear],
    );

    const pct = useCallback((fraction: number) => Math.floor((fraction || 0) * 100), []);

    return useMemo(() => ({ money, monthYear, dayMonthOf, fullDate, pct }),
        [money, monthYear, dayMonthOf, fullDate, pct]);
}
