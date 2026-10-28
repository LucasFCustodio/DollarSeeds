import React, { createContext, useState, useEffect, useContext } from 'react';
import { usePostHog } from 'posthog-react-native';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';

// Define the blueprint for our Auth data
type AuthContextType = {
    user: User | null;
    session: Session | null;
    initialized: boolean;
};

// Create the Context
const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    initialized: false,
});

// A custom hook so other files can easily ask: "Who is logged in?"
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: any) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [initialized, setInitialized] = useState<boolean>(false);
    const posthog = usePostHog();

    useEffect(() => {
        // Tie analytics events to the anonymous user id — NO email or financial data
        // is ever attached as a person property.
        //
        // The onboarding runs BEFORE sign-up, so its events are captured under
        // PostHog's anonymous id. identify() on sign-up links that anonymous id to the
        // account, which only works if the anonymous id is still the one the events
        // went out under. So reset() runs on an actual sign-out only — never merely
        // because a launch found no session, which would mint a fresh anonymous id on
        // every relaunch mid-onboarding and orphan everything captured before it.
        const identify = (nextUser: User | null) => {
            if (nextUser) posthog?.identify(nextUser.id);
        };

        // 1. Check if they are already logged in when the app opens
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setInitialized(true);
            identify(session?.user ?? null); // session-restore → identify
        });

        // 2. Listen for login/logout events while the app is open
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (event === 'SIGNED_OUT') posthog?.reset();   // logout → a new anonymous id
            else identify(session?.user ?? null);         // login → identify (links the anonymous events)
        });

        return () => subscription.unsubscribe();
    }, [posthog]);

    return (
        <AuthContext.Provider value={{ user, session, initialized }}>
            {children}
        </AuthContext.Provider>
    );
};