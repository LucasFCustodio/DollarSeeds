/**
 * LoggingArea — directly under Savings. Not a container; it shows exactly one of:
 *
 *  - Bank connected with pending transactions: up to three bubbles at a time (the
 *    row pages sideways past three). Long-press a bubble and drag it onto a split
 *    (an expense) or the income hero (an income) to classify it.
 *  - No bank, and nothing logged for 5+ days: the tracking nudge.
 *  - Otherwise nothing, at zero height.
 *
 * Bank data comes only from lib/bankTransactions.ts, so wiring Plaid never touches
 * this file.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { shadow, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import type { ClassifyTarget, PendingTransaction } from '../../lib/bankTransactions';
import { useDropZones } from './DropZones';
import { homeType } from './homeType';

export const BUBBLE = 76;
const PER_PAGE = 3;
export const STALE_DAYS = 5;

interface Props {
    connected: boolean;
    pending: PendingTransaction[];
    onClassify: (tx: PendingTransaction, target: ClassifyTarget) => void;
    daysSinceLastLog: number | null;
    onOpenExpense: () => void;
}

export default function LoggingArea({ connected, pending, onClassify, daysSinceLastLog, onOpenExpense }: Props) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');

    if (connected) {
        if (pending.length === 0) return null;
        return <BubbleRow pending={pending} onClassify={onClassify} />;
    }
    if (daysSinceLastLog != null && daysSinceLastLog >= STALE_DAYS) {
        return (
            <Pressable onPress={onOpenExpense} accessibilityRole="button" hitSlop={6}
                style={({ pressed }) => pressed && { opacity: 0.6 }}>
                <Text style={[homeType.small, { color: theme.harvestInk }]}>
                    {t('logging.nudge', { count: daysSinceLastLog })}
                </Text>
            </Pressable>
        );
    }
    return null;
}

function BubbleRow({ pending, onClassify }: { pending: PendingTransaction[]; onClassify: Props['onClassify'] }) {
    const [width, setWidth] = useState(0);
    const pages = useMemo(() => {
        const out: PendingTransaction[][] = [];
        for (let i = 0; i < pending.length; i += PER_PAGE) out.push(pending.slice(i, i + PER_PAGE));
        return out;
    }, [pending]);

    return (
        <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
            {width > 0 ? (
                <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    scrollEnabled={pages.length > 1}
                >
                    {pages.map((page, i) => (
                        <View key={i} style={[styles.page, { width }]}>
                            {page.map(tx => <DraggableBubble key={tx.id} tx={tx} onClassify={onClassify} />)}
                        </View>
                    ))}
                </ScrollView>
            ) : null}
        </View>
    );
}

function DraggableBubble({ tx, onClassify }: { tx: PendingTransaction; onClassify: Props['onClassify'] }) {
    const zones = useDropZones();
    const { t } = useTranslation('dashboard');
    const { formatMoney } = useLocale();
    const dragGesture = zones?.dragGesture;
    const gesture = useMemo(
        () => dragGesture?.(tx, BUBBLE, target => onClassify(tx, target)),
        [dragGesture, tx, onClassify],
    );
    const lifted = zones?.dragging?.id === tx.id;
    const face = (
        <View
            accessible
            accessibilityLabel={t(tx.kind === 'income' ? 'logging.bubbleIncomeA11y' : 'logging.bubbleExpenseA11y',
                { name: tx.name, amount: formatMoney(tx.amount, 2) })}
            accessibilityHint={t('logging.bubbleHint')}
            style={lifted && styles.lifted}
        >
            <BubbleFace tx={tx} />
        </View>
    );
    return gesture ? <GestureDetector gesture={gesture}>{face}</GestureDetector> : face;
}

/** The bubble itself — also drawn as the floating ghost while it is dragged. */
export function BubbleFace({ tx }: { tx: PendingTransaction }) {
    const { theme } = useTheme();
    const { formatMoney } = useLocale();
    return (
        <View style={[styles.bubble, { backgroundColor: theme.surface, ...(shadow(3) as object) }]}>
            <Text style={[homeType.small, styles.name, { color: theme.ink }]} numberOfLines={1}>{tx.name}</Text>
            <Text style={[homeType.verySmall, { color: tx.kind === 'income' ? theme.success : theme.ink2 }]} numberOfLines={1}>
                {formatMoney(tx.amount, 2)}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    page: { flexDirection: 'row', justifyContent: 'space-evenly', paddingVertical: 8 },
    bubble: {
        width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2,
        alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
    },
    name: { maxWidth: BUBBLE - 14, textAlign: 'center' },
    lifted: { opacity: 0.25 },
});
