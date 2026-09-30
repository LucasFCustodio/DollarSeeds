/**
 * DropZones — drag-and-drop for the home's pending-transaction bubbles.
 *
 * A bubble is long-pressed and dragged onto a target: an expense onto Needs, Wants or
 * Savings, an income onto the hero. The provider owns everything a drag needs so the
 * pieces stay independent:
 *
 *  - targets register a View with useDropTarget(); their window rects are measured
 *    once when a drag starts (the page cannot scroll mid-drag, so they hold still);
 *  - the dragged bubble is drawn as a floating ghost in an overlay above the whole
 *    page, so it can leave the bubble row's clipped scroller;
 *  - hit-testing runs on the UI thread and only crosses to JS when the hovered
 *    target changes, which is what lights the target up.
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { acceptsDrop, type ClassifyTarget, type PendingTransaction } from '../../lib/bankTransactions';

type Rect = { x: number; y: number; w: number; h: number };

interface DropCtx {
    register: (target: ClassifyTarget, view: View | null) => void;
    dragging: PendingTransaction | null;
    hover: ClassifyTarget | null;
    /** A gesture for one bubble. `onDrop` gets the target it was released over. */
    dragGesture: (tx: PendingTransaction, size: number, onDrop: (target: ClassifyTarget) => void) => ReturnType<typeof Gesture.Pan>;
}

const Ctx = createContext<DropCtx | null>(null);

const LONG_PRESS_MS = 300;

export function DropZoneProvider({ children, renderGhost }: {
    children: React.ReactNode;
    renderGhost: (tx: PendingTransaction) => React.ReactNode;
}) {
    const views = useRef(new Map<ClassifyTarget, View>());
    const rootRef = useRef<View>(null);
    const [dragging, setDragging] = useState<PendingTransaction | null>(null);
    const [hover, setHover] = useState<ClassifyTarget | null>(null);

    const rects = useSharedValue<Partial<Record<ClassifyTarget, Rect>>>({});
    const origin = useSharedValue({ x: 0, y: 0 });
    const ghostX = useSharedValue(0);
    const ghostY = useSharedValue(0);
    const lastHover = useSharedValue<ClassifyTarget | null>(null);

    const register = useCallback((target: ClassifyTarget, view: View | null) => {
        if (view) views.current.set(target, view);
        else views.current.delete(target);
    }, []);

    const measure = useCallback((tx: PendingTransaction) => {
        const next: Partial<Record<ClassifyTarget, Rect>> = {};
        views.current.forEach((view, target) => {
            if (!acceptsDrop(tx.kind, target)) return;
            view.measureInWindow((x, y, w, h) => {
                next[target] = { x, y, w, h };
                rects.value = { ...next };
            });
        });
        rects.value = {};
        rootRef.current?.measureInWindow((x, y) => { origin.value = { x, y }; });
    }, [rects, origin]);

    const begin = useCallback((tx: PendingTransaction) => {
        measure(tx);
        setDragging(tx);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }, [measure]);

    const end = useCallback(() => {
        setDragging(null);
        setHover(null);
    }, []);

    const dragGesture = useCallback((
        tx: PendingTransaction, size: number, onDrop: (target: ClassifyTarget) => void,
    ) => {
        const finish = (target: ClassifyTarget | null) => {
            end();
            if (target) onDrop(target);
        };
        return Gesture.Pan()
            .activateAfterLongPress(LONG_PRESS_MS)
            .onStart(e => {
                ghostX.value = e.absoluteX - size / 2;
                ghostY.value = e.absoluteY - size / 2;
                lastHover.value = null;
                runOnJS(begin)(tx);
            })
            .onUpdate(e => {
                ghostX.value = e.absoluteX - size / 2;
                ghostY.value = e.absoluteY - size / 2;
                const found = hitTest(rects, e.absoluteX, e.absoluteY);
                if (found !== lastHover.value) {
                    lastHover.value = found;
                    runOnJS(setHover)(found);
                }
            })
            .onEnd(e => {
                runOnJS(finish)(hitTest(rects, e.absoluteX, e.absoluteY));
            })
            .onFinalize((_e, success) => {
                if (!success) runOnJS(end)();
            });
    }, [begin, end, ghostX, ghostY, lastHover, rects]);

    const ghostStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: ghostX.value - origin.value.x },
            { translateY: ghostY.value - origin.value.y },
            { scale: 1.08 },
        ],
    }));

    const value = useMemo(() => ({ register, dragging, hover, dragGesture }), [register, dragging, hover, dragGesture]);

    return (
        <Ctx.Provider value={value}>
            <View ref={rootRef} style={styles.fill} collapsable={false}>
                {children}
                {dragging ? (
                    <Animated.View pointerEvents="none" style={[styles.ghost, ghostStyle]}>
                        {renderGhost(dragging)}
                    </Animated.View>
                ) : null}
            </View>
        </Ctx.Provider>
    );
}

function hitTest(rects: SharedValue<Partial<Record<ClassifyTarget, Rect>>>, x: number, y: number): ClassifyTarget | null {
    'worklet';
    const all = rects.value;
    for (const key in all) {
        const r = all[key as ClassifyTarget];
        if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return key as ClassifyTarget;
    }
    return null;
}

/** Nothing breaks without a provider: no targets, no drags. */
export function useDropZones() {
    return useContext(Ctx);
}

/**
 * Register a View as a drop target. `valid` is true while a drag that may land here
 * is in progress, `over` while it is over this target.
 */
export function useDropTarget(target: ClassifyTarget) {
    const ctx = useContext(Ctx);
    const register = ctx?.register;
    const ref = useCallback((view: View | null) => register?.(target, view), [register, target]);
    const valid = !!ctx?.dragging && acceptsDrop(ctx.dragging.kind, target);
    return { ref, valid, over: valid && ctx?.hover === target };
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    ghost: { position: 'absolute', left: 0, top: 0 },
});
