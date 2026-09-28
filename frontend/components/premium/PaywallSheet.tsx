/**
 * PaywallSheet — the subscription screen.
 *
 * A modal, not a route: it opens over whatever the user was doing (a locked series, a
 * locked goal, a settings row, a 403 from the player) and returns them there. Built on
 * RN's `Modal` with a `theme.surface` card and `shadow(10)`, matching the app's other
 * modals — no sheet library, no new dependency.
 *
 * It MUST scroll. There is more here than fits a phone screen, and everything App
 * Review requires has to be reachable: per-option price and period, an auto-renewal
 * disclosure, the trial terms when a trial is offered, Restore Purchases, and links to
 * Terms and Privacy.
 *
 * ONE TIER, TWO PERIODS. Premium Yearly and Premium Monthly, both on screen at once and
 * yearly first. There is no "best value" badge and no computed saving: every amount
 * rendered is `option.priceString` off the RevenueCat package — already localised for
 * the US, Canada and Brazil — and nothing here computes a price or a percentage.
 *
 * NO FREE-TIER NUMBERS. The benefit list says "unlimited goals", never "1 goal on the
 * free plan": the free allowance is a server value that can change without a release.
 *
 * THE TRIAL IS CHECKED, NOT PROMISED. Trial copy renders only for a product RevenueCat
 * says this Apple ID is eligible for (`trialEligible`). Anyone who took a trial on a
 * legacy tier is ineligible, because all ten products share one subscription group.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { useTranslation } from 'react-i18next';
import { useTheme, shadow, Fonts } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useLocale } from '../../context/LocaleContext';
import { useAnalytics } from '../../lib/analytics';
import { ft } from '../../constants/responsive';
import { MONTHS } from '../../constants/months';
import { PRIVACY_URL, TERMS_URL } from '../../constants/legal';
import { BUDGET_TYPE_ORDER } from '../../constants/budgetTypes';
import { IconCheck, IconClose } from '../icons';
import {
    describeProduct,
    planLabelKey,
    type PlanInfo,
} from '../../constants/premium';
import type { PlanOption } from '../../lib/purchases';

/**
 * What buying `target` does to the subscription the user already holds, per the
 * service levels in App Store Connect (SUBSCRIPTION_REWORK.md §3): Premium Yearly is
 * level 1, Premium Monthly level 2, the legacy tiers level 3.
 *
 *  - upgrade   — legacy → either Premium plan, or Monthly → Yearly. Immediate; Apple
 *                refunds the unused part of the old plan.
 *  - downgrade — Yearly → Monthly. Apple never refuses it; it DEFERS it to the end of
 *                the annual term. Copy must say when, never read as an error.
 *  - unknown   — subscribed, but we can't tell to what (no product id reported).
 */
type Change = 'new' | 'upgrade' | 'downgrade' | 'unknown';

function changeKind(active: boolean, current: PlanInfo | null, target: PlanOption): Change {
    if (!active) return 'new';
    if (!current) return 'unknown';
    if (current.plan === 'legacy') return 'upgrade';
    if (current.period === 'monthly' && target.period === 'yearly') return 'upgrade';
    if (current.period === 'yearly' && target.period === 'monthly') return 'downgrade';
    return 'unknown';
}

