/**
 * Feature flags for work that is built but not yet approved for production.
 *
 * DEBT_FREEDOM_ENABLED gates the Debts tab (the plant-debts garden) and every entry
 * point into it: the tab itself, `debtDetail` and `debtForm`. `__DEV__` means it is on
 * in development builds and off in every store build until the owner approves it.
 */
export const DEBT_FREEDOM_ENABLED: boolean = __DEV__;
