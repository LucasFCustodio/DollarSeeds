/**
 * serverStrings — display-time translation of text the SERVER composed.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────
 * The backend writes human-readable English into `savings_transactions.title` and
 * into HTTPException `detail` bodies. Those strings are DATA: they are already
 * sitting in the production database on rows created months ago, and the live App
 * Store binary reads them verbatim. So they can never be translated at the source
 * — the backend keeps emitting English forever, and we map to a display label here.
 *
 * A pleasant side effect: because the mapping happens at render, historical rows
 * get translated too. There is no backfill.
 *
 * ── THE FALL-THROUGH IS THE CONTRACT ──────────────────────────────────────────
 * Every function returns its INPUT unchanged when nothing matches. A title the
 * backend starts emitting tomorrow, or a goal a user named themselves, shows as
 * plain English rather than a `serverTitle.…` key or an empty string. Never make
 * an unmatched value throw or blank.
 *
 * Keys live under `common:serverTitle` / `common:serverError`.
 */
import type { TFunction } from 'i18next';

/** Signature of the `t` bound to the `common` namespace. */
type T = TFunction<'common'> | ((key: string, opts?: Record<string, unknown>) => string);

/**
 * Titles carrying a month. The month inside them is a canonical English month name
 * (the backend built it from its own MONTHS list), so it goes through `monthLabel`
 * rather than being pasted in raw.
 */
const MONTH_SUFFIXED: ReadonlyArray<{ re: RegExp; key: string }> = [
    // Order matters only in that a more specific prefix must precede a broader one.
    // "Rollover recovery — X" does not match /^Rollover — /, so these are disjoint,
    // but keep recovery first so a future "Rollover foo" pattern can't shadow it.
    { re: /^Rollover recovery — (.+)$/, key: 'rolloverRecovery' },
    { re: /^Rollover — (.+)$/,          key: 'rollover' },
    { re: /^Spent after close — (.+)$/, key: 'spentAfterClose' },
];

/**
 * Translate one server-composed savings-transaction title.
 *
 * @param monthLabel translates a canonical English month; pass the bound one from
 *                   LocaleContext so the result tracks the active language.
 */
export function serverTitle(title: string, t: T, monthLabel: (m: string) => string): string {
    if (!title) return title;

    for (const { re, key } of MONTH_SUFFIXED) {
        const m = re.exec(title);
        if (m) return t(`serverTitle.${key}`, { month: monthLabel(m[1]), defaultValue: title });
    }

    // The goal name here is FREE USER TEXT — it is re-interpolated exactly as stored
    // and must never be looked up as a key.
    const transfer = /^Transfer from General Savings to (.+)$/.exec(title);
    if (transfer) {
        return t('serverTitle.transferToGoal', { goal: transfer[1], defaultValue: title });
    }

    // Exact-match titles. Keyed by the English string itself, which is safe here
    // because these are fixed literals in main.py, not user input.
    switch (title) {
        case 'General Savings':           return t('serverTitle.General Savings', { defaultValue: title });
        case 'Reconciliation':            return t('serverTitle.Reconciliation', { defaultValue: title });
        case 'Starting balance':          return t('serverTitle.Starting balance', { defaultValue: title });
        case 'Returned from deleted goal':return t('serverTitle.Returned from deleted goal', { defaultValue: title });
        // Composed by the frontend (piggyBank funding) but stored the same way, so a
        // row written by an OLD binary still lands here.
        case 'Deposit':                   return t('serverTitle.Deposit', { defaultValue: title });
        case 'Savings goal':              return t('serverTitle.Savings goal', { defaultValue: title });
        default:                          return title;
    }
}

/**
 * Translate a backend HTTPException `detail`, which several screens render raw.
 *
 * Matching on English prose is admittedly brittle — but the alternative (an error
 * `code` field) would only reach clients that took the update, and these same
 * messages must keep rendering for the binaries already installed. So: match here,
 * fall through to the server's own English when we don't recognise it.
 */
export function serverError(detail: string, t: T, monthLabel: (m: string) => string): string {
    if (!detail) return detail;

    const closed = /^(.+) is closed\. Reopen it before making changes\.$/.exec(detail);
    if (closed) {
        return t('serverError.monthClosed', { month: monthLabel(closed[1]), defaultValue: detail });
    }

    switch (detail) {
        case 'A goal with this name already exists.':
            return t('serverError.goalNameTaken', { defaultValue: detail });
        case 'General Savings cannot be edited.':
            return t('serverError.generalSavingsLocked', { defaultValue: detail });
        case 'General Savings cannot be deleted.':
            return t('serverError.generalSavingsUndeletable', { defaultValue: detail });
        case 'The Reconciliation goal is managed automatically.':
            return t('serverError.reconciliationLocked', { defaultValue: detail });
        case 'The Reconciliation goal is managed automatically and cannot be deleted.':
            return t('serverError.reconciliationUndeletable', { defaultValue: detail });
        case 'Target amount must be greater than zero.':
            return t('serverError.targetTooSmall', { defaultValue: detail });
        case 'Goal is already completed.':
            return t('serverError.alreadyCompleted', { defaultValue: detail });
        default:
            return detail;
    }
}
