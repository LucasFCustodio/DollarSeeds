/**
 * UpdateGate — blocks the app when this build is below `min_supported_version`.
 *
 * Rendered as a sibling of <Stack>, alongside OnboardingTour and StartingBalanceGate,
 * because it has to cover every screen including auth.
 *
 * IT CANNOT HELP THE BUILD ALREADY IN THE STORE. That binary has no gate and never
 * will, which is the whole reason the backend hides premium content from unmarked
 * clients instead of locking it. This is for v3 onward.
 *
 * FAILS OPEN, THREE WAYS. An unreachable /config/, a malformed `min_supported_version`,
 * and an unreadable local version all pass. The app's own rule (see
 * StartingBalanceGate) is that a gate must never be able to trap the user, and a false
 * positive here bricks the app for everyone with no way back that does not involve
 * shipping another binary.
 */
import React, { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Application from 'expo-application';

import { useTheme, shadow, Fonts } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { ft } from '../../constants/responsive';

/**
 * Numeric semver compare. String comparison is wrong in the way that bites late:
 * "1.10.0" < "1.9.0" lexically, so the gate would start blocking at exactly the point
 * the version numbers grow past a single digit.
 *
 * Returns null when either side is unparseable, which the caller treats as "pass".
 */
export function isBelowVersion(current: string | null, minimum: string | null): boolean | null {
    const parse = (v: string | null) => {
        if (!v || typeof v !== 'string') return null;
        const parts = v.trim().split('.').map(p => Number.parseInt(p, 10));
        if (parts.length === 0 || parts.some(n => !Number.isFinite(n) || n < 0)) return null;
        while (parts.length < 3) parts.push(0);
        return parts.slice(0, 3);
    };

    const a = parse(current);
    const b = parse(minimum);
    if (!a || !b) return null;

    for (let i = 0; i < 3; i++) {
        if (a[i] < b[i]) return true;
        if (a[i] > b[i]) return false;
    }
    return false;
}

export default function UpdateGate() {
    const { theme } = useTheme();
    const { config } = useSubscription();

    const blocked = useMemo(() => {
        const current = Application.nativeApplicationVersion;
        return isBelowVersion(current, config.minSupportedVersion) === true;
    }, [config.minSupportedVersion]);

    if (!blocked) return null;

    return (
        <View style={styles.overlay}>
            <View style={[styles.scrim, { backgroundColor: theme.bg }]} />
            <View style={[styles.card, { backgroundColor: theme.surface, ...shadow(10) }]}>
                <Text style={[styles.title, { color: theme.ink }]}>Time to update</Text>
                <Text style={[styles.body, { color: theme.ink2 }]}>
                    This version of DollarSeeds is no longer supported. Update to the latest
                    version to keep going — your data is safe and will be waiting.
                </Text>
                {!!config.updateUrl && (
                    <Pressable
                        onPress={() => Linking.openURL(config.updateUrl)}
                        style={({ pressed }) => [
                            styles.btn,
                            { backgroundColor: theme.brand },
                            pressed && { opacity: 0.85 },
                        ]}
                    >
                        <Text style={[styles.btnText, { color: theme.onBrand }]}>Update DollarSeeds</Text>
                    </Pressable>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 2000,
        elevation: 2000,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 28,
    },
    // Opaque, not translucent: this is a hard stop, and showing the app behind it
    // invites tapping at controls that will not respond.
    scrim: StyleSheet.absoluteFillObject,
    card: {
        width: '100%',
        maxWidth: 420,
        borderRadius: 22,
        padding: 24,
    },
    title: {
        fontFamily: Fonts.serif,
        fontSize: ft(28, 1.25),
        lineHeight: ft(32, 1.25),
        letterSpacing: -0.4,
        marginBottom: 10,
    },
    body: {
        fontFamily: Fonts.sans,
        fontSize: ft(14, 1.18),
        lineHeight: ft(21, 1.18),
        marginBottom: 20,
    },
    btn: {
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
    },
    btnText: {
        fontFamily: Fonts.sansSemiBold,
        fontSize: ft(15, 1.2),
    },
});
