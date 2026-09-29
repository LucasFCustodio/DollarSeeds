/**
 * MinToggle — "Log min payment" with a real switch on the right. Only the switch
 * changes the state (tap or slide it); the row around it is a label, not a button.
 *
 * The state is the server's `min_logged_this_cycle`, so it turns itself off the day
 * after the due date, when a new cycle starts. While a request is in flight the switch
 * shows where it is going (`pendingValue`) and snaps back if the server refuses.
 * Outlined, so the focus debt's filled Extra button stays the strongest action.
 */
import React, { memo } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import type { Debt } from '../../lib/debtFreedom';

interface Props {
    debt: Debt;
    /** The target state while a request is in flight; null when idle. */
    pendingValue: boolean | null;
    onChange: () => void;
}

function MinToggle({ debt, pendingValue, onChange }: Props) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const pending = pendingValue != null;
    const on = pending ? pendingValue : debt.min_logged_this_cycle;
    return (
        <View style={[styles.base, { borderColor: theme.brand, backgroundColor: on ? theme.brandSoft : theme.surface }]}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
                importantForAccessibility="no"
                style={[styles.label, { color: theme.brand, fontFamily: Fonts.sansSemiBold }]}>
                {on ? t('actions.minLogged') : t('actions.logMin')}
            </Text>
            <Switch
                value={on}
                onValueChange={pending ? undefined : onChange}
                disabled={pending}
                trackColor={{ false: theme.border, true: theme.brand }}
                thumbColor={theme.surface}
                // react-native-web only: its "on" thumb ignores thumbColor.
                {...({ activeThumbColor: theme.surface } as object)}
                ios_backgroundColor={theme.border}
                accessibilityRole="switch"
                accessibilityLabel={t('a11y.minToggle', { name: debt.name })}
                accessibilityState={{ checked: on, busy: pending }}
            />
        </View>
    );
}

export default memo(MinToggle);

// Same outer height as the v1 "Log a payment" button (Button size "md").
const styles = StyleSheet.create({
    base: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        minHeight: 46, paddingVertical: 4, paddingLeft: 14, paddingRight: 8, borderRadius: 10, borderWidth: 1.5,
    },
    label: { fontSize: 15, flexShrink: 1 },
});
