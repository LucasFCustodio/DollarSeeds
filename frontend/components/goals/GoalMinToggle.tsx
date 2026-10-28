/**
 * GoalMinToggle — "Add $334 for October", the goal card's monthly-minimum switch.
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
    // "Added automatically" describes a minimum that is actually in, so it shows only
    // then: while auto is on but the month has no income yet, the label stays the plain
    // call to action. That also keeps this state at two lines instead of three.
    const addedAuto = auto && on;
    return (
        <View style={[styles.base, { borderColor: theme.brand, backgroundColor: on ? theme.brandSoft : theme.surface }]}>
            <View style={styles.text} importantForAccessibility="no">
                {/* Two thirds of the card wide, and never more than two lines. The
                    catalogue string holds the break ("Add $90" / "for October"); the
                    automatic state drops the month instead, so the hint below it is
                    line two rather than a third line. It only shrinks for a long
                    amount. */}
                <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}
                    style={[styles.label, { color: theme.brand, fontFamily: Fonts.sansSemiBold }]}>
                    {addedAuto
                        ? t('minimum.loggedAuto', { amount: formatMoney(amount) })
                        : on
                            ? t('minimum.logged', { amount: formatMoney(amount), month })
                            : t('minimum.log', { amount: formatMoney(amount), month })}
                </Text>
                {addedAuto ? (
                    <Text numberOfLines={1} style={[styles.sub, { color: theme.ink3, fontFamily: Fonts.sans }]}>{t('minimum.auto')}</Text>
                ) : null}
            </View>
            <View style={styles.switch}>
                <MinSwitch on={on} pending={pending} onChange={onChange}
                    a11yLabel={t('minimum.a11y', { name: title })} />
            </View>
        </View>
    );
}

export default memo(GoalMinToggle);

const styles = StyleSheet.create({
    base: {
        // Two thirds of the goal card's bottom row, against "+ Extra"'s one third:
        // at an even split the longest label ("$1,250 added for September", with
        // "Added automatically" under it) ran to four lines and broke mid-word.
        flex: 2,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        minHeight: 46, paddingVertical: 4, paddingLeft: 10, paddingRight: 6, borderRadius: 10, borderWidth: 1.5,
    },
    text: { flexShrink: 1 },
    label: { fontSize: ft(13, 1.2), lineHeight: ft(16, 1.2) },
    // A touch smaller than the debts' switch, with the space it frees given back to the
    // label (a transform alone would keep the full-size layout box).
    switch: { transform: [{ scale: 0.85 }], marginHorizontal: -4 },
    sub: { fontSize: ft(11, 1.18), marginTop: 1 },
});
