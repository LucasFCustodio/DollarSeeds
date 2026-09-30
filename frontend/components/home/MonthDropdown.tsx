/**
 * MonthDropdown — the home's month picker: a small wheel that drops down under the
 * date, three months tall. The TOP row is the selected month. Dragging down brings
 * earlier months to the top, dragging up later ones; it snaps one row at a time and
 * picks the month it settles on, which the home treats exactly as the old picker's
 * tap (same fetch, same cache reset). Tapping a row picks it and closes; tapping
 * anywhere else closes.
 *
 * January–December of the current year only: months are stored by name, with no
 * year, so the wheel stops at both ends rather than wrapping.
 *
 * A transparent Modal rather than a view in the top bar, so the panel can float over
 * the hero (which clips its children) and a tap anywhere on the screen closes it.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    Modal, Pressable, ScrollView, StyleSheet, Text, View,
    type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, shadow, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { MONTHS } from '../../constants/months';
import { ft } from '../../constants/responsive';

export interface Anchor { x: number; y: number; width: number; height: number }

interface Props {
    anchor: Anchor | null;
    selected: number;
    onPick: (index: number) => void;
    onClose: () => void;
}

const ROW_H = 40;
const VISIBLE = 3;
const WIDTH = 176;
const GAP = 6;

export default function MonthDropdown({ anchor, selected, onPick, onClose }: Props) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    const { monthLabel } = useLocale();
    const scroll = useRef<ScrollView>(null);
    const last = useRef(selected);
    const [top, setTop] = useState(selected);

    // Every open starts with the current month on top.
    useEffect(() => {
        if (!anchor) return;
        last.current = selected;
        setTop(selected);
        requestAnimationFrame(() => scroll.current?.scrollTo({ y: selected * ROW_H, animated: false }));
    }, [anchor, selected]);

    const settle = (y: number) => {
        const i = Math.max(0, Math.min(MONTHS.length - 1, Math.round(y / ROW_H)));
        if (i === last.current) return;
        last.current = i;
        onPick(i);
    };
    const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const i = Math.max(0, Math.min(MONTHS.length - 1, Math.round(e.nativeEvent.contentOffset.y / ROW_H)));
        if (i !== top) setTop(i);
    };
    const onEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        // A release with no fling may not produce a momentum phase; settle now.
        if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) settle(e.nativeEvent.contentOffset.y);
    };

    const pickRow = (i: number) => {
        scroll.current?.scrollTo({ y: i * ROW_H, animated: true });
        setTop(i);
        if (i !== last.current) {
            last.current = i;
            onPick(i);
        }
        onClose();
    };

    if (!anchor) return null;
    const left = anchor.x + anchor.width / 2 - WIDTH / 2;

    return (
        <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <Pressable
                style={StyleSheet.absoluteFill}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t('monthPicker.close')}
            />
            <View
                accessibilityLabel={t('monthPicker.title')}
                style={[
                    styles.panel,
                    { top: anchor.y + anchor.height + GAP, left, backgroundColor: theme.surface, borderColor: theme.border },
                    shadow(8) as object,
                ]}
            >
                {/* The selected (top) row's band; the wheel scrolls under it. */}
                <View pointerEvents="none" style={[styles.band, { backgroundColor: theme.brandSoft }]} />
                <ScrollView
                    ref={scroll}
                    style={{ height: ROW_H * VISIBLE }}
                    contentContainerStyle={{ paddingBottom: ROW_H * (VISIBLE - 1) }}
                    contentOffset={{ x: 0, y: selected * ROW_H }}
                    snapToInterval={ROW_H}
                    decelerationRate="fast"
                    showsVerticalScrollIndicator={false}
                    scrollEventThrottle={16}
                    onScroll={onScroll}
                    onScrollEndDrag={onEndDrag}
                    onMomentumScrollEnd={e => settle(e.nativeEvent.contentOffset.y)}
                >
                    {MONTHS.map((m, i) => {
                        const active = i === top;
                        return (
                            <Pressable
                                key={m}
                                onPress={() => pickRow(i)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                style={styles.row}
                            >
                                <Text
                                    numberOfLines={1}
                                    style={[
                                        styles.label,
                                        active
                                            ? { fontFamily: Fonts.sansSemiBold, color: theme.brand }
                                            : { color: theme.ink3 },
                                    ]}
                                >
                                    {monthLabel(m)}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    panel: {
        position: 'absolute', width: WIDTH, borderRadius: 14, borderWidth: 1,
        paddingHorizontal: 6,
    },
    band: { position: 'absolute', left: 6, right: 6, top: 0, height: ROW_H, borderRadius: 10 },
    row: { height: ROW_H, alignItems: 'center', justifyContent: 'center' },
    label: { fontFamily: Fonts.sansMedium, fontSize: ft(15) },
});
