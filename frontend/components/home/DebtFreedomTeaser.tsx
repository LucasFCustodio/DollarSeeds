/**
 * DebtFreedomTeaser — the Analyze band's card for a user without Debt Freedom (the
 * `debt_freedom` allowance is `none` or `read_only`), where NextPaymentCard sits for
 * a subscriber. Painted the same way, with the same outline.
 *
 *   no debts (`none`)          "Start getting out of debt." · Learn how → the Debts tab's
 *                              tutorial
 *   has debts (`read_only`: a free user who planted one in the onboarding, or a
 *   lapsed subscriber)         "Your Visa is planted." / "Your debts are planted." ·
 *                              "Help it grow." · Water it → the paywall
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { ft } from '../../constants/responsive';
import PaintedCard from './PaintedCard';
import { homeType } from './homeType';

export default function DebtFreedomTeaser({ onLearn, onWater, planted }: {
    onLearn: () => void;
    onWater: () => void;
    /** Set when the user already has debts: how many, and the one to name. */
    planted?: { count: number; name: string | null } | null;
}) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    const has = !!planted && planted.count > 0;
    const top = has
        ? (planted!.count === 1 && planted!.name
            ? t('debtTeaser.plantedOne', { name: planted!.name })
            : t('debtTeaser.plantedMany'))
        : t('debtTeaser.eyebrow');
    return (
        <PaintedCard source={ART} borderColor={theme.ink} borderWidth={1.5} style={styles.card}>
            <View style={styles.row}>
                <View style={styles.left}>
                    {has ? (
                        <>
                            <Text style={[homeType.medium, { color: theme.ink }]}
                                numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
                                {top}
                            </Text>
                            <Text style={[homeType.small, styles.line, { color: theme.ink2 }]} numberOfLines={1}>
                                {t('debtTeaser.grow')}
                            </Text>
                        </>
                    ) : (
                        <>
                            <Text style={[homeType.small, { color: theme.ink2 }]} numberOfLines={1}>
                                {top}
                            </Text>
                            {/* Two lines at most beside the button: the copy fits in two at
                                375 pt in both languages; a larger system text size shrinks
                                it a little rather than adding a third. */}
                            <Text style={[homeType.medium, styles.line, { color: theme.ink }]}
                                numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
                                {t('debtTeaser.line')}
                            </Text>
                        </>
                    )}
                </View>
                <Pressable
                    onPress={has ? onWater : onLearn}
                    accessibilityRole="button"
                    accessibilityLabel={has ? t('debtTeaser.waterA11y') : t('debtTeaser.ctaA11y')}
                    style={({ pressed }) => [styles.cta, { backgroundColor: theme.brand }, pressed && { opacity: 0.8 }]}
                >
                    <Text style={[styles.ctaText, { color: theme.onBrand }]}>
                        {has ? t('debtTeaser.water') : t('debtTeaser.cta')}
                    </Text>
                </Pressable>
            </View>
        </PaintedCard>
    );
}

// NextPaymentCard's art: the teaser stands in its place.
const ART = require('../../assets/images/home/next-payment-bg.png');

const styles = StyleSheet.create({
    card: { padding: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    left: { flex: 1 },
    line: { marginTop: 4 },
    cta: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
    ctaText: { fontFamily: Fonts.sansSemiBold, fontSize: ft(13) },
});
