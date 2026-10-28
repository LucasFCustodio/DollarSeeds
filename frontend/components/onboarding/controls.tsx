/**
 * The onboarding's building blocks (ONBOARDING_REWORK.md §4, "Shared building
 * blocks"): the progress header, big tap cards, the one primary button per screen and
 * its small text-link skips, the form field, and the press-and-hold.
 *
 * Every colour, font and shadow comes from useTheme().
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, TextInput, View,
    type KeyboardTypeOptions, type TextInputProps,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Fonts, shadow, useTheme } from '../../context/ThemeContext';
import { ft } from '../../constants/responsive';
import AnimatedProgressBar from '../ui/AnimatedProgressBar';
import { IconCheck, IconChevronLeft } from '../icons';

// ── Progress header ──────────────────────────────────────────────────────────

export function ProgressHeader({ group, value, onBack, backLabel }: {
    /** The current group's name, above the bar. Null on screens 1–2 (no bar). */
    group: string | null;
    value: number;
    onBack: (() => void) | null;
    backLabel: string;
}) {
    const { theme } = useTheme();
    return (
        <View style={styles.header}>
            <View style={styles.backSlot}>
                {onBack ? (
                    <Pressable
                        onPress={onBack}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={backLabel}
                        style={({ pressed }) => [styles.back, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && { opacity: 0.6 }]}
                    >
                        <IconChevronLeft size={20} color={theme.ink} />
                    </Pressable>
                ) : null}
            </View>
            {group ? (
                <View style={styles.progress}>
                    <Text style={[styles.group, { color: theme.ink2 }]} numberOfLines={1}>{group}</Text>
                    <AnimatedProgressBar value={Math.round(value * 100)} color={theme.brand2} bg={theme.borderSoft} height={8} />
                </View>
            ) : <View style={styles.progress} />}
        </View>
    );
}

// ── Tap cards ────────────────────────────────────────────────────────────────

export function TapCard({ label, hint, icon, selected, onPress, multi = false, compact = false }: {
    label: string;
    hint?: string;
    icon?: React.ReactNode;
    selected: boolean;
    onPress: () => void;
    /** A checkbox (multi-select) rather than a radio. */
    multi?: boolean;
    /** Two per row. */
    compact?: boolean;
}) {
    const { theme } = useTheme();
    return (
        <Pressable
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={multi ? { checked: selected } : { selected }}
            accessibilityLabel={hint ? `${label}. ${hint}` : label}
            style={({ pressed }) => [
                styles.card,
                compact && styles.cardCompact,
                {
                    backgroundColor: selected ? theme.brandSoft : theme.surface,
                    borderColor: selected ? theme.brand : theme.border,
                },
                selected ? null : shadow(2),
                pressed && { opacity: 0.85 },
            ]}
        >
            {icon ? <View style={[styles.cardIcon, compact && styles.cardIconCompact]}>{icon}</View> : null}
            <View style={styles.cardText}>
                <Text style={[styles.cardLabel, { color: theme.ink }]}>{label}</Text>
                {hint ? <Text style={[styles.cardHint, { color: theme.ink2 }]}>{hint}</Text> : null}
            </View>
            <View
                style={[
                    styles.check,
                    multi ? styles.checkSquare : null,
                    { borderColor: selected ? theme.brand : theme.borderStrong, backgroundColor: selected ? theme.brand : 'transparent' },
                ]}
            >
                {selected ? <IconCheck size={13} color={theme.onBrand} /> : null}
            </View>
        </Pressable>
    );
}

export function CardGrid({ children }: { children: React.ReactNode }) {
    return <View style={styles.grid}>{children}</View>;
}

// ── Buttons ──────────────────────────────────────────────────────────────────

/** The screen's ONE primary button. Disabled until the step is valid. */
export function PrimaryButton({ label, onPress, disabled = false, busy = false }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    busy?: boolean;
}) {
    const { theme } = useTheme();
    const off = disabled || busy;
    return (
        <Pressable
            onPress={off ? undefined : onPress}
            accessibilityRole="button"
            accessibilityState={{ disabled: off, busy }}
            style={({ pressed }) => [
                styles.primary,
                { backgroundColor: disabled ? theme.border : theme.brand },
                disabled ? null : shadow(4, theme.brand),
                (pressed || busy) && !disabled && { opacity: 0.85 },
            ]}
        >
            <Text style={[styles.primaryText, { color: disabled ? theme.ink3 : theme.onBrand }]}>{label}</Text>
        </Pressable>
    );
}

