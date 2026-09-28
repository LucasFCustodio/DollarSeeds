/**
 * BudgetTypeSelector — reusable picker for the 50/30/20-style budget splits.
 *
 * Used in Settings today; designed to drop into onboarding later. Purely
 * presentational: it renders the options from the BUDGET_TYPES single source of
 * truth and reports the chosen KEY. All colors come from useTheme() tokens.
 *
 * FREE TIER. `locked` lists the types outside the user's `budget_types` allowance.
 * They still render and still report taps — the parent answers a tap with the upsell —
 * but read as unavailable. The stored choice can itself be locked: a lapsed subscriber
 * keeps Wealth Builder SAVED while open months use `effective` instead. That card stays
 * marked as the choice (outlined, with a lock where the check would be) and says so in
 * words, and the effective card is tagged "in use", so the screen reads as "saved for
 * later" rather than as two selections or a setting that didn't stick.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { IconCheck, IconLock } from '../icons';
import {
    BUDGET_TYPES, BUDGET_TYPE_ORDER, BudgetTypeKey, splitLabel,
} from '../../constants/budgetTypes';

interface Props {
    value: BudgetTypeKey;
    onSelect: (key: BudgetTypeKey) => void;
    disabled?: boolean;
    /** Types the user's plan doesn't include. Empty/omitted = everything available. */
    locked?: readonly BudgetTypeKey[];
    /** What open months actually use, when that differs from `value`. */
    effective?: BudgetTypeKey;
}

export default function BudgetTypeSelector({ value, onSelect, disabled, locked = [], effective }: Props) {
    const { theme } = useTheme();
    // Names and taglines live in `common:budgetType` rather than a screen namespace
    // because the dashboard renders the same name in its split row.
    const { t } = useTranslation(['common', 'premium']);
    const inUse = effective && effective !== value ? effective : null;

    return (
        <View style={{ gap: 10 }}>
            {BUDGET_TYPE_ORDER.map(key => {
                const def = BUDGET_TYPES[key];
                const selected = key === value;
                const isLocked = locked.includes(key);
                // Selected AND locked = the saved-for-later choice of a lapsed subscriber.
                const saved = selected && isLocked;
                const active = selected && !isLocked;
                return (
                    <Pressable
                        key={key}
                        onPress={() => !disabled && onSelect(key)}
                        style={({ pressed }) => [
                            styles.option,
                            {
                                backgroundColor: active ? theme.brandSoft : isLocked ? theme.surfaceSoft : theme.surface,
                                borderColor: selected ? theme.brand : theme.border,
                            },
                            saved && { borderStyle: 'dashed' },
                            pressed && { opacity: 0.85 },
                        ]}
                    >
                        <View style={{ flex: 1 }}>
                            <View style={[isLocked && !saved && styles.dim]}>
                                <View style={styles.titleRow}>
                                    <Text style={[styles.name, { color: theme.ink }]}>
                                        {t(`common:budgetType.${key}.name`)}
                                    </Text>
                                    <Text style={[styles.split, { color: selected ? theme.brand : theme.ink3 }]}>
                                        {splitLabel(def)}
                                    </Text>
                                    {isLocked && (
                                        <View style={[styles.badge, { backgroundColor: theme.harvest }]}>
                                            <IconLock size={9} color={theme.brand} />
                                            <Text style={[styles.badgeText, { color: theme.brand }]}>
                                                {t('premium:lock.badge')}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={[styles.tagline, { color: theme.ink2 }]}>
                                    {t(`common:budgetType.${key}.tagline`)}
                                </Text>
                                {key === inUse && (
                                    <Text style={[styles.inUse, { color: theme.brand }]}>
                                        {t('premium:budgetLock.inUse')}
                                    </Text>
                                )}

                                {/* Mini split bar for an at-a-glance feel of the proportions */}
                                <View style={[styles.bar, { backgroundColor: theme.borderSoft }]}>
                                    <View style={{ flex: def.needs, backgroundColor: theme.needs }} />
                                    <View style={{ flex: def.wants, backgroundColor: theme.wants }} />
                                    <View style={{ flex: def.savings, backgroundColor: theme.goals }} />
                                </View>
                            </View>

                            {saved && inUse && (
                                <Text style={[styles.savedNote, { color: theme.ink2 }]}>
                                    {t('premium:budgetLock.savedChoice', {
                                        name: t(`common:budgetType.${key}.name`),
                                        fallback: t(`common:budgetType.${inUse}.name`),
                                    })}
                                </Text>
                            )}
                        </View>

                        <View style={[
                            styles.radio,
                            {
                                borderColor: selected ? theme.brand : theme.border,
                                backgroundColor: active ? theme.brand : 'transparent',
                            },
                        ]}>
                            {active && <IconCheck size={12} color="#fff" />}
                            {saved && <IconLock size={11} color={theme.brand} />}
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1.5,
    },
    dim: { opacity: 0.6 },
    titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
    name: { fontFamily: 'Geist-SemiBold', fontSize: 15, letterSpacing: -0.2 },
    split: { fontFamily: 'JetBrainsMono-SemiBold', fontSize: 12 },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        alignSelf: 'center',
    },
    badgeText: { fontFamily: 'JetBrainsMono-SemiBold', fontSize: 8, letterSpacing: 1 },
    tagline: { fontFamily: 'Geist-Regular', fontSize: 12, marginTop: 2, lineHeight: 17 },
    inUse: { fontFamily: 'JetBrainsMono-SemiBold', fontSize: 9, letterSpacing: 1, marginTop: 6 },
    savedNote: { fontFamily: 'Geist-Regular', fontSize: 12, lineHeight: 17, marginTop: 10 },
    bar: {
        flexDirection: 'row',
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        marginTop: 10,
    },
    radio: {
        width: 22, height: 22, borderRadius: 11,
        borderWidth: 2,
        alignItems: 'center', justifyContent: 'center',
    },
});
