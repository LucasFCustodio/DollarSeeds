/**
 * PlantSection — one page of the garden: the plant in its pot, its label, the
 * focus glow, the actions under the pot, and the water stream down to the next plant.
 *
 * Actions: "Mark as paid off" at a zero balance; otherwise the min-payment toggle on
 * every active debt, plus the filled "Extra" button on the focus debt.
 */
import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, shadow, useTheme } from '../../context/ThemeContext';
import Button from '../ui/Button';
import { plantStateOf, type Debt } from '../../lib/debtFreedom';
import PlantView, { type PlantViewHandle } from './PlantView';
import PotLabel from './PotLabel';
import MinToggle from './MinToggle';
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
    /** A request or sequence is running for this debt: hide its action. */
    busy: boolean;
    /** The min-payment toggle's request is in flight for this debt. */
    togglePending: boolean;
    registerPlant: (id: number, handle: PlantViewHandle | null) => void;
    onOpen: (id: number) => void;
    onToggleMin: (id: number) => void;
    onExtra: (id: number) => void;
    onComplete: (id: number) => void;
    streamAnimateIn: boolean;
    onStreamRevealed: (id: number) => void;
}

export function canvasWidthFor(width: number, height: number) {
    return Math.max(120, Math.min(width - 32, (height - SECTION_ACTION_SPACE) / CANVAS_RATIO));
}

function PlantSection({
    debt, hasNext, width, height, settled, busy, togglePending, registerPlant, onOpen, onToggleMin, onExtra,
    onComplete, streamAnimateIn, onStreamRevealed,
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

    // The stake's tag is small (~200 × 130 canvas units): the name on one line, and
    // "Paid off · Aug 2026" allowed to wrap at its natural break.
    const stakeLabel = debt.paid_off_at ? (
        <View style={styles.stake}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
                style={{ color: theme.ink, fontFamily: Fonts.sansBold, fontSize: Math.max(8, 25 * s), textAlign: 'center' }}>
                {debt.name}
            </Text>
            <Text numberOfLines={2}
                style={{ color: theme.ink2, fontFamily: Fonts.sansSemiBold, fontSize: Math.max(7, 19 * s), lineHeight: Math.max(9, 23 * s), textAlign: 'center' }}>
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

            {settled && !busy && state !== 'paid_off' ? (
                debt.ready_to_complete ? (
                    <View style={[styles.action, { top: ch + 4, left: left + cw * 0.18, width: cw * 0.64 }]}>
                        <Button color={theme.brand} label={t('actions.markPaidOff')} variant="primary" size="md" fullWidth
                            onPress={() => onComplete(debt.id)} />
                    </View>
                ) : (
                    <View style={[styles.action, styles.row, debt.is_focus
                        ? { top: ch + 4, left: Math.max(16, left + cw * 0.06), right: Math.max(16, left + cw * 0.06) }
                        : { top: ch + 4, left: left + cw * 0.18, width: cw * 0.64 }]}>
                        <View style={styles.flex}>
                            <MinToggle debt={debt} pending={togglePending} onPress={() => onToggleMin(debt.id)} />
                        </View>
                        {debt.is_focus ? (
                            <Pressable
                                onPress={() => onExtra(debt.id)}
                                accessibilityRole="button"
                                accessibilityLabel={t('payment.title')}
                                style={({ pressed }) => [styles.extra, {
                                    backgroundColor: theme.brand, borderColor: theme.brand,
                                    opacity: pressed ? 0.8 : 1, ...(shadow(4) as object),
                                }]}
                            >
                                <Text style={[styles.extraLabel, { color: theme.onBrand, fontFamily: Fonts.sansBold }]}>
                                    {t('actions.extra')}
                                </Text>
                            </Pressable>
                        ) : null}
                    </View>
                )
            ) : null}
        </View>
    );
}

export default memo(PlantSection);

const styles = StyleSheet.create({
    stake: { flex: 1, width: '90%', alignItems: 'center', justifyContent: 'center' },
    action: { position: 'absolute' },
    row: { flexDirection: 'row', gap: 10 },
    flex: { flex: 1 },
    extra: { paddingVertical: 10.5, paddingHorizontal: 22, borderRadius: 10, borderWidth: 1.5, justifyContent: 'center' },
    extraLabel: { fontSize: 15 },
});
