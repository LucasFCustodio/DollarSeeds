/**
 * DebtFreedomTutorial — the Debts tab for a user whose `debt_freedom` allowance is
 * `none` (not premium, no debts): what the Snowball method is, then three steps,
 * each ending in Subscribe.
 *
 * Vertically paged, one full-height page at a time (snap paging; swiping works). Every
 * page but the last has a down arrow that scrolls to the next one, without animating
 * when Reduce Motion is on. The floating tab bar stays visible: each page keeps its
 * content clear of it.
 *
 * The art is the garden's own (PlantView, WaterStream), one species and no pot label,
 * so the tutorial shows exactly what the tab will look like. Each plant is drawn as
 * large as its page allows, anchored to the bottom of its area so the empty sky above
 * a young plant is what gets cropped.
 */
import React, { useCallback, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Fonts, shadow, useTheme } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import Button from '../ui/Button';
import { IconChevronDown } from '../icons';
import { useReduceMotion } from '../home/RotatingCard';
import { PAINTED_OUTLINE } from '../home/PaintedCard';
import type { PlantState } from '../../lib/debtFreedom';
import PlantView from './PlantView';
import WaterStream from './WaterStream';
import { GROUND_Y } from './PlantSection';
import { ART_TOP, ART_TOP_PAID_OFF, CANVAS_H, CANVAS_W, POT_WIDTH } from './art';

/** The custom tab bar's pill height (as on the Debts tab). */
const TAB_BAR_HEIGHT = 58;
const SPECIES = 4;
const MAX_PLANT_W = 300;
/** The stream needs at least this much room under the paid-off plant. */
const STREAM_MIN = 72;
/** A wide stream: the garden's grows with each debt paid off; this is ~6 of them. */
const STREAM_PAID_COUNT = 6;

type Step = { key: 'seed' | 'grow' | 'free'; step: number; state: PlantState };
const STEPS: Step[] = [
    { key: 'seed', step: 0, state: 'seed' },
    { key: 'grow', step: 5, state: 'growing' },
    { key: 'free', step: 10, state: 'paid_off' },
];
const PAGE_COUNT = 1 + STEPS.length;

export default function DebtFreedomTutorial() {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const reduceMotion = useReduceMotion();
    const scroll = useRef<ScrollView>(null);
    const [pageH, setPageH] = useState(0);

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        const h = Math.round(e.nativeEvent.layout.height);
        setPageH(prev => (prev === h ? prev : h));
    }, []);

    const goTo = useCallback((page: number) => {
        scroll.current?.scrollTo({ y: page * pageH, animated: !reduceMotion });
    }, [pageH, reduceMotion]);

    const pad = {
        paddingTop: insets.top + 16,
        paddingBottom: Math.max(insets.bottom, 14) + TAB_BAR_HEIGHT + 12,
    };

    return (
        <View style={[styles.fill, { backgroundColor: theme.bg }]} onLayout={onLayout}>
            {pageH > 0 ? (
                <ScrollView
                    ref={scroll}
                    snapToInterval={pageH}
                    snapToAlignment="start"
                    decelerationRate="fast"
                    disableIntervalMomentum
                    showsVerticalScrollIndicator={false}
                >
                    <IntroPage height={pageH} pad={pad} onNext={() => goTo(1)} />
                    {STEPS.map((s, i) => (
                        <StepPage
                            key={s.key}
                            step={s}
                            height={pageH}
                            pad={pad}
                            onNext={i + 2 < PAGE_COUNT ? () => goTo(i + 2) : undefined}
                        />
                    ))}
                </ScrollView>
            ) : null}
        </View>
    );
}

type Pad = { paddingTop: number; paddingBottom: number };

function IntroPage({ height, pad, onNext }: { height: number; pad: Pad; onNext: () => void }) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    return (
        <View style={[styles.page, pad, { height }]}>
            <View style={styles.intro}>
                <Text style={[styles.eyebrow, { color: theme.ink2, fontFamily: Fonts.monoSemiBold }]}>
                    {t('tutorial.intro.eyebrow')}
                </Text>
                <Text accessibilityRole="header" style={[styles.title, { color: theme.ink, fontFamily: Fonts.serif }]}>
                    {t('tutorial.intro.title')}
                </Text>
                {(['what', 'why', 'premium'] as const).map(k => (
                    <Text key={k} style={[styles.paragraph, { color: theme.ink2, fontFamily: Fonts.sans }]}>
                        {t(`tutorial.intro.${k}`)}
                    </Text>
                ))}
            </View>
            <NextArrow onPress={onNext} />
        </View>
    );
}