/** A skip or side path: small text under the primary button, never a second button. */
export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
    const { theme } = useTheme();
    return (
        <Pressable onPress={onPress} hitSlop={10} accessibilityRole="link" style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
            <Text style={[styles.linkText, { color: theme.ink2 }]}>{label}</Text>
        </Pressable>
    );
}

// ── Field ────────────────────────────────────────────────────────────────────

/**
 * A text field. `label` only on screens with more than one field (a one-field
 * screen's question IS the label — pass `accessibilityLabel` then). `validate` runs
 * when the field loses focus, never per keystroke; once an error shows, it clears the
 * moment the input becomes valid.
 */
export function Field({
    label, accessibilityLabel, value, onChangeText, validate, helper, placeholder, keyboardType,
    secure = false, showLabel, hideLabel, prefix, autoFocus, textContentType, autoComplete, autoCapitalize,
    maxLength, returnKeyType, onSubmitEditing,
}: {
    label?: string;
    accessibilityLabel?: string;
    value: string;
    onChangeText: (next: string) => void;
    /** Returns the error message, or null when valid. */
    validate?: (value: string) => string | null;
    helper?: React.ReactNode;
    placeholder?: string;
    keyboardType?: KeyboardTypeOptions;
    secure?: boolean;
    showLabel?: string;
    hideLabel?: string;
    prefix?: string;
    autoFocus?: boolean;
    textContentType?: TextInputProps['textContentType'];
    autoComplete?: TextInputProps['autoComplete'];
    autoCapitalize?: TextInputProps['autoCapitalize'];
    maxLength?: number;
    returnKeyType?: TextInputProps['returnKeyType'];
    onSubmitEditing?: () => void;
}) {
    const { theme } = useTheme();
    const [error, setError] = useState<string | null>(null);
    const [hidden, setHidden] = useState(true);

    const change = (next: string) => {
        onChangeText(next);
        if (error && validate && validate(next) === null) setError(null);
    };

    return (
        <View style={styles.field}>
            {label ? <Text style={[styles.fieldLabel, { color: theme.ink2 }]}>{label}</Text> : null}
            <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: error ? theme.danger : theme.border }]}>
                {prefix ? <Text style={[styles.prefix, { color: theme.ink2 }]}>{prefix}</Text> : null}
                <TextInput
                    style={[styles.input, { color: theme.ink }]}
                    value={value}
                    onChangeText={change}
                    onBlur={() => validate && setError(validate(value))}
                    placeholder={placeholder}
                    placeholderTextColor={theme.ink3}
                    keyboardType={keyboardType}
                    secureTextEntry={secure && hidden}
                    autoFocus={autoFocus}
                    textContentType={textContentType}
                    autoComplete={autoComplete}
                    autoCapitalize={autoCapitalize}
                    autoCorrect={!secure && keyboardType !== 'email-address'}
                    maxLength={maxLength}
                    returnKeyType={returnKeyType}
                    onSubmitEditing={onSubmitEditing}
                    accessibilityLabel={label ?? accessibilityLabel}
                />
                {secure ? (
                    <Pressable
                        onPress={() => setHidden(h => !h)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={hidden ? showLabel : hideLabel}
                    >
                        <EyeIcon open={!hidden} color={theme.ink2} />
                    </Pressable>
                ) : null}
            </View>
            {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
            {!error && helper ? <View style={styles.helper}>{helper}</View> : null}
        </View>
    );
}

function EyeIcon({ open, color }: { open: boolean; color: string }) {
    return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.7} />
            <Path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" stroke={color} strokeWidth={1.7} />
            {open ? null : <Path d="M4 4l16 16" stroke={color} strokeWidth={1.7} strokeLinecap="round" />}
        </Svg>
    );
}

// ── Press and hold ───────────────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING = 64;
const STROKE = 5;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

/**
 * Hold about 1.5 s to commit; a filling ring shows how far along. Letting go early
 * drains it. Reverent, not gamified: one soft haptic at the end, nothing else.
 * With Reduce Motion on, the ring still fills (it is the only feedback) but linearly.
 */
