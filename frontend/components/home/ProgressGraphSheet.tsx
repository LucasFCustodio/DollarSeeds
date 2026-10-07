/**
 * ProgressGraphSheet — the Envision dashboard's expanded graph, in the app's one
 * bottom sheet (components/ui/Sheet) at 80% of the screen height.
 *
 *   Heading   "Debt $ paid off - {year}" / "Goal $ saved - {year}", where {year} is
 *             the year of the month at the horizontal centre of the visible graph,
 *             updated while scrolling.
 *   Summary   total so far · this calendar year · debts paid off / goals completed.
 *   Graph     the cumulative line from the first month to today, one point per
 *             month. Every month is a fixed MONTH_W wide, so the graph is as wide as
 *             the history and scrolls sideways under a pinned y axis; a short
 *             history stays left-aligned rather than stretched. It opens scrolled to
 *             today, at the right end.
 *
 * Milestones (a debt's payoff month, a goal's completion month) are harvest dots on
 * the line, labelled in a band above the plot with a thin leader down to the dot.
 * Two in one month merge into one label ("2 debts paid off"); labels that would
 * collide sideways move up a level, so they never overlap.
 *
 * Everything plotted is the server's (lib/homeProgress.ts); only the y scale's round
 * ticks are chosen here.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ScrollView, StyleSheet, Text, View,
    type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import { useLocale, MONTHS } from '../../context/LocaleContext';
import { CURRENCIES } from '../../constants/currencies';
import Sheet from '../ui/Sheet';
import type { HomeProgress, Milestone, SeriesPoint } from '../../lib/homeProgress';
import { homeType } from './homeType';

export type GraphKind = 'debts' | 'goals';

const SHEET_HEIGHT = 0.8;
const MONTH_W = 56;
const AXIS_W = 56;
const PLOT_H = 240;
const PLOT_PAD_TOP = 8;
const X_LABEL_H = 24;
const LABEL_H = 18;
const LABEL_GAP = 6;
const LABEL_MAX_W = 140;
/** Geist 11 averages ~6 pt a character; labels are given this width and ellipsize. */
const CHAR_W = 6.2;
const MAX_TICKS = 5;

interface Props {
    kind: GraphKind | null;
    progress: HomeProgress;
    onClose: () => void;
}

