/**
 * PremiumCta — the "Subscribe to premium" prompt.
 *
 * Rendered in exactly two places: the Lessons page (under the page description) and
 * Settings (under the budget-type section). Deliberately NOT on the dashboard.
 *
 * COLOUR. Harvest yellow, the same accent as the tithing icon tile in Settings. The
 * link is intentional — both are about giving. `theme.harvest` is identical in light
 * and dark, which means `theme.ink` (which inverts) is unreadable on it; content on
 * solid harvest uses `theme.brand`, exactly as the tithing tile does. The card
 * underneath is `theme.surface`, so its text uses the normal ink scale and reads
 * correctly in both themes.
 *
 * SUBSCRIBED STATE. A paying subscriber must never see "Subscribe to premium". On
 * Lessons the CTA disappears; in Settings it becomes "Manage Subscription". While the
 * entitlement is still resolving on cold start we render NOTHING rather than guessing,
 * so a subscriber never sees the CTA flash and vanish.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { useTheme, shadow, Fonts } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { useSubscription } from '../../context/SubscriptionContext';
import { ft } from '../../constants/responsive';
import {
    MANAGE_SUBSCRIPTION_URL, describeProduct,
} from '../../constants/premium';
import { IconChevronRight, IconSparkle } from '../icons';

type Props = {
    /**
     * 'lessons' hides entirely once subscribed; 'settings' swaps to Manage
     * Subscription and shows a section title above the card.
     */
    placement: 'lessons' | 'settings';
    style?: object;
};

export default function PremiumCta({ placement, style }: Props) {
    const { theme } = useTheme();
    const { t } = useTranslation('premium');
    const { premiumActive, entitlementLoaded, productId, openPaywall } = useSubscription();

    // No flash: say nothing until we actually know.
    if (!entitlementLoaded) return null;

    // Lessons has no subscribed variant — the CTA simply goes away.
    if (premiumActive && placement === 'lessons') return null;

    const isManage = premiumActive && placement === 'settings';
    const currentTier = describeProduct(productId);

    const body = isManage
        ? (currentTier ?? t('cta.activeFallback'))
        : t('cta.body');

    return (
        <View style={style}>
            {placement === 'settings' && (
                <Text style={[styles.sectionLabel, { color: theme.ink3 }]}>PREMIUM</Text>
            )}

            <Pressable
                onPress={() => {
                    if (isManage) WebBrowser.openBrowserAsync(MANAGE_SUBSCRIPTION_URL);
                    else openPaywall();
                }}
                style={({ pressed }) => [
                    styles.card,
                    { backgroundColor: theme.surface, ...shadow(7) },
                    pressed && { transform: [{ scale: 0.99 }], opacity: 0.95 },
                ]}
            >
                {/* Solid harvest tile with a brand-coloured glyph — the tithing pattern. */}
                <View style={[styles.iconTile, { backgroundColor: theme.harvest }]}>
                    <IconSparkle size={22} color={theme.brand} />
                </View>

                <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: theme.ink }]}>
                        {isManage ? t('cta.manage') : t('cta.title')}
                    </Text>
                    <Text style={[styles.body, { color: theme.ink2 }]}>{body}</Text>
                </View>

                <IconChevronRight size={18} color={theme.ink3} />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    sectionLabel: {
        fontFamily: Fonts.monoSemiBold,
        fontSize: ft(10, 1.25),
        letterSpacing: 1.6,
        marginBottom: 10,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
        borderRadius: 18,
    },
    iconTile: {
        width: 44,
        height: 44,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    title: {
        fontFamily: Fonts.sansSemiBold,
        fontSize: ft(15, 1.28),
        letterSpacing: -0.1,
        marginBottom: 3,
    },
    body: {
        fontFamily: Fonts.sans,
        fontSize: ft(13, 1.18),
        lineHeight: ft(19, 1.18),
    },
});
