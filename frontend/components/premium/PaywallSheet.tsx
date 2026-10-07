/**
 * PaywallSheet — the subscription screen. The ONLY one: every entry point (both CTAs,
 * locked series and lesson rows, locked goals, the connect-bank prompt, a 403 from the
 * player, the premium-error upsell alert) calls `openPaywall()` and lands here, with
 * one layout for all of them.
 *
 * A modal, not a route: it opens over whatever the user was doing and returns them
 * there on close or after a purchase. Full-screen and opaque on `theme.bg`, sliding up
 * from the bottom — RN's `Modal`, no sheet library, no new dependency.
 *
 * LAYOUT. Close button fixed at the top; the CTA, its note and the legal row fixed at
 * the bottom; everything between scrolls, because on an iPhone SE it does not fit. The
 * App Review requirements stay reachable: per-plan price and period, the auto-renewal
 * disclosure, the trial terms whenever trial copy is on screen, Restore Purchases, and
 * links to Terms and Privacy.
 *
 * SELECT, THEN BUY. Tapping a plan card selects it; only the CTA purchases, and it buys
 * the selected plan through `handleBuy`. Annual is preselected on every visit —
 * subscribers start on the plan they do NOT hold.
 *
 * PRICES. Every amount the user is BILLED — both card prices and the figure in the note
 * under the CTA — is `option.priceString` off the RevenueCat package, already localised
 * for the US, Canada and Brazil. Two comparison figures on the Annual card ARE
 * derived, in lib/planPricing.ts: the crossed-out twelve-month price and the discount
 * (floored, never rounded up). They are hidden together
 * whenever they can't be trusted — a plan missing, mismatched currencies, or no saving.
 * Apple requires the billed price to dominate its card, so the derived figures are
 * always set smaller and muted.
 *
 * NO FREE-TIER NUMBERS. The free allowance is a server value that can change without a
 * release, so nothing here says what the free plan includes.
 *
 * THE TRIAL IS CHECKED, NOT PROMISED. Trial copy renders only for a product RevenueCat
 * says this Apple ID is eligible for (`trialEligible`), and never to a subscriber.
 * While the answer is pending the screen uses the non-trial wording, so it can never
 * promise a free month and then withdraw it. Anyone who took a trial on a legacy tier
 * is ineligible, because all ten products share one subscription group.
 */
import React, { useEffect, useMemo, useRef, useState, type FC } from 'react';
import {
    ActivityIndicator, Alert, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';

import { useTranslation } from 'react-i18next';
import { useTheme, Fonts } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useLocale } from '../../context/LocaleContext';
import { useAnalytics } from '../../lib/analytics';
import { derivePlanPricing } from '../../lib/planPricing';
import { ft } from '../../constants/responsive';
import { MONTHS } from '../../constants/months';
import { PRIVACY_URL, TERMS_URL } from '../../constants/legal';
import { IconCheck, IconClose } from '../icons';
import {
    describeProduct,
    planLabelKey,
    type BillingPeriod,
    type PlanInfo,
} from '../../constants/premium';
import type { PlanOption } from '../../lib/purchases';
import Svg, { Defs, LinearGradient, Rect, Stop, type SvgProps } from 'react-native-svg';

/** The three benefit rows, in order. Copy lives at premium:paywall.benefit.<key>. */
const BENEFITS = ['debt', 'budget', 'wisdom'] as const;

type Art = FC<SvgProps>;

/**
 * Each row's glyph, imported the way components/debts/plantAssets.ts imports its art.
 * The colours are baked into the SVGs (brand forest and emerald), as with the plants.
 */
const BENEFIT_ART: Record<(typeof BENEFITS)[number], Art> = {
    debt: require('../../assets/premium/benefit-debt.svg').default as Art,
    budget: require('../../assets/premium/benefit-budget.svg').default as Art,
    wisdom: require('../../assets/premium/benefit-lessons.svg').default as Art,
};

/**
 * Height of the cream fade under the top bar. The scroll content is padded by the same
 * amount, so at rest nothing sits under it; once scrolled, text fades out instead of
 * being cut off by a hard edge.
 */
const TOP_FADE = 20;

