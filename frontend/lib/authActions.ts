/**
 * authActions — the sign-in and sign-up flows, shared by app/auth.tsx and the
 * onboarding's sign-up screen (ONBOARDING_REWORK.md screen 19), so there is one copy
 * of the Google redirect parsing and the Apple name capture.
 *
 * Each returns an outcome instead of showing UI: the auth screen turns it into an
 * Alert, the onboarding into Benny's "oops" bubble. A successful sign-in needs no
 * handling here — AuthContext's onAuthStateChange picks up the session.
 *
 * `message` is Supabase's own (not localised by us); `reason` marks the cases the
 * caller words itself.
 */
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type AuthOutcome =
    | { status: 'ok' }
    | { status: 'cancelled' }
    | { status: 'error'; message?: string; reason?: 'no_session' | 'no_token' | 'no_url' | 'exception' };

export type SignUpOutcome =
    | { status: 'session' }
    /** The project requires email confirmation: the account exists, no session yet. */
    | { status: 'confirm' }
    | { status: 'error'; message?: string };

export async function signInWithGoogle(): Promise<AuthOutcome> {
    // 1. Where Google returns to after the login finishes.
    const redirectTo = makeRedirectUri();

    // 2. The Google login URL. The client uses the implicit flow (lib/supabase.ts), so
    // the redirect back carries the session tokens in the URL fragment — no
    // server-side code exchange, no flow-state to go stale.
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },   // Expo opens the browser, not Supabase
    });
    if (error || !data?.url) {
        console.error('OAuth Error:', error);
        return { status: 'error', message: error?.message, reason: error ? undefined : 'no_url' };
    }

    // 3. The phone's browser, on the Google login screen.
    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (res.type !== 'success') return { status: 'cancelled' };

    // 4. dollarseeds://#access_token=...&refresh_token=...&expires_in=...
    const getParam = (name: string) => new RegExp(`[#?&]${name}=([^&#]+)`).exec(res.url)?.[1];
    const access_token = getParam('access_token');
    const refresh_token = getParam('refresh_token');
    if (!access_token || !refresh_token) {
        const errDesc = getParam('error_description');
        return errDesc
            ? { status: 'error', message: decodeURIComponent(errDesc.replace(/\+/g, ' ')) }
            : { status: 'error', reason: 'no_session' };
    }

    const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
    if (sessionError) {
        console.error('Set session error:', sessionError);
        return { status: 'error', message: sessionError.message };
    }
    return { status: 'ok' };
}

/** iOS only. Apple returns a signed identity token, which Supabase verifies directly. */
export async function signInWithApple(): Promise<AuthOutcome> {
    try {
        const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
                AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
        });
        if (!credential.identityToken) return { status: 'error', reason: 'no_token' };

        const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
        if (error) {
            console.error('Apple sign-in error:', error);
            return { status: 'error', message: error.message };
        }

        // Apple only returns the user's name on the FIRST authorization — the identity
        // token never carries it. Persist it now (into user metadata) or it's lost for good.
        if (credential.fullName?.givenName || credential.fullName?.familyName) {
            const full_name = [credential.fullName?.givenName, credential.fullName?.familyName]
                .filter(Boolean)
                .join(' ');
            if (full_name) await supabase.auth.updateUser({ data: { full_name } });
        }
        return { status: 'ok' };
    } catch (e: any) {
        // The user tapped "Cancel" in the Apple sheet — not an error, just no session.
        if (e?.code === 'ERR_REQUEST_CANCELED') return { status: 'cancelled' };
        console.error('Apple sign-in exception:', e);
        return { status: 'error', message: e?.message, reason: 'exception' };
    }
}

export async function signUpWithEmail(email: string, password: string): Promise<SignUpOutcome> {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { status: 'error', message: error.message };
    return data.session ? { status: 'session' } : { status: 'confirm' };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthOutcome> {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? { status: 'error', message: error.message } : { status: 'ok' };
}
