/**
 * PotLabel — the debt's name and numbers, as real text laid over the pot's label
 * panel so it stays sharp and accessible at any size. PlantView positions it over
 * the `pot_label` box; this fills that box.
 */
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import type { Debt } from '../../lib/debtFreedom';
import { useDebtFormat } from './format';

interface Props {
    debt: Debt;
    /** Height of the label panel in px; the type scales from it. */
    boxHeight: number;
}

function PotLabel({ debt, boxHeight }: Props) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const f = useDebtFormat();
    const size = Math.max(9, boxHeight * 0.2);
    const missingDue = debt.missing.includes('due_day');
    const due = missingDue ? t('label.missing') : f.dayMonthOf(debt.next_due_date);

    // Split so the red "--" can be styled on its own, without assembling the
    // sentence by hand: the catalogue owns the word order.
    const minDue = t('label.minDue', { min: f.money(debt.min_payment), date: '\u0000' });
    const [before, after = ''] = minDue.split('\u0000');

    return (
        <View style={[styles.box, { paddingHorizontal: size * 0.8 }]} importantForAccessibility="no-hide-descendants">
            <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                style={[styles.name, { color: theme.ink, fontFamily: Fonts.sansBold, fontSize: size * 1.25 }]}
            >
                {debt.name}
            </Text>
            <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                style={{ color: theme.ink, fontFamily: Fonts.sansSemiBold, fontSize: size * 0.92 }}
            >
                {before}
                <Text style={missingDue ? { color: theme.danger } : null}>{due}</Text>
                {after}
            </Text>
            {/* A debt from before due days were required: ask for one (tapping the
                plant opens its detail, which links to the edit form). */}
            <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                style={{ color: missingDue ? theme.danger : theme.ink2, fontFamily: Fonts.sansSemiBold, fontSize: size * 0.86 }}
            >
                {missingDue && debt.status !== 'paid_off' ? t('label.addDueDay') : t('label.pctPaid', { pct: f.pct(debt.pct_paid) })}
            </Text>
        </View>
    );
}

export default memo(PotLabel);

const styles = StyleSheet.create({
    box: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    name: { letterSpacing: -0.2 },
});
