/**
 * debtFreedomEvents.ts — one-shot animation handoffs into the Debts garden.
 *
 * Creating a debt (debtForm) or logging a payment from the detail screen happens on
 * a Stack screen above the tab. The garden plays the matching animation the next
 * time it is focused and that plant settles, then clears it. Module state is enough:
 * these are "play this once, now" signals, never data — the data always comes back
 * from the server.
 */

export type PendingAnimation =
    | { kind: 'plant'; debtId: number }
    | { kind: 'payment'; debtId: number; extra: boolean }
    | { kind: 'complete'; debtId: number };

let pending: PendingAnimation | null = null;

export function queueGardenAnimation(a: PendingAnimation) {
    pending = a;
}

export function takeGardenAnimation(): PendingAnimation | null {
    const a = pending;
    pending = null;
    return a;
}

// The flytrap's bug wanders in by chance at most once per app session.
let bugShown = false;

export function claimRandomBug(chance = 0.2): boolean {
    if (bugShown || Math.random() >= chance) return false;
    bugShown = true;
    return true;
}
