/**
 * PlantView — draws one debt's plant, and plays its moments.
 *
 * This is the v1 implementation: layered SVGs (react-native-svg) animated with
 * Reanimated on the UI thread, transform and opacity only. A Rive implementation is
 * planned to replace it behind the SAME interface — `PlantViewProps` plus the
 * imperative `PlantViewHandle` — so no screen may know how a plant is drawn. Screens
 * pass state in and call triggers; nothing else.
 *
 * Layering (every layer is a full 1000 × 1250 canvas, so they line up 1:1):
 *   back (stems behind the pot) → pot → pot label (RN text) → front → flytrap top
 * Paid off is one static file plus the stake-tag text.
 *
 * Nothing loops. An animation runs only when a trigger is called and `active` is
 * true; with `active` false, or Reduce Motion on, every trigger lands straight on
 * its end state.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
    cancelAnimation,
    Easing,
    SharedValue,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Fonts, useTheme } from '../../context/ThemeContext';
import type { PlantState, Species } from '../../lib/debtFreedom';
import { POT_KIT, SPECIES_ART } from './plantAssets';
import {
    Box, CANVAS_H, CANVAS_RATIO, CANVAS_W, FRAGMENT_FALLS, ILLUSTRATION_COLORS,
    POT_LABEL_BOX, SOIL_TOP, clampSpecies, clampStep, stakeTagOf,
} from './art';

export type PaymentKind = 'minimum' | 'extra';

export interface PlantViewHandle {
    /** Water drops: a few for a minimum, more plus a splash with extra. The grow
     *  transition to the new `growthStep` waits for the drops to land. */
    playPayment: (kind: PaymentKind) => void;
    /** The paid-off sequence. Resolves when it ends or is skipped. */
    playComplete: () => Promise<void>;
    /** The seed drops into the soil (once, on creation). */
    playPlant: () => void;
    /** Flytrap only: the bug flies in, is caught, gone. Never loops. */
    playBug: () => void;
}

export interface PlantViewProps {
    species: Species;
    growthStep: number;
    state: PlantState;
    isFocus: boolean;
    /** Only the settled, on-screen plant animates. */
    active: boolean;
    /** Rendered width in px; height is width × 1.25. */
    width: number;
    /** Rendered over the pot's label panel. Hidden once the pot breaks. */
    potLabel?: React.ReactNode;
    /** Rendered over the stake's tag once the debt is paid off. */
    stakeLabel?: React.ReactNode;
}

const DROP_FALL_MS = 520;
const DROP_STAGGER_MS = 130;
const GROW_MS = 650;
const BUG_STEP_MIN = 5;

// Where the drops land: spread across the soil, in canvas units.
const DROP_XS = [455, 540, 500, 420, 580, 470, 530, 390, 610];
const SOIL_Y = SOIL_TOP.y + 14;

const at = (box: Box, s: number) => ({
    position: 'absolute' as const,
    left: box.x * s,
    top: box.y * s,
    width: box.width * s,
    height: box.height * s,
});

function hasBugArt(species: number, step: number) {
    return species === 3 && step >= BUG_STEP_MIN && !!SPECIES_ART[3].frames[step]?.bugA;
}

