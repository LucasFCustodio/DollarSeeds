/**
 * TitheToggle — a small switch for "I have given this month's tithe".
 *
 * Hand-rolled rather than react-native's <Switch> because that renders at a fixed
 * platform size (~51×31 on iOS) which crowds the envelope, and because its track
 * colour is the one thing here that has to sit in the app's palette rather than the
 * OS's. Enlarged on tablets only (tv()).
 *
 * `outline` draws a 1pt ring round the track, for when it sits on painted art: the
 * pale off-state track alone measures ~1.1:1 against the tithe card's painting.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { type AppTheme } from '../../context/ThemeContext';
import { tv } from '../../constants/responsive';

const TOGGLE_W = tv(44, 56);
const TOGGLE_H = tv(24, 30);
const THUMB = tv(18, 23);
const TOGGLE_INSET = 3;
const THUMB_TRAVEL = TOGGLE_W - THUMB - TOGGLE_INSET * 2;
const OUTLINE = 1;

export default function TitheToggle({
    theme, value, disabled, onToggle, a11yLabel, outline,
}: {
    theme: AppTheme;
    value: boolean;
    disabled: boolean;
    onToggle: () => void;
    a11yLabel: string;
    /** A ring colour for the track; none by default. */
    outline?: string;
}) {
    // One driver for both the slide and the track colour. useNativeDriver has to be
    // false: backgroundColor is not a transform and cannot cross to the UI thread.
    const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(anim, { toValue: value ? 1 : 0, duration: 180, useNativeDriver: false }).start();
    }, [value, anim]);

    const trackColor = anim.interpolate({ inputRange: [0, 1], outputRange: [theme.borderSoft, theme.brand2] });
    const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, THUMB_TRAVEL] });

    return (
        <Pressable
            onPress={onToggle}
            disabled={disabled}
            accessibilityRole="switch"
            accessibilityState={{ checked: value, disabled }}
            accessibilityLabel={a11yLabel}
            // The switch is deliberately small; hitSlop keeps the TAP target at the
            // 44pt minimum in every direction.
            hitSlop={12}
            style={({ pressed }) => [(pressed || disabled) && { opacity: 0.6 }]}
        >
            <Animated.View style={[
                styles.track,
                { backgroundColor: trackColor },
                // The ring eats into the inset, so the thumb's position and travel stay put.
                outline ? { borderWidth: OUTLINE, borderColor: outline, padding: TOGGLE_INSET - OUTLINE } : null,
            ]}>
                <Animated.View style={[styles.thumb, { backgroundColor: theme.surface, transform: [{ translateX }] }]} />
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    track: {
        width: TOGGLE_W,
        height: TOGGLE_H,
        borderRadius: TOGGLE_H / 2,
        padding: TOGGLE_INSET,
        justifyContent: 'center',
    },
    thumb: {
        width: THUMB,
        height: THUMB,
        borderRadius: THUMB / 2,
        // Without a lift the thumb disappears into the pale off-state track.
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        elevation: 2,
    },
});
