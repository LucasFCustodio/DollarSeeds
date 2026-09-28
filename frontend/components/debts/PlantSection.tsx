/**
 * PlantSection — one page of the garden: the plant in its pot, its label, the
 * focus glow, the action under the pot, and the water stream down to the next plant.
 */
import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import Button from '../ui/Button';
import { plantStateOf, type Debt } from '../../lib/debtFreedom';
import PlantView, { type PlantViewHandle } from './PlantView';
import PotLabel from './PotLabel';
import FocusGlow from './FocusGlow';
import WaterStream from './WaterStream';
import { CANVAS_RATIO, POT_LABEL_BOX, POT_WIDTH, CANVAS_W } from './art';
import { useDebtFormat } from './format';

/** Room under the canvas for the action button. */
export const SECTION_ACTION_SPACE = 64;
/** The stream is fully clear this far above the next section. */
const STREAM_CLEARANCE = 28;
/** Where the ground sits under a paid-off plant, in canvas units. */
const GROUND_Y = 1185;

interface Props {
    debt: Debt;
    hasNext: boolean;
    width: number;
    height: number;
    /** The settled, on-screen section. Only it animates and shows its action. */
    settled: boolean;
    registerPlant: (id: number, handle: PlantViewHandle | null) => void;
    onOpen: (id: number) => void;
    onLogPayment: (id: number) => void;
    onComplete: (id: number) => void;
    streamAnimateIn: boolean;
    onStreamRevealed: (id: number) => void;
}

export function canvasWidthFor(width: number, height: number) {
    return Math.max(120, Math.min(width - 32, (height - SECTION_ACTION_SPACE) / CANVAS_RATIO));
}

function PlantSection({
    debt, hasNext, width, height, settled, registerPlant, onOpen, onLogPayment, onComplete,
    streamAnimateIn, onStreamRevealed,
}: Props) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const f = useDebtFormat();
    const cw = canvasWidthFor(width, height);
    const ch = cw * CANVAS_RATIO;
    const s = cw / CANVAS_W;
    const left = (width - cw) / 2;
    const state = plantStateOf(debt);

    const setRef = useCallback((h: PlantViewHandle | null) => registerPlant(debt.id, h), [registerPlant, debt.id]);
    const open = useCallback(() => onOpen(debt.id), [onOpen, debt.id]);
    const revealed = useCallback(() => onStreamRevealed(debt.id), [onStreamRevealed, debt.id]);

    const a11y = state === 'paid_off'
        ? t('a11y.plantPaidOff', { name: debt.name, position: debt.position, total: debt.total })
        : t('a11y.plant', {
            name: debt.name, pct: f.pct(debt.pct_paid), step: debt.growth_step,
            position: debt.position, total: debt.total,
        });

    const stakeLabel = debt.paid_off_at ? (
        <View style={styles.stake}>
            <Text numberOfLines={1} adjustsFontSizeToFit
                style={{ color: theme.ink, fontFamily: Fonts.sansBold, fontSize: Math.max(8, 26 * s) }}>
                {debt.name}
            </Text>
            <Text numberOfLines={1} adjustsFontSizeToFit
                style={{ color: theme.ink2, fontFamily: Fonts.sansSemiBold, fontSize: Math.max(7, 21 * s) }}>
                {t('label.paidOffOn', { date: f.monthYear(debt.paid_off_at.slice(0, 7)) })}
            </Text>
        </View>
    ) : null;

    return (
        <View style={{ width, height }}>
            {debt.is_focus ? (
                <View style={{ position: 'absolute', left: 0, top: 0 }}>
                    <FocusGlow width={width} height={ch} />
                </View>
            ) : null}

            {state === 'paid_off' && hasNext ? (
                <WaterStream
                    cx={width / 2}
                    top={GROUND_Y * s}
                    bottom={height - STREAM_CLEARANCE}
                    potWidth={POT_WIDTH * s}
                    paidCount={debt.paid_off_count_through_here}
                    animateIn={streamAnimateIn}
                    onRevealed={revealed}
                />
            ) : null}

            <Pressable
                onPress={open}
                accessibilityRole="button"
                accessibilityLabel={a11y}
                style={{ position: 'absolute', left, top: 0, width: cw, height: ch }}
            >
                <PlantView
                    ref={setRef}
                    species={debt.species}
                    growthStep={debt.growth_step}
                    state={state}
                    isFocus={debt.is_focus}
                    active={settled}
                    width={cw}
                    potLabel={<PotLabel debt={debt} boxHeight={POT_LABEL_BOX.height * s} />}
                    stakeLabel={stakeLabel}
                />
            </Pressable>

            {settled && (debt.ready_to_complete || (debt.is_focus && state !== 'paid_off')) ? (
                <View style={[styles.action, { top: ch + 4, left: left + cw * 0.18, width: cw * 0.64 }]}>
                    {debt.ready_to_complete ? (
                        <Button color={theme.brand} label={t('actions.markPaidOff')} variant="primary" size="md" fullWidth
                            onPress={() => onComplete(debt.id)} />
                    ) : (
                        <Button color={theme.brand} label={t('actions.logPayment')} variant="primary" size="md" fullWidth
                            onPress={() => onLogPayment(debt.id)} />
                    )}
                </View>
            ) : null}
        </View>
    );
}

export default memo(PlantSection);

const styles = StyleSheet.create({
    stake: { flex: 1, width: '88%', alignItems: 'center', justifyContent: 'center' },
    action: { position: 'absolute' },
});