export function HoldButton({ label, onComplete, done = false, durationMs = 1500 }: {
    label: string;
    onComplete: () => void;
    done?: boolean;
    durationMs?: number;
}) {
    const { theme } = useTheme();
    const progress = useRef(new Animated.Value(done ? 1 : 0)).current;
    const anim = useRef<Animated.CompositeAnimation | null>(null);
    const [reduce, setReduce] = useState(false);

    useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {}); }, []);
    useEffect(() => { if (done) progress.setValue(1); }, [done, progress]);

    const start = () => {
        if (done) return;
        anim.current?.stop();
        anim.current = Animated.timing(progress, {
            toValue: 1,
            duration: durationMs,
            easing: reduce ? Easing.linear : Easing.inOut(Easing.quad),
            useNativeDriver: false,
        });
        anim.current.start(({ finished }) => {
            if (!finished) return;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            onComplete();
        });
    };
    const cancel = () => {
        if (done) return;
        anim.current?.stop();
        Animated.timing(progress, { toValue: 0, duration: 250, useNativeDriver: false }).start();
    };

    const offset = progress.interpolate({ inputRange: [0, 1], outputRange: [CIRC, 0] });

    return (
        <Pressable
            onPressIn={start}
            onPressOut={cancel}
            // Screen readers can't hold: a double-tap commits.
            onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'activate' && !done) onComplete(); }}
            accessibilityActions={[{ name: 'activate' }]}
            accessibilityRole="button"
            accessibilityState={{ checked: done }}
            accessibilityLabel={label}
            style={[styles.hold, { backgroundColor: done ? theme.brand : theme.surface, borderColor: theme.brand }, shadow(3, theme.brand)]}
        >
            <Svg width={RING} height={RING}>
                <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={done ? theme.onBrand : theme.borderSoft} strokeWidth={STROKE} fill="none" opacity={done ? 0.35 : 1} />
                <AnimatedCircle
                    cx={RING / 2} cy={RING / 2} r={R}
                    stroke={done ? theme.onBrand : theme.brand2}
                    strokeWidth={STROKE}
                    fill="none"
                    strokeDasharray={`${CIRC} ${CIRC}`}
                    strokeDashoffset={offset as unknown as number}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
                />
            </Svg>
            <Text style={[styles.holdText, { color: done ? theme.onBrand : theme.ink }]}>{label}</Text>
        </Pressable>
    );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, marginBottom: 8 },
    backSlot: { width: 40 },
    back: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    progress: { flex: 1, gap: 6 },
    group: { fontFamily: Fonts.monoSemiBold, fontSize: ft(11), letterSpacing: 1.4, textTransform: 'uppercase' },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    card: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderWidth: 2, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 14,
        width: '100%', minHeight: 64,
    },
    cardCompact: { width: '48%', flexDirection: 'column', alignItems: 'flex-start', minHeight: 108, gap: 8 },
    cardIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    cardIconCompact: { width: 44, height: 44 },
    cardText: { flex: 1, gap: 2, alignSelf: 'stretch', justifyContent: 'center' },
    cardLabel: { fontFamily: Fonts.sansSemiBold, fontSize: ft(16), lineHeight: ft(21) },
    cardHint: { fontFamily: Fonts.sans, fontSize: ft(13), lineHeight: ft(18) },
    check: {
        position: 'absolute', top: 10, right: 10,
        width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    },
    checkSquare: { borderRadius: 6 },

    primary: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontFamily: Fonts.sansSemiBold, fontSize: ft(17) },
    link: { alignSelf: 'center', paddingVertical: 12 },
    linkText: { fontFamily: Fonts.sansMedium, fontSize: ft(15), textDecorationLine: 'underline' },

    field: { gap: 6, marginBottom: 14 },
    fieldLabel: { fontFamily: Fonts.sansMedium, fontSize: ft(13) },
    inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, gap: 6 },
    prefix: { fontFamily: Fonts.serif, fontSize: ft(22) },
    input: { flex: 1, paddingVertical: 14, fontFamily: Fonts.sans, fontSize: ft(17) },
    error: { fontFamily: Fonts.sansMedium, fontSize: ft(13) },
    helper: { marginTop: 2 },

    hold: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        borderWidth: 2, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 14,
    },
    holdText: { flex: 1, fontFamily: Fonts.sansSemiBold, fontSize: ft(16), lineHeight: ft(22) },
});
