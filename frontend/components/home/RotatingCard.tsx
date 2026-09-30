/**
 * RotatingCard — one card that cycles through a short list of one-line items.
 * Used by the status block and the encouragement container on the home.
 *
 * - Falsy entries are dropped before rendering, so a caller lists every item it
 *   could show and writes `cond && item`; whatever has data fills the rotation.
 * - Two or more items advance every 4 s, the new one sliding in from the right.
 *   One item is static, and there are no page dots.
 * - Paused while the screen is not focused or the app is in the background.
 * - With the OS "Reduce Motion" setting on, items crossfade instead of sliding.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export interface RotatingItem {
    /** Stable across refreshes, so a data reload does not restart the rotation. */
    key: string;
    content: React.ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
}

interface Props {
    items: (RotatingItem | null | undefined | false)[];
    style?: StyleProp<ViewStyle>;
    dotColor: string;
    dotActiveColor: string;
    intervalMs?: number;
}

const INTERVAL_MS = 4000;
const SLIDE_MS = 420;

function useReduceMotion() {
    const [reduce, setReduce] = useState(false);
    useEffect(() => {
        let alive = true;
        AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setReduce(v); }).catch(() => {});
        const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
        return () => { alive = false; sub.remove(); };
    }, []);
    return reduce;
}

function useAppActive() {
    const [active, setActive] = useState(AppState.currentState === 'active');
    useEffect(() => {
        const sub = AppState.addEventListener('change', s => setActive(s === 'active'));
        return () => sub.remove();
    }, []);
    return active;
}

export default function RotatingCard({ items, style, dotColor, dotActiveColor, intervalMs = INTERVAL_MS }: Props) {
    const list = useMemo(() => items.filter((i): i is RotatingItem => !!i), [items]);
    const keys = list.map(i => i.key).join('|');

    const [index, setIndex] = useState(0);
    const indexRef = useRef(0);
    const [prevIndex, setPrevIndex] = useState<number | null>(null);
    const [width, setWidth] = useState(0);
    const progress = useSharedValue(1);

    const focused = useIsFocused();
    const appActive = useAppActive();
    const reduceMotion = useReduceMotion();
    const running = list.length > 1 && focused && appActive;

    // A different set of items (a refresh that added or dropped one) starts over at
    // the first, rather than landing on whatever now sits at the old index.
    const lastKeys = useRef(keys);
    useEffect(() => {
        if (lastKeys.current === keys) return;
        lastKeys.current = keys;
        indexRef.current = 0;
        setIndex(0);
        setPrevIndex(null);
        progress.value = 1;
    }, [keys, progress]);

    useEffect(() => {
        if (!running) return;
        const id = setInterval(() => {
            const from = indexRef.current % list.length;
            indexRef.current = (from + 1) % list.length;
            setPrevIndex(from);
            setIndex(indexRef.current);
            progress.value = 0;
            progress.value = withTiming(1, { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) });
        }, intervalMs);
        return () => clearInterval(id);
    }, [running, list.length, intervalMs, progress]);

    const incomingStyle = useAnimatedStyle(() => (reduceMotion
        ? { opacity: progress.value }
        : { transform: [{ translateX: (1 - progress.value) * width }] }));
    const outgoingStyle = useAnimatedStyle(() => (reduceMotion
        ? { opacity: 1 - progress.value }
        : { transform: [{ translateX: -progress.value * width }] }));

    if (list.length === 0) return null;
    const safeIndex = index % list.length;
    const current = list[safeIndex];
    const previous = prevIndex != null && prevIndex < list.length && prevIndex !== safeIndex ? list[prevIndex] : null;

    return (
        <Pressable
            onPress={current.onPress}
            disabled={!current.onPress}
            accessibilityRole={current.onPress ? 'button' : 'text'}
            accessibilityLabel={current.accessibilityLabel}
            style={({ pressed }) => [style, pressed && { transform: [{ scale: 0.98 }] }]}
        >
            <View style={styles.clip} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
                <Animated.View key={`in-${current.key}`} style={list.length > 1 ? incomingStyle : undefined}>
                    {current.content}
                </Animated.View>
                {previous ? (
                    <Animated.View
                        key={`out-${previous.key}`}
                        pointerEvents="none"
                        style={[StyleSheet.absoluteFill, outgoingStyle]}
                    >
                        {previous.content}
                    </Animated.View>
                ) : null}
            </View>
            {list.length > 1 ? (
                <View style={styles.dots} importantForAccessibility="no-hide-descendants">
                    {list.map((item, i) => (
                        <View
                            key={item.key}
                            style={[styles.dot, { backgroundColor: i === safeIndex ? dotActiveColor : dotColor }]}
                        />
                    ))}
                </View>
            ) : null}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    clip: { overflow: 'hidden' },
    dots: { flexDirection: 'row', gap: 4, marginTop: 8 },
    dot: { width: 5, height: 5, borderRadius: 999 },
});
