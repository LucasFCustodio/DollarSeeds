/**
 * debtFreedomAccess — what the Debts tab may do for this user, from the server's
 * `debt_freedom` allowance (SUBSCRIPTION_REWORK.md §4, §6). Values, never a premium
 * check of our own:
 *
 *   full       every action
 *   read_only  lapsed with debts: the garden and detail render, every action hidden
 *   none       no debts and not premium: the tutorial instead of the garden
 *   loading    this user's first entitlement read hasn't finished — render the
 *              screen's loading state, so a subscriber never sees the tutorial flash
 *
 * An allowance the server didn't send (a failed read, or a backend that predates it)
 * is read as `full`, like every unknown allowance: the server still refuses what it
 * won't allow, and its 403 `debt_freedom_locked` is the backstop.
 */
import { useCallback } from 'react';

import { useSubscription, type DebtFreedomAllowance } from '../context/SubscriptionContext';
import { premiumErrorCode } from './premiumErrors';

export type DebtFreedomAccess = DebtFreedomAllowance | 'loading';

export const DEBT_FREEDOM_LOCKED = 'debt_freedom_locked';

export function useDebtFreedomAccess(): DebtFreedomAccess {
    const { allowances, entitlementSettled } = useSubscription();
    if (allowances?.debtFreedom) return allowances.debtFreedom;
    return entitlementSettled ? 'full' : 'loading';
}

export function isDebtFreedomLocked(err: unknown): boolean {
    return premiumErrorCode(err) === DEBT_FREEDOM_LOCKED;
}

/**
 * For every Debt Freedom write's catch: `true` when the server refused it because the
 * user isn't premium. It then re-reads the entitlement, which re-renders the screen in
 * its read-only or tutorial state, and the caller shows no alert of its own.
 */
export function useDebtFreedomLockedHandler() {
    const { refreshEntitlement } = useSubscription();
    return useCallback((err: unknown): boolean => {
        if (!isDebtFreedomLocked(err)) return false;
        void refreshEntitlement();
        return true;
    }, [refreshEntitlement]);
}
