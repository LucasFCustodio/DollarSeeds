/**
 * OnboardingTour — the first-run guided-tour overlay.
 *
 * Renders nothing unless the tour is active. When active, it dims the screen and
 * shows a themed card near the bottom describing the current tab, and drives the
 * app to the matching tab as the user taps Next. Sits above the tabs and the
 * floating CustomTabBar. State comes from OnboardingContext; copy from
 * constants/onboarding.
 */
import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, shadow, Fonts } from '../../context/ThemeContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { ONBOARDING_STEPS } from '../../constants/onboarding';
import Button from '../ui/Button';

export default function OnboardingTour() {
    const { active, step, stepCount, next, skip } = useOnboarding();
    const { theme } = useTheme();
    const router = useRouter();
    const segments = useSegments();
    const insets = useSafeAreaInsets();

    const current = ONBOARDING_STEPS[step];
    const inAuthGroup = segments[0] === 'auth';

    // Keep the correct tab visible behind the card as steps advance.
    useEffect(() => {
        if (!active || !current) return;
        router.navigate(current.route as any);
    }, [active, step]);

    // Don't overlay the auth screens, and bail if state is out of range.
    if (!active || inAuthGroup || !current) return null;

    const isLast = step >= stepCount - 1;

    return (
        <View style={styles.overlay} pointerEvents="box-none">
            {/* Scrim — tappable no-op so taps don't reach the app behind it */}
            <Pressable style={styles.scrim} onPress={() => {}} />

            <View
                style={[
                    styles.card,
                    {
                        backgroundColor: theme.surface,
                        marginBottom: insets.bottom + 24,
                        ...shadow(10),
                    },
                ]}
            >
                {/* Progress: dots + "n of N" */}
                <View style={styles.progressRow}>
                    <View style={styles.dots}>
                        {ONBOARDING_STEPS.map((_, i) => (
                            <View
                                key={i}
                                style={[
                                    styles.dot,
                                    {
                                        backgroundColor: i <= step ? theme.brand : theme.borderSoft,
                                        width: i === step ? 18 : 6,
                                    },
                                ]}
                            />
                        ))}
                    </View>
                    <Text style={[styles.stepCount, { color: theme.ink3 }]}>
                        {step + 1} of {stepCount}
                    </Text>
                </View>

                <Text style={[styles.eyebrow, { color: theme.brand }]}>{current.eyebrow}</Text>
                <Text style={[styles.title, { color: theme.ink }]}>{current.title}</Text>
                <Text style={[styles.body, { color: theme.ink2 }]}>{current.body}</Text>

                {current.subnote ? (
                    <View style={[styles.subnoteBox, { backgroundColor: theme.brandSoft }]}>
                        <Text style={[styles.subnote, { color: theme.ink }]}>{current.subnote}</Text>
                    </View>
                ) : null}

                <View style={styles.footer}>
                    <Pressable onPress={skip} hitSlop={8} style={styles.skipBtn}>
                        <Text style={[styles.skipText, { color: theme.ink3 }]}>Skip</Text>
                    </Pressable>
                    <Button
                        label={isLast ? 'Get started' : 'Next'}
                        variant="primary"
                        size="lg"
                        color={theme.onBrand}
                        onPress={next}
                    />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end',
        alignItems: 'center',
        zIndex: 1000,
        elevation: 1000,
        paddingBottom: 70,
    },
    scrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    card: {
        width: '92%',
        borderRadius: 22,
        padding: 22,
    },
    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { height: 6, borderRadius: 999 },
    stepCount: { fontFamily: Fonts.monoSemiBold, fontSize: 11, letterSpacing: 1 },
    eyebrow: { fontFamily: Fonts.monoSemiBold, fontSize: 11, letterSpacing: 1.6, marginBottom: 6 },
    title: { fontFamily: Fonts.serif, fontSize: 28, marginBottom: 8 },
    body: { fontFamily: Fonts.sans, fontSize: 14, lineHeight: 21 },
    subnoteBox: { marginTop: 14, padding: 12, borderRadius: 12 },
    subnote: { fontFamily: Fonts.sansMedium, fontSize: 13, lineHeight: 19 },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 22,
    },
    skipBtn: { paddingVertical: 8, paddingHorizontal: 4 },
    skipText: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
});
