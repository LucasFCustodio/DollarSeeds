/**
 * FocusPlant — the focus debt's plant, exactly as the Debts tab draws it (same
 * species, growth step, pot label and focus glow), just smaller: about 55% of the
 * screen width, centred. Tapping it opens the Debts tab on that debt.
 *
 * Self-contained on purpose: it is rendered from ONE line in the home, so deleting
 * that line removes it with nothing left behind. It renders nothing when the debt
 * flag is off or there is no focus debt.
 */
import React from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { DEBT_FREEDOM_ENABLED } from '../../constants/features';
import { plantStateOf } from '../../lib/debtFreedom';
import type { HomeSummary } from '../../lib/homeSummary';
import PlantView from '../debts/PlantView';
import PotLabel from '../debts/PotLabel';
import FocusGlow from '../debts/FocusGlow';
import { CANVAS_RATIO, CANVAS_W, POT_LABEL_BOX } from '../debts/art';
import { useDebtFormat } from '../debts/format';
import { HOME_PAD } from './homeType';

const WIDTH_SHARE = 0.55;

export default function FocusPlant({ summary }: { summary: HomeSummary | null }) {
    const router = useRouter();
    const { width: screen } = useWindowDimensions();
    const { t } = useTranslation('debts');
    const f = useDebtFormat();
    const debt = summary?.debts?.focus?.debt;
    if (!DEBT_FREEDOM_ENABLED || !debt) return null;

    const width = Math.round(screen * WIDTH_SHARE);
    const height = width * CANVAS_RATIO;
    const s = width / CANVAS_W;

    return (
        <View style={[styles.center, { height }]}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height }}>
                <FocusGlow width={screen - HOME_PAD * 2} height={height} />
            </View>
            <Pressable
                onPress={() => router.push({ pathname: '/(tabs)/debts', params: { debtId: String(debt.id) } } as any)}
                accessibilityRole="button"
                accessibilityLabel={t('a11y.plant', {
                    name: debt.name, pct: f.pct(debt.pct_paid), step: debt.growth_step,
                    position: debt.position, total: debt.total,
                })}
            >
                <PlantView
                    species={debt.species}
                    growthStep={debt.growth_step}
                    state={plantStateOf(debt)}
                    isFocus={debt.is_focus}
                    active={false}
                    width={width}
                    potLabel={<PotLabel debt={debt} boxHeight={POT_LABEL_BOX.height * s} />}
                />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { alignItems: 'center' },
});