/** Selection cross-fade. Only colours change between states, so nothing shifts on tap. */
const SELECT_FADE_MS = 150;

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
    const { dayMonthYear, numberFormat } = useLocale();
    const analytics = useAnalytics();
    const insets = useSafeAreaInsets();
    const {
        paywallVisible, closePaywall, options, optionsLoading, canPurchase,
        premiumActive, productId, pendingProductId, expiresAt, trialEligible, buy, restore,
    } = useSubscription();

    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [restoring, setRestoring] = useState(false);
    /** The period tapped on this visit; null means "this visit's default". */
    const [picked, setPicked] = useState<BillingPeriod | null>(null);

    useEffect(() => {
        if (paywallVisible) analytics.paywallViewed();
        // `analytics` wraps a stable PostHog client; including it would re-fire on
        // every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paywallVisible]);

    // Every visit starts on the default plan. Reset on CLOSE rather than on open: the
    // sheet stays mounted, so resetting on open would render last visit's choice for
    // the first frame of the slide-in.
    useEffect(() => {
        if (!paywallVisible) setPicked(null);
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

    // One card per period. loadPlanOptions sorts known plans first, so the first option
    // of each period is the Premium product whenever the offering carries it.
    const monthly = options.find(o => o.period === 'monthly') ?? null;
    const yearly = options.find(o => o.period === 'yearly') ?? null;

    const isCurrent = (o: PlanOption) => premiumActive && o.productId === productId;
    const isPending = (o: PlanOption) =>
        premiumActive && o.productId === pendingProductId && pendingProductId !== productId;

    // Annual by default; a Yearly subscriber starts on the plan they don't hold.
    const defaultPeriod: BillingPeriod = yearly && isCurrent(yearly) ? 'monthly' : 'yearly';
    const wanted = picked ?? defaultPeriod;
    const selected = (wanted === 'yearly' ? yearly : monthly) ?? yearly ?? monthly;

    const pricing = useMemo(
        () => derivePlanPricing(monthly, yearly, numberFormat),
        [monthly, yearly, numberFormat],
    );

    const selectedTrial = selected ? trialFor(selected) : null;
    const per = (o: PlanOption) => o.period === 'monthly'
        ? t('premium:paywall.perMonth')
        : t('premium:paywall.perYear');

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
            // Not `result.message`: RevenueCat's error text is English in every
            // language. The detail is already logged in lib/purchases.ts.
            result.status === 'unavailable'
                ? t('premium:purchase.unavailableBody')
                : t('premium:purchase.failedBody'),
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
            Alert.alert(t('premium:restore.failedTitle'), t('premium:restore.failedBody'));
        }
    };

    const pendingDate = formatDate(expiresAt);
    const busy = !!busyKey || restoring;

    /** "CURRENT PLAN" / "STARTS 14 March 2027" on the card of a plan the user holds. */
    const tagFor = (o: PlanOption) => {
        if (isCurrent(o)) return { text: t('premium:paywall.currentTag'), color: theme.brand };
        if (isPending(o)) {
            return {
                text: pendingDate
                    ? t('premium:paywall.startsOn', { date: pendingDate })
                    : t('premium:paywall.startsLater'),
                color: theme.ink2,
            };
        }
        return null;
    };

    // The CTA is disabled, not hidden, when there is nothing it can buy: no plans, or
    // the selected plan is the one already held or already scheduled.
    const ctaBlocked = !selected || isCurrent(selected) || isPending(selected);
    const ctaLabel = premiumActive && selected
        ? t('premium:paywall.switchCta', { plan: optionName(selected) })
        : t('premium:paywall.cta');

    return (
        <Modal
            visible={paywallVisible}
            animationType="slide"
            presentationStyle="fullScreen"
            statusBarTranslucent
            onRequestClose={handleClose}
        >
            <View style={[styles.screen, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
                {/* Fixed top: close */}
                <View style={styles.topBar}>
                    <Pressable
                        onPress={handleClose}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t('premium:paywall.close')}
                        style={({ pressed }) => [
                            styles.closeBtn,
                            { backgroundColor: theme.surface },
                            pressed && { opacity: 0.6 },
                        ]}
                    >
                        <IconClose size={18} color={theme.ink2} />
                    </Pressable>
                </View>

                <View style={styles.scroll}>
                    <ScrollView
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollBody}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Instrument Serif ships in regular only — size carries the
                            emphasis; a bold weight would be faux-bold. */}
                        <Text style={[styles.headline, { color: theme.ink }]} accessibilityRole="header">
                            {t('premium:paywall.headline')}
                        </Text>

                        {/* What Premium adds. No free-tier numbers — see the header. */}
                        <View style={[styles.benefits, { backgroundColor: theme.surface }]}>
                            {BENEFITS.map(key => {
                                const Glyph = BENEFIT_ART[key];
                                return (
                                    <View key={key} style={styles.benefitRow}>
                                        <View style={[styles.benefitTick, { backgroundColor: theme.brandSoft }]}>
                                            <Glyph width={18} height={18} />
                                        </View>
                                        <View style={styles.benefitCopy}>
                                            <Text style={[styles.benefitTitle, { color: theme.ink }]}>
                                                {t(`premium:paywall.benefit.${key}.title`)}
                                            </Text>
                                            <Text style={[styles.benefitBody, { color: theme.ink2 }]}>
                                                {t(`premium:paywall.benefit.${key}.body`)}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })}
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
                        ) : !monthly && !yearly ? (
                            <Text style={[styles.unavailable, { color: theme.ink3 }]}>
                                {canPurchase
                                    ? t('premium:paywall.loadFailed')
                                    : t('premium:paywall.unavailable')}
                            </Text>
                        ) : (
                            <View style={styles.priceRow} accessibilityRole="radiogroup">
                                {monthly && (
                                    <PriceCard
                                        label={t('premium:paywall.monthly')}
                                        price={monthly.priceString}
                                        sub={t('premium:paywall.perMonth')}
                                        tag={tagFor(monthly)}
                                        selected={selected?.key === monthly.key}
                                        disabled={busy}
                                        onSelect={() => setPicked('monthly')}
                                    />
                                )}
                                {yearly && (
                                    <PriceCard
                                        label={t('premium:paywall.annual')}
                                        badge={pricing ? t('premium:paywall.discount', { percent: pricing.discountPercent }) : null}
                                        struck={pricing?.twelveMonths ?? null}
                                        price={yearly.priceString}
                                        sub={t('premium:paywall.perYear')}
                                        tag={tagFor(yearly)}
                                        selected={selected?.key === yearly.key}
                                        disabled={busy}
                                        onSelect={() => setPicked('yearly')}
                                    />
                                )}
                            </View>
                        )}

                        {/* App Review: the trial's terms, whenever trial copy is on screen */}
                        {selectedTrial && (
                            <Text style={[styles.disclosure, { color: theme.ink3 }]}>
                                {t('premium:trial.disclosure')}
                            </Text>
                        )}

                        {/* App Review: auto-renewal disclosure */}
                        <Text style={[styles.disclosure, { color: theme.ink3 }]}>
                            {t('premium:paywall.autoRenew')}
                        </Text>
                    </ScrollView>

                    {/* Cream fade under the top bar — `bg` at full strength to transparent,
                        via stopOpacity so it never greys through a transparent black. */}
                    <View pointerEvents="none" style={styles.topFade}>
                        <Svg width="100%" height="100%">
                            <Defs>
                                <LinearGradient id="paywallTopFade" x1="0" y1="0" x2="0" y2="1">
                                    <Stop offset="0" stopColor={theme.bg} stopOpacity="1" />
                                    <Stop offset="1" stopColor={theme.bg} stopOpacity="0" />
                                </LinearGradient>
                            </Defs>
                            <Rect x="0" y="0" width="100%" height="100%" fill="url(#paywallTopFade)" />
                        </Svg>
                    </View>
                </View>

                {/* Fixed bottom: CTA, its note, legal links */}
                <View
                    style={[
                        styles.footer,
                        { borderTopColor: theme.borderSoft, paddingBottom: Math.max(insets.bottom, 14) },
                    ]}
                >
                    {/* The ONLY solid forest block on the screen. Same height with one
                        line or two, so the late trial-eligibility answer moves nothing. */}
                    <Pressable
                        onPress={() => { if (selected) handleBuy(selected); }}
                        disabled={ctaBlocked || busy}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: ctaBlocked || busy, busy: !!busyKey }}
                        style={({ pressed }) => [
                            styles.cta,
                            { backgroundColor: theme.brand },
                            pressed && { opacity: 0.88 },
                            (ctaBlocked || restoring) && { opacity: 0.45 },
                        ]}
                    >
                        {busyKey ? (
                            <ActivityIndicator color={theme.onBrand} />
                        ) : (
                            <>
                                <Text style={[styles.ctaText, { color: theme.onBrand }]} numberOfLines={1}>
                                    {ctaLabel}
                                </Text>
                                {selectedTrial && (
                                    <Text style={[styles.ctaSub, { color: theme.onBrand }]} numberOfLines={1}>
                                        {t('premium:paywall.ctaTrial')}
                                    </Text>
                                )}
                            </>
                        )}
                    </Pressable>

                    {selected && (
                        <Text style={[styles.note, { color: theme.ink2 }]}>
                            {selectedTrial
                                ? t('premium:paywall.noteTrial', {
                                    duration: trialLabel(selectedTrial),
                                    price: selected.priceString,
                                    per: per(selected),
                                })
                                : t('premium:paywall.note', {
                                    price: selected.priceString,
                                    per: per(selected),
                                })}
                        </Text>
                    )}

                    {/* App Review: Restore Purchases and the policy links */}
                    <View style={styles.legalRow}>
                        <Pressable
                            onPress={handleRestore}
                            disabled={busy}
                            hitSlop={8}
                            accessibilityRole="button"
                            style={({ pressed }) => pressed && { opacity: 0.6 }}
                        >
                            {restoring ? (
                                <ActivityIndicator size="small" color={theme.brand} />
                            ) : (
                                <Text style={[styles.legalLink, { color: theme.ink2 }]}>{t('premium:paywall.restore')}</Text>
                            )}
                        </Pressable>
                        <Pressable onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} hitSlop={8} accessibilityRole="link">
                            <Text style={[styles.legalLink, { color: theme.ink2 }]}>{t('premium:paywall.terms')}</Text>
                        </Pressable>
                        <Pressable onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} hitSlop={8} accessibilityRole="link">
                            <Text style={[styles.legalLink, { color: theme.ink2 }]}>{t('premium:paywall.privacy')}</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

