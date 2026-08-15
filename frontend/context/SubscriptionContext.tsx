/**
 * SubscriptionContext — premium entitlement + remote config for the whole app.
 *
 * WHO DECIDES WHAT. The client decides what to *show*; the backend decides what to
 * *serve*. `premiumActive` here drives lock badges and which CTA renders. It is never
 * sent to the API as a claim — `GET /lessons/{id}/playback/` re-checks server-side and
 * answers 403 `premium_required` regardless of what this context believes.
 *
 * WHY CONFIG LIVES HERE TOO. `premium_enabled` and `min_supported_version` come from
 * the same `GET /config/` call and want the same refresh moment (app foreground), so
 * one provider and one listener rather than two of each. Config also has to be LIVE,
 * not a boot-time snapshot: flipping the kill switch off to roll back must stop the
 * app showing locks for content the backend has started serving freely.
 *
 * FAILURE POSTURE IS FAIL-OPEN, matching StartingBalanceGate's "never trap the user"
 * rule. An unreachable /config/ means unrestricted, never a bricked app.
 */
import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { useAuth } from './AuthContext';
import {
    premiumEntitlementKey,
    type BillingPeriod,
} from '../constants/premium';
import {
    getCustomerInfo,
    hasPremiumEntitlement,
    loadTierOptions,
    loginPurchases,
    logoutPurchases,
    purchasesAvailable,
    purchaseTier,
    restorePurchases,
    type PurchaseResult,
    type RestoreResult,
    type TierOption,
} from '../lib/purchases';

const BASE = 'https://dollarseeds-1.onrender.com';

/** Unreachable /config/ resolves to these — i.e. exactly today's behaviour. */
const CONFIG_FALLBACK: AppConfig = {
    premiumEnabled: false,
    minSupportedVersion: '0.0.0',
    updateUrl: '',
};

export type AppConfig = {
    premiumEnabled: boolean;
    minSupportedVersion: string;
    updateUrl: string;
};

type Entitlement = {
    premiumActive: boolean;
    expiresAt: string | null;
    productId: string | null;
    pendingProductId: string | null;
};

const NO_ENTITLEMENT: Entitlement = {
    premiumActive: false,
    expiresAt: null,
    productId: null,
    pendingProductId: null,
};

type SubscriptionContextType = Entitlement & {
    /** False until the first entitlement answer (cache or network) has landed. */
    entitlementLoaded: boolean;
    config: AppConfig;
    /** Whether the RevenueCat SDK is usable at all on this build/platform. */
    canPurchase: boolean;
    options: Record<BillingPeriod, TierOption[]>;
    optionsLoading: boolean;
    refresh: () => Promise<void>;
    buy: (option: TierOption) => Promise<PurchaseResult>;
    restore: () => Promise<RestoreResult>;
    // The paywall opens from five places (two CTAs, a locked series card, a locked
    // lesson row, and a 403 from the player). Owning its visibility here means one
    // rendered instance at the root instead of five copies and five pieces of state.
    paywallVisible: boolean;
    openPaywall: () => void;
    closePaywall: () => void;
};

