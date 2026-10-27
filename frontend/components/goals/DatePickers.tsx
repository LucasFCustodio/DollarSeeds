/**
 * The goal form's two date fields — target month and target year — shared by the
 * goal form and the Goals tab's edit modal.
 *
 * The chip LABEL is translated; the value handed to onSelect is the canonical English
 * month, which is what gets POSTed and stored (.claude/docs/i18n.md).
 *
 * `selected` may be null: the onboarding's required form starts with nothing picked,
 * so the user has to choose explicitly.
 */
import React, { useRef } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { MONTHS } from '../../constants/months';
import { formStyles as styles, YEAR_ITEM_W } from './formStyles';

export function MonthChips({ selected, onSelect, isDisabled }: {
    selected: string | null;
    onSelect: (month: string) => void;
    /** Months that can't be picked for the chosen year (before this one). */
    isDisabled?: (month: string) => boolean;
}) {
    const { theme } = useTheme();
    const { monthAbbr } = useLocale();
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 14 }}
            contentContainerStyle={{ flexDirection: 'row', gap: 8 }}
        >
            {MONTHS.map(month => {
                const active = selected === month;
                const disabled = !!isDisabled?.(month);
                return (
                    <Pressable
                        key={month}
                        onPress={() => onSelect(month)}
                        disabled={disabled}
                        accessibilityState={{ selected: active, disabled }}
                        style={[
                            styles.chip,
                            {
                                backgroundColor: active ? theme.brand : theme.surface,
                                borderColor: active ? theme.brand : theme.border,
                                opacity: disabled ? 0.4 : 1,
                            },
                        ]}
                    >
                        <Text style={[styles.chipText, { color: active ? theme.onBrand : theme.ink2 }]}>
                            {monthAbbr(month)}
                        </Text>
                    </Pressable>
                );
            })}
        </ScrollView>
    );
}

// Horizontal twin of the month wheel in IncomeContainer/ExpenseContainer: a free
// continuous swipe that snaps to the nearest item, rather than a stepped one-at-a-time
// control. Runs from this year out 70 years, so long-horizon goals (a mortgage, a
// retirement fund) are reachable by swiping instead of being capped at +2.
const YEAR_SPAN = 70;

export function YearPicker({ selected, onSelect, anchor }: {
    selected: number | null;
    onSelect: (y: number) => void;
    /** Where the list opens when nothing is selected yet. */
    anchor?: number;
}) {
    const { theme } = useTheme();
    const scrollRef = useRef<ScrollView>(null);
    const didInit = useRef(false);
    const startYear = new Date().getFullYear();

    // An existing goal can hold a year before this one (an old deadline), so anchor the
    // list at whichever is earlier and let the selection always be reachable.
    const firstYear = Math.min(startYear, selected ?? startYear);
    const years = Array.from(
        { length: startYear + YEAR_SPAN - firstYear + 1 },
        (_, i) => firstYear + i,
    );

    const scrollToYear = (y: number, animated: boolean) => {
        scrollRef.current?.scrollTo({ x: Math.max(0, years.indexOf(y)) * YEAR_ITEM_W, animated });
    };

    // Center the current selection on first layout. onContentSizeChange (not a mount
    // effect) because inside the edit Modal the ScrollView has no layout until it opens,
    // and a scrollTo before that is a no-op.
    const onContentSizeChange = () => {
        if (didInit.current) return;
        didInit.current = true;
        scrollToYear(selected ?? anchor ?? startYear, false);
    };

    const onScrollEnd = (e: any) => {
        // Nothing chosen yet (required form): scrolling is looking, not choosing.
        if (selected === null) return;
        const idx = Math.round(e.nativeEvent.contentOffset.x / YEAR_ITEM_W);
        const clamped = Math.max(0, Math.min(years.length - 1, idx));
        onSelect(years[clamped]);
    };

    return (
        <ScrollView
            ref={scrollRef}
            horizontal
            snapToInterval={YEAR_ITEM_W}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onContentSizeChange={onContentSizeChange}
            onMomentumScrollEnd={onScrollEnd}
            style={{ marginBottom: 20 }}
        >
            {years.map(y => {
                const active = selected === y;
                return (
                    <Pressable
                        key={y}
                        onPress={() => { onSelect(y); scrollToYear(y, true); }}
                        accessibilityState={{ selected: active }}
                        style={[
                            styles.yearItem,
                            {
                                backgroundColor: active ? theme.brand : theme.surface,
                                borderColor: active ? theme.brand : theme.border,
                            },
                        ]}
                    >
                        <Text style={[styles.chipText, { color: active ? theme.onBrand : theme.ink2 }]}>
                            {y}
                        </Text>
                    </Pressable>
                );
            })}
        </ScrollView>
    );
}
