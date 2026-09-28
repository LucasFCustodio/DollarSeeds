/**
 * DebtGarden — the plant view: a vertical, snapping list of PlantSections.
 *
 * Paid-off (older) plants sit above and newer ones below, so swiping down goes back
 * in time. Each section is ~82% of the viewport, leaving the top of the next one
 * peeking in; the list snaps section by section and opens on the focus debt.
 *
 * Performance: only the section that is ≥60% visible ("settled") animates, and only
 * while the screen is active. Its neighbours render their static frame, and anything
 * further away is unmounted (windowSize 3). Items are memoized and every callback
 * passed down is stable.
 */
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, StyleSheet, View, ViewToken } from 'react-native';
import type { Debt } from '../../lib/debtFreedom';
import type { PlantViewHandle } from './PlantView';
import PlantSection from './PlantSection';

export const SECTION_FRACTION = 0.82;

export interface DebtGardenHandle {
    scrollToDebt: (id: number, animated?: boolean) => void;
    plant: (id: number) => PlantViewHandle | null;
}

interface Props {
    debts: Debt[];
    focusId: number | null;
    active: boolean;
    streamAnimId: number | null;
    onSettledChange: (debt: Debt | null) => void;
    onOpen: (id: number) => void;
    onLogPayment: (id: number) => void;
    onComplete: (id: number) => void;
    onStreamRevealed: (id: number) => void;
}

const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

const DebtGarden = forwardRef<DebtGardenHandle, Props>(function DebtGarden(
    { debts, focusId, active, streamAnimId, onSettledChange, onOpen, onLogPayment, onComplete, onStreamRevealed },
    ref,
) {
    const listRef = useRef<FlatList<Debt>>(null);
    const plants = useRef(new Map<number, PlantViewHandle>());
    const [size, setSize] = useState<{ w: number; h: number } | null>(null);
    const [settledId, setSettledId] = useState<number | null>(null);

    const sectionH = size ? Math.round(size.h * SECTION_FRACTION) : 0;
    const debtsRef = useRef(debts);
    debtsRef.current = debts;

    const registerPlant = useCallback((id: number, h: PlantViewHandle | null) => {
        if (h) plants.current.set(id, h);
        else plants.current.delete(id);
    }, []);

    useImperativeHandle(ref, () => ({
        scrollToDebt(id, animated = true) {
            const index = debtsRef.current.findIndex(d => d.id === id);
            if (index >= 0) listRef.current?.scrollToIndex({ index, animated });
        },
        plant: (id) => plants.current.get(id) ?? null,
    }), []);

    const onSettledChangeRef = useRef(onSettledChange);
    onSettledChangeRef.current = onSettledChange;

    // Stable across renders, as FlatList requires.
    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        const top = viewableItems.find(v => v.isViewable);
        const debt = (top?.item as Debt | undefined) ?? null;
        setSettledId(debt?.id ?? null);
        onSettledChangeRef.current(debt);
    }).current;

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setSize(prev => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
    }, []);

    const getItemLayout = useCallback(
        (_: ArrayLike<Debt> | null | undefined, index: number) => ({ length: sectionH, offset: sectionH * index, index }),
        [sectionH],
    );

    const renderItem = useCallback(({ item, index }: { item: Debt; index: number }) => (
        <PlantSection
            debt={item}
            hasNext={index < debtsRef.current.length - 1}
            width={size?.w ?? 0}
            height={sectionH}
            settled={active && item.id === settledId}
            registerPlant={registerPlant}
            onOpen={onOpen}
            onLogPayment={onLogPayment}
            onComplete={onComplete}
            streamAnimateIn={streamAnimId === item.id}
            onStreamRevealed={onStreamRevealed}
        />
    ), [size?.w, sectionH, active, settledId, registerPlant, onOpen, onLogPayment, onComplete, streamAnimId, onStreamRevealed]);

    const initialIndex = useMemo(() => {
        const i = debts.findIndex(d => d.id === focusId);
        return i >= 0 ? i : Math.max(0, debts.length - 1);
        // Only the first mount's focus matters; later moves are explicit scrolls.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [size != null]);

    // Lets the last section snap to the top like the others.
    const footer = size ? <View style={{ height: Math.max(0, size.h - sectionH) }} /> : null;

    return (
        <View style={styles.fill} onLayout={onLayout}>
            {size && sectionH > 0 ? (
                <FlatList
                    ref={listRef}
                    data={debts}
                    keyExtractor={d => String(d.id)}
                    renderItem={renderItem}
                    extraData={debts.length}
                    getItemLayout={getItemLayout}
                    initialScrollIndex={initialIndex}
                    snapToInterval={sectionH}
                    snapToAlignment="start"
                    decelerationRate="fast"
                    showsVerticalScrollIndicator={false}
                    onViewableItemsChanged={onViewableItemsChanged}
                    viewabilityConfig={VIEWABILITY}
                    windowSize={3}
                    initialNumToRender={2}
                    maxToRenderPerBatch={2}
                    removeClippedSubviews
                    ListFooterComponent={footer}
                    onScrollToIndexFailed={({ index }) => {
                        listRef.current?.scrollToOffset({ offset: index * sectionH, animated: true });
                    }}
                />
            ) : null}
        </View>
    );
});

export default DebtGarden;

const styles = StyleSheet.create({
    fill: { flex: 1 },
});
