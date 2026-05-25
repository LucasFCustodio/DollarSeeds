/**
 * AnimatedProgressBar — fills from 0 to value% over 1100ms on mount.
 * Glow shadow in the bar color (iOS only; Android falls back to flat).
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, ViewStyle } from 'react-native';

interface Props {
    /** 0–100 */
    value: number;
    color: string;
    bg: string;
    height?: number;
    animate?: boolean;
    style?: ViewStyle;
}

export default function AnimatedProgressBar({ value, color, bg, height = 8, animate = true, style }: Props) {
    const animRef = useRef(new Animated.Value(animate ? 0 : value));

    useEffect(() => {
        if (!animate) {
            animRef.current.setValue(value);
            return;
        }
        animRef.current.setValue(0);
        Animated.timing(animRef.current, {
            toValue: value,
            duration: 1100,
            useNativeDriver: false,
        }).start();
    }, [value, animate]);

    const widthAnim = animRef.current.interpolate({
        inputRange: [0, 100],
        outputRange: ['0%', '100%'],
        extrapolate: 'clamp',
    });

    return (
        <View style={[{ height, backgroundColor: bg, borderRadius: 999, overflow: 'hidden' }, style]}>
            <Animated.View
                style={{
                    width: widthAnim,
                    height: '100%',
                    backgroundColor: color,
                    borderRadius: 999,
                    // Glow shadow (iOS)
                    shadowColor: color,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.45,
                    shadowRadius: 6,
                }}
            />
        </View>
    );
}
