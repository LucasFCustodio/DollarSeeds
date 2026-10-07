/**
 * EnvisionDashboard — the Envision band, under the encouragement card: "Where is
 * this going?" in two rows, debts (flag-gated) over goals, on one surface card.
 *
 * The card is a two-page horizontal pager — COUNT and AMOUNT — and each page holds
 * both rows, so one swipe flips both together; the rows never swipe on their own.
 * It only moves on a swipe (no auto-rotation, no entrance animation, so Reduce
 * Motion needs nothing extra). It opens on COUNT, unless nothing has been paid off
 * or completed yet: then on AMOUNT, since a rising line encourages more than an
 * empty count.
 *
 * Each row keeps one fixed height in both views, so the card never jumps when it
 * flips. The debts row is taller than the goals row because its pots need room for
 * the tallest plant above them (see MiniPlant).
 *
 * The server computes every number (lib/homeProgress.ts); this file only lays them
 * out. With no debts or no goals a row shows its empty state in both views.
 */
import React, { useState } from 'react';
import {
    Pressable, ScrollView, StyleSheet, Text, View,
    type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle } from 'react-native-svg';
import { shadow, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { IconChevronRight, IconPlus } from '../icons';
import type { DebtProgress, GoalProgress, HomeProgress } from '../../lib/homeProgress';
import MiniPlant, { miniPlantHeight } from './MiniPlant';
import Sparkline from './Sparkline';
import ProgressGraphSheet, { type GraphKind } from './ProgressGraphSheet';
import { homeType } from './homeType';

const RADIUS = 18;
const ROW_PAD_X = 16;
const ROW_PAD_Y = 10;
const GOAL_ROW_H = 90;

/** Pot rim width: 36 pt for up to 6 debts, shrinking evenly to 26 pt at 8. More
 *  than 8 switch to segments. */
const POT_MAX = 36;
const POT_MIN = 26;
const POTS_FULL_SIZE = 6;
const POTS_MAX = 8;
const POT_GAP = 4;
const potSize = (n: number) => n <= POTS_FULL_SIZE
    ? POT_MAX
    : POT_MAX - ((n - POTS_FULL_SIZE) * (POT_MAX - POT_MIN)) / (POTS_MAX - POTS_FULL_SIZE);

/** Room for the tallest (completed) plant on the largest pot, plus the line under it. */
const POT_AREA_H = Math.ceil(miniPlantHeight(POT_MAX));
const DEBT_LINE_H = 24;
const DEBT_ROW_H = ROW_PAD_Y * 2 + POT_AREA_H + 4 + DEBT_LINE_H;

const RING = 56;
const RING_STROKE = 6;
const SPARK_H = 44;
const PLUS = 32;

type View2 = 'count' | 'amount';

interface Props {
    progress: HomeProgress;
    /** DEBT_FREEDOM_ENABLED. Off: the goals row only, no hairline. */
    showDebts: boolean;
    onOpenDebts: (debtId?: number) => void;
    onAddDebt: () => void;
    onOpenCompletedGoals: () => void;
    onAddGoal: () => void;
}

export default function EnvisionDashboard({
    progress, showDebts, onOpenDebts, onAddDebt, onOpenCompletedGoals, onAddGoal,
}: Props) {
    const { theme } = useTheme();
    const debts = showDebts ? progress.debts : null;
    const goals = progress.goals;

    // Decided once, from the data the card first rendered with: a refetch on focus
    // must not flip the card out from under a user who swiped.
    const [initialPage] = useState<0 | 1>(() => {
        const nonePaid = !debts || debts.paid_count === 0;
        const noneCompleted = !goals || goals.completed_count === 0;
        return nonePaid && noneCompleted ? 1 : 0;
    });
    const [page, setPage] = useState<number>(initialPage);
    const [width, setWidth] = useState(0);
    const [graph, setGraph] = useState<GraphKind | null>(null);
    const [placed, setPlaced] = useState(initialPage === 0);
    const [pager, setPager] = useState<ScrollView | null>(null);

    const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
    const onPageEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (width > 0) setPage(Math.round(e.nativeEvent.contentOffset.x / width));
    };
    // contentOffset is the first try at opening on AMOUNT; this is the fallback for
    // a platform that ignores it on mount.
    const onContentSize = () => {
        if (placed || !pager || width <= 0) return;
        pager.scrollTo({ x: initialPage * width, animated: false });
        setPlaced(true);
    };

    const renderPage = (view: View2) => (
        <View key={view} style={{ width }}>
            {showDebts ? (
                <>
                    <DebtsRow view={view} debts={debts} onOpenDebts={onOpenDebts} onAddDebt={onAddDebt} onOpenGraph={() => setGraph('debts')} />
                    <View style={[styles.hairline, { backgroundColor: theme.borderSoft }]} />
                </>
            ) : null}
            <GoalsRow view={view} goals={goals} onOpenCompleted={onOpenCompletedGoals} onAddGoal={onAddGoal} onOpenGraph={() => setGraph('goals')} />
        </View>
    );

    return (
        <View style={[styles.shell, { backgroundColor: theme.surface, ...(shadow(6) as object) }]}>
            <View style={styles.clip} onLayout={onLayout}>
                {width > 0 ? (
                    <ScrollView
                        ref={setPager}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        // Only a deliberate sideways swipe pages; a vertical drag still
                        // scrolls the home.
                        directionalLockEnabled
                        nestedScrollEnabled
                        contentOffset={{ x: initialPage * width, y: 0 }}
                        onContentSizeChange={onContentSize}
                        onMomentumScrollEnd={onPageEnd}
                    >
                        {renderPage('count')}
                        {renderPage('amount')}
                    </ScrollView>
                ) : null}
                <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    {[0, 1].map(i => (
                        <View key={i} style={[styles.dot, { backgroundColor: page === i ? theme.brand : theme.border }]} />
                    ))}
                </View>
            </View>

            <ProgressGraphSheet
                kind={graph}
                progress={progress}
                onClose={() => setGraph(null)}
            />
        </View>
    );
}

