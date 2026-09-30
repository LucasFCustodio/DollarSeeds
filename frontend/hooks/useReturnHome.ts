import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';

/** Long enough for the "saved" state on the button to register before leaving. */
const RETURN_DELAY_MS = 600;

/** Back to the home after a save — back() when the home pushed this screen, else
 *  straight to it (an announcement link can open these screens cold). */
export function useReturnHome() {
    const router = useRouter();
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
    return useCallback(() => {
        if (timer.current) return;
        timer.current = setTimeout(() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)');
        }, RETURN_DELAY_MS);
    }, [router]);
}
