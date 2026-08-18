/**
 * LocaleContext — display language and currency symbol.
 *
 * TWO INDEPENDENT SETTINGS. Language decides the words and the number separators;
 * currency decides only the symbol. All four combinations are valid and neither
 * setting constrains the other. Changing currency NEVER converts a value and never
 * touches anything stored — amounts are plain numbers with no currency dimension.
 *
 * ── WHY THE FORMATTERS ARE BOUND HERE AND NOT MODULE-LEVEL ────────────────────
 * `app.json` enables `reactCompiler`. Its auto-memoisation tracks hooks and props but
 * cannot see module state, so a top-level `formatMoney()` reading the active locale
 * from a singleton would leave memoised components rendering STALE after a switch —
 * a random-looking subset of the screen failing to update. Exposing bound
 * `formatMoney` / `monthLabel` through context makes the dependency visible.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Preferences are DEVICE-GLOBAL, not per-user (unlike the keys in
 * constants/onboarding.ts). `/auth` and `UpdateGate` render before any user exists,
 * and they have to be readable.
 */
import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

import i18n, {
    DEFAULT_LANGUAGE, detectDeviceCurrency, detectDeviceLanguage, initI18n,
    isLanguageTag, type LanguageTag,
} from '../lib/i18n';
import {
    CURRENCIES, DEFAULT_CURRENCY, isCurrencyCode, numberFormatFor,
    type CurrencyCode, type NumberFormat,
} from '../constants/currencies';
import { formatMoney as rawFormatMoney, formatNumber as rawFormatNumber, parseAmount as rawParseAmount } from '../lib/money';
import { MONTHS, type MonthName } from '../constants/months';

const LANGUAGE_KEY = 'display_language';
const CURRENCY_KEY = 'display_currency';

type LocaleContextType = {
    language: LanguageTag;
    currency: CurrencyCode;
    numberFormat: NumberFormat;
    /** False until the stored preference has been read — gate first paint on this. */
    ready: boolean;
    setLanguage: (next: LanguageTag) => Promise<void>;
    setCurrency: (next: CurrencyCode) => Promise<void>;
    /** Bound money formatter. Symbol from `currency`, separators from `language`. */
    formatMoney: (value: number, decimals?: number) => string;
    formatNumber: (value: number, decimals?: number) => string;
    /** Bound amount parser — use this instead of parseFloat, always. */
    parseAmount: (input: string) => number | null;
    /** Canonical English month -> display label. */
    monthLabel: (month: string) => string;
    monthAbbr: (month: string) => string;
    /** Localised "Apr 15" / "15 de abr". */
    dayMonth: (month: string, day: number) => string;
    monthYear: (month: string, year: number) => string;
};

const noop = async () => {};

const LocaleContext = createContext<LocaleContextType>({
    language: DEFAULT_LANGUAGE,
    currency: DEFAULT_CURRENCY,
    numberFormat: numberFormatFor(DEFAULT_LANGUAGE),
    ready: false,
    setLanguage: noop,
    setCurrency: noop,
    formatMoney: v => String(v),
    formatNumber: v => String(v),
    parseAmount: () => null,
    monthLabel: m => m,
    monthAbbr: m => m,
    dayMonth: (m, d) => `${m} ${d}`,
    monthYear: (m, y) => `${m} ${y}`,
});

export const useLocale = () => useContext(LocaleContext);

/** Convenience for the common case — money only. */
export function useMoney() {
    const { formatMoney, parseAmount, currency } = useLocale();
    return { formatMoney, parseAmount, currency };
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<LanguageTag>(DEFAULT_LANGUAGE);
    const [currency, setCurrencyState] = useState<CurrencyCode>(DEFAULT_CURRENCY);
    const [ready, setReady] = useState(false);

    // i18next must exist before the first render that calls t(). Initialising with the
    // device language means the very first paint is already in the right language for
    // a new install; a stored override is applied a tick later, before `ready` flips.
    useMemo(() => initI18n(detectDeviceLanguage()), []);

    // `useTranslation` is what subscribes this subtree to language changes — without
    // it, changing the language would not re-render consumers.
    const { i18n: i18nInstance, t } = useTranslation('common');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [storedLang, storedCurrency] = await Promise.all([
                    AsyncStorage.getItem(LANGUAGE_KEY),
                    AsyncStorage.getItem(CURRENCY_KEY),
                ]);
                if (cancelled) return;

                const nextLang = isLanguageTag(storedLang) ? storedLang : detectDeviceLanguage();
                setLanguageState(nextLang);
                if (i18n.language !== nextLang) await i18n.changeLanguage(nextLang);

                if (isCurrencyCode(storedCurrency)) {
                    setCurrencyState(storedCurrency);
                } else {
                    // First run: honour the device's region if we support its currency.
                    const deviceCurrency = detectDeviceCurrency();
                    setCurrencyState(isCurrencyCode(deviceCurrency) ? deviceCurrency : DEFAULT_CURRENCY);
                }
            } catch {
                // A storage failure must never stop the app from starting — fall back
                // to the device language, matching the app's fail-open convention.
            } finally {
                if (!cancelled) setReady(true);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const setLanguage = useCallback(async (next: LanguageTag) => {
        setLanguageState(next);
        await i18n.changeLanguage(next);
        try {
            await AsyncStorage.setItem(LANGUAGE_KEY, next);
        } catch {
            // Preference is applied for this session even if it can't be persisted.
        }
    }, []);

    const setCurrency = useCallback(async (next: CurrencyCode) => {
        setCurrencyState(next);
        try {
            await AsyncStorage.setItem(CURRENCY_KEY, next);
        } catch {
            // As above.
        }
    }, []);

    const numberFormat = useMemo(() => numberFormatFor(language), [language]);
    const currencyConfig = CURRENCIES[currency];

    const value = useMemo<LocaleContextType>(() => {
        const monthLabel = (month: string) =>
            t(`months.${month}`, { defaultValue: month });
        const monthAbbr = (month: string) =>
            t(`monthsShort.${month}`, { defaultValue: month.slice(0, 3) });

        return {
            language,
            currency,
            numberFormat,
            ready,
            setLanguage,
            setCurrency,
            formatMoney: (v, decimals = 0) => rawFormatMoney(v, currencyConfig, numberFormat, decimals),
            formatNumber: (v, decimals = 0) => rawFormatNumber(v, numberFormat, decimals),
            parseAmount: (input: string) => rawParseAmount(input, numberFormat),
            monthLabel,
            monthAbbr,
            dayMonth: (month, day) =>
                t('date.dayMonth', { month: monthAbbr(month), day }),
            monthYear: (month, year) =>
                t('date.monthYear', { month: monthLabel(month), year }),
        };
        // `i18nInstance.language` is in the dep list so every formatter is rebuilt when
        // the language changes — that is what stops reactCompiler serving stale output.
    }, [language, currency, numberFormat, ready, setLanguage, setCurrency,
        currencyConfig, t, i18nInstance.language]);

    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** Re-exported so screens don't need a second import for the canonical list. */
export { MONTHS };
export type { MonthName };
