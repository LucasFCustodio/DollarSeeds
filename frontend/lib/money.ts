/**
 * money.ts — the ONE place a monetary value becomes a string, or a string becomes a
 * monetary value. Pure functions: locale and currency are passed in, never read from
 * module state (see the note at the bottom on why that matters here).
 *
 * `parseAmount` is the more important half of this file.
 *
 * Every amount input in the app uses `keyboardType="decimal-pad"`, which renders the
 * DEVICE's decimal separator — a comma on a Brazilian phone, regardless of what
 * language the app itself is set to. Those inputs were previously read with bare
 * `parseFloat`, which is silently wrong on exactly that input:
 *
 *     parseFloat("1234,56")   ->  1234      centavos dropped
 *     parseFloat("1.234,56")  ->  1.234     stores R$ 1,23 for an intended R$ 1.234,56
 *     parseFloat("5,000")     ->  5         off by three orders of magnitude
 *
 * No exception, no validation, no way to spot it afterwards. That is a live bug today
 * for anyone with a pt-BR device; shipping Portuguese is what brings those users in
 * volume. Nothing may call `parseFloat` on a user-entered amount again.
 */
import type { Currency, NumberFormat } from '../constants/currencies';

/** Group the integer part in threes: 1234567 -> "1,234,567" */
function groupInteger(digits: string, group: string): string {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, group);
}

/**
 * A bare number with locale separators and no currency symbol.
 * Used for the few places that show a number without money framing.
 */
export function formatNumber(
    value: number,
    format: NumberFormat,
    decimals = 0,
): string {
    const safe = Number.isFinite(value) ? value : 0;
    const negative = safe < 0;
    const [intPart, fracPart] = Math.abs(safe).toFixed(decimals).split('.');
    const grouped = groupInteger(intPart, format.group);
    const body = fracPart ? `${grouped}${format.decimal}${fracPart}` : grouped;
    return negative ? `-${body}` : body;
}

/**
 * The canonical money renderer: locale separators + the chosen currency symbol.
 *
 *   USD + en     ->  $1,234.56
 *   BRL + pt-BR  ->  R$ 1.234,56
 *   BRL + en     ->  R$ 1,234.56    (valid: symbol and separators are separate settings)
 *
 * The minus sign goes before the symbol (-$5, not $-5), which is what both conventions
 * expect.
 */
export function formatMoney(
    value: number,
    currency: Currency,
    format: NumberFormat,
    decimals = 0,
): string {
    const safe = Number.isFinite(value) ? value : 0;
    const sign = safe < 0 ? '-' : '';
    // Plain ASCII space. A non-breaking space would read marginally better but is an
    // invisible character in source that an editor or formatter can silently strip.
    const gap = currency.spaceAfterSymbol ? ' ' : '';
    return `${sign}${currency.symbol}${gap}${formatNumber(Math.abs(safe), format, decimals)}`;
}

/**
 * Read a user-typed amount. Returns null for anything that isn't a number, so callers
 * can show a validation error instead of silently storing garbage.
 *
 * Deliberately PERMISSIVE about separators rather than trusting the app's language,
 * because the keyboard follows the DEVICE: an English-language app on a Brazilian
 * phone still offers a comma key. The rules, in order:
 *
 *   1. Both separators present  -> the LAST one is the decimal mark. True in every
 *      convention ("1.234,56" and "1,234.56" are both unambiguous), so no locale
 *      knowledge is needed.
 *   2. One separator, appearing more than once -> grouping ("1.234.567").
 *   3. One separator, appearing once -> genuinely ambiguous ("5,000" is five thousand
 *      in en and five in pt-BR). Fall back to the active language's convention, with
 *      one refinement: a single separator followed by exactly three digits is treated
 *      as grouping when the language says that character groups.
 *
 * Currency symbols, spaces (including NBSP) and stray characters are stripped first,
 * so pasting "R$ 1.234,56" works.
 */
export function parseAmount(input: string, format: NumberFormat): number | null {
    if (typeof input !== 'string') return null;

    // Keep only digits, separators and a leading sign.
    const cleaned = input.replace(/[^\d.,-]/g, '').trim();
    if (!cleaned) return null;

    const negative = cleaned.startsWith('-');
    const body = cleaned.replace(/-/g, '');
    if (!body) return null;

    const lastDot = body.lastIndexOf('.');
    const lastComma = body.lastIndexOf(',');
    const dots = (body.match(/\./g) || []).length;
    const commas = (body.match(/,/g) || []).length;

    let decimalMark: string | null = null;

    if (dots > 0 && commas > 0) {
        decimalMark = lastDot > lastComma ? '.' : ',';        // rule 1
    } else if (dots > 1 || commas > 1) {
        decimalMark = null;                                    // rule 2 — all grouping
    } else if (dots === 1 || commas === 1) {
        const sep = dots === 1 ? '.' : ',';
        const trailing = body.length - body.lastIndexOf(sep) - 1;
        // rule 3
        decimalMark = sep === format.group && trailing === 3 ? null : sep;
    }

    let normalised: string;
    if (decimalMark === null) {
        normalised = body.replace(/[.,]/g, '');
    } else {
        const other = decimalMark === '.' ? ',' : '.';
        normalised = body.split(other).join('').replace(decimalMark, '.');
    }

    const parsed = Number(normalised);
    if (!Number.isFinite(parsed)) return null;
    return negative ? -parsed : parsed;
}

/**
 * NOTE FOR CALLERS: do not wrap these in a module-level convenience that reads the
 * active locale from a singleton. `app.json` enables `reactCompiler`, whose
 * auto-memoisation cannot see module state — components would render stale after a
 * language or currency switch. Use the bound `useMoney()` hook from LocaleContext.
 */
