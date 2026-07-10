/**
 * OnboardingContext — drives the first-run guided tour.
 *
 * Holds the tour's active/step state and persists a per-user "completed" flag in
 * AsyncStorage (local only — no backend). Auto-starts the tour once for genuinely
 * new accounts (created on/after ONBOARDING_RELEASE_DATE) that haven't seen it,
 * so existing beta testers are never surfaced it. The dev replay button calls
 * replay() to clear the flag and run it again.
 */
import React, {
    createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from './AuthContext';
import {
    ONBOARDING_STEPS,
    ONBOARDING_RELEASE_DATE,
    onboardingKey,
} from '../constants/onboarding';

type OnboardingContextType = {
    active: boolean;
    step: number;
    stepCount: number;
    next: () => void;
    skip: () => void;
    start: () => void;
    replay: () => void;
};

const OnboardingContext = createContext<OnboardingContextType>({
    active: false,
    step: 0,
    stepCount: ONBOARDING_STEPS.length,
    next: () => {},
    skip: () => {},
    start: () => {},
    replay: () => {},
});

export const useOnboarding = () => useContext(OnboardingContext);

export const OnboardingProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, initialized } = useAuth();
    const [active, setActive] = useState(false);
    const [step, setStep] = useState(0);

    // Ensures the auto-start check runs at most once per signed-in session.
    const autoCheckedFor = useRef<string | null>(null);

    const persistCompleted = useCallback(async () => {
        if (!user?.id) return;
        try {
            await AsyncStorage.setItem(onboardingKey(user.id), 'true');
        } catch (err) {
            console.error('Onboarding flag save error:', err);
        }
    }, [user?.id]);

    const start = useCallback(() => {
        setStep(0);
        setActive(true);
    }, []);

    const finish = useCallback(() => {
        setActive(false);
        persistCompleted();
    }, [persistCompleted]);

    const next = useCallback(() => {
        setStep((prev) => {
            if (prev >= ONBOARDING_STEPS.length - 1) {
                finish();
                return prev;
            }
            return prev + 1;
        });
    }, [finish]);

    const skip = useCallback(() => {
        finish();
    }, [finish]);

    // Replay: clear the completed flag then restart from step 0 (dev-only entry point).
    const replay = useCallback(async () => {
        if (user?.id) {
            try {
                await AsyncStorage.removeItem(onboardingKey(user.id));
            } catch (err) {
                console.error('Onboarding flag reset error:', err);
            }
        }
        start();
    }, [user?.id, start]);

    // Auto-start once for eligible new accounts.
    useEffect(() => {
        if (!initialized || !user?.id) {
            autoCheckedFor.current = null;
            return;
        }
        if (autoCheckedFor.current === user.id) return;
        autoCheckedFor.current = user.id;

        let cancelled = false;
        (async () => {
            try {
                const seen = await AsyncStorage.getItem(onboardingKey(user.id));
                if (cancelled || seen) return;

                // Only genuinely new accounts (created on/after the release cutoff)
                // auto-start — existing beta accounts are skipped.
                const createdAt = user.created_at ? new Date(user.created_at) : null;
                const isNewAccount =
                    !!createdAt && createdAt.getTime() >= new Date(ONBOARDING_RELEASE_DATE).getTime();
                if (isNewAccount) start();
            } catch (err) {
                console.error('Onboarding auto-start check error:', err);
            }
        })();

        return () => { cancelled = true; };
    }, [initialized, user?.id, user?.created_at, start]);

    return (
        <OnboardingContext.Provider
            value={{
                active,
                step,
                stepCount: ONBOARDING_STEPS.length,
                next,
                skip,
                start,
                replay,
            }}
        >
            {children}
        </OnboardingContext.Provider>
    );
};
