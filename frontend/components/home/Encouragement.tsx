/**
 * Envision — "Where is this going?": the debts-paid line and the encouragement card.
 *
 * The debts-paid line sits straight on the green Envision band in ink, the one
 * non-onBrand text on the green bands. Once a debt is paid it breathes slowly
 * between ink and harvest gold.
 *
 * Every item renders only when its data exists; the card hides when none do. The
 * debt items are flag-gated by the parent passing `debts = null`. Goals near
 * completion work for everyone.
 *
 * The encouragement card is painted (PaintedCard): the art stays still while only
 * the text/icon row slides.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
    cancelAnimation, Easing, interpolateColor, useAnimatedStyle, useSharedValue,
    withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { ft } from '../../constants/responsive';
import { MONTHS, useLocale } from '../../context/LocaleContext';
import { IconLeaf, IconSparkle, IconStar, IconTarget } from '../icons';
import type { GoalNearCompletion, HomeDebts } from '../../lib/homeSummary';
import { useDebtFormat } from '../debts/format';
import RotatingCard, { type RotatingItem, useAppActive, useReduceMotion } from './RotatingCard';
import PaintedCard, { withAlpha } from './PaintedCard';
import { homeType } from './homeType';

// One cycle: ease to gold, hold, ease back to ink, rest.
const TO_GOLD_MS = 2400;
const HOLD_MS = 1200;
const TO_INK_MS = 2400;
const REST_MS = 4000;

export function DebtsPaidLine({ debts }: { debts: HomeDebts }) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    const focused = useIsFocused();
    const appActive = useAppActive();
    const reduceMotion = useReduceMotion();
    const text = t('envision.debtsPaid', { paid: debts.paid_count, total: debts.total_count });

    const paid = debts.paid_count >= 1;
    const animate = paid && !reduceMotion;
    const running = animate && focused && appActive;
    const gold = useSharedValue(0);

    useEffect(() => {
        if (!running) {
            cancelAnimation(gold);
            return;
        }
        const ease = Easing.inOut(Easing.ease);
        // Resuming after a pause eases on from wherever the colour stopped.
        gold.value = withRepeat(withSequence(
            withTiming(1, { duration: TO_GOLD_MS, easing: ease }),
            withDelay(HOLD_MS, withTiming(0, { duration: TO_INK_MS, easing: ease })),
            withTiming(0, { duration: REST_MS }),
        ), -1);
        return () => cancelAnimation(gold);
    }, [running, gold]);

    // Gold is low-contrast on the painted green band: a brand glow grows in with it.
    const ink = theme.ink;
    const harvest = theme.harvest;
    const glowOn = theme.brand;
    const glowOff = withAlpha(theme.brand, 0);
    const colorStyle = useAnimatedStyle(() => ({
        color: interpolateColor(gold.value, [0, 1], [ink, harvest]),
        textShadowColor: interpolateColor(gold.value, [0, 1], [glowOff, glowOn]),
    }));

    if (!animate) {
        // Nothing paid yet: static ink. Reduce Motion: static gold, with its glow.
        return (
            <Text style={[homeType.medium, paid ? [styles.glow, { color: harvest, textShadowColor: glowOn }] : { color: ink }]}>
                {text}
            </Text>
        );
    }
    return <Animated.Text style={[homeType.medium, styles.glow, colorStyle]}>{text}</Animated.Text>;
}

const ICON = 22;
// The 4-point sparkle's glyph is thin and spans 14 of its 24 units (the leaf, star
// and target span 16-18), so at the same box size it looks smaller. Drawn larger,
// and nudged down to centre it: its glyph sits 2 units above the box's middle.
const SPARKLE_SCALE = 1.3;
const SPARKLE = Math.round(ICON * SPARKLE_SCALE);
const BADGE = 32;
const BADGE_FILL = 'rgba(255,255,255,0.7)';

export function EncouragementCard({ debts, goals }: { debts: HomeDebts | null; goals: GoalNearCompletion[] }) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    const { monthYear, serverTitle } = useLocale();
    const f = useDebtFormat();

    /** "2031-06" → "June 2031" */
    const longMonth = (ym: string) => {
        const [y, m] = ym.split('-').map(Number);
        return monthYear(MONTHS[(m || 1) - 1], y);
    };

    // Gold icons on a white disc, so the harvest holds up on the painting.
    const line = (icon: React.ReactNode, text: string) => (
        <View style={styles.line}>
            <View style={[styles.badge, { backgroundColor: BADGE_FILL }]}>{icon}</View>
            <Text style={[styles.text, { color: theme.ink }]} numberOfLines={2}>{text}</Text>
        </View>
    );

    const focus = debts?.focus;
    const items: (RotatingItem | null | false | undefined)[] = [
        !!debts?.plan_est_payoff_month && {
            key: 'debtFree',
            content: line(
                <View style={styles.sparkle}><IconSparkle size={SPARKLE} color={theme.harvest} /></View>,
                t('envision.debtFreeBy', { date: longMonth(debts.plan_est_payoff_month) })),
        },
        debts?.almost_free && {
            key: `almost-${debts.almost_free.id}`,
            content: line(<IconLeaf size={ICON} color={theme.harvest} />,
                t('envision.almostFree', { name: debts.almost_free.name })),
        },
        focus && focus.focus_extra > 0 && {
            key: `extra-${focus.id}`,
            content: line(<IconStar size={ICON} color={theme.harvest} filled />,
                t('envision.focusExtra', { amount: f.money(focus.focus_extra), name: focus.name })),
        },
        ...goals.map(g => ({
            key: `goal-${g.id}`,
            content: line(<IconTarget size={ICON} color={theme.harvest} />,
                t('envision.goalNear', { goal: serverTitle(g.title), pct: Math.floor(g.pct * 100) })),
        })),
    ];

    if (!items.some(Boolean)) return null;

    return (
        <PaintedCard source={ART} borderColor={theme.ink} borderWidth={1.5}>
            <RotatingCard
                items={items}
                dotColor={theme.borderSoft}
                dotActiveColor={theme.harvest}
                style={styles.card}
            />
        </PaintedCard>
    );
}

const ART = require('../../assets/images/home/encouragement-bg.png');

const styles = StyleSheet.create({
    card: { paddingHorizontal: 16, paddingVertical: 14 },
    glow: { textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 } },
    line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    badge: { width: BADGE, height: BADGE, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    sparkle: { width: SPARKLE, height: SPARKLE, transform: [{ translateY: (2 / 24) * SPARKLE }] },
    // v1's small size + 2, same family and weight.
    text: { fontFamily: homeType.small.fontFamily, fontSize: ft(15), flexShrink: 1 },
});
