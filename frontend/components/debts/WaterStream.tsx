/**
 * WaterStream — the water a paid-off plant sends down to the next one.
 *
 * Starts on the ground under the paid-off plant and meanders down the gap. Fully
 * visible for the first ~60% of its length, then a linear fade to nothing, ending
 * clear of the next section's top edge so it never touches the next plant. Wider for
 * every debt paid off so far, capped at 40% of the pot's width.
 *
 * Static. It animates once — the reveal right after a completion — and never again.
 */
import React, { memo, useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { ILLUSTRATION_COLORS } from './art';

interface Props {
    /** Horizontal centre, px. */
    cx: number;
    /** Where the water leaves the ground, px from the section top. */
    top: number;
    /** Where it must be fully clear, px from the section top. */
    bottom: number;
    /** The pot's rendered width, px. */
    potWidth: number;
    /** Debts paid off up to and including the one above. */
    paidCount: number;
    /** Play the one-time reveal. */
    animateIn?: boolean;
    onRevealed?: () => void;
}

function WaterStream({ cx, top, bottom, potWidth, paidCount, animateIn, onRevealed }: Props) {
    const reduceMotion = useReducedMotion();
    const reveal = useSharedValue(animateIn && !reduceMotion ? 0 : 1);

    useEffect(() => {
        if (!animateIn) return;
        if (reduceMotion) {
            onRevealed?.();
            return;
        }
        reveal.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
        const id = setTimeout(() => onRevealed?.(), 1150);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [animateIn]);

    const style = useAnimatedStyle(() => ({
        opacity: reveal.value,
        transform: [{ scaleY: reveal.value }],
    }));

    const length = bottom - top;
    if (length < 24) return null;

    const w = Math.min(potWidth * 0.4, potWidth * (0.07 + 0.045 * Math.max(0, paidCount - 1)));
    const outline = Math.max(2, w * 0.14);
    const boxW = w + outline * 2 + potWidth * 0.3;
    const mid = boxW / 2;
    const amp = potWidth * 0.08;
    // A gentle S down the gap.
    const d = `M ${mid} 0 C ${mid + amp} ${length * 0.3}, ${mid - amp} ${length * 0.6}, ${mid} ${length}`;

    return (
        <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', left: cx - mid, top, width: boxW, height: length, transformOrigin: 'top' }, style]}
        >
            <Svg width={boxW} height={length}>
                <Defs>
                    {/* 100% for the first 60%, then fading to 0 by the end. */}
                    <LinearGradient id="waterFade" x1="0" y1="0" x2="0" y2={length} gradientUnits="userSpaceOnUse">
                        <Stop offset="0" stopColor={ILLUSTRATION_COLORS.water} stopOpacity="1" />
                        <Stop offset="0.6" stopColor={ILLUSTRATION_COLORS.water} stopOpacity="1" />
                        <Stop offset="1" stopColor={ILLUSTRATION_COLORS.water} stopOpacity="0" />
                    </LinearGradient>
                    <LinearGradient id="waterEdge" x1="0" y1="0" x2="0" y2={length} gradientUnits="userSpaceOnUse">
                        <Stop offset="0" stopColor={ILLUSTRATION_COLORS.outline} stopOpacity="1" />
                        <Stop offset="0.6" stopColor={ILLUSTRATION_COLORS.outline} stopOpacity="1" />
                        <Stop offset="1" stopColor={ILLUSTRATION_COLORS.outline} stopOpacity="0" />
                    </LinearGradient>
                    <LinearGradient id="waterShine" x1="0" y1="0" x2="0" y2={length} gradientUnits="userSpaceOnUse">
                        <Stop offset="0" stopColor={ILLUSTRATION_COLORS.waterShine} stopOpacity="0.9" />
                        <Stop offset="0.5" stopColor={ILLUSTRATION_COLORS.waterShine} stopOpacity="0.6" />
                        <Stop offset="0.85" stopColor={ILLUSTRATION_COLORS.waterShine} stopOpacity="0" />
                    </LinearGradient>
                </Defs>
                <Path d={d} stroke="url(#waterEdge)" strokeWidth={w + outline * 2} strokeLinecap="round" fill="none" />
                <Path d={d} stroke="url(#waterFade)" strokeWidth={w} strokeLinecap="round" fill="none" />
                <Path d={d} stroke="url(#waterShine)" strokeWidth={Math.max(1.5, w * 0.18)} strokeLinecap="round"
                    fill="none" transform={`translate(${-w * 0.22} 0)`} />
            </Svg>
        </Animated.View>
    );
}

export default memo(WaterStream);
