/**
 * Feature flags: kill switches for features that ship in store builds.
 *
 * DEBT_FREEDOM_ENABLED gates the Debts tab (the plant-debts garden) and every entry
 * point into it: the tab itself, `debtDetail`, `debtForm` and the home's debt
 * elements. It is on for every build. Who may USE it is not decided here: Debt
 * Freedom is premium, and the server's `debt_freedom` allowance picks between the
 * garden, its read-only view and the tutorial (lib/debtFreedomAccess.ts).
 *
 * Kept as a constant so a future build can switch the whole feature off again.
 */
export const DEBT_FREEDOM_ENABLED: boolean = true;