export default function PaywallSheet() {
    const { theme } = useTheme();
    const { t } = useTranslation(['premium', 'common']);
    const { dayMonthYear } = useLocale();
    const analytics = useAnalytics();
    const {
        paywallVisible, closePaywall, options, optionsLoading, canPurchase,
        premiumActive, productId, pendingProductId, expiresAt, trialEligible, buy, restore,
    } = useSubscription();

    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [restoring, setRestoring] = useState(false);

    useEffect(() => {
        if (paywallVisible) analytics.paywallViewed();
        // `analytics` wraps a stable PostHog client; including it would re-fire on
        // every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paywallVisible]);

    /** "14 March 2027", in the app's language rather than the device's. */
    const formatDate = (iso?: string | null): string | null => {
        if (!iso) return null;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return null;
        return dayMonthYear(MONTHS[d.getMonth()], d.getDate(), d.getFullYear());
    };

    const current = useMemo(() => describeProduct(productId), [productId]);
    const pending = useMemo(() => describeProduct(pendingProductId), [pendingProductId]);
    const planName = (info: PlanInfo | null, option?: PlanOption) =>
        info ? t(planLabelKey(info)) : (option?.storeTitle ?? '');
    const optionName = (o: PlanOption) => planName(describeProduct(o.productId), o);

    const trialFor = (o: PlanOption) =>
        !premiumActive && o.freeTrial && trialEligible[o.productId] ? o.freeTrial : null;
    // RevenueCat's periodUnit is one of DAY / WEEK / MONTH / YEAR; each has a key.
    const trialLabel = (trial: { unit: string; units: number }) =>
        t(`premium:trial.unit.${trial.unit.toLowerCase()}`, { count: trial.units });
    const anyTrialShown = options.some(o => trialFor(o));

    const handleClose = () => {
        if (busyKey || restoring) return;   // never yank the sheet mid-purchase
        analytics.paywallDismissed();
        closePaywall();
    };

    const confirmChange = (option: PlanOption, kind: Change) => new Promise<boolean>(resolve => {
        const plan = optionName(option);
        const on = formatDate(expiresAt);
        const body = kind === 'upgrade'
            ? t('premium:switch.upgradeBody', { plan })
            : kind === 'downgrade'
                ? (on
                    ? t('premium:switch.downgradeBodyWithDate', { plan, date: on })
                    : t('premium:switch.downgradeBodyNoDate', { plan }))
                : t('premium:switch.unknownBody');
        Alert.alert(
            t('premium:switch.title', { plan }),
            body,
            [
                { text: t('common:action.cancel'), style: 'cancel', onPress: () => resolve(false) },
                { text: t('common:action.confirm'), onPress: () => resolve(true) },
            ],
        );
    });

    const handleBuy = async (option: PlanOption) => {
        if (busyKey) return;
        const kind = changeKind(premiumActive, current, option);
        if (kind !== 'new') {
            const ok = await confirmChange(option, kind);
            if (!ok) return;
        }

        setBusyKey(option.key);
        analytics.purchaseStarted({ product_id: option.productId });
        const result = await buy(option);
        setBusyKey(null);

        if (result.status === 'purchased') {
            analytics.purchaseCompleted({ product_id: option.productId });
            closePaywall();
            // A downgrade the store has ACCEPTED but deferred. Saying when it happens is
            // the difference between "working as designed" and "I paid and nothing
            // changed" — and it must never read as a failure.
            if (kind === 'downgrade') {
                const on = formatDate(expiresAt);
                Alert.alert(
                    t('premium:switch.scheduledTitle'),
                    on
                        ? t('premium:switch.scheduledBodyWithDate', { plan: optionName(option), date: on })
                        : t('premium:switch.scheduledBodyNoDate', { plan: optionName(option) }),
                );
            }
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

    const pendingDate = formatDate(expiresAt);
    const benefits = [
        t('premium:paywall.benefitGoals'),
        // Names from the catalogue, so they match Settings and the dashboard exactly.
        t('premium:paywall.benefitBudgets', {
            names: BUDGET_TYPE_ORDER.map(k => t(`common:budgetType.${k}.name`)).join(' · '),
        }),
        t('premium:paywall.benefitVideos'),
    ];

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

                        {/* What Premium adds. No free-tier numbers — see the header. */}
                        <View style={styles.benefits}>
                            {benefits.map(line => (
                                <View key={line} style={styles.benefitRow}>
                                    <View style={[styles.benefitTick, { backgroundColor: theme.brandSoft }]}>
                                        <IconCheck size={12} color={theme.brand} />
                                    </View>
                                    <Text style={[styles.benefitText, { color: theme.ink }]}>{line}</Text>
                                </View>
                            ))}
                        </View>

                        {/* What stays free. Harvest, NOT danger: this is the warmest
                            message on the screen, and the tithing envelope is the part
                            of the app that is never gated. */}
                        <View style={[styles.callout, { backgroundColor: theme.harvestSoft }]}>
                            <Text style={[styles.calloutText, { color: theme.ink }]}>
                                {t('premium:paywall.alwaysFree')}
                            </Text>
                        </View>

                        {/* Current subscription, and a change the store has scheduled */}
                        {premiumActive && current && (
                            <View style={[styles.currentRow, { backgroundColor: theme.brandSoft }]}>
                                <Text style={[styles.currentText, { color: theme.brand }]}>
                                    {t('premium:paywall.current', { plan: t(planLabelKey(current)) })}
                                </Text>
                                {pending && pendingProductId !== productId && (
                                    <Text style={[styles.pendingText, { color: theme.ink2 }]}>
                                        {pendingDate
                                            ? t('premium:switch.scheduledBodyWithDate', { plan: t(planLabelKey(pending)), date: pendingDate })
                                            : t('premium:switch.scheduledBodyNoDate', { plan: t(planLabelKey(pending)) })}
                                    </Text>
                                )}
                            </View>
                        )}

                        {/* Plans */}
                        {optionsLoading ? (
                            <View style={styles.planLoading}>
                                <ActivityIndicator color={theme.brand} />
                            </View>
                        ) : options.length === 0 ? (
                            <Text style={[styles.unavailable, { color: theme.ink3 }]}>
                                {canPurchase
                                    ? t('premium:paywall.loadFailed')
                                    : t('premium:paywall.unavailable')}
                            </Text>
                        ) : (
                            <View style={styles.planList}>
                                {options.map(option => {
                                    const isCurrent = premiumActive && option.productId === productId;
                                    const isPending = premiumActive && option.productId === pendingProductId
                                        && pendingProductId !== productId;
                                    const busy = busyKey === option.key;
                                    const trial = trialFor(option);
                                    const per = option.period === 'monthly'
                                        ? t('premium:paywall.perMonth')
                                        : t('premium:paywall.perYear');
                                    return (
                                        <Pressable
                                            key={option.key}
                                            onPress={() => handleBuy(option)}
                                            disabled={!!busyKey || isCurrent || isPending}
                                            style={({ pressed }) => [
                                                styles.planCard,
                                                {
                                                    backgroundColor: isCurrent ? theme.brandSoft : theme.surface,
                                                    borderColor: isCurrent ? theme.brand : theme.border,
                                                },
                                                pressed && { transform: [{ scale: 0.98 }] },
                                                !!busyKey && !busy && { opacity: 0.5 },
                                            ]}
                                        >
                                            {busy ? (
                                                <ActivityIndicator color={theme.brand} style={{ flex: 1 }} />
                                            ) : (
                                                <>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[styles.planName, { color: theme.ink }]}>
                                                            {optionName(option)}
                                                        </Text>
                                                        {trial ? (
                                                            <Text style={[styles.planTrial, { color: theme.brand }]}>
                                                                {t('premium:trial.then', {
                                                                    duration: trialLabel(trial),
                                                                    price: option.priceString,
                                                                    per,
                                                                })}
                                                            </Text>
                                                        ) : isCurrent ? (
                                                            <Text style={[styles.planTag, { color: theme.brand }]}>
                                                                {t('premium:paywall.currentTag')}
                                                            </Text>
                                                        ) : isPending ? (
                                                            <Text style={[styles.planTag, { color: theme.ink2 }]}>
                                                                {pendingDate
                                                                    ? t('premium:paywall.startsOn', { date: pendingDate })
                                                                    : t('premium:paywall.startsLater')}
                                                            </Text>
                                                        ) : null}
                                                    </View>
                                                    <View style={styles.planPriceCol}>
                                                        <Text style={[styles.planPrice, { color: theme.brand }]}>
                                                            {option.priceString}
                                                        </Text>
                                                        <Text style={[styles.planPer, { color: theme.ink3 }]}>{per}</Text>
                                                    </View>
                                                </>
                                            )}
                                        </Pressable>
                                    );
                                })}
                            </View>
                        )}

                        {/* App Review: the trial's terms, whenever a trial is on screen */}
                        {anyTrialShown && (
                            <Text style={[styles.disclosure, { color: theme.ink3 }]}>
                                {t('premium:trial.disclosure')}
                            </Text>
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
        marginBottom: 14,
    },
    benefits: {
        gap: 10,
        marginBottom: 16,
    },
    benefitRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    benefitTick: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
    },
    benefitText: {
        flex: 1,
        fontFamily: Fonts.sansMedium,
        fontSize: ft(14, 1.18),
        lineHeight: ft(20, 1.18),
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
    currentRow: {
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginBottom: 14,
        gap: 3,
    },
    currentText: {
        fontFamily: Fonts.sansSemiBold,
        fontSize: ft(12, 1.18),
    },
    pendingText: {
        fontFamily: Fonts.sans,
        fontSize: ft(12, 1.18),
        lineHeight: ft(17, 1.18),
    },
    planLoading: {
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
    planList: {
        gap: 12,
    },
    planCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 76,
        borderRadius: 14,
        borderWidth: 1.5,
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    planName: {
        fontFamily: Fonts.sansSemiBold,
        fontSize: ft(15, 1.2),
    },
    planTrial: {
        fontFamily: Fonts.sansMedium,
        fontSize: ft(12, 1.18),
        lineHeight: ft(17, 1.18),
        marginTop: 3,
    },
    planTag: {
        fontFamily: Fonts.monoSemiBold,
        fontSize: ft(10, 1.18),
        letterSpacing: 1,
        marginTop: 4,
    },
    planPriceCol: {
        alignItems: 'flex-end',
    },
    planPrice: {
        fontFamily: Fonts.serif,
        fontSize: ft(24, 1.25),
        lineHeight: ft(28, 1.25),
    },
    planPer: {
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
