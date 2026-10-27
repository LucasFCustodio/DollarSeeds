/**
 * GoalMinToggle — "Add my $334 for October", the goal card's monthly-minimum switch.
 * The same outlined container and switch as the debts' MinToggle (MinSwitch is
 * shared), so the two habits look like one.
 *
 * The state is the server's `minimum_logged` for THIS month; the amount is the
 * server's `minimum_amount` (the stored minimum, capped at what is left to save).
 */
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { MinSwitch } from '../debts/MinToggle';
import { ft } from '../../constants/responsive';
import { MONTHS } from '../../constants/months';

interface Props {
    title: string;
    logged: boolean;
    amount: number;
    auto: boolean;
    /** The target state while a request is in flight; null when idle. */
    pendingValue: boolean | null;
    onChange: () => void;
}

function GoalMinToggle({ title, logged, amount, auto, pendingValue, onChange }: Props) {
    const { t } = useTranslation('goals');
    const { theme } = useTheme();
    const { formatMoney, monthLabel } = useLocale();
    const pending = pendingValue != null;
    const on = pending ? pendingValue : logged;
    const month = monthLabel(MONTHS[new Date().getMonth()]);
    return (
        <View style={[styles.base, { borderColor: theme.brand, backgroundColor: on ? theme.brandSoft : theme.surface }]}>
            <View style={styles.text} importantForAccessibility="no">
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
                    style={[styles.label, { color: theme.brand, fontFamily: Fonts.sansSemiBold }]}>
                    {on
                        ? t('minimum.logged', { amount: formatMoney(amount), month })
                        : t('minimum.log', { amount: formatMoney(amount), month })}
                </Text>
                {auto ? (
                    <Text style={[styles.sub, { color: theme.ink3, fontFamily: Fonts.sans }]}>{t('minimum.auto')}</Text>
                ) : null}
            </View>
            <MinSwitch on={on} pending={pending} onChange={onChange}
                a11yLabel={t('minimum.a11y', { name: title })} />
        </View>
    );
}

export default memo(GoalMinToggle);

const styles = StyleSheet.create({
    base: {
        flex: 1,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        minHeight: 46, paddingVertical: 4, paddingLeft: 14, paddingRight: 8, borderRadius: 10, borderWidth: 1.5,
    },
    text: { flexShrink: 1 },
    label: { fontSize: ft(14, 1.2) },
    sub: { fontSize: ft(11, 1.18), marginTop: 1 },
});
