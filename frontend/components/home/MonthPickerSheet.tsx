/**
 * MonthPickerSheet — the bottom sheet the home's date opens. Replaces the old
 * previous/next arrows: picking a month hands its 0–11 index back, and the home
 * treats it exactly as an arrow tap (same fetch, same cache reset).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { MONTHS } from '../../constants/months';
import { ft } from '../../constants/responsive';
import Sheet from '../debts/Sheet';
import { IconCheck } from '../icons';

interface Props {
    visible: boolean;
    selected: number;
    onPick: (index: number) => void;
    onClose: () => void;
}

export default function MonthPickerSheet({ visible, selected, onPick, onClose }: Props) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    const { monthLabel } = useLocale();

    return (
        <Sheet visible={visible} onClose={onClose} closeLabel={t('monthPicker.close')} title={t('monthPicker.title')}>
            <View style={styles.grid}>
                {MONTHS.map((m, i) => {
                    const active = i === selected;
                    return (
                        <Pressable
                            key={m}
                            onPress={() => { onPick(i); onClose(); }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            style={({ pressed }) => [
                                styles.cell,
                                {
                                    backgroundColor: active ? theme.brand : theme.surfaceSoft,
                                    borderColor: active ? theme.brand : theme.border,
                                },
                                pressed && { opacity: 0.7 },
                            ]}
                        >
                            <Text
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.8}
                                style={[styles.label, { color: active ? theme.onBrand : theme.ink }]}
                            >
                                {monthLabel(m)}
                            </Text>
                            {active ? <IconCheck size={14} color={theme.onBrand} /> : null}
                        </Pressable>
                    );
                })}
            </View>
        </Sheet>
    );
}

const styles = StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    cell: {
        width: '31.8%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 12,
        paddingHorizontal: 6,
        borderRadius: 12,
        borderWidth: 1,
    },
    label: { fontFamily: Fonts.sansMedium, fontSize: ft(13) },
});
