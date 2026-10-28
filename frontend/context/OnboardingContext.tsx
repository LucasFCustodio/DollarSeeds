/**
 * OnboardingContext — has this ACCOUNT done the onboarding? (ONBOARDING_REWORK.md §1)
 *
 * The answer lives on the account: `user_metadata.onboarding_v2_completed_at`, written
 * with supabase.auth.updateUser, so a reinstall or a new phone never shows it again.
 * AsyncStorage keeps a copy as a fast cache (and as the fallback when that write
 * failed offline — the next launch pushes it up).
 *
 *   status  'unknown' until the signed-in user's flag has been read; then 'needed' or
 *           'done'. Signed out it is 'needed' — the logged-out first launch IS the
 *           onboarding. Every account without the flag, including every account from
 *           before this rework, is 'needed' once (there is no release-date cutoff).
 *   replaying  the dev account's "Replay Onboarding Tour" (Settings): the flow runs
 *           again in signed-in mode without clearing the account's flag.
 *
 * The root layout routes on `status` / `replaying`; app/onboarding.tsx calls
 * `markComplete` on its last screen.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { clearSaved, completedKey, getFlag, homeHintKey, setFlag } from '../lib/onboardingStore';

export type OnboardingStatus = 'unknown' | 'needed' | 'done';

type OnboardingContextType = {
    status: OnboardingStatus;
    replaying: boolean;
    /** Dev only: run the flow again, signed in. */
    replay: () => Promise<void>;
    /** The last screen: store completion on the account (and the cache). */
    markComplete: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextType>({
    status: 'unknown',
    replaying: false,
    replay: async () => {},
    markComplete: async () => {},
});

export const useOnboarding = () => useContext(OnboardingContext);

export const OnboardingProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, initialized } = useAuth();
    const [status, setStatus] = useState<OnboardingStatus>('unknown');
    const [replaying, setReplaying] = useState(false);

    const metaDone = !!user?.user_metadata?.onboarding_v2_completed_at;

    useEffect(() => {
        if (!initialized) return;
        if (!user?.id) {
            setStatus('needed');
            setReplaying(false);
            return;
        }
        if (metaDone) {
            setStatus('done');
            setFlag(completedKey(user.id), String(user.user_metadata.onboarding_v2_completed_at));
            return;
        }
        let live = true;
        setStatus('unknown');
        getFlag(completedKey(user.id)).then(cached => {
            if (!live) return;
            if (cached) {
                setStatus('done');
                // The account write failed last time (offline): try it again.
                supabase.auth.updateUser({ data: { onboarding_v2_completed_at: cached } }).catch(() => {});
            } else {
                setStatus('needed');
            }
        });
        return () => { live = false; };
    }, [initialized, user?.id, metaDone]); // eslint-disable-line react-hooks/exhaustive-deps

    const replay = useCallback(async () => {
        await clearSaved();
        setReplaying(true);
    }, []);

    const markComplete = useCallback(async () => {
        if (!user?.id) return;
        const at = new Date().toISOString();
        await setFlag(completedKey(user.id), at);
        await setFlag(homeHintKey(user.id), 'pending');
        try {
            const { error } = await supabase.auth.updateUser({ data: { onboarding_v2_completed_at: at } });
            if (error) console.error('Onboarding completion save error:', error);
        } catch (err) {
            console.error('Onboarding completion save error:', err);
        }
        setStatus('done');
        setReplaying(false);
    }, [user?.id]);

    return (
        <OnboardingContext.Provider value={{ status, replaying, replay, markComplete }}>
            {children}
        </OnboardingContext.Provider>
    );
};
