/**
 * Global axios defaults + auth — imported once for its side effect, as the very first
 * line of app/_layout.tsx so it runs before any screen can fire a request.
 *
 * Every screen calls the bare `axios` singleton directly (no shared instance), so
 * everything set here applies everywhere.
 *
 * 1. TIMEOUT. Without one, a stalled or dropped connection leaves a request pending
 *    forever: spinners that never resolve, buttons stuck disabled, screens that look
 *    frozen. App Review flags that as the app hanging. 15s gives slow mobile networks
 *    room without leaving the UI blocked indefinitely.
 *
 * 2. AUTHORIZATION. The backend authenticates every request from the Supabase access
 *    token (a signed JWT) and takes the user's id from it — it no longer trusts the
 *    `user_id` the app sends in params/bodies. Attaching the header centrally here is
 *    what keeps that working across all ~43 call sites without touching one of them.
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { supabase } from './supabase';

axios.defaults.timeout = 15000;

/** The DollarSeeds API. Screens each declare their own `BASE` constant; this is the
 *  host they all point at. */
export const API_HOST = 'dollarseeds-1.onrender.com';

/**
 * Only OUR backend may see the access token. Sentry, PostHog and the Supabase Storage
 * URLs that expo-video streams are all reached over the network too — attaching a
 * bearer token to those would hand a third party a live credential for the user's
 * account. Hosts are matched exactly, never by substring, so a lookalike domain
 * (`dollarseeds-1.onrender.com.evil.tld`) cannot collect a token.
 */
function isBackendUrl(rawUrl: string | undefined): boolean {
    if (!rawUrl) return false;
    let host: string;
    try {
        host = new URL(rawUrl).host;
    } catch {
        return false; // relative URL — the app never uses one
    }
    if (host === API_HOST) return true;
    // Local backend during development only (see CLAUDE.md — `uvicorn ... --host 0.0.0.0`).
    // Never in a release build, so a shipped app can only ever talk to the real API.
    if (__DEV__) {
        const [hostname] = host.split(':');
        return (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
            /^192\.168\.\d+\.\d+$/.test(hostname)
        );
    }
    return false;
}

/**
 * Attach the CURRENT access token to every backend request.
 *
 * The token is read per request rather than captured once: it expires roughly hourly,
 * and supabase-js refreshes it in the background (`autoRefreshToken: true` in
 * lib/supabase.ts). `getSession()` returns the stored session and refreshes it inline
 * if it has already expired, so a token is always fresh by the time it goes out.
 */
axios.interceptors.request.use(async (config) => {
    if (!isBackendUrl(config.url)) return config;
    try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) config.headers.set('Authorization', `Bearer ${token}`);
    } catch {
        // Couldn't read the session (e.g. AsyncStorage hiccup). Send the request
        // anyway — the backend answers 401 and the response interceptor below
        // retries once with a fresh token.
    }
    return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _authRetried?: boolean };

/**
 * One retry on 401. Covers the narrow race where a token expires between being
 * attached and reaching the server, or where the session was momentarily unreadable.
 * The `_authRetried` flag makes it strictly one attempt — no retry loop against a
 * genuinely invalid session. We deliberately do NOT sign the user out here: a 401 is
 * handled by letting the screen surface its normal error state.
 */
axios.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const config = error.config as RetriableConfig | undefined;
        if (
            error.response?.status !== 401 ||
            !config ||
            config._authRetried ||
            !isBackendUrl(config.url)
        ) {
            return Promise.reject(error);
        }
        config._authRetried = true;
        try {
            const { data } = await supabase.auth.refreshSession();
            const token = data.session?.access_token;
            if (!token) return Promise.reject(error);
            config.headers.set('Authorization', `Bearer ${token}`);
            return axios.request(config);
        } catch {
            return Promise.reject(error);
        }
    },
);