export default function ProgressGraphSheet({ kind, progress, onClose }: Props) {
    const { t } = useTranslation('dashboard');
    const { formatMoney, currency } = useLocale();
    const { theme } = useTheme();
    const block = kind === 'debts' ? progress.debts : kind === 'goals' ? progress.goals : null;
    const series = useMemo(() => block?.series ?? [], [block]);
    const lastYear = series.length ? series[series.length - 1].month.slice(0, 4) : '';
    const [year, setYear] = useState(lastYear);

    // Each opening starts on today's year; the graph then reports as it scrolls.
    useEffect(() => {
        if (kind) setYear(lastYear);
    }, [kind, lastYear]);

    const symbol = CURRENCIES[currency].symbol;
    const title = kind === 'goals'
        ? t('graph.goalsTitle', { symbol, year })
        : t('graph.debtsTitle', { symbol, year });

    const stats = !block ? [] : kind === 'debts' && progress.debts ? [
        { label: t('graph.total'), value: formatMoney(progress.debts.total_paid) },
        { label: t('graph.thisYear'), value: formatMoney(progress.debts.paid_this_year) },
        { label: t('graph.debtsPaidOff'), value: String(progress.debts.paid_count) },
    ] : progress.goals ? [
        { label: t('graph.total'), value: formatMoney(progress.goals.total_saved) },
        { label: t('graph.thisYear'), value: formatMoney(progress.goals.saved_this_year) },
        { label: t('graph.goalsCompleted'), value: String(progress.goals.completed_count) },
    ] : [];

    return (
        <Sheet
            visible={!!block && series.length > 0}
            onClose={onClose}
            closeLabel={t('graph.close')}
            title={title}
            heightRatio={SHEET_HEIGHT}
        >
            <View style={styles.stats}>
                {stats.map(s => (
                    <View key={s.label} style={styles.stat}>
                        <Text style={[homeType.verySmall, { color: theme.ink3 }]} numberOfLines={1}>{s.label}</Text>
                        <Text style={[homeType.medium, { color: theme.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                            {s.value}
                        </Text>
                    </View>
                ))}
            </View>
            {block && series.length ? (
                <Graph
                    key={kind}
                    series={series}
                    milestones={block.milestones}
                    color={kind === 'goals' ? theme.goals : theme.brand}
                    merged={(count: number) => kind === 'goals'
                        ? t('graph.mergedGoals', { count })
                        : t('graph.mergedDebts', { count })}
                    onYear={setYear}
                />
            ) : null}
        </Sheet>
    );
}

// ── the graph ────────────────────────────────────────────────────────────────

/** 4–5 round ticks from 0 (or below, if the line dips under it) to above the
 *  highest value: the smallest step from 1, 2, 2.5, 5 × 10ⁿ that needs at most five. */
export function niceTicks(values: number[]): number[] {
    const max = Math.max(0, ...values);
    const min = Math.min(0, ...values);
    const span = Math.max(max - min, 4);
    let step = 1;
    search: for (let e = 0; e < 13; e++) {
        for (const m of [1, 2, 2.5, 5]) {
            const s = m * 10 ** e;
            if (!Number.isInteger(s)) continue;
            if (Math.ceil(span / s) + 1 <= MAX_TICKS) { step = s; break search; }
        }
    }
    const bottom = Math.floor(min / step) * step;
    const top = Math.max(bottom + step, Math.ceil(max / step) * step);
    const ticks = [];
    for (let v = bottom; v <= top + step / 2; v += step) ticks.push(v);
    return ticks;
}

interface PlacedLabel { key: string; text: string; x: number; left: number; width: number; level: number; value: number }

/** One label per milestone month, merged when a month has several, assigned to the
 *  lowest level where it clears every label already there. */
function placeLabels(
    series: SeriesPoint[], milestones: Milestone[], merged: (count: number) => string, contentW: number,
): { labels: PlacedLabel[]; levels: number } {
    if (!series.length || !milestones.length) return { labels: [], levels: 0 };
    const first = series[0].month;
    const last = series[series.length - 1].month;
    const byIndex = new Map<number, string[]>();
    for (const m of milestones) {
        // A payoff dated before the first payment (or after today) pins to the end.
        const month = m.month < first ? first : m.month > last ? last : m.month;
        const i = series.findIndex(p => p.month === month);
        if (i < 0) continue;
        byIndex.set(i, [...(byIndex.get(i) ?? []), m.name]);
    }
    const rightEdges: number[] = [];
    const labels: PlacedLabel[] = [...byIndex.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([i, names]) => {
            const text = names.length > 1 ? merged(names.length) : names[0];
            const width = Math.min(LABEL_MAX_W, Math.ceil(text.length * CHAR_W) + 12);
            const x = i * MONTH_W + MONTH_W / 2;
            const left = Math.max(0, Math.min(x - width / 2, contentW - width));
            let level = rightEdges.findIndex(edge => left >= edge + LABEL_GAP);
            if (level < 0) { level = rightEdges.length; rightEdges.push(0); }
            rightEdges[level] = left + width;
            return { key: String(i), text, x, left, width, level, value: series[i].cumulative };
        });
    return { labels, levels: rightEdges.length };
}

function Graph({ series, milestones, color, merged, onYear }: {
    series: SeriesPoint[];
    milestones: Milestone[];
    color: string;
    merged: (count: number) => string;
    onYear: (year: string) => void;
}) {
    const { theme } = useTheme();
    const { formatMoney, monthAbbr } = useLocale();
    const [viewW, setViewW] = useState(0);
    const scroller = useRef<ScrollView>(null);
    const atEnd = useRef(false);
    const contentWidth = useRef(0);
    const shownYear = useRef('');

    const n = series.length;
    const values = series.map(p => p.cumulative);
    const ticks = niceTicks(values);
    const bottom = ticks[0];
    const top = ticks[ticks.length - 1];
    const dataW = n * MONTH_W;
    const contentW = Math.max(dataW, viewW);
    const { labels, levels } = placeLabels(series, milestones, merged, Math.max(dataW, LABEL_MAX_W));
    const bandH = levels ? levels * LABEL_H + 8 : 0;
    const plotTop = bandH + PLOT_PAD_TOP;
    const height = plotTop + PLOT_H + X_LABEL_H;

    const xOf = (i: number) => i * MONTH_W + MONTH_W / 2;
    const yOf = (v: number) => plotTop + ((top - v) / (top - bottom || 1)) * PLOT_H;

    const linePath = series.map((p, i) => `${i ? 'L' : 'M'}${xOf(i)} ${yOf(p.cumulative).toFixed(2)}`).join(' ');
    const areaPath = `${linePath} L${xOf(n - 1)} ${yOf(bottom)} L${xOf(0)} ${yOf(bottom)} Z`;

    /** The year of the month at the visible centre (clamped to the data). */
    const report = (offsetX: number) => {
        if (!viewW) return;
        const i = Math.max(0, Math.min(n - 1, Math.floor((offsetX + viewW / 2) / MONTH_W)));
        const y = series[i].month.slice(0, 4);
        if (y !== shownYear.current) {
            shownYear.current = y;
            onYear(y);
        }
    };
    const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => report(e.nativeEvent.contentOffset.x);

    // Opens at today, the right end — once, as soon as BOTH the viewport and the
    // content have been measured, whichever lands last.
    const scrollToToday = () => {
        if (atEnd.current || !viewW || !contentWidth.current) return;
        atEnd.current = true;
        scroller.current?.scrollToEnd({ animated: false });
        report(Math.max(0, contentWidth.current - viewW));
    };
    const onContentSize = (w: number) => {
        contentWidth.current = w;
        scrollToToday();
    };
    useEffect(() => {
        scrollToToday();
        // Only the viewport's first measurement matters; scrollToToday guards repeats.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewW]);

    return (
        <View style={[styles.graph, { height }]}>
            {/* Pinned y axis */}
            <View style={[styles.axis, { height }]}>
                {ticks.map(v => (
                    <Text
                        key={v}
                        numberOfLines={1}
                        style={[homeType.verySmall, styles.tick, { top: yOf(v) - 7, color: theme.ink3 }]}
                    >
                        {formatMoney(v)}
                    </Text>
                ))}
            </View>

            <ScrollView
                ref={scroller}
                horizontal
                style={styles.flex}
                showsHorizontalScrollIndicator={false}
                onLayout={e => setViewW(Math.floor(e.nativeEvent.layout.width))}
                onContentSizeChange={onContentSize}
                onScroll={onScroll}
                scrollEventThrottle={32}
            >
                <View style={{ width: contentW, height }}>
                    <Svg width={contentW} height={height} style={StyleSheet.absoluteFill}>
                        {ticks.map(v => (
                            <Line key={v} x1={0} x2={contentW} y1={yOf(v)} y2={yOf(v)} stroke={theme.borderSoft} strokeWidth={1} />
                        ))}
                        <Path d={areaPath} fill={color} fillOpacity={0.12} />
                        <Path d={linePath} stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" />
                        {labels.map(l => (
                            <Line
                                key={`lead-${l.key}`}
                                x1={l.x} x2={l.x}
                                y1={bandH - l.level * LABEL_H} y2={yOf(l.value)}
                                stroke={theme.border} strokeWidth={1} strokeDasharray="2 3"
                            />
                        ))}
                        {labels.map(l => (
                            <Circle key={`dot-${l.key}`} cx={l.x} cy={yOf(l.value)} r={5} fill={theme.harvest} />
                        ))}
                        <Circle cx={xOf(n - 1)} cy={yOf(values[n - 1])} r={4} fill={color} />
                    </Svg>

                    {/* On a surface fill, so a higher label's leader passes behind a
                        lower label instead of through its text. */}
                    {labels.map(l => (
                        <Text
                            key={`label-${l.key}`}
                            numberOfLines={1}
                            style={[
                                homeType.verySmallEmphasis, styles.label,
                                {
                                    left: l.left, width: l.width, top: bandH - (l.level + 1) * LABEL_H,
                                    color: theme.ink, backgroundColor: theme.surface,
                                },
                            ]}
                        >
                            {l.text}
                        </Text>
                    ))}

                    {series.map((p, i) => (
                        <Text
                            key={p.month}
                            numberOfLines={1}
                            style={[homeType.verySmall, styles.month, { left: i * MONTH_W, top: plotTop + PLOT_H + 6, color: theme.ink3 }]}
                        >
                            {monthAbbr(MONTHS[Number(p.month.slice(5, 7)) - 1])}
                        </Text>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    stats: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    stat: { flex: 1, gap: 2 },
    graph: { flexDirection: 'row' },
    axis: { width: AXIS_W },
    tick: { position: 'absolute', right: 6, left: 0, textAlign: 'right' },
    label: { position: 'absolute', height: LABEL_H, textAlign: 'center', lineHeight: LABEL_H },
    month: { position: 'absolute', width: MONTH_W, textAlign: 'center' },
});
