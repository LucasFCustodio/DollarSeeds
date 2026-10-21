/**
 * MiniPlant — the Envision dashboard's one-pot-per-debt plant. Deliberately NOT the
 * Debts tab's illustrated art: a minimal flat terracotta pot with a stem and oval
 * leaves, no outlines and no species. Every debt draws the same plant; only its
 * stage changes, and the server decides the stage (lib/homeProgress.ts).
 *
 *   empty      bare pot with soil            opacity 0.55
 *   started    short stem, 1 leaf            opacity 0.75
 *   finishing  visibly taller stem, 2 leaves opacity 0.9
 *   completed  full-height stem, 3 leaves    opacity 1
 *
 * The three plant tops sit at 12, 25 and 38 units above the rim, so the heights
 * still read apart at the smallest pot (26 pt). The stage opacity fades the pot and
 * plant together; the focus glow behind them is never faded.
 *
 * Drawn on one viewBox with its origin at the top-centre of the rim: x −19…19, y −40
 * (the tallest leaf's tip) … 31 (just under the pot), so the tallest plant is never
 * clipped. `size` is the pot's rim width in points.
 *
 * The stem and leaf greens are theme tokens. The terracotta and soil browns have no
 * token; like the Debts tab's plant art, they are the illustration's own colours.
 */
import React, { memo } from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import type { PotStage } from '../../lib/homeProgress';

const POT = {
    rim: '#B8703C',
    body: '#C8834B',
    soil: '#5A3A22',
} as const;

const VIEW = { x: -19, y: -40, w: 38, h: 71 };
/** The rim is 34 units wide. */
const RIM_UNITS = 34;

export const STAGE_OPACITY: Record<PotStage, number> = {
    empty: 0.55,
    started: 0.75,
    finishing: 0.9,
    completed: 1,
};

/** Rendered height for a pot `size` wide — what a row must leave room for. */
export function miniPlantHeight(size: number) {
    return (size * VIEW.h) / RIM_UNITS;
}

interface Props {
    stage: PotStage;
    /** The pot's rim width, in points. */
    size: number;
    /** A soft disc behind the plant (the focus debt). Not faded by the stage. */
    glowColor?: string;
}

function MiniPlant({ stage, size, glowColor }: Props) {
    const { theme } = useTheme();
    const scale = size / RIM_UNITS;
    const stem = theme.brand;
    const leaf = theme.brand2;
    const crown = theme.sectionGreen;

    return (
        <Svg
            width={VIEW.w * scale}
            height={VIEW.h * scale}
            viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
        >
            {glowColor ? <Circle cx={0} cy={-6} r={19} fill={glowColor} /> : null}
            <G opacity={STAGE_OPACITY[stage]}>
                <Rect x={-17} y={0} width={34} height={7} rx={2} fill={POT.rim} />
                <Path d="M-14 7 L14 7 L10 30 L-10 30 Z" fill={POT.body} />
                <Ellipse cx={0} cy={1.5} rx={13} ry={2.5} fill={POT.soil} />
                {stage === 'started' ? (
                    <>
                        <Path d="M0 0 L0 -6" stroke={stem} strokeWidth={2.5} fill="none" />
                        <Ellipse cx={4} cy={-7} rx={7} ry={4} fill={leaf} transform="rotate(30 4 -7)" />
                    </>
                ) : null}
                {stage === 'finishing' ? (
                    <>
                        <Path d="M0 0 L0 -21" stroke={stem} strokeWidth={2.5} fill="none" />
                        <Ellipse cx={-8} cy={-11} rx={9} ry={5} fill={leaf} transform="rotate(-30 -8 -11)" />
                        <Ellipse cx={8} cy={-19} rx={9} ry={5} fill={leaf} transform="rotate(30 8 -19)" />
                    </>
                ) : null}
                {stage === 'completed' ? (
                    <>
                        <Path d="M0 0 L0 -26" stroke={stem} strokeWidth={2.5} fill="none" />
                        <Ellipse cx={-8} cy={-14} rx={9} ry={5} fill={leaf} transform="rotate(-30 -8 -14)" />
                        <Ellipse cx={8} cy={-20} rx={9} ry={5} fill={leaf} transform="rotate(30 8 -20)" />
                        <Ellipse cx={0} cy={-30} rx={6} ry={8} fill={crown} />
                    </>
                ) : null}
            </G>
        </Svg>
    );
}

export default memo(MiniPlant);
