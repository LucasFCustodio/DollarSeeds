/**
 * TitheEnvelope — this month's tithe on one full-width line:
 *   {icon} Tithe - $X {toggle}
 * The toggle marks it given (and back). Given or not, the line looks the same; the
 * toggle carries the state. Rendered only when tithing is on with a non-zero amount.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import Card from '../ui/Card';
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
        <Card theme={theme} depth={6} padding={14}>
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
                />
            </View>
        </Card>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    label: { flex: 1 },
});
