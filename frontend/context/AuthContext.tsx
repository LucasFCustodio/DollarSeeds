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
        const syncIdentity = (nextUser: User | null) => {
            if (nextUser) posthog?.identify(nextUser.id);
            else posthog?.reset();
        };

        // 1. Check if they are already logged in when the app opens
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setInitialized(true);
            syncIdentity(session?.user ?? null); // session-restore → identify
        });

        // 2. Listen for login/logout events while the app is open
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            syncIdentity(session?.user ?? null); // login → identify · logout → reset
        });

        return () => subscription.unsubscribe();
    }, [posthog]);

    return (
        <AuthContext.Provider value={{ user, session, initialized }}>
            {children}
        </AuthContext.Provider>
    );
};