const PlantView = forwardRef<PlantViewHandle, PlantViewProps>(function PlantView(
    { species: speciesIn, growthStep, state, active, width, potLabel, stakeLabel },
    ref,
) {
    const { theme } = useTheme();
    const { t } = useTranslation('debts');
    const reduceMotion = useReducedMotion();
    const species = clampSpecies(speciesIn);
    const step = clampStep(growthStep);
    const art = SPECIES_ART[species];
    const s = width / CANVAS_W;
    const height = width * CANVAS_RATIO;
    const animate = active && !reduceMotion;

    // ── timers: every sequence is a chain of timeouts driving UI-thread animations
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const later = useCallback((ms: number, fn: () => void) => {
        timers.current.push(setTimeout(fn, ms));
    }, []);
    const clearTimers = useCallback(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
    }, []);
    useEffect(() => clearTimers, [clearTimers]);

    // ── grow transition (crossfade previous frame → new frame)
    const [shownStep, setShownStep] = useState(step);
    const [prevStep, setPrevStep] = useState<number | null>(null);
    const grow = useSharedValue(1);
    const dropsUntil = useRef(0);

    useEffect(() => {
        if (step === shownStep) return;
        if (!animate) {
            setPrevStep(null);
            setShownStep(step);
            return;
        }
        const wait = Math.max(0, dropsUntil.current - Date.now());
        setPrevStep(shownStep);
        setShownStep(step);
        grow.value = 0;
        grow.value = withDelay(wait, withTiming(1, { duration: GROW_MS, easing: Easing.out(Easing.cubic) }));
        later(wait + GROW_MS + 30, () => setPrevStep(null));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    const newLayerStyle = useAnimatedStyle(() => ({
        opacity: grow.value,
        transform: [{ scale: 0.965 + 0.035 * grow.value }],
    }));
    const oldLayerStyle = useAnimatedStyle(() => ({ opacity: 1 - grow.value }));

    // ── drops
    const dropT = useSharedValue(0);
    const [drops, setDrops] = useState(0);
    const [splash, setSplash] = useState(false);

    // ── seed planting
    const seedY = useSharedValue(0);
    const [planting, setPlanting] = useState(false);
    const seedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: seedY.value * s }] }));

    // ── bug (flytrap)
    type BugPhase = null | 'a' | 'b' | 'snap' | 'puff';
    const [bugPhase, setBugPhase] = useState<BugPhase>(null);
    const bugX = useSharedValue(0);
    const bugY = useSharedValue(0);
    const puffT = useSharedValue(0);
    const bugStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: bugX.value * s }, { translateY: bugY.value * s }],
    }));
    const puffStyle = useAnimatedStyle(() => ({
        opacity: 1 - puffT.value,
        transform: [{ translateY: -30 * puffT.value * s }],
    }));

    // ── completion
    type CompletePhase = null | 'roots' | 'break' | 'glare' | 'stake';
    const [completing, setCompleting] = useState<CompletePhase>(null);
    const completeResolve = useRef<(() => void) | null>(null);
    const shake = useSharedValue(0);
    const swell = useSharedValue(0);
    const fall = useSharedValue(0);
    const glare = useSharedValue(0);
    const sweep = useSharedValue(0);
    const stakeIn = useSharedValue(0);

    const potShakeStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: shake.value * 6 * s },
            { scaleX: 1 + 0.035 * swell.value },
            { scaleY: 1 + 0.015 * swell.value },
        ],
    }));
    const glareStyle = useAnimatedStyle(() => ({ opacity: glare.value }));
    const sweepStyle = useAnimatedStyle(() => ({
        opacity: glare.value,
        transform: [{ translateX: (-700 + 1400 * sweep.value) * s }, { rotate: '18deg' }],
    }));
    const stakeLayerStyle = useAnimatedStyle(() => ({ opacity: stakeIn.value }));
    const stakeLabelStyle = useAnimatedStyle(() => ({
        opacity: stakeIn.value,
        transform: [{ scale: 0.7 + 0.3 * stakeIn.value }],
    }));

    const finishComplete = useCallback(() => {
        clearTimers();
        [shake, swell, fall, glare, sweep, stakeIn].forEach(v => cancelAnimation(v));
        shake.value = 0;
        swell.value = 0;
        fall.value = 1;
        glare.value = 0;
        stakeIn.value = 1;
        setCompleting(null);
        const done = completeResolve.current;
        completeResolve.current = null;
        done?.();
    }, [clearTimers, shake, swell, fall, glare, sweep, stakeIn]);

    // Losing the screen mid-animation lands everything on its end state.
    useEffect(() => {
        if (active) return;
        if (completing) finishComplete();
        clearTimers();
        setDrops(0);
        setSplash(false);
        setPlanting(false);
        setBugPhase(null);
        setPrevStep(null);
        grow.value = 1;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    useImperativeHandle(ref, () => ({
        playPayment(kind) {
            if (!animate) return;
            const count = kind === 'extra' ? 8 : 4;
            const total = DROP_FALL_MS + DROP_STAGGER_MS * (count - 1) + (kind === 'extra' ? 380 : 0);
            dropsUntil.current = Date.now() + total;
            setDrops(count);
            setSplash(kind === 'extra');
            dropT.value = 0;
            dropT.value = withTiming(total, { duration: total, easing: Easing.linear });
            later(total + 20, () => { setDrops(0); setSplash(false); });
        },
        playComplete() {
            return new Promise<void>(resolve => {
                completeResolve.current = resolve;
                if (!animate) {
                    finishComplete();
                    return;
                }
                fall.value = 0;
                glare.value = 0;
                sweep.value = 0;
                stakeIn.value = 0;
                // 1. roots expand: the pot strains and swells
                setCompleting('roots');
                swell.value = withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) });
                shake.value = withSequence(
                    ...[1, -1, 1.4, -1.4, 1.8, -1.8, 2.2, -2.2, 0].map(v =>
                        withTiming(v, { duration: 100 })),
                );
                // 2. the pot breaks; fragments fall with gravity and settle
                later(950, () => {
                    setCompleting('break');
                    swell.value = 0;
                    fall.value = withTiming(1, { duration: 900, easing: Easing.in(Easing.quad) });
                });
                // 3. a three-second glare
                later(1950, () => {
                    setCompleting('glare');
                    glare.value = withSequence(
                        withTiming(0.9, { duration: 600 }),
                        withTiming(0.9, { duration: 1800 }),
                        withTiming(0, { duration: 600 }),
                    );
                    sweep.value = withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.quad) });
                });
                // 4. the stake appears with its tag
                later(5000, () => {
                    setCompleting('stake');
                    stakeIn.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.6)) });
                });
                later(5700, finishComplete);
            });
        },
        playPlant() {
            if (!animate) return;
            setPlanting(true);
            seedY.value = -520;
            seedY.value = withSequence(
                withTiming(0, { duration: 650, easing: Easing.in(Easing.quad) }),
                withTiming(-26, { duration: 140, easing: Easing.out(Easing.quad) }),
                withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) }),
            );
            later(1000, () => setPlanting(false));
        },
        playBug() {
            if (!animate || !hasBugArt(species, shownStep) || bugPhase) return;
            setBugPhase('a');
            bugX.value = 320;
            bugY.value = -260;
            bugX.value = withTiming(0, { duration: 1100, easing: Easing.out(Easing.cubic) });
            bugY.value = withSequence(
                withTiming(-120, { duration: 500, easing: Easing.out(Easing.sin) }),
                withTiming(0, { duration: 600, easing: Easing.inOut(Easing.sin) }),
            );
            later(1150, () => setBugPhase('b'));
            later(1750, () => setBugPhase('snap'));
            later(2800, () => {
                setBugPhase('puff');
                puffT.value = 0;
                puffT.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) });
            });
            later(3750, () => setBugPhase(null));
        },
    }), [animate, species, shownStep, bugPhase, later, finishComplete,
        dropT, fall, glare, sweep, stakeIn, shake, swell, seedY, bugX, bugY, puffT]);

    const canvas = { width, height };

    // ── paid off (static) — also the last beat of the completion sequence
    if (state === 'paid_off' && completing !== 'break' && completing !== 'glare' && completing !== 'roots' && completing !== 'stake') {
        const PaidOff = art.paidOff;
        const tag = stakeTagOf(species);
        return (
            <View style={canvas}>
                <PaidOff width={width} height={height} />
                {stakeLabel ? (
                    <View style={[at(tag.box, s), styles.center, { transform: [{ rotate: `${tag.rotation}deg` }] }]}>
                        {stakeLabel}
                    </View>
                ) : null}
            </View>
        );
    }

    // ── completion sequence
    if (completing && completing !== 'roots') {
        const Base = art.paidOffBase;
        const PaidOff = art.paidOff;
        const tag = stakeTagOf(species);
        return (
            <Pressable style={[canvas, styles.clip]} onPress={finishComplete} accessibilityRole="button" accessibilityLabel={t('actions.skip')}>
                <View style={StyleSheet.absoluteFill}>
                    <Base width={width} height={height} />
                </View>
                {POT_KIT.fragments.map((Frag, i) => (
                    <PotFragment key={i} index={i} fall={fall} s={s} width={width} height={height}>
                        <Frag width={width} height={height} />
                    </PotFragment>
                ))}
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glareStyle]}>
                    <Svg width={width} height={height}>
                        <Defs>
                            <RadialGradient id="glare" cx="50%" cy="45%" r="50%">
                                <Stop offset="0" stopColor={theme.harvest} stopOpacity="0.85" />
                                <Stop offset="0.6" stopColor={theme.harvest} stopOpacity="0.25" />
                                <Stop offset="1" stopColor={theme.harvest} stopOpacity="0" />
                            </RadialGradient>
                        </Defs>
                        <Rect x="0" y="0" width={width} height={height} fill="url(#glare)" />
                    </Svg>
                </Animated.View>
                <Animated.View pointerEvents="none" style={[styles.sweep, { height: height * 1.4, top: -height * 0.2, left: width / 2 - 60 * s * 2 }, sweepStyle]}>
                    <Svg width={120 * s * 2} height={height * 1.4}>
                        <Defs>
                            <LinearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
                                <Stop offset="0" stopColor={theme.surface} stopOpacity="0" />
                                <Stop offset="0.5" stopColor={theme.surface} stopOpacity="0.7" />
                                <Stop offset="1" stopColor={theme.surface} stopOpacity="0" />
                            </LinearGradient>
                        </Defs>
                        <Rect x="0" y="0" width={120 * s * 2} height={height * 1.4} fill="url(#sweep)" />
                    </Svg>
                </Animated.View>
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, stakeLayerStyle]}>
                    <PaidOff width={width} height={height} />
                </Animated.View>
                {stakeLabel ? (
                    <Animated.View pointerEvents="none" style={[at(tag.box, s), styles.center, { transform: [{ rotate: `${tag.rotation}deg` }] }]}>
                        <Animated.View style={stakeLabelStyle}>{stakeLabel}</Animated.View>
                    </Animated.View>
                ) : null}
                <SkipHint label={t('actions.skip')} color={theme.ink3} />
            </Pressable>
        );
    }

    // ── growing (seed … frame 10)
    const frame = art.frames[shownStep];
    const prev = prevStep != null ? art.frames[prevStep] : null;
    const Pot = POT_KIT.emptyPot;
    const showBug = species === 3 && bugPhase != null && !!frame.bugA;
    const Top = showBug && bugPhase === 'snap' ? frame.snap : frame.top;
    const hideFront = planting && shownStep === 0;
    const Seed = POT_KIT.seed;

    const body = (
        <View style={canvas}>
            {prev ? (
                <Animated.View style={[StyleSheet.absoluteFill, oldLayerStyle]}>
                    <prev.back width={width} height={height} />
                </Animated.View>
            ) : null}
            <Animated.View style={[StyleSheet.absoluteFill, styles.growOrigin, prev ? newLayerStyle : null]}>
                <frame.back width={width} height={height} />
            </Animated.View>

            <Animated.View style={[StyleSheet.absoluteFill, styles.potOrigin, potShakeStyle]}>
                <Pot width={width} height={height} />
                {potLabel ? <View style={at(POT_LABEL_BOX, s)}>{potLabel}</View> : null}
            </Animated.View>

            {prev ? (
                <Animated.View style={[StyleSheet.absoluteFill, oldLayerStyle]}>
                    <prev.front width={width} height={height} />
                    {prev.top ? <View style={StyleSheet.absoluteFill}><prev.top width={width} height={height} /></View> : null}
                </Animated.View>
            ) : null}
            {!hideFront ? (
                <Animated.View style={[StyleSheet.absoluteFill, styles.growOrigin, prev ? newLayerStyle : null]}>
                    <frame.front width={width} height={height} />
                    {/* Its own absolute layer: two SVGs in one View would stack in a
                        flex column and shrink to half size each. */}
                    {Top ? <View style={StyleSheet.absoluteFill}><Top width={width} height={height} /></View> : null}
                </Animated.View>
            ) : null}

            {planting ? (
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, seedStyle]}>
                    <Seed width={width} height={height} />
                </Animated.View>
            ) : null}

            {showBug && (bugPhase === 'a' || bugPhase === 'b') ? (
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, bugPhase === 'a' ? bugStyle : null]}>
                    {bugPhase === 'a' && frame.bugA ? <frame.bugA width={width} height={height} /> : null}
                    {bugPhase === 'b' && frame.bugB ? <frame.bugB width={width} height={height} /> : null}
                </Animated.View>
            ) : null}
            {showBug && bugPhase === 'puff' && frame.puff ? (
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, puffStyle]}>
                    <frame.puff width={width} height={height} />
                </Animated.View>
            ) : null}

            {drops > 0
                ? DROP_XS.slice(0, drops).map((x, i) => (
                    <Drop key={i} index={i} x={x} t={dropT} s={s} />
                ))
                : null}
            {splash ? <Splash t={dropT} start={DROP_FALL_MS + DROP_STAGGER_MS * 3} s={s} /> : null}
        </View>
    );

    if (completing === 'roots') {
        return (
            <Pressable onPress={finishComplete} accessibilityRole="button" accessibilityLabel={t('actions.skip')}>
                {body}
                <SkipHint label={t('actions.skip')} color={theme.ink3} />
            </Pressable>
        );
    }
    return body;
});

