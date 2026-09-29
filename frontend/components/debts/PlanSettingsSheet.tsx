/**
 * PlanSettingsSheet — reached from the Debts header's settings icon. One row today:
 * "Extra each month", which the payoff projection adds to the focus debt every month.
 * Optional; blank means $0.
 */
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import Button from '../ui/Button';
import InputField from '../ui/InputField';
import { saveSettings } from '../../lib/debtFreedom';
import { useDebtFormat } from './format';
import Sheet, { sheetStyles } from './Sheet';

interface Props {
    visible: boolean;
    monthlyExtra: number | null;
    onClose: () => void;
    onSaved: () => void;
}

export default function PlanSettingsSheet({ visible, monthlyExtra, onClose, onSaved }: Props) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const { parseAmount, formatNumber } = useLocale();
    const f = useDebtFormat();
    const [extra, setExtra] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setExtra(monthlyExtra ? formatNumber(monthlyExtra, monthlyExtra % 1 ? 2 : 0).replace(/\s/g, '') : '');
        setError(null);
        setBusy(false);
    }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = async () => {
        const value = extra.trim() ? parseAmount(extra) : null;
        if (extra.trim() && (value == null || value < 0)) {
            setError(t('form.errNumber', { field: t('settings.label') }));
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await saveSettings(value && value > 0 ? value : null);
            onSaved();
            onClose();
        } catch (e) {
            console.error('saveSettings failed', e);
            setError(t('settings.errFailed'));
            setBusy(false);
        }
    };

    return (
        <Sheet visible={visible} onClose={onClose} closeLabel={t('settings.cancel')} title={t('settings.title')}>
            <Text style={[sheetStyles.body, { color: theme.ink2, fontFamily: Fonts.sans }]}>
                {t('settings.body', { zero: f.money(0) })}
            </Text>
            <InputField icon={null} maxLength={undefined} label={t('settings.label')}
                placeholder={f.money(0)} isNumeric value={extra} onChangeText={setExtra} />

            {error ? <Text style={[sheetStyles.error, { color: theme.danger, fontFamily: Fonts.sansMedium }]}>{error}</Text> : null}

            <View style={sheetStyles.buttons}>
                <Button color={theme.brand} label={t('settings.save')} variant="primary" size="lg" fullWidth disabled={busy} onPress={submit} />
                <Button color={theme.brand} label={t('settings.cancel')} variant="ghost" size="md" fullWidth onPress={onClose} />
            </View>
        </Sheet>
    );
}
