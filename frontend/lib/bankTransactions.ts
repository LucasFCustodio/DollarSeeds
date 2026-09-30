/**
 * bankTransactions.ts — the placeholder for bank-connected logging (Plaid comes later).
 *
 * The home's logging area shows a connected user's PENDING transactions as bubbles they
 * drag onto a split (expenses) or the income hero (income). All of that UI is real; only
 * this file is a stand-in. Wiring Plaid means replacing the bodies below — nothing in
 * components/home/ should need to change.
 *
 * Production: not connected, nothing pending. In a dev build, DEV_MOCK_BANK previews
 * the bubbles with a handful of mock transactions that classify away locally.
 */

export const BANK_CONNECTION_ENABLED = false;

/** Flip to preview the bubbles in a dev build. Has no effect in a store build. */
const DEV_MOCK_BANK = true;

const mockOn = () => __DEV__ && DEV_MOCK_BANK;

export interface PendingTransaction {
    id: string;
    /** The merchant / payer name the bank reports. */
    name: string;
    /** Always positive; `kind` says which way it went. */
    amount: number;
    kind: 'expense' | 'income';
    /** YYYY-MM-DD */
    date: string;
}

/** Where a bubble can be dropped. Expenses go to a split, income to the hero. */
export type ClassifyTarget = 'needs' | 'wants' | 'goals' | 'income';

let mockPending: PendingTransaction[] = [
    { id: 'mock-1', name: 'Trader Joe’s', amount: 64.12, kind: 'expense', date: '2026-09-27' },
    { id: 'mock-2', name: 'Payroll', amount: 1850, kind: 'income', date: '2026-09-26' },
    { id: 'mock-3', name: 'Netflix', amount: 15.49, kind: 'expense', date: '2026-09-25' },
    { id: 'mock-4', name: 'Shell', amount: 42.3, kind: 'expense', date: '2026-09-25' },
    { id: 'mock-5', name: 'Blue Bottle Coffee', amount: 6.75, kind: 'expense', date: '2026-09-24' },
];

export function isBankConnected(): boolean {
    return BANK_CONNECTION_ENABLED || mockOn();
}

export async function getPendingTransactions(): Promise<PendingTransaction[]> {
    if (mockOn()) return [...mockPending];
    return [];
}

/** Which targets accept a transaction of this kind. */
export function acceptsDrop(kind: PendingTransaction['kind'], target: ClassifyTarget): boolean {
    return kind === 'income' ? target === 'income' : target !== 'income';
}

export async function classifyPendingTransaction(id: string, target: ClassifyTarget): Promise<void> {
    if (mockOn()) {
        const tx = mockPending.find(t => t.id === id);
        if (!tx || !acceptsDrop(tx.kind, target)) throw new Error('Cannot classify there');
        mockPending = mockPending.filter(t => t.id !== id);
        return;
    }
    throw new Error('No bank connection');
}