export default PlantView;

// ── pieces ──────────────────────────────────────────────────────────────────

function SkipHint({ label, color }: { label: string; color: string }) {
    return (
        <Text pointerEvents="none" style={[styles.skip, { color, fontFamily: Fonts.mono }]}>{label}</Text>
    );
}

/** One pot fragment falling from its fitted place to where it rests in the
 *  paid-off art: translate(d) · rotate(a) about the fragment's centroid c. React
 *  Native rotates about the view's centre o, so the equivalent translation is
 *  d + (c − o) − R(a)·(c − o). */
function PotFragment({ index, fall, s, width, height, children }: {
    index: number; fall: SharedValue<number>; s: number; width: number; height: number;
    children: React.ReactNode;
}) {
    const f = FRAGMENT_FALLS[index];
    const ox = CANVAS_W / 2, oy = CANVAS_H / 2;
    const rad = (f.rotate * Math.PI) / 180;
    const vx = f.cx - ox, vy = f.cy - oy;
    const tx = f.dx + vx - (vx * Math.cos(rad) - vy * Math.sin(rad));
    const ty = f.dy + vy - (vx * Math.sin(rad) + vy * Math.cos(rad));
    // A small per-fragment delay so they don't drop as one slab.
    const delay = (index % 4) * 0.06;
    const style = useAnimatedStyle(() => {
        const p = Math.min(1, Math.max(0, (fall.value - delay) / (1 - delay)));
        return {
            transform: [
                { translateX: tx * p * s },
                { translateY: ty * p * s },
                { rotate: `${f.rotate * p}deg` },
            ],
        };
    });
    return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width, height }, style]}>{children}</Animated.View>;
}

