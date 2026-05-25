/**
 * Card — soft surface card with depth-based shadow.
 * Replaces hard-bordered flat cards with layered shadow + warm surface.
 */
import React from 'react';
import { Pressable, View, ViewStyle, StyleSheet, StyleProp } from 'react-native';
import { AppTheme, shadow } from '../../context/ThemeContext';

interface CardProps {
    theme: AppTheme;
    depth?: number;
    padding?: number;
    style?: StyleProp<ViewStyle>;
    onPress?: () => void;
    children: React.ReactNode;
}

export default function Card({ theme, depth = 6, padding = 18, style, onPress, children }: CardProps) {
    const base: ViewStyle = {
        backgroundColor: theme.surface,
        borderRadius: 18,
        padding,
        borderWidth: depth <= 2 ? 1 : 0,
        borderColor: depth <= 2 ? theme.border : 'transparent',
        ...(shadow(depth) as ViewStyle),
    };

    if (onPress) {
        return (
            <Pressable
                onPress={onPress}
                style={({ pressed }) => [base, style, pressed && { transform: [{ scale: 0.97 }] }]}
            >
                {children}
            </Pressable>
        );
    }

    return <View style={[base, style]}>{children}</View>;
}
