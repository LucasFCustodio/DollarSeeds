/**
 * GardenHeader — fixed above the garden, describing the plant that has settled on
 * screen. Crossfades when a new plant settles.
 */
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { IconPlus } from '../icons';
import type { Debt } from '../../lib/debtFreedom';
import { useDebtFormat } from './format';

export type GardenMode = 'plants' | 'cards';

interface Props {
    debt: Debt | null;
    planEstPayoffMonth: string | null;
    mode: GardenMode;
    onToggleMode: () => void;
    onAdd: () => void;
}

function GardenHeader({ debt, planEstPayoffMonth, mode, onToggleMode, onAdd }: Props) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const f = useDebtFormat();

    let eyebrow = '';
    let amount = '';
    let sub = '';
    if (debt && mode === 'plants') {
        eyebrow = t('header.eyebrow', { position: debt.position, total: debt.total });
        if (debt.status === 'paid_off') {
            amount = t('header.paidOff');
            sub = t('header.freeSince', { date: f.monthYear(debt.est_payoff_month) });
        } else {
            amount = t('header.left', { amount: f.money(debt.current_balance) });
            sub = t('header.freeBy', { date: f.monthYear(debt.est_payoff_month) });
        }
    } else if (debt) {
        // Card view describes the whole plan rather than one plant.
        eyebrow = t('header.eyebrow', { position: debt.position, total: debt.total });
        amount = t('header.left', { amount: f.money(debt.current_balance) });
        sub = t('header.planFreeBy', { date: f.monthYear(planEstPayoffMonth) });
    }

    const missingDate = debt && !debt.est_payoff_month && debt.status !== 'paid_off';

    return (
        <View style={styles.row}>
            <View style={styles.text}>
                {debt ? (
                    <Animated.View key={`${debt.id}-${mode}`} entering={FadeIn.duration(260)} exiting={FadeOut.duration(160)}>
                        <Text style={[styles.eyebrow, { color: theme.ink2, fontFamily: Fonts.monoSemiBold }]}>
                            {eyebrow}
                        </Text>
                        <Text
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            style={[styles.amount, { color: theme.ink, fontFamily: Fonts.serif }]}
                        >
                            {amount}
                        </Text>
                        <Text style={[styles.sub, { color: missingDate ? theme.danger : theme.ink2, fontFamily: Fonts.sansSemiBold }]}>
                            {sub}
                        </Text>
                    </Animated.View>
                ) : null}
            </View>
            <View style={styles.actions}>
                <Pressable
                    onPress={onToggleMode}
                    accessibilityRole="button"
                    accessibilityLabel={mode === 'plants' ? t('actions.showCards') : t('actions.showPlants')}
                    hitSlop={8}
                    style={[styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.ink }]}
                >
                    {mode === 'plants' ? <CardsGlyph color={theme.ink} /> : <PlantGlyph color={theme.ink} />}
                </Pressable>
                <Pressable
                    onPress={onAdd}
                    accessibilityRole="button"
                    accessibilityLabel={t('actions.add')}
                    hitSlop={8}
                    style={[styles.iconBtn, { backgroundColor: theme.brand, borderColor: theme.ink }]}
                >
                    <IconPlus size={18} color={theme.onBrand} />
                </Pressable>
            </View>
        </View>
    );
}

export default memo(GardenHeader);

function CardsGlyph({ color }: { color: string }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Rect x="3.5" y="4" width="17" height="6.5" rx="2" stroke={color} strokeWidth="2" />
            <Rect x="3.5" y="13.5" width="17" height="6.5" rx="2" stroke={color} strokeWidth="2" />
        </Svg>
    );
}

function PlantGlyph({ color }: { color: string }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path d="M12 13V7" stroke={color} strokeWidth="2" strokeLinecap="round" />
            <Path d="M12 9C9.5 9 8 7.5 8 5c2.5 0 4 1.5 4 4ZM12 8c0-2.5 1.5-4 4-4 0 2.5-1.5 4-4 4Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
            <Path d="M6 13h12l-1.6 7.2a1 1 0 0 1-1 .8H8.6a1 1 0 0 1-1-.8L6 13Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        </Svg>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6, minHeight: 104 },
    text: { flex: 1, paddingRight: 12 },
    eyebrow: { fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 2 },
    amount: { fontSize: 44, lineHeight: 50 },
    sub: { fontSize: 15, marginTop: 2 },
    actions: { flexDirection: 'row', gap: 10, paddingTop: 4 },
    iconBtn: { width: 40, height: 40, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
