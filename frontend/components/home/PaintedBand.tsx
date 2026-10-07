/**
 * PaintedBand — a home band drawn on the painted watercolour wash (analyze-bg.png),
 * the same Version A style as the painted cards. Only the top (Analyze) band uses
 * it: calm forest at the top, the misty field at the bottom. The green is reserved
 * for that band; Envision sits on the flat bgDeep cream.
 *
 * - The band's height comes from its children, never from the image: the art is
 *   `cover`, so a short band crops it and a tall one scales it.
 * - `anchor` is the edge of the art that stays pinned when the band is shorter than
 *   the art; the crop comes off the other end.
 * - paintedForest fills the band while the art loads.
 *
 * Corner radii in `style` also clip the art, on an inner layer: overflow:'hidden' on
 * the outer view would suppress its iOS shadow.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../context/ThemeContext';

const ART = require('../../assets/images/home/analyze-bg.png');

const RADII = [
    'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
    'borderBottomLeftRadius', 'borderBottomRightRadius',
] as const;

interface Props {
    anchor: 'top' | 'bottom';
    style?: StyleProp<ViewStyle>;
    children: React.ReactNode;
}

export default function PaintedBand({ anchor, style, children }: Props) {
    const { theme } = useTheme();
    const flat = StyleSheet.flatten(style) ?? {};
    const radii: ViewStyle = {};
    for (const k of RADII) if (flat[k] != null) (radii as Record<string, unknown>)[k] = flat[k];

    return (
        <View style={[{ backgroundColor: theme.paintedForest }, style]}>
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, radii]}>
                <Image
                    source={ART}
                    contentFit="cover"
                    contentPosition={anchor}
                    style={StyleSheet.absoluteFill}
                />
            </View>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    clip: { overflow: 'hidden' },
});
