/**
 * useTicker — animates a numeric value from its previous to its next target.
 * Cubic ease-out, matching the web prototype.
 * Uses requestAnimationFrame via react-native-reanimated's worklet approach
 * for smooth 60fps animation.
 */
import { useEffect, useRef, useState } from 'react';

export function useTicker(
    target: number,
    options: { duration?: number; animate?: boolean } = {}
): number {
    const { duration = 900, animate = true } = options;

    const [value, setValue] = useState(animate ? 0 : target);
    const startTimeRef = useRef<number | null>(null);
    const fromRef = useRef(animate ? 0 : target);
    const rafRef = useRef<ReturnType<typeof requestAnimationFrame>>(0);

    useEffect(() => {
        if (!animate) {
            setValue(target);
            fromRef.current = target;
            return;
        }

        const from = fromRef.current;
        startTimeRef.current = null;

        const tick = (time: number) => {
            if (startTimeRef.current === null) startTimeRef.current = time;
            const elapsed = time - startTimeRef.current;
            const p = Math.min(1, elapsed / duration);
            // Cubic ease-out: 1 - (1-p)^3
            const eased = 1 - Math.pow(1 - p, 3);
            setValue(from + (target - from) * eased);

            if (p < 1) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                fromRef.current = target;
            }
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(rafRef.current);
        };
    }, [target, duration, animate]);

    return value;
}