function Drop({ index, x, t, s }: { index: number; x: number; t: SharedValue<number>; s: number }) {
    const start = index * DROP_STAGGER_MS;
    const size = 34 * s;
    const style = useAnimatedStyle(() => {
        const p = Math.min(1, Math.max(0, (t.value - start) / DROP_FALL_MS));
        const visible = t.value >= start && p < 1;
        return {
            opacity: visible ? (p > 0.85 ? (1 - p) / 0.15 : 1) : 0,
            transform: [{ translateY: (-420 + 420 * p * p) * s }],
        };
    });
    return (
        <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', left: x * s - size / 2, top: SOIL_Y * s - size * 1.3, width: size, height: size * 1.3 }, style]}
        >
            <Svg width={size} height={size * 1.3} viewBox="0 0 20 26">
                <Path d="M10 1 C10 1 2 11 2 17 A8 8 0 0 0 18 17 C18 11 10 1 10 1 Z"
                    fill={ILLUSTRATION_COLORS.water} stroke={ILLUSTRATION_COLORS.outline} strokeWidth="2" />
                <Ellipse cx="7" cy="16" rx="2" ry="3.2" fill={ILLUSTRATION_COLORS.waterShine} />
            </Svg>
        </Animated.View>
    );
}

function Splash({ t, start, s }: { t: SharedValue<number>; start: number; s: number }) {
    const w = 300 * s, h = 70 * s;
    const style = useAnimatedStyle(() => {
        const p = Math.min(1, Math.max(0, (t.value - start) / 600));
        return {
            opacity: t.value < start ? 0 : 1 - p,
            transform: [{ scale: 0.3 + 1.1 * p }],
        };
    });
    return (
        <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', left: 500 * s - w / 2, top: SOIL_Y * s - h / 2, width: w, height: h }, style]}
        >
            <Svg width={w} height={h} viewBox="0 0 300 70">
                <Ellipse cx="150" cy="35" rx="140" ry="28" fill="none" stroke={ILLUSTRATION_COLORS.waterDeep} strokeWidth="8" />
                <Ellipse cx="150" cy="35" rx="95" ry="18" fill="none" stroke={ILLUSTRATION_COLORS.water} strokeWidth="6" />
            </Svg>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    center: { alignItems: 'center', justifyContent: 'center' },
    clip: { overflow: 'hidden' },
    // Scale grows from the pot, not from the middle of the canvas.
    growOrigin: { transformOrigin: '50% 68%' },
    potOrigin: { transformOrigin: '50% 92%' },
    sweep: { position: 'absolute' },
    skip: { position: 'absolute', top: 6, alignSelf: 'center', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
});
