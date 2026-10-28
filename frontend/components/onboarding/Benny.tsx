/**
 * Benny — the coin mascot, with his chat bubble to his right (ONBOARDING_REWORK.md §4).
 *
 * Every pose is a 600 × 600 PNG with a transparent background and a shared baseline,
 * so swapping `pose` never moves the layout. The bubble holds the screen's question;
 * a step passes its reaction instead once the user has tapped an answer, and the text
 * fades across so the change reads as Benny talking.
 *
 * A screen shows at most two of: the bubble, a heading, a subtitle (ONBOARDING_FIXES.md
 * §1). Without a heading the bubble carries the screen, so its text is `large`.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Fonts, shadow, useTheme } from '../../context/ThemeContext';
import { ft, tv } from '../../constants/responsive';

export const POSES = {
    waving: require('../../assets/images/mascot/waving.png'),
    curious: require('../../assets/images/mascot/curious.png'),
    listening: require('../../assets/images/mascot/listening.png'),
    gentle: require('../../assets/images/mascot/gentle.png'),
    bible: require('../../assets/images/mascot/bible.png'),
    thinking: require('../../assets/images/mascot/thinking.png'),
    excited: require('../../assets/images/mascot/excited.png'),
    'excited-phone': require('../../assets/images/mascot/excited-phone.png'),
    pointing: require('../../assets/images/mascot/pointing.png'),
    'thumbs-up': require('../../assets/images/mascot/thumbs-up.png'),
    planting: require('../../assets/images/mascot/planting.png'),
    watering: require('../../assets/images/mascot/watering.png'),
    praying: require('../../assets/images/mascot/praying.png'),
    proud: require('../../assets/images/mascot/proud.png'),
    key: require('../../assets/images/mascot/key.png'),
    oops: require('../../assets/images/mascot/oops.png'),
} as const;

export type Pose = keyof typeof POSES;

const SIZE = tv(104, 150);

export function BennyImage({ pose, size = SIZE }: { pose: Pose; size?: number }) {
    return (
        <Image
            source={POSES[pose]}
            style={{ width: size, height: size }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            accessible={false}
        />
    );
}

export default function Benny({ pose, text, large = false }: { pose: Pose; text: string; large?: boolean }) {
    const { theme } = useTheme();
    return (
        <View style={styles.row}>
            <BennyImage pose={pose} />
            <View
                style={[styles.bubble, { backgroundColor: theme.surface, borderColor: theme.border }, shadow(2)]}
                accessibilityLiveRegion="polite"
            >
                {/* The tail, pointing back at Benny. */}
                <View style={[styles.tail, { backgroundColor: theme.surface, borderColor: theme.border }]} />
                <Animated.Text key={text} entering={FadeIn.duration(220)} style={[large ? styles.textLarge : styles.text, { color: theme.ink }]}>
                    {text}
                </Animated.Text>
            </View>
        </View>
    );
}

/**
 * A screen title under Benny, and the expectation-setting line under it. `lead` is a
 * short bold question at the start of the subtitle: where an answer screen's question
 * goes once the bubble has switched to Benny's reaction.
 */
export function StepTitle({ title, subtitle, lead }: { title?: string; subtitle?: string; lead?: string }) {
    const { theme } = useTheme();
    if (!title && !subtitle) return null;
    return (
        <View style={styles.titles}>
            {title ? <Text accessibilityRole="header" style={[styles.title, { color: theme.ink }]}>{title}</Text> : null}
            {subtitle ? (
                <Text style={[styles.subtitle, { color: theme.ink2 }]}>
                    {lead ? <Text style={[styles.lead, { color: theme.ink }]}>{lead} </Text> : null}
                    {subtitle}
                </Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 12 },
    bubble: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: SIZE * 0.35,
    },
    tail: {
        position: 'absolute',
        left: -6,
        bottom: 16,
        width: 12,
        height: 12,
        borderLeftWidth: 1,
        borderBottomWidth: 1,
        transform: [{ rotate: '45deg' }],
    },
    text: { fontFamily: Fonts.sansMedium, fontSize: ft(16), lineHeight: ft(22) },
    textLarge: { fontFamily: Fonts.sansMedium, fontSize: ft(20), lineHeight: ft(27) },
    lead: { fontFamily: Fonts.sansSemiBold },
    titles: { gap: 6, marginBottom: 16 },
    title: { fontFamily: Fonts.serif, fontSize: ft(32, 1.25), lineHeight: ft(36, 1.25), letterSpacing: -0.4 },
    subtitle: { fontFamily: Fonts.sans, fontSize: ft(15), lineHeight: ft(21) },
});
