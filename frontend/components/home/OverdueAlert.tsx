/**
 * OverdueAlert — the overdue warning: a small harvest pill in the home's top bar,
 * "! {n}", that opens OverdueModal with every overdue debt. The parent renders it
 * only when a debt is overdue (overdue_count > 0, Debt Freedom on and premium).
 *
 * It pulses to draw the eye: two beats (scale 1 → 1.12 → 1, 600 ms each), then a
 * 6 s rest, looping, on the UI thread. The loop pauses while the home is not the
 * focused screen or the app is in the background, stops for the rest of the app
 * session once the modal has been opened, and never runs with Reduce Motion on.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Animated, {
    cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { Fonts, useTheme } from '../../context/ThemeContext';
import type { OverdueDebt } from '../../lib/homeSummary';
import { useAppActive, useReduceMotion } from './RotatingCard';
import OverdueModal from './OverdueModal';
import { homeType } from './homeType';

/** Half of one 600 ms beat: up, then back down. */
const HALF_BEAT_MS = 300;
const REST_MS = 6000;
const PEAK = 1.12;

// Once the modal has been opened the user has seen the alert: no more pulsing until
// the next app launch. Plain module state on purpose.
let openedThisSession = false;

interface Props {
    count: number;
    /** Undefined from a backend older than debts.overdue. */
    debts?: OverdueDebt[];
    /** Opens the Debts tab, on that debt when given. */
    onOpenDebts: (debtId?: number) => void;
}

export default function OverdueAlert({ count, debts, onOpenDebts }: Props) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    const [visible, setVisible] = useState(false);
    const [opened, setOpened] = useState(openedThisSession);

    const focused = useIsFocused();
    const appActive = useAppActive();
    const reduceMotion = useReduceMotion();
    const running = focused && appActive && !reduceMotion && !opened;

    const scale = useSharedValue(1);
    useEffect(() => {
        if (!running) {
            cancelAnimation(scale);
            scale.value = 1;
            return;
        }
        const ease = Easing.inOut(Easing.quad);
        const beat = () => withSequence(
            withTiming(PEAK, { duration: HALF_BEAT_MS, easing: ease }),
            withTiming(1, { duration: HALF_BEAT_MS, easing: ease }),
        );
        // The rest is a timing from 1 to 1: it holds still for REST_MS.
        scale.value = withRepeat(withSequence(beat(), beat(), withTiming(1, { duration: REST_MS })), -1);
        return () => cancelAnimation(scale);
    }, [running, scale]);
    const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    const open = () => {
        openedThisSession = true;
        setOpened(true);
        setVisible(true);
    };

    return (
        <>
            <Animated.View style={pulseStyle}>
                <Pressable
                    onPress={open}
                    accessibilityRole="button"
                    accessibilityLabel={t('overdueAlert.buttonA11y', { count })}
                    style={({ pressed }) => [styles.pill, { backgroundColor: theme.harvest }, pressed && { opacity: 0.8 }]}
                >
                    <Text style={[homeType.medium, styles.bang, { color: theme.ink }]}>!</Text>
                    <Text style={[homeType.medium, { color: theme.ink }]}>{count}</Text>
                </Pressable>
            </Animated.View>
            <OverdueModal
                visible={visible}
                count={count}
                debts={debts}
                onClose={() => setVisible(false)}
                onReview={debtId => { setVisible(false); onOpenDebts(debtId); }}
            />
        </>
    );
}

const styles = StyleSheet.create({
    // The top bar's 38 pt button height.
    pill: {
        height: 38, borderRadius: 999, paddingHorizontal: 12,
        flexDirection: 'row', alignItems: 'center', gap: 4,
    },
    bang: { fontFamily: Fonts.sansBold },
});
