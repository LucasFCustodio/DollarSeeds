/**
 * PaywallSheet — the subscription screen.
 *
 * A modal, not a route: it opens over whatever the user was doing (a locked series, a
 * settings row, a 403 from the player) and returns them there. Built on RN's `Modal`
 * with a `theme.surface` card and `shadow(10)`, matching the four modals already in
 * the app — no sheet library, no new dependency.
 *
 * It MUST scroll. There is more here than fits a phone screen, and everything App
 * Review requires has to be reachable: per-option price and period, an auto-renewal
 * disclosure, Restore Purchases, and links to Terms and Privacy.
 *
 * PRICES COME FROM THE STORE. Every amount rendered is `option.priceString` off the
 * RevenueCat package — already localised for the US, Canada and Brazil. Nothing here
 * hardcodes or computes a price.
 *
 * THE TIERS ARE IDENTICAL. No feature lists, no "most popular" badge, no comparison
 * table. The UI must not imply a difference that does not exist.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { useTranslation, Trans } from 'react-i18next';
import { useTheme, shadow, Fonts } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useAnalytics } from '../../lib/analytics';
import { ft } from '../../constants/responsive';
import { PRIVACY_URL, TERMS_URL } from '../../constants/legal';
import { IconClose } from '../icons';
import {
    describeProduct,
    type BillingPeriod,
} from '../../constants/premium';
import type { TierOption } from '../../lib/purchases';

/** "14 March 2027" — the crossgrade effective date. */
function formatDate(iso?: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function PaywallSheet() {
    const { theme } = useTheme();
    const { t } = useTranslation(['premium', 'common']);
    const analytics = useAnalytics();
    const {
        paywallVisible, closePaywall, options, optionsLoading, canPurchase,
        premiumActive, productId, expiresAt, buy, restore,
    } = useSubscription();

    const [period, setPeriod] = useState<BillingPeriod>('monthly');
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [restoring, setRestoring] = useState(false);

    useEffect(() => {
        if (paywallVisible) analytics.paywallViewed();
        // `analytics` wraps a stable PostHog client; including it would re-fire on
        // every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paywallVisible]);

    const current = useMemo(() => describeProduct(productId), [productId]);
    const currentTier = current
        ? t('premium:tierPeriod', {
            tier: t(`premium:tier.${current.tier}`),
            period: t(current.period === 'monthly' ? 'premium:paywall.monthly' : 'premium:paywall.yearly'),
        })
        : null;
    const shown = options[period] ?? [];

    const handleClose = () => {
        if (busyKey || restoring) return;   // never yank the sheet mid-purchase
        analytics.paywallDismissed();
        closePaywall();
    };

    const confirmSwitch = (option: TierOption) => new Promise<boolean>(resolve => {
        const on = formatDate(expiresAt);
        // Every product sits at Level 1 in one subscription group, so a switch is a
        // CROSSGRADE that takes effect at the next renewal — in both directions, never
        // prorated, never immediate. Saying so is the difference between "working as
        // designed" and "I paid and nothing happened".
        Alert.alert(
            t('premium:switch.title'),
            on
                ? t('premium:switch.bodyWithDate', { date: on })
                : t('premium:switch.bodyNoDate'),
            [
                { text: t('common:action.cancel'), style: 'cancel', onPress: () => resolve(false) },
                { text: t('common:action.confirm'), onPress: () => resolve(true) },
            ],
        );
    });

    const handleBuy = async (option: TierOption) => {
        if (busyKey) return;
        if (premiumActive && option.productId !== productId) {
            const ok = await confirmSwitch(option);
            if (!ok) return;
        }

        setBusyKey(option.key);
        analytics.purchaseStarted({ product_id: option.productId });
        const result = await buy(option);
        setBusyKey(null);

        if (result.status === 'purchased') {
            analytics.purchaseCompleted({ product_id: option.productId });
            closePaywall();
            return;
        }
        // Cancelling is a normal outcome, not an error — no alert for it.
        if (result.status === 'cancelled') return;
        Alert.alert(
            t('premium:purchase.failedTitle'),
            result.status === 'unavailable'
                ? t('premium:purchase.unavailableBody')
                : result.message,
        );
    };

    const handleRestore = async () => {
        setRestoring(true);
        const result = await restore();
        setRestoring(false);

        if (result.status === 'restored') {
            analytics.restoreCompleted();
            Alert.alert(t('premium:restore.restoredTitle'), t('premium:restore.restoredBody'));
            closePaywall();
        } else if (result.status === 'nothing') {
            Alert.alert(t('premium:restore.nothingTitle'), t('premium:restore.nothingBody'));
        } else if (result.status === 'unavailable') {
            Alert.alert(t('premium:restore.unavailableTitle'), t('premium:restore.unavailableBody'));
        } else {
            Alert.alert(t('premium:restore.failedTitle'), result.message);
        }
    };

    return (
        <Modal
            visible={paywallVisible}
            transparent
            animationType="fade"
            onRequestClose={handleClose}
        >
            <View style={styles.overlay}>
                <View style={[styles.card, { backgroundColor: theme.surface, ...shadow(10) }]}>
                    {/* Close */}
                    <Pressable
                        onPress={handleClose}
                        hitSlop={10}
                        style={({ pressed }) => [
                            styles.closeBtn,
                            { backgroundColor: theme.surfaceSoft },
                            pressed && { opacity: 0.6 },
                        ]}
                    >
                        <IconClose size={16} color={theme.ink2} />
                    </Pressable>

                    <ScrollView
                        contentContainerStyle={styles.scrollBody}
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={[styles.heading, { color: theme.ink }]}>
                            {t('premium:paywall.heading')}
                        </Text>

                        <Text style={[styles.description, { color: theme.ink2 }]}>
                            {t('premium:paywall.description')}
                        </Text>

                        {/* Equal-tiers callout. Harvest, NOT danger: red means overspending
                            and errors everywhere else in this app, and this is the warmest
                            message on the screen. */}
                        <View style={[styles.callout, { backgroundColor: theme.harvestSoft }]}>
                            <Text style={[styles.calloutText, { color: theme.ink }]}>
                                <Trans
                                    i18nKey="premium:paywall.equalTiers"
                                    components={{ bold: <Text style={styles.calloutBold} /> }}
                                />
                            </Text>
                        </View>

                        {/* Current subscription, when there is one */}
                        {premiumActive && currentTier && (
                            <View style={[styles.currentRow, { backgroundColor: theme.brandSoft }]}>
                                <Text style={[styles.currentText, { color: theme.brand }]}>
                                    {t('premium:paywall.current', { tier: currentTier })}
                                </Text>
                            </View>
                        )}

                        {/* Billing period */}
                        <View style={[styles.segment, { backgroundColor: theme.surfaceSoft }]}>
                            {(['monthly', 'yearly'] as BillingPeriod[]).map(p => {
                                const active = period === p;
                                return (
                                    <Pressable
                                        key={p}
                                        onPress={() => setPeriod(p)}
                                        style={[
                                            styles.segmentBtn,
                                            active && { backgroundColor: theme.brand },
                                        ]}
                                    >
                                        <Text style={[
                                            styles.segmentText,
                                            { color: active ? theme.onBrand : theme.ink2 },
                                        ]}>
                                            {p === 'monthly' ? t('premium:paywall.monthly') : t('premium:paywall.yearly')}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {/* Yearly is exactly 12x monthly by design. Without this line a
                            no-discount annual reads as a mistake or a trap. */}
                        {period === 'yearly' && (
                            <Text style={[styles.yearlyNote, { color: theme.ink2 }]}>
                                {t('premium:paywall.yearlyNote')}
                            </Text>
                        )}

                        {/* Tier grid — two rows of two */}
                        {optionsLoading ? (
                            <View style={styles.tierLoading}>
                                <ActivityIndicator color={theme.brand} />
                            </View>
                        ) : shown.length === 0 ? (
                            <Text style={[styles.unavailable, { color: theme.ink3 }]}>
                                {canPurchase
                                    ? t('premium:paywall.loadFailed')
                                    : t('premium:paywall.unavailable')}
                            </Text>
                        ) : (
                            <View style={styles.tierGrid}>
                                {shown.map(option => {
                                    const isCurrent = premiumActive && option.productId === productId;
                                    const busy = busyKey === option.key;
                                    return (
                                        <Pressable
                                            key={option.key}
                                            onPress={() => handleBuy(option)}
                                            disabled={!!busyKey || isCurrent}
                                            style={({ pressed }) => [
                                                styles.tierCard,
                                                {
                                                    backgroundColor: theme.surface,
                                                    borderColor: isCurrent ? theme.brand : theme.border,
                                                },
                                                isCurrent && { backgroundColor: theme.brandSoft },
                                                pressed && { transform: [{ scale: 0.98 }] },
                                                !!busyKey && !busy && { opacity: 0.5 },
                                            ]}
                                        >
                                            {busy ? (
                                                <ActivityIndicator color={theme.brand} />
                                            ) : (
                                                <>
                                                    <Text style={[styles.tierName, { color: theme.ink }]}>
                                                        {t(`premium:tier.${option.tier ?? 'basic'}`, { defaultValue: option.label })}
                                                    </Text>
                                                    <Text style={[styles.tierPrice, { color: theme.brand }]}>
                                                        {option.priceString}
                                                    </Text>
                                                    <Text style={[styles.tierPeriod, { color: theme.ink3 }]}>
                                                        {option.period === 'monthly' ? t('premium:paywall.perMonth') : t('premium:paywall.perYear')}
                                                    </Text>
                                                </>
                                            )}
                                        </Pressable>
                                    );
                                })}
                            </View>
                        )}

                        {/* App Review: auto-renewal disclosure */}
                        <Text style={[styles.disclosure, { color: theme.ink3 }]}>
                            {t('premium:paywall.autoRenew')}
                        </Text>

                        {/* App Review: Restore Purchases */}
                        <Pressable
                            onPress={handleRestore}
                            disabled={restoring || !!busyKey}
                            style={({ pressed }) => [
                                styles.restoreBtn,
                                { borderColor: theme.border },
                                pressed && { opacity: 0.6 },
                            ]}
                        >
                            {restoring ? (
                                <ActivityIndicator color={theme.brand} />
                            ) : (
                                <Text style={[styles.restoreText, { color: theme.brand }]}>
                                    {t('premium:paywall.restore')}
                                </Text>
                            )}
                        </Pressable>

                        {/* App Review: policy links */}
                        <View style={styles.legalRow}>
                            <Pressable onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} hitSlop={8}>
                                <Text style={[styles.legalLink, { color: theme.ink2 }]}>{t('premium:paywall.terms')}</Text>
                            </Pressable>
                            <Text style={[styles.legalDot, { color: theme.ink3 }]}>·</Text>
                            <Pressable onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} hitSlop={8}>
                                <Text style={[styles.legalLink, { color: theme.ink2 }]}>{t('premium:paywall.privacy')}</Text>
                            </Pressable>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',   // scrim — matches the app's other modals
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    card: {
        width: '100%',
        maxWidth: 460,
        maxHeight: '88%',      // the sheet scrolls inside this rather than overflowing
        borderRadius: 22,
        paddingTop: 20,
    },
    closeBtn: {
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 2,
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollBody: {
        paddingHorizontal: 22,
        paddingBottom: 24,
    },
    heading: {
        fontFamily: Fonts.serif,
        fontSize: ft(28, 1.25),
        lineHeight: ft(32, 1.25),
        letterSpacing: -0.4,
        marginTop: 8,
        marginBottom: 12,
        paddingRight: 32,      // clears the close button
    },
    description: {
        fontFamily: Fonts.sans,
        fontSize: ft(13, 1.18),
        lineHeight: ft(20, 1.18),
        marginBottom: 16,
    },
    callout: {
        borderRadius: 14,
        padding: 14,
        marginBottom: 18,
    },
    calloutText: {
        fontFamily: Fonts.sans,
        fontSize: ft(13, 1.18),
        lineHeight: ft(20, 1.18),
    },
    calloutBold: {
        fontFamily: Fonts.sansBold,
    },
    currentRow: {
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginBottom: 14,
        alignSelf: 'flex-start',
    },
    currentText: {
        fontFamily: Fonts.sansSemiBold,
        fontSize: ft(12, 1.18),
    },
    segment: {
        flexDirection: 'row',
        borderRadius: 12,
        padding: 4,
        gap: 4,
    },
    segmentBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 9,
        alignItems: 'center',
    },
    segmentText: {
        fontFamily: Fonts.sansSemiBold,
        fontSize: ft(13, 1.2),
    },
    yearlyNote: {
        fontFamily: Fonts.sans,
        fontSize: ft(12, 1.18),
        lineHeight: ft(18, 1.18),
        marginTop: 10,
        textAlign: 'center',
    },
    tierLoading: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    unavailable: {
        fontFamily: Fonts.sans,
        fontSize: ft(13, 1.18),
        lineHeight: ft(19, 1.18),
        textAlign: 'center',
        paddingVertical: 28,
    },
    tierGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 16,
    },
    tierCard: {
        // Two per row: half the width minus half the gap.
        width: '47.5%',
        flexGrow: 1,
        minHeight: 92,
        borderRadius: 14,
        borderWidth: 1.5,
        paddingVertical: 14,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
    },
    tierName: {
        fontFamily: Fonts.sansSemiBold,
        fontSize: ft(14, 1.2),
    },
    tierPrice: {
        fontFamily: Fonts.serif,
        fontSize: ft(24, 1.25),
        lineHeight: ft(28, 1.25),
    },
    tierPeriod: {
        fontFamily: Fonts.mono,
        fontSize: ft(10, 1.18),
    },
    disclosure: {
        fontFamily: Fonts.sans,
        fontSize: ft(11, 1.18),
        lineHeight: ft(17, 1.18),
        marginTop: 18,
    },
    restoreBtn: {
        marginTop: 16,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1.5,
        alignItems: 'center',
    },
    restoreText: {
        fontFamily: Fonts.sansSemiBold,
        fontSize: ft(14, 1.2),
    },
    legalRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginTop: 16,
    },
    legalLink: {
        fontFamily: Fonts.sans,
        fontSize: ft(12, 1.18),
        textDecorationLine: 'underline',
    },
    legalDot: {
        fontFamily: Fonts.sans,
        fontSize: ft(12, 1.18),
    },
});
