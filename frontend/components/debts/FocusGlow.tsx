/**
 * FocusGlow — a soft Harvest-yellow halo behind the focus plant. Static: a single
 * SVG radial gradient, no animation.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';

function FocusGlow({ width, height, cy = '55%' }: { width: number; height: number; cy?: string }) {
    const { theme } = useTheme();
    return (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { width, height }]}>
            <Svg width={width} height={height}>
                <Defs>
                    <RadialGradient id="focusGlow" cx="50%" cy={cy} rx="50%" ry="42%">
                        <Stop offset="0" stopColor={theme.harvest} stopOpacity="0.45" />
                        <Stop offset="0.55" stopColor={theme.harvest} stopOpacity="0.16" />
                        <Stop offset="1" stopColor={theme.harvest} stopOpacity="0" />
                    </RadialGradient>
                </Defs>
                <Rect x="0" y="0" width={width} height={height} fill="url(#focusGlow)" />
            </Svg>
        </View>
    );
}

export default memo(FocusGlow);
