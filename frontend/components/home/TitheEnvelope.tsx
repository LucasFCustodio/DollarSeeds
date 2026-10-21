/**
 * TitheEnvelope — this month's tithe on one full-width line:
 *   {icon} Tithe - $X {toggle}
 * The toggle marks it given (and back). Given or not, the line looks the same; the
 * toggle carries the state. Rendered only when tithing is on with a non-zero amount.
 *
 * Painted with the next-payment card's art, outline and scrim (PaintedCard). The
 * default centre crop of this one-line card already shows the field's rows.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import PaintedCard, { PAINTED_OUTLINE } from './PaintedCard';
import { IconScripture } from '../icons';
import TitheToggle from './TitheToggle';
import { homeType } from './homeType';

interface Props {
    amount: number;
    given: boolean;
    disabled: boolean;
    onToggle: () => void;
}

export default function TitheEnvelope({ amount, given, disabled, onToggle }: Props) {
    const { theme } = useTheme();
    const { formatMoney } = useLocale();
    const { t } = useTranslation('dashboard');

    return (
        <PaintedCard source={ART} borderColor={theme.ink} borderWidth={PAINTED_OUTLINE} style={styles.card}>
            <View style={styles.row}>
                <IconScripture size={16} color={theme.brand} />
                <Text style={[homeType.small, styles.label, { color: theme.ink2 }]} numberOfLines={1}>
                    {t('tithe.title')}
                    {' - '}
                    <Text style={[homeType.medium, { color: theme.ink }]}>{formatMoney(amount)}</Text>
                </Text>
                <TitheToggle
                    theme={theme}
                    value={given}
                    disabled={disabled}
                    onToggle={onToggle}
                    a11yLabel={t('tithe.givenToggleA11y')}
                    outline={theme.ink}
                />
            </View>
        </PaintedCard>
    );
}

const ART = require('../../assets/images/home/next-payment-bg.png');

const styles = StyleSheet.create({
    card: { padding: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    label: { flex: 1 },
});