type PriceCardProps = {
    label: string;
    /** The billed amount — `priceString`, always the dominant figure on the card. */
    price: string;
    /** "per month" / "per year". */
    sub: string;
    /** "-41%" — derived, so omitted whenever the saving can't be trusted. */
    badge?: string | null;
    /** The twelve-month price, struck through — derived, same rule as `badge`. */
    struck?: string | null;
    tag: { text: string; color: string } | null;
    selected: boolean;
    disabled: boolean;
    onSelect: () => void;
};

/**
 * One plan card. Both states draw the SAME geometry — 2px border, same size, no
 * shadow — and the selected look is a layer cross-faded over the unselected one, so a
 * tap changes colour only and nothing on the screen moves.
 */
function PriceCard({ label, price, sub, badge, struck, tag, selected, disabled, onSelect }: PriceCardProps) {
    const { theme } = useTheme();
    const on = useRef(new Animated.Value(selected ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(on, {
            toValue: selected ? 1 : 0,
            duration: SELECT_FADE_MS,
            useNativeDriver: true,
        }).start();
    }, [selected, on]);

    return (
        <Pressable
            onPress={onSelect}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected, disabled }}
            style={[styles.priceCard, { backgroundColor: theme.surface, borderColor: theme.borderStrong }]}
        >
            {/* Selected layer: forest border over the neutral one, plus a faint emerald
                wash. Inset by the border width so it lands exactly on top of it. */}
            <Animated.View
                pointerEvents="none"
                style={[styles.selectedLayer, { borderColor: theme.brand, opacity: on }]}
            >
                <View style={[styles.wash, { backgroundColor: theme.brand2 }]} />
            </Animated.View>

            {/* Corner indicator: an empty ring, with a filled forest check faded in. */}
            <View style={[styles.radio, { borderColor: theme.borderStrong }]} pointerEvents="none">
                <Animated.View style={[styles.radioOn, { backgroundColor: theme.brand, opacity: on }]}>
                    <IconCheck size={12} color={theme.onBrand} />
                </Animated.View>
            </View>

            <View style={styles.cardHead}>
                <Text style={[styles.cardLabel, { color: theme.ink }]}>{label}</Text>
                {badge ? (
                    <View style={[styles.pill, { backgroundColor: theme.brand2 }]}>
                        <Text style={[styles.pillText, { color: theme.brand }]}>{badge}</Text>
                    </View>
                ) : null}
            </View>

            <View style={styles.priceLine}>
                {struck ? (
                    <Text style={[styles.struck, { color: theme.ink3 }]}>{struck}</Text>
                ) : null}
                <Text
                    style={[styles.price, { color: theme.ink }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                >
                    {price}
                </Text>
            </View>

            <Text style={[styles.sub, { color: theme.ink2 }]}>{sub}</Text>

            {tag && (
                <Text style={[styles.tag, { color: tag.color }]}>{tag.text}</Text>
            )}
        </Pressable>
    );
}