// ── rows ─────────────────────────────────────────────────────────────────────

interface RowProps {
    height: number;
    onPress?: () => void;
    chevron?: boolean;
    children: React.ReactNode;
}

/** A full-width row: its own pressable, its own pressed highlight, a trailing chevron. */
function Row({ height, onPress, chevron = true, children }: RowProps) {
    const { theme } = useTheme();
    const body = (
        <>
            <View style={styles.rowBody}>{children}</View>
            {onPress && chevron ? <IconChevronRight size={16} color={theme.ink3} /> : null}
        </>
    );
    if (!onPress) return <View style={[styles.row, { height }]}>{body}</View>;
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, { height }, pressed && { backgroundColor: theme.surfaceSoft }]}
        >
            {body}
        </Pressable>
    );
}

/** No debts / no goals: a + and the invitation, the whole row tappable, no chevron. */
function EmptyRow({ message, onPress }: { message: string; onPress: () => void }) {
    const { theme } = useTheme();
    return (
        <Row height={GOAL_ROW_H} onPress={onPress} chevron={false}>
            <View style={styles.emptyLine}>
                <View style={[styles.plus, { backgroundColor: theme.brand }]}>
                    <IconPlus size={18} color={theme.onBrand} />
                </View>
                <Text style={[homeType.small, styles.flex, { color: theme.ink }]}>{message}</Text>
            </View>
        </Row>
    );
}

function DebtsRow({ view, debts, onOpenDebts, onAddDebt, onOpenGraph }: {
    view: View2;
    debts: DebtProgress | null;
    onOpenDebts: (debtId?: number) => void;
    onAddDebt: () => void;
    onOpenGraph: () => void;
}) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    if (!debts) return <EmptyRow message={t('progress.emptyDebts')} onPress={onAddDebt} />;

    if (view === 'amount') {
        return (
            <AmountRow
                height={DEBT_ROW_H}
                total={debts.total_paid}
                caption={t('progress.paidTowardDebt')}
                series={debts.series.map(p => p.cumulative)}
                color={theme.brand}
                firstLine={t('progress.firstPayment')}
                onPress={onOpenGraph}
            />
        );
    }

    const n = debts.pots.length;
    const size = potSize(n);
    const tail = debts.focus_name
        ? t('progress.debtNext', { name: debts.focus_name })
        : t('progress.allDebtsPaid');
    return (
        // Opens the garden at its first debt, so the user sees their debts from the start.
        <Row height={DEBT_ROW_H} onPress={() => onOpenDebts(debts.pots[0]?.id)}>
            <View style={[styles.potArea, { height: POT_AREA_H }]}>
                {n > POTS_MAX ? (
                    <View style={styles.segments}>
                        {debts.pots.map(p => (
                            <View
                                key={p.id}
                                style={[styles.segment, {
                                    backgroundColor: p.stage === 'completed'
                                        ? theme.brand
                                        : p.is_focus ? theme.harvest : theme.borderSoft,
                                }]}
                            />
                        ))}
                    </View>
                ) : (
                    <View style={styles.pots}>
                        {debts.pots.map(p => (
                            <MiniPlant
                                key={p.id}
                                stage={p.stage}
                                size={size}
                                glowColor={p.is_focus ? theme.harvestSoft : undefined}
                            />
                        ))}
                    </View>
                )}
            </View>
            <Text numberOfLines={1} style={styles.debtLine}>
                <Text style={[homeType.medium, { color: theme.ink }]}>
                    {t('progress.debtsOf', { paid: debts.paid_count, total: debts.total_count })}
                </Text>
                <Text style={[homeType.verySmall, { color: theme.ink3 }]}>{tail}</Text>
            </Text>
        </Row>
    );
}

