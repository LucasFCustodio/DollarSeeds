/**
 * ReplantCard — Ready to Replant: money from goals the user removed (and, once, what
 * General Savings held when this build first loaded). Rendered only while it holds
 * more than $0; the caller decides that.
 *
 * One action: plant an amount (up to what it holds) into an active, unlocked goal.
 * A transfer, so it counts against no month's budget, and the history shows it as
 * one entry.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isAxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { ft } from '../../constants/responsive';
import { premiumErrorCode, usePremiumUpsell } from '../../lib/premiumErrors';
import { plantFromReplant } from '../../lib/goals';
import Button from '../ui/Button';
import Card from '../ui/Card';
import InputField from '../ui/InputField';
import Sheet, { sheetStyles } from '../ui/Sheet';
import { IconSavings } from '../icons';
import { formStyles } from './formStyles';

interface Props {
    balance: number;
    /** Active, unlocked goals that can take money. */
    goals: { id: number; title: string }[];
    onPlanted: () => void;
}

export default function ReplantCard({ balance, goals, onPlanted }: Props) {
    const { t } = useTranslation('goals');
    const { theme } = useTheme();
    const { formatMoney } = useLocale();
    const [open, setOpen] = useState(false);
    return (
        <Card theme={theme} depth={5} padding={16} style={[styles.card, { borderColor: theme.goals }]}>
            <View style={styles.header}>
                <View style={[styles.tile, { backgroundColor: theme.goalsSoft }]}>
                    <IconSavings size={22} color={theme.goals} accent={theme.brand2} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: theme.ink }]}>{t('replant.title')}</Text>
                    <Text style={[styles.explain, { color: theme.ink2 }]}>{t('replant.explain')}</Text>
                </View>
            </View>
            <Text style={[styles.amount, { color: theme.ink }]}>{formatMoney(balance, 2)}</Text>
            {goals.length > 0 ? (
                <Button color={theme.goals} label={t('replant.open')} variant="outline" size="md" fullWidth onPress={() => setOpen(true)} />
            ) : (
                <Text style={[styles.explain, { color: theme.ink3 }]}>{t('replant.noGoals')}</Text>
            )}
            <ReplantSheet visible={open} balance={balance} goals={goals}
                onClose={() => setOpen(false)} onPlanted={() => { setOpen(false); onPlanted(); }} />
        </Card>
    );
}

function ReplantSheet({ visible, balance, goals, onClose, onPlanted }: {
    visible: boolean;
    balance: number;
    goals: { id: number; title: string }[];
    onClose: () => void;
    onPlanted: () => void;
}) {
    const { t } = useTranslation('goals');
    const { theme } = useTheme();
    const { parseAmount, formatMoney, serverTitle, serverError } = useLocale();
    const { showUpsell } = usePremiumUpsell();
    const [amount, setAmount] = useState('');
    const [goalId, setGoalId] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (visible) {
            setAmount(''); setError(null); setBusy(false);
            setGoalId(goals.length === 1 ? goals[0].id : null);
        }
    }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = async () => {
        if (busy) return;
        const value = parseAmount(amount);
        if (value === null || !(value > 0)) return setError(t('extra.errAmount'));
        if (value > balance + 0.005) return setError(t('replant.errTooMuch', { amount: formatMoney(balance, 2) }));
        if (goalId === null) return setError(t('replant.errGoal'));
        setBusy(true);
        setError(null);
        try {
            await plantFromReplant(goalId, value);
            onPlanted();
        } catch (e) {
            const code = premiumErrorCode(e);
            if (code) { onClose(); showUpsell(code); return; }
            const detail = isAxiosError(e) ? e.response?.data?.detail : undefined;
            if (typeof detail === 'string') setError(serverError(detail));
            else { console.error('replant failed', e); setError(t('extra.errFailed')); }
        } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet visible={visible} onClose={onClose} closeLabel={t('extra.cancel')}
            title={t('replant.sheetTitle')} subtitle={t('replant.holding', { amount: formatMoney(balance, 2) })}>
            <InputField icon={null} maxLength={undefined}
                label={t('extra.amountLabel')}
                placeholder={formatMoney(0)}
                isNumeric
                value={amount}
                onChangeText={(v: string) => { setAmount(v); setError(null); }}
            />
            <View style={{ height: 12 }} />
            <Text style={[formStyles.fieldLabel, { color: theme.ink3 }]}>{t('replant.whichGoal')}</Text>
            <View style={formStyles.chipWrap}>
                {goals.map(g => {
                    const active = goalId === g.id;
                    return (
                        <Pressable
                            key={g.id}
                            onPress={() => { setGoalId(g.id); setError(null); }}
                            accessibilityState={{ selected: active }}
                            style={({ pressed }) => [
                                formStyles.chip,
                                { backgroundColor: active ? theme.goals : theme.surface, borderColor: active ? theme.goals : theme.border },
                                pressed && { opacity: 0.8 },
                            ]}
                        >
                            <Text style={[formStyles.chipText, { color: active ? theme.onBrand : theme.ink2 }]}>{serverTitle(g.title)}</Text>
                        </Pressable>
                    );
                })}
            </View>

            {error ? <Text style={[sheetStyles.error, { color: theme.danger, fontFamily: Fonts.sansMedium }]}>{error}</Text> : null}

            <View style={sheetStyles.buttons}>
                <Button color={theme.goals} label={t('replant.submit')} variant="primary" size="lg" fullWidth disabled={busy} onPress={submit} />
                <Button color={theme.brand} label={t('extra.cancel')} variant="ghost" size="md" fullWidth onPress={onClose} />
            </View>
        </Sheet>
    );
}

const styles = StyleSheet.create({
    card: { marginBottom: 12, borderWidth: 1.5 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    title: { fontFamily: 'Geist-SemiBold', fontSize: ft(14, 1.28) },
    explain: { fontFamily: 'Geist-Regular', fontSize: ft(12, 1.18), lineHeight: ft(17, 1.18), marginTop: 2 },
    amount: { fontFamily: 'InstrumentSerif-Regular', fontSize: ft(28, 1.3), marginBottom: 12 },
});
