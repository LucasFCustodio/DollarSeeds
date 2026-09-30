/**
 * Budget types — frontend mirror of the backend BUDGET_TYPES (backend/main.py).
 * Store/transmit only the KEY; percentages here are for display only and must
 * stay in sync with the backend single source of truth.
 *
 * Invariants the three types satisfy: wants <= 30%, savings > 0.
 */
export type BudgetTypeKey = 'balanced' | 'wealth_builder' | 'firm_foundation';

export interface BudgetTypeDef {
    key: BudgetTypeKey;
    name: string;
    needs: number;   // fraction (0–1)
    wants: number;
    savings: number;
    tagline: string;
}

export const BUDGET_TYPES: Record<BudgetTypeKey, BudgetTypeDef> = {
    balanced: {
        key: 'balanced',
        name: 'Balanced',
        needs: 0.50, wants: 0.30, savings: 0.20,
        tagline: 'A steady, even split.',
    },
    wealth_builder: {
        key: 'wealth_builder',
        name: 'Wealth Builder',
        needs: 0.30, wants: 0.20, savings: 0.50,
        tagline: 'Low expenses or high income — save aggressively.',
    },
    firm_foundation: {
        key: 'firm_foundation',
        name: 'Firm Foundation',
        needs: 0.70, wants: 0.10, savings: 0.20,
        tagline: 'High essential costs — build stability and a safety net.',
    },
};

export const BUDGET_TYPE_ORDER: BudgetTypeKey[] = ['balanced', 'wealth_builder', 'firm_foundation'];

export const DEFAULT_BUDGET_TYPE: BudgetTypeKey = 'balanced';

/** Compact "50/30/20" label for a type. */
export function splitLabel(t: BudgetTypeDef): string {
    return `${Math.round(t.needs * 100)}/${Math.round(t.wants * 100)}/${Math.round(t.savings * 100)}`;
}

/**
 * The split an OPEN month actually uses, given the user's STORED choice and the
 * `budget_types` allowance from GET /me/entitlements/.
 *
 * A lapsed subscriber keeps `wealth_builder` in user_settings — the server never
 * rewrites it, so resubscribing restores it — while every unclosed month resolves to
 * the default split (backend `_live_budget_type`). GET /settings/ returns the stored
 * value, so any screen that PREVIEWS a split from it must pass it through here or it
 * shows a split the budget isn't using. `allowed` null means the allowances are
 * unknown, and the stored choice is taken as-is.
 */
export function effectiveBudgetType(
    stored: string | null | undefined,
    allowed: readonly string[] | null | undefined,
): BudgetTypeKey {
    const key = resolveBudgetType(stored).key;
    return !allowed || allowed.includes(key) ? key : DEFAULT_BUDGET_TYPE;
}

/** Safely resolve a key (possibly from the API) to a definition. */
export function resolveBudgetType(key?: string | null): BudgetTypeDef {
    return BUDGET_TYPES[(key as BudgetTypeKey)] ?? BUDGET_TYPES[DEFAULT_BUDGET_TYPE];
}
