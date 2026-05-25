/**
 * HeroBg — curved-bottom gradient hero header.
 * Uses expo-linear-gradient + a subtle leaf-flourish SVG overlay.
 */
import React from 'react';
import { View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';

interface Props {
    brand: string;
    brand2: string;
    children: React.ReactNode;
    style?: ViewStyle;
}

export default function HeroBg({ brand, brand2, children, style }: Props) {
    return (
        <LinearGradient
            colors={[brand, brand, brand2]}
            locations={[0, 0.45, 1.3]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
                {
                    borderBottomLeftRadius: 32,
                    borderBottomRightRadius: 32,
                    paddingBottom: 36,
                    overflow: 'hidden',
                },
                style,
            ]}
        >
            {/* Leaf flourish — top-right */}
            <View style={{ position: 'absolute', right: -20, top: -10, width: 220, height: 200, opacity: 0.09 }}>
                <Svg viewBox="0 0 400 280" width={220} height={200}>
                    <Path
                        d="M380 40c-60 0-160 30-200 100-30 50-50 80-50 120 80 0 160-30 200-90 30-45 50-80 50-130z"
                        fill="#fff"
                    />
                    <Path
                        d="M380 40c-50 30-110 80-150 130-30 40-50 70-70 90"
                        stroke="#fff"
                        strokeWidth={1.5}
                        fill="none"
                    />
                </Svg>
            </View>

            {/* Subtle circle — bottom-left */}
            <View style={{ position: 'absolute', left: -10, bottom: 10, width: 100, height: 100, opacity: 0.07 }}>
                <Svg viewBox="0 0 100 100" width={100} height={100}>
                    <Circle cx={50} cy={50} r={40} fill="#fff" />
                </Svg>
            </View>

            {children}
        </LinearGradient>
    );
}
