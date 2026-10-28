/**
 * Confetti — one burst of multi-coloured pieces flying up across the screen, then
 * falling away. Played once as the plan screen opens after the commitment
 * (ONBOARDING_FIXES.md §2). Theme colours only: emerald, harvest yellow, amber,
 * violet, forest. Untouchable (the host lays it over with pointerEvents="none") and
 * skipped entirely with Reduce Motion on.
 */
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
    Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';

const PIECES = 44;
const DURATION = 2200;

/** A fixed pseudo-random sequence, so a re-render never reshuffles a burst in flight. */
function seeded(i: number, salt: number) {
    const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

export default function Confetti() {
    const { theme } = useTheme();
    const reduce = useReducedMotion();
    const { width, height } = useWindowDimensions();
    const colors = [theme.brand2, theme.harvest, theme.needs, theme.wants, theme.brand];

    const pieces = useMemo(() => Array.from({ length: PIECES }, (_, i) => ({
        x: seeded(i, 1) * width,
        drift: (seeded(i, 2) - 0.5) * width * 0.5,
        rise: height * (0.55 + seeded(i, 3) * 0.4),
        spin: (seeded(i, 4) - 0.5) * 900,
        delay: seeded(i, 5) * 280,
        w: 7 + seeded(i, 6) * 6,
        h: 10 + seeded(i, 7) * 8,
        round: seeded(i, 8) > 0.7,
        color: colors[i % colors.length],
    })), [width, height]); // eslint-disable-line react-hooks/exhaustive-deps

    if (reduce) return null;
    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {pieces.map((p, i) => <Piece key={i} {...p} bottom={height} />)}
        </View>
    );
}

function Piece({ x, drift, rise, spin, delay, w, h, round, color, bottom }: {
    x: number; drift: number; rise: number; spin: number; delay: number;
    w: number; h: number; round: boolean; color: string; bottom: number;
}) {
    const t = useSharedValue(0);
    useEffect(() => {
        t.value = withDelay(delay, withTiming(1, { duration: DURATION, easing: Easing.out(Easing.quad) }));
    }, [t, delay]);

    const style = useAnimatedStyle(() => {
        // Up fast, a slow drift sideways, then a short fall as it fades.
        const up = t.value < 0.7 ? t.value / 0.7 : 1 - (t.value - 0.7) * 0.6;
        return {
            opacity: t.value === 0 ? 0 : t.value < 0.75 ? 1 : 1 - (t.value - 0.75) / 0.25,
            transform: [
                { translateX: drift * t.value },
                { translateY: -rise * up },
                { rotate: `${spin * t.value}deg` },
            ],
        };
    });

    return (
        <Animated.View
            style={[
                styles.piece,
                { left: x, top: bottom, width: w, height: round ? w : h, borderRadius: round ? w / 2 : 2, backgroundColor: color },
                style,
            ]}
        />
    );
}

const styles = StyleSheet.create({
    piece: { position: 'absolute' },
});