const CARD_RADIUS = 16;
const CARD_BORDER = 2;

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scroll: {
        flex: 1,
    },
    scrollBody: {
        width: '100%',
        maxWidth: 560,          // tablets: keep the cards a readable size
        alignSelf: 'center',
        paddingHorizontal: 20,
        paddingTop: TOP_FADE,
        paddingBottom: 24,
    },
    topFade: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: TOP_FADE,
    },
    headline: {
        fontFamily: Fonts.serif,
        fontSize: ft(40, 1.25),
        lineHeight: ft(44, 1.25),
        letterSpacing: -0.6,
        marginBottom: 24,
    },
    benefits: {
        borderRadius: 18,
        paddingVertical: 18,
        paddingHorizontal: 16,
        gap: 16,
        marginBottom: 24,
    },
    benefitRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    benefitTick: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    benefitCopy: {
        flex: 1,
        gap: 3,
    },
    benefitTitle: {
        fontFamily: Fonts.sansSemiBold,
        fontSize: ft(16, 1.2),
        lineHeight: ft(21, 1.2),
    },
    benefitBody: {
        fontFamily: Fonts.sans,
        fontSize: ft(13, 1.18),
        lineHeight: ft(19, 1.18),
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
    priceRow: {
        flexDirection: 'row',
        alignItems: 'stretch',  // equal heights
        gap: 12,
    },
    priceCard: {
        flex: 1,                // equal widths
        borderRadius: CARD_RADIUS,
        borderWidth: CARD_BORDER,
        paddingTop: 14,
        paddingBottom: 14,
        paddingHorizontal: 14,
    },
    selectedLayer: {
        position: 'absolute',
        top: -CARD_BORDER,
        left: -CARD_BORDER,
        right: -CARD_BORDER,
        bottom: -CARD_BORDER,
        borderRadius: CARD_RADIUS,
        borderWidth: CARD_BORDER,
    },
    wash: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: CARD_RADIUS - CARD_BORDER,
        opacity: 0.06,
    },
    radio: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
    },
    radioOn: {
        position: 'absolute',
        top: -2,
        left: -2,
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardHead: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        paddingRight: 26,       // clears the corner indicator
        minHeight: 22,
    },
    cardLabel: {
        fontFamily: Fonts.sansSemiBold,
        fontSize: ft(15, 1.2),
    },
    pill: {
        borderRadius: 999,
        paddingHorizontal: 7,
        paddingVertical: 2,
    },
    pillText: {
        fontFamily: Fonts.sansBold,
        fontSize: ft(11, 1.18),
    },
    priceLine: {
        flexDirection: 'row',
        alignItems: 'baseline',
        flexWrap: 'wrap',
        columnGap: 6,
        marginTop: 10,
    },
    struck: {
        fontFamily: Fonts.serif,
        fontSize: ft(15, 1.2),
        textDecorationLine: 'line-through',
    },
    price: {
        fontFamily: Fonts.serif,
        fontSize: ft(28, 1.25),
        lineHeight: ft(34, 1.25),
        flexShrink: 1,
    },
    sub: {
        fontFamily: Fonts.sans,
        fontSize: ft(12, 1.18),
        marginTop: 2,
    },
    tag: {
        fontFamily: Fonts.sansSemiBold,
        fontSize: ft(10, 1.18),
        letterSpacing: 1,
        marginTop: 8,
    },
    disclosure: {
        fontFamily: Fonts.sans,
        fontSize: ft(11, 1.18),
        lineHeight: ft(17, 1.18),
        marginTop: 18,
    },
    footer: {
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
        paddingHorizontal: 20,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    cta: {
        minHeight: 60,          // fits two lines, so one line and two are the same size
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    ctaText: {
        fontFamily: Fonts.sansSemiBold,
        fontSize: ft(17, 1.2),
    },
    ctaSub: {
        fontFamily: Fonts.sans,
        fontSize: ft(12, 1.18),
        marginTop: 2,
        opacity: 0.85,
    },
    note: {
        fontFamily: Fonts.sans,
        fontSize: ft(12, 1.18),
        lineHeight: ft(17, 1.18),
        textAlign: 'center',
        marginTop: 10,
    },
    // No "·" separators: the three links don't fit one line on a small phone in
    // Portuguese, and a wrapped row would strand a dot at a line end. The underline
    // and the gap separate them instead.
    legalRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        columnGap: 18,
        rowGap: 6,
        marginTop: 10,
    },
    legalLink: {
        fontFamily: Fonts.sans,
        fontSize: ft(12, 1.18),
        textDecorationLine: 'underline',
    },
});
