/**
 * Sparkline — a single line with no axes or labels: a 2 pt stroke with rounded
 * joins, a soft area fill under it (the same colour at 12%) and a dot on the last
 * value (today). Scaled to the window's own min…max so a rising line reads as
 * rising; a flat or one-point series draws a level line through the middle.
 *
 * `baseline` draws only a flat line in `color` — the "nothing logged yet" state.
 */
import React, { memo } from 'react';
import Svg, { Circle, Line, Path } from 'react-native-svg';

const STROKE = 2;
const DOT = 3;
const PAD = DOT + 1;
const FILL_OPACITY = 0.12;

interface Props {
    values: number[];
    color: string;
    width: number;
    height: number;
    baseline?: boolean;
}

function Sparkline({ values, color, width, height, baseline }: Props) {
    if (width <= 0) return null;
    if (baseline || values.length === 0) {
        const y = height - PAD;
        return (
            <Svg width={width} height={height}>
                <Line x1={0} y1={y} x2={width} y2={y} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
            </Svg>
        );
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const innerW = width - PAD * 2;
    const innerH = height - PAD * 2;
    const yOf = (v: number) => (span > 0 ? PAD + (1 - (v - min) / span) * innerH : PAD + innerH / 2);
    const pts = values.length === 1
        ? [{ x: PAD, y: yOf(values[0]) }, { x: PAD + innerW, y: yOf(values[0]) }]
        : values.map((v, i) => ({ x: PAD + (i / (values.length - 1)) * innerW, y: yOf(v) }));

    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    const last = pts[pts.length - 1];
    const area = `${line} L${last.x.toFixed(2)} ${height} L${pts[0].x.toFixed(2)} ${height} Z`;

    return (
        <Svg width={width} height={height}>
            <Path d={area} fill={color} fillOpacity={FILL_OPACITY} />
            <Path d={line} stroke={color} strokeWidth={STROKE} strokeLinejoin="round" strokeLinecap="round" fill="none" />
            <Circle cx={last.x} cy={last.y} r={DOT} fill={color} />
        </Svg>
    );
}

export default memo(Sparkline);