const SubscriptionContext = createContext<SubscriptionContextType>({
    ...NO_ENTITLEMENT,
    entitlementLoaded: false,
    config: CONFIG_FALLBACK,
    canPurchase: false,
    options: { monthly: [], yearly: [] },
    optionsLoading: false,
    refresh: async () => {},
    buy: async () => ({ status: 'unavailable' }),
    restore: async () => ({ status: 'unavailable' }),
    paywallVisible: false,
    openPaywall: () => {},
    closePaywall: () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

export const SubscriptionProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, initialized } = useAuth();

    const [entitlement, setEntitlement] = useState<Entitlement>(NO_ENTITLEMENT);
    const [entitlementLoaded, setEntitlementLoaded] = useState(false);
    const [config, setConfig] = useState<AppConfig>(CONFIG_FALLBACK);
    const [options, setOptions] = useState<Record<BillingPeriod, TierOption[]>>({
        monthly: [], yearly: [],
    });
    const [optionsLoading, setOptionsLoading] = useState(false);
    const [paywallVisible, setPaywallVisible] = useState(false);

    // Resolved when lib/purchases was first imported — a plain read, not a side effect.
    const canPurchase = purchasesAvailable();

    const openPaywall = useCallback(() => setPaywallVisible(true), []);
    const closePaywall = useCallback(() => setPaywallVisible(false), []);

    // Which user we have already called Purchases.logIn for. Mirrors the
    // `autoCheckedFor` pattern in OnboardingContext and exists for a specific reason:
    // AuthContext's onAuthStateChange fires on TOKEN_REFRESHED, i.e. roughly hourly.
    // Hooking logIn to that would mean a RevenueCat network call every hour forever.
    const loggedInFor = useRef<string | null>(null);

    // ── Config ────────────────────────────────────────────────────────────────
    const loadConfig = useCallback(async () => {
        try {
            const res = await axios.get(`${BASE}/config/`);
            setConfig({
                premiumEnabled: !!res.data?.premium_enabled,
                minSupportedVersion: res.data?.min_supported_version ?? '0.0.0',
                updateUrl: res.data?.update_url ?? '',
            });
        } catch {
            // FAIL OPEN. Unreachable config must never restrict the app or block the
            // update gate — it behaves as unrestricted until the next successful read.
            setConfig(CONFIG_FALLBACK);
        }
    }, []);

    // ── Entitlement ───────────────────────────────────────────────────────────
    const cacheEntitlement = useCallback(async (userId: string, active: boolean) => {
        try {
            await AsyncStorage.setItem(premiumEntitlementKey(userId), active ? 'true' : 'false');
        } catch {
            // A cache miss only costs a CTA flicker next cold start.
        }
    }, []);

    const loadEntitlement = useCallback(async (userId: string) => {
        // The backend is the source of truth. RevenueCat's local customerInfo is only
        // a fallback for when our own API is unreachable — it is the store's view, and
        // the store does not know about refunds we have revoked server-side.
        try {
            const res = await axios.get(`${BASE}/me/entitlements/`);
            const next: Entitlement = {
                premiumActive: !!res.data?.premium_active,
                expiresAt: res.data?.expires_at ?? null,
                productId: res.data?.product_id ?? null,
                pendingProductId: res.data?.pending_product_id ?? null,
            };
            setEntitlement(next);
            cacheEntitlement(userId, next.premiumActive);
            return next.premiumActive;
        } catch {
            const info = await getCustomerInfo();
            if (info) {
                const active = hasPremiumEntitlement(info);
                setEntitlement(prev => ({ ...prev, premiumActive: active }));
                cacheEntitlement(userId, active);
                return active;
            }
            return null;   // genuinely unknown — keep whatever we had
        }
    }, [cacheEntitlement]);

    const refresh = useCallback(async () => {
        await loadConfig();
        if (user?.id) await loadEntitlement(user.id);
    }, [loadConfig, loadEntitlement, user?.id]);

    // ── Boot / user change ────────────────────────────────────────────────────
    useEffect(() => {
        if (!initialized) return;

        if (!user?.id) {
            loggedInFor.current = null;
            setEntitlement(NO_ENTITLEMENT);
            setEntitlementLoaded(true);
            logoutPurchases();
            loadConfig();
            return;
        }

        const userId = user.id;
        let cancelled = false;

        (async () => {
            // 1. Cached value FIRST, so a subscriber never sees "Subscribe to premium"
            //    flash on cold start and then disappear.
            try {
                const cached = await AsyncStorage.getItem(premiumEntitlementKey(userId));
                if (!cancelled && cached !== null) {
                    setEntitlement(prev => ({ ...prev, premiumActive: cached === 'true' }));
                    setEntitlementLoaded(true);
                }
            } catch {
                // Ignore — the network read below is authoritative anyway.
            }

            // 2. Identify to RevenueCat once per user, so the webhook's app_user_id is
            //    this Supabase uuid rather than an anonymous RevenueCat id.
            if (loggedInFor.current !== userId) {
                loggedInFor.current = userId;
                await loginPurchases(userId);
            }

            if (cancelled) return;
            await loadConfig();
            if (cancelled) return;
            await loadEntitlement(userId);
            if (!cancelled) setEntitlementLoaded(true);
        })();

        return () => { cancelled = true; };
    }, [initialized, user?.id, loadConfig, loadEntitlement]);

    // ── Foreground refresh ────────────────────────────────────────────────────
    // Config must be live rather than a boot-time snapshot: if the kill switch is
    // flipped off to roll back, an app holding a stale `premiumEnabled: true` keeps
    // showing locks for content the backend now serves to everyone.
    useEffect(() => {
        const onChange = (state: AppStateStatus) => {
            if (state === 'active') refresh();
        };
        const sub = AppState.addEventListener('change', onChange);
        return () => sub.remove();
    }, [refresh]);

    // ── Offering ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!canPurchase) return;
        let cancelled = false;
        setOptionsLoading(true);
        loadTierOptions()
            .then(next => { if (!cancelled) setOptions(next); })
            .finally(() => { if (!cancelled) setOptionsLoading(false); });
        return () => { cancelled = true; };
    }, [canPurchase]);

    // ── Purchase ──────────────────────────────────────────────────────────────
    const buy = useCallback(async (option: TierOption): Promise<PurchaseResult> => {
        const result = await purchaseTier(option);
        if (result.status !== 'purchased' || !user?.id) return result;

        // StoreKit has taken the money, but entitlement is written by the RevenueCat
        // webhook and that may not have landed yet. Poll our own API with backoff
        // rather than declaring success off the client's word — the backend gate is
        // what actually unlocks the video, so this waits for the thing that matters.
        // (The backend also falls back to querying RevenueCat directly on a miss, so
        // this loop is the belt to that braces.)
        // Check immediately, then after 1s, 2s, 4s, 8s. The leading 0 matters: the
        // webhook has often already landed by the time StoreKit returns, and making
        // that case wait a second is a second of the user staring at a paywall they
        // just paid to dismiss.
        for (const delay of [0, 1000, 2000, 4000, 8000]) {
            if (delay) await new Promise(resolve => setTimeout(resolve, delay));
            if (await loadEntitlement(user.id)) return result;
        }

        // Timed out, but the purchase itself succeeded. Reflect it optimistically
        // rather than leaving the user locked out of what they just bought — the next
        // refresh (or the backend's own RevenueCat fallback) reconciles.
        setEntitlement(prev => ({ ...prev, premiumActive: true }));
        return result;
    }, [loadEntitlement, user?.id]);

    const restore = useCallback(async (): Promise<RestoreResult> => {
        const result = await restorePurchases();
        if (result.status === 'restored' && user?.id) await loadEntitlement(user.id);
        return result;
    }, [loadEntitlement, user?.id]);

    const value = useMemo<SubscriptionContextType>(() => ({
        ...entitlement,
        entitlementLoaded,
        config,
        canPurchase,
        options,
        optionsLoading,
        refresh,
        buy,
        restore,
        paywallVisible,
        openPaywall,
        closePaywall,
    }), [entitlement, entitlementLoaded, config, canPurchase, options, optionsLoading,
         refresh, buy, restore, paywallVisible, openPaywall, closePaywall]);

    return (
        <SubscriptionContext.Provider value={value}>
            {children}
        </SubscriptionContext.Provider>
    );
};
