/**
 * AnimatedAmount — displays a dollar amount with a number-ticker animation.
 * Renders in Instrument Serif at the requested size.
 * Falls back to system serif if the font hasn't loaded yet.
 */
import React from 'react';
import { Text } from 'react-native';
import { useTicker } from '../../hooks/useTicker';

interface Props {
    value: number;
    prefix?: string;
    size?: number;
    color?: string;
    animate?: boolean;
    decimals?: number;
}

function fmt(n: number, decimals = 0): string {
    return Number(n).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

export default function AnimatedAmount({
    value,
    prefix = '$',
    size = 56,
    color = '#0F2820',
    animate = true,
    decimals = 0,
}: Props) {
    const v = useTicker(value, { animate, duration: 900 });

    return (
        <Text
            style={{
                fontFamily: 'InstrumentSerif-Regular',
                fontSize: size,
                fontWeight: '400',
                lineHeight: size * 1.05,
                letterSpacing: -0.5,
                color,
            }}
        >
            {prefix}{fmt(v, decimals)}
        </Text>
    );
}
