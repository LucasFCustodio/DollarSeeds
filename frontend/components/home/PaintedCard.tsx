/**
 * PaintedCard — a card whose surface is a watercolour painting.
 *
 * The art fills the card (cover, clipped to the 18 radius) and never moves; only the
 * children do. A surface-coloured scrim keeps the content readable, in one of two
 * shapes:
 *
 *  - 'fade' (default): from 0.85 on the left to nothing by 65% of the width, for a
 *    card whose text sits on the left (next payment, encouragement). Their art is
 *    painted calm on its left ~60% as well; the scrim is the safety net.
 *  - 'even': one wash of EVEN_WASH over the whole painting, for a card with content
 *    across its full width (the Envision dashboard). The painting comes through as a
 *    soft tint, strongest where it is strongest — the field at the bottom and edges.
 *
 * The images live at fixed paths (docs/design-home/README.md): replacing a file with
 * new art of the same name needs no code change.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { shadow, useTheme } from '../../context/ThemeContext';

const RADIUS = 18;
const SCRIM_OPACITY = 0.85;
const SCRIM_END = 0.65;
/** Measured, not eyeballed: see EnvisionDashboard for what it has to keep readable. */
export const EVEN_WASH = 0.7;
/** The painted cards' ink outline, shared so the two Envision cards read as a pair. */
export const PAINTED_OUTLINE = 1.5;

/** '#RRGGBB' → 'rgba(r,g,b,a)' */
export function withAlpha(hex: string, alpha: number) {
    const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

interface Props {
    source: ImageSource | number;
    borderColor: string;
    borderWidth: number;
    scrim?: 'fade' | 'even';
    style?: StyleProp<ViewStyle>;
    children: React.ReactNode;
}

export default function PaintedCard({ source, borderColor, borderWidth, scrim = 'fade', style, children }: Props) {
    const { theme } = useTheme();
    return (
        // The shadow sits on this unclipped shell: overflow:'hidden' on the same view
        // would suppress it on iOS.
        <View style={[styles.shell, { borderColor, borderWidth, backgroundColor: theme.surface, ...(shadow(6) as object) }, style]}>
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: RADIUS - borderWidth }]}>
                <Image source={source} contentFit="cover" style={StyleSheet.absoluteFill} />
                {scrim === 'even' ? (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(theme.surface, EVEN_WASH) }]} />
                ) : (
                    <LinearGradient
                        colors={[withAlpha(theme.surface, SCRIM_OPACITY), withAlpha(theme.surface, 0)]}
                        locations={[0, SCRIM_END]}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={StyleSheet.absoluteFill}
                    />
                )}
            </View>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    shell: { borderRadius: RADIUS },
    clip: { overflow: 'hidden' },
});
