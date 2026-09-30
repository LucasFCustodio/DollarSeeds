/**
 * FocusPlant — the focus debt's plant, exactly as the Debts tab draws it (same
 * species, growth step, pot label and focus glow), just smaller: about 62% of the
 * screen width, centred. Tapping it opens the Debts tab on that debt.
 *
 * PlantView always draws the full 1000 × 1250 canvas, sized for a grown plant, so
 * a seedling would sit under a tall empty sky. This crops the canvas to the art's
 * real top (ART_TOP, measured by scripts/extract-plant-svgs.mjs) plus a little
 * breathing room. Only the home crops; the Debts tab's garden needs the full canvas.
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
import {
    ART_TOP, ART_TOP_PAID_OFF, CANVAS_H, CANVAS_W, POT_LABEL_BOX, clampSpecies, clampStep,
} from '../debts/art';
import { useDebtFormat } from '../debts/format';
import { HOME_PAD } from './homeType';

const WIDTH_SHARE = 0.62;
/** Canvas units kept above the art's top-most painted pixel. */
const HEADROOM = 16;

export default function FocusPlant({ summary }: { summary: HomeSummary | null }) {
    const router = useRouter();
    const { width: screen } = useWindowDimensions();
    const { t } = useTranslation('debts');
    const f = useDebtFormat();
    const debt = summary?.debts?.focus?.debt;
    if (!DEBT_FREEDOM_ENABLED || !debt) return null;

    const width = Math.round(screen * WIDTH_SHARE);
    const s = width / CANVAS_W;
    const state = plantStateOf(debt);
    const species = clampSpecies(debt.species);
    const artTop = state === 'paid_off' ? ART_TOP_PAID_OFF[species] : ART_TOP[species][clampStep(debt.growth_step)];
    const cropTop = Math.max(0, artTop - HEADROOM);
    const height = (CANVAS_H - cropTop) * s;

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
                <View style={[styles.crop, { width, height }]}>
                    <View style={{ marginTop: -cropTop * s }}>
                        <PlantView
                            species={debt.species}
                            growthStep={debt.growth_step}
                            state={state}
                            isFocus={debt.is_focus}
                            active={false}
                            width={width}
                            potLabel={<PotLabel debt={debt} boxHeight={POT_LABEL_BOX.height * s} />}
                        />
                    </View>
                </View>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { alignItems: 'center' },
    crop: { overflow: 'hidden' },
});
