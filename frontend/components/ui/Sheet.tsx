/**
 * Sheet — the app's one bottom-sheet shell: backdrop, grabber, title and subtitle.
 * Shared by every Debts sheet (extra payment, statement check-in, late fee, plan
 * settings) and the home's progress graph.
 *
 * Closes three ways: a tap on the backdrop, the Android back button
 * (onRequestClose), and a swipe down on the grabber/title area. The swipe is bound
 * to the header only, so it never fights a ScrollView or a text field in the body.
 *
 * `heightRatio` gives the sheet a fixed share of the screen height (the graph sheet
 * uses 0.8); without it the sheet is as tall as its content.
 *
 * The Modal is its own native root on Android, so its content sits in a
 * GestureHandlerRootView for the swipe to work there.
 */
import React, { useEffect } from 'react';
import {
    KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts, shadow, useTheme } from '../../context/ThemeContext';

/** A swipe past this distance, or faster than this velocity, closes the sheet. */
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 900;

interface Props {
    visible: boolean;
    onClose: () => void;
    /** Accessibility label for the backdrop, which closes the sheet. */
    closeLabel: string;
    title: string;
    subtitle?: string;
    /** Fixed height as a share of the screen height (0–1). Content-sized when omitted. */
    heightRatio?: number;
    children: React.ReactNode;
}

export default function Sheet({ visible, onClose, closeLabel, title, subtitle, heightRatio, children }: Props) {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const { height: screenHeight } = useWindowDimensions();
    const drag = useSharedValue(0);

    // Every opening starts from rest, including after a swipe-close.
    useEffect(() => {
        if (visible) drag.value = 0;
    }, [visible, drag]);

    const swipe = Gesture.Pan()
        .activeOffsetY(8)
        .failOffsetX([-24, 24])
        .onUpdate(e => {
            drag.value = Math.max(0, e.translationY);
        })
        .onEnd(e => {
            if (e.translationY > CLOSE_DISTANCE || e.velocityY > CLOSE_VELOCITY) {
                drag.value = withTiming(screenHeight, { duration: 180 }, done => {
                    if (done) runOnJS(onClose)();
                });
            } else {
                drag.value = withSpring(0, { damping: 20, stiffness: 220 });
            }
        });

    const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drag.value }] }));

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <GestureHandlerRootView style={styles.fill}>
                <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Pressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
                    {visible ? (
                        <Animated.View
                            style={[
                                styles.sheet,
                                {
                                    backgroundColor: theme.surface, borderColor: theme.ink,
                                    paddingBottom: 20 + insets.bottom, ...(shadow(10) as object),
                                },
                                heightRatio ? { height: screenHeight * heightRatio } : null,
                                dragStyle,
                            ]}
                        >
                            <GestureDetector gesture={swipe}>
                                <View>
                                    <View style={[styles.grabber, { backgroundColor: theme.border }]} />
                                    <Text style={[styles.title, { color: theme.ink, fontFamily: Fonts.serif }]}>{title}</Text>
                                    {subtitle ? (
                                        <Text style={[styles.sub, { color: theme.ink2, fontFamily: Fonts.sansSemiBold }]}>{subtitle}</Text>
                                    ) : <View style={styles.gap} />}
                                </View>
                            </GestureDetector>
                            {children}
                        </Animated.View>
                    ) : null}
                </KeyboardAvoidingView>
            </GestureHandlerRootView>
        </Modal>
    );
}

export const sheetStyles = StyleSheet.create({
    hint: { fontSize: 12, marginTop: -2 },
    body: { fontSize: 15, lineHeight: 21, marginBottom: 12 },
    error: { fontSize: 13, marginTop: 10 },
    buttons: { gap: 6, marginTop: 16 },
});

const styles = StyleSheet.create({
    fill: { flex: 1 },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1.5, borderBottomWidth: 0, paddingHorizontal: 20, paddingTop: 10 },
    grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, marginBottom: 12 },
    title: { fontSize: 28 },
    sub: { fontSize: 14, marginBottom: 14 },
    gap: { height: 10 },
});
