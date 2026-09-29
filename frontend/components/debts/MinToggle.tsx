/**
 * MinToggle — "Log min payment" ⇄ "Min payment logged". The state is the server's
 * `min_logged_this_cycle`, so it turns itself off the day after the due date, when a
 * new cycle starts. Outlined, so the focus debt's filled Extra button stays the
 * strongest action on screen.
 */
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { IconCheck } from '../icons';
import type { Debt } from '../../lib/debtFreedom';

interface Props {
    debt: Debt;
    /** A request is in flight: show it, ignore taps. */
    pending: boolean;
    onPress: () => void;
}

function MinToggle({ debt, pending, onPress }: Props) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const on = debt.min_logged_this_cycle;
    return (
        <Pressable
            onPress={pending ? undefined : onPress}
            accessibilityRole="switch"
            accessibilityState={{ checked: on, busy: pending }}
            accessibilityLabel={t('a11y.minToggle', { name: debt.name })}
            style={({ pressed }) => [
                styles.base,
                {
                    borderColor: theme.brand,
                    backgroundColor: on ? theme.brandSoft : theme.surface,
                    opacity: pressed || pending ? 0.7 : 1,
                },
            ]}
        >
            {on ? (
                <View style={[styles.check, { backgroundColor: theme.brand }]}>
                    <IconCheck size={12} color={theme.onBrand} />
                </View>
            ) : null}
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
                style={[styles.label, { color: theme.brand, fontFamily: Fonts.sansSemiBold }]}>
                {on ? t('actions.minLogged') : t('actions.logMin')}
            </Text>
        </Pressable>
    );
}

export default memo(MinToggle);

// Same box as Button size "md", which the v1 "Log a payment" button used.
const styles = StyleSheet.create({
    base: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 10.5, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5,
    },
    check: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    label: { fontSize: 15, flexShrink: 1 },
});