function GoalsRow({ view, goals, onOpenCompleted, onAddGoal, onOpenGraph }: {
    view: View2;
    goals: GoalProgress | null;
    onOpenCompleted: () => void;
    onAddGoal: () => void;
    onOpenGraph: () => void;
}) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    const { serverTitle } = useLocale();
    if (!goals) return <EmptyRow message={t('progress.emptyGoals')} onPress={onAddGoal} />;

    if (view === 'amount') {
        return (
            <AmountRow
                height={GOAL_ROW_H}
                total={goals.total_saved}
                caption={t('progress.savedTowardGoals')}
                series={goals.series.map(p => p.cumulative)}
                color={theme.goals}
                firstLine={t('progress.firstDeposit')}
                onPress={onOpenGraph}
            />
        );
    }

    const message = goals.nearest
        ? t('envision.goalNear', { goal: serverTitle(goals.nearest.title), pct: Math.floor(goals.nearest.pct * 100) })
        : goals.completed_count === goals.total_count ? t('progress.allGoalsDone') : null;
    return (
        <Row height={GOAL_ROW_H} onPress={onOpenCompleted}>
            <View style={styles.goalLine}>
                <Ring completed={goals.completed_count} total={goals.total_count} />
                {message ? (
                    <Text numberOfLines={2} style={[homeType.small, styles.flex, { color: theme.ink }]}>{message}</Text>
                ) : null}
            </View>
        </Row>
    );
}

/** Headline total on the left, the last 12 months' cumulative line filling the rest.
 *  Before any money is logged: a flat baseline and an invitation, and no graph to
 *  open, so the row isn't tappable. */
function AmountRow({ height, total, caption, series, color, firstLine, onPress }: {
    height: number;
    total: number;
    caption: string;
    series: number[];
    color: string;
    firstLine: string;
    onPress: () => void;
}) {
    const { theme } = useTheme();
    const { formatMoney } = useLocale();
    const [sparkW, setSparkW] = useState(0);
    const empty = series.length === 0;
    return (
        <Row height={height} onPress={empty ? undefined : onPress}>
            <View style={styles.amountLine}>
                <View style={styles.amountText}>
                    <Text style={[homeType.medium, { color: theme.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                        {formatMoney(total)}
                    </Text>
                    <Text style={[homeType.verySmall, { color: theme.ink3 }]} numberOfLines={1}>{caption}</Text>
                </View>
                <View style={styles.flex} onLayout={e => setSparkW(Math.floor(e.nativeEvent.layout.width))}>
                    {empty ? (
                        <>
                            <Text style={[homeType.verySmall, styles.firstLine, { color: theme.ink3 }]} numberOfLines={2}>
                                {firstLine}
                            </Text>
                            <Sparkline values={[]} baseline color={theme.border} width={sparkW} height={8} />
                        </>
                    ) : (
                        <Sparkline values={series.slice(-12)} color={color} width={sparkW} height={SPARK_H} />
                    )}
                </View>
            </View>
        </Row>
    );
}

/** 56 pt ring: borderSoft track, goals progress with a round cap, "{done}/{total}". */
function Ring({ completed, total }: { completed: number; total: number }) {
    const { theme } = useTheme();
    const r = (RING - RING_STROKE) / 2;
    const c = 2 * Math.PI * r;
    const pct = total > 0 ? Math.min(1, completed / total) : 0;
    return (
        <View style={styles.ring}>
            <Svg width={RING} height={RING} style={styles.ringSvg}>
                <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={theme.borderSoft} strokeWidth={RING_STROKE} fill="none" />
                {pct > 0 ? (
                    <Circle
                        cx={RING / 2} cy={RING / 2} r={r}
                        stroke={theme.goals} strokeWidth={RING_STROKE} fill="none"
                        strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round"
                    />
                ) : null}
            </Svg>
            <Text style={[homeType.small, { color: theme.ink }]}>{`${completed}/${total}`}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    shell: { borderRadius: RADIUS },
    // Clipped on an inner layer: overflow:'hidden' on the shadowed view would drop its
    // iOS shadow. Keeps the rows' pressed highlight inside the rounded corners.
    clip: { borderRadius: RADIUS, overflow: 'hidden', paddingTop: 4 },
    flex: { flex: 1 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: ROW_PAD_X, paddingVertical: ROW_PAD_Y, gap: 8 },
    rowBody: { flex: 1, justifyContent: 'center' },
    hairline: { height: 1, marginHorizontal: ROW_PAD_X, marginVertical: 2 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 4, paddingBottom: 10 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    potArea: { justifyContent: 'flex-end' },
    pots: { flexDirection: 'row', alignItems: 'flex-end', gap: POT_GAP },
    segments: { flexDirection: 'row', gap: 3, height: 10, alignSelf: 'stretch', marginBottom: (POT_AREA_H - 10) / 2 },
    segment: { flex: 1, borderRadius: 999 },
    debtLine: { marginTop: 4, height: DEBT_LINE_H },
    goalLine: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
    ringSvg: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
    amountLine: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    amountText: { flexShrink: 0, maxWidth: '45%' },
    firstLine: { marginBottom: 6 },
    emptyLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    plus: { width: PLUS, height: PLUS, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