function StepPage({ step, height, pad, onNext }: {
    step: Step; height: number; pad: Pad; onNext?: () => void;
}) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const { openPaywall } = useSubscription();
    const [area, setArea] = useState<{ w: number; h: number } | null>(null);

    const onArea = useCallback((e: LayoutChangeEvent) => {
        const { width, height: h } = e.nativeEvent.layout;
        setArea(prev => (prev && prev.w === width && prev.h === h ? prev : { w: width, h }));
    }, []);

    return (
        <View style={[styles.page, pad, { height }]}>
            <View style={[styles.box, { backgroundColor: theme.surface, borderColor: theme.ink }, shadow(4) as object]}>
                <Text style={[styles.boxText, { color: theme.ink, fontFamily: Fonts.sans }]}>
                    {t(`tutorial.steps.${step.key}`)}
                </Text>
            </View>
            <View style={styles.area} onLayout={onArea}>
                {area ? <StepArt step={step} width={area.w} height={area.h} /> : null}
            </View>
            <Button color={theme.brand} label={t('tutorial.subscribe')} variant="primary" size="lg" fullWidth
                onPress={openPaywall} />
            {onNext ? <NextArrow onPress={onNext} /> : <View style={styles.arrowSpace} />}
        </View>
    );
}

/** The plant (and, once paid off, its stream), fitted to the area between the text
 *  box and the button. */
function StepArt({ step, width, height }: { step: Step; width: number; height: number }) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const paidOff = step.state === 'paid_off';
    // The highest painted y of this frame: everything above it is empty sky.
    const artTop = paidOff ? ART_TOP_PAID_OFF[SPECIES] : ART_TOP[SPECIES][step.step];
    const visible = (CANVAS_H - artTop) / CANVAS_W;   // visible height per unit of width
    const room = paidOff ? height - STREAM_MIN : height;
    const w = Math.max(120, Math.min(width * (paidOff ? 0.72 : 0.82), MAX_PLANT_W, room / visible));
    const s = w / CANVAS_W;
    const shownH = (CANVAS_H - artTop) * s;
    // Paid off sits at the top so the stream can run down under it; a potted plant
    // sits on the button.
    const top = paidOff ? 0 : height - shownH;
    const left = (width - w) / 2;

    const stake = paidOff ? (
        <View style={styles.stake}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
                style={{ color: theme.ink, fontFamily: Fonts.sansBold, fontSize: Math.max(8, 25 * s), textAlign: 'center' }}>
                {t('header.paidOff')}
            </Text>
        </View>
    ) : undefined;

    return (
        <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none"
            accessible accessibilityLabel={t(`tutorial.a11y.${step.key}`)}>
            {paidOff ? (
                <WaterStream
                    cx={width / 2}
                    top={top + (GROUND_Y - artTop) * s}
                    bottom={height}
                    potWidth={POT_WIDTH * s}
                    paidCount={STREAM_PAID_COUNT}
                />
            ) : null}
            <View style={{ position: 'absolute', left, top: top - artTop * s, width: w }}>
                <PlantView species={SPECIES} growthStep={step.step} state={step.state} isFocus={false}
                    active={false} width={w} stakeLabel={stake} />
            </View>
        </View>
    );
}

function NextArrow({ onPress }: { onPress: () => void }) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    return (
        <View style={styles.arrowRow}>
            <Pressable
                onPress={onPress}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('tutorial.next')}
                style={({ pressed }) => [styles.arrow, {
                    backgroundColor: theme.surface, borderColor: theme.ink, opacity: pressed ? 0.7 : 1,
                }]}
            >
                <IconChevronDown size={22} color={theme.ink} />
            </Pressable>
        </View>
    );
}

const ARROW = 44;

const styles = StyleSheet.create({
    fill: { flex: 1 },
    page: { paddingHorizontal: 16, gap: 14 },
    intro: { flex: 1, justifyContent: 'center', paddingHorizontal: 8, gap: 14 },
    eyebrow: { fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase', textAlign: 'center' },
    title: { fontSize: 38, lineHeight: 44, textAlign: 'center', marginBottom: 4 },
    paragraph: { fontSize: 16, lineHeight: 24 },
    box: { borderRadius: 18, borderWidth: PAINTED_OUTLINE, paddingHorizontal: 18, paddingVertical: 16 },
    boxText: { fontSize: 16, lineHeight: 23 },
    area: { flex: 1, minHeight: 120 },
    clip: { overflow: 'hidden' },
    stake: { flex: 1, width: '90%', alignItems: 'center', justifyContent: 'center' },
    arrowRow: { alignItems: 'center' },
    arrow: {
        width: ARROW, height: ARROW, borderRadius: ARROW / 2, borderWidth: 1.5,
        alignItems: 'center', justifyContent: 'center',
    },
    arrowSpace: { height: ARROW },
});
