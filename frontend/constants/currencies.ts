/**
 * Currency and number-format registries.
 *
 * TWO SEPARATE SETTINGS, ON PURPOSE:
 *   - CURRENCY decides the SYMBOL only ($ vs R$). It never converts a value and never
 *     touches anything stored. Amounts are plain numbers in the database with no
 *     currency dimension, so this is a labelling preference, not a unit conversion.
 *   - LANGUAGE decides the SEPARATORS (1,234.56 vs 1.234,56), because separator
 *     convention follows the language a person reads, not the money they hold.
 *
 * All four combinations are reachable and all four are valid.
 *
 * WHY WE OWN THE SEPARATORS INSTEAD OF USING Intl.NumberFormat:
 * Hermes built without full Intl still provides `Number.prototype.toLocaleString`, but
 * its fallback IGNORES the locale argument and emits en-US shape. So the fact that
 * `toLocaleString('en-US')` works today proves only that the fallback exists — it says
 * nothing about whether pt-BR data is present. The two failure modes would be a hard
 * crash (`Intl` undefined) or, far worse in a financial app, SILENTLY WRONG
 * SEPARATORS. Owning the table is a dozen lines, is identical on every engine, and is
 * unit-testable in plain Node.
 */

export type CurrencyCode = 'USD' | 'BRL';

export type Currency = {
    code: CurrencyCode;
    symbol: string;
    /** R$ takes a space before the number; $ does not. */
    spaceAfterSymbol: boolean;
    /** Shown in the settings picker, in the language the user is reading. */
    labelKey: string;
};

export const CURRENCIES: Record<CurrencyCode, Currency> = {
    USD: { code: 'USD', symbol: '$', spaceAfterSymbol: false, labelKey: 'settings:currency.usd' },
    BRL: { code: 'BRL', symbol: 'R$', spaceAfterSymbol: true, labelKey: 'settings:currency.brl' },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export const DEFAULT_CURRENCY: CurrencyCode = 'USD';

export function isCurrencyCode(value: unknown): value is CurrencyCode {
    return typeof value === 'string' && value in CURRENCIES;
}

/** Thousands and decimal marks, keyed by language. */
export type NumberFormat = { group: string; decimal: string };

export const NUMBER_FORMATS: Record<string, NumberFormat> = {
    en: { group: ',', decimal: '.' },
    'pt-BR': { group: '.', decimal: ',' },
};

export const DEFAULT_NUMBER_FORMAT: NumberFormat = NUMBER_FORMATS.en;

export function numberFormatFor(language: string): NumberFormat {
    return NUMBER_FORMATS[language] ?? DEFAULT_NUMBER_FORMAT;
}
