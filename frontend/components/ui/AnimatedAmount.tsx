/**
 * AnimatedAmount — displays a monetary amount with a number-ticker animation.
 * Renders in Instrument Serif at the requested size.
 * Falls back to system serif if the font hasn't loaded yet.
 *
 * Formatting comes from LocaleContext, so the symbol follows the currency setting and
 * the separators follow the language setting. Both call sites (the dashboard hero and
 * the piggy-bank balance) previously relied on a hardcoded `$` default and an
 * `en-US`-locked formatter.
 *
 * `prefix` is still accepted as an override for a caller that needs a non-money
 * ticker, but it is no longer the currency mechanism and defaults to nothing.
 */
import React from 'react';
import { Text } from 'react-native';
import { useTicker } from '../../hooks/useTicker';
import { useLocale } from '../../context/LocaleContext';

interface Props {
    value: number;
    /** Override the rendered string entirely — omit for normal money display. */
    prefix?: string;
    size?: number;
    color?: string;
    animate?: boolean;
    decimals?: number;
}

export default function AnimatedAmount({
    value,
    prefix,
    size = 56,
    color = '#0F2820',
    animate = true,
    decimals = 0,
}: Props) {
    const { formatMoney, formatNumber } = useLocale();
    const v = useTicker(value, { animate, duration: 900 });

    const body = prefix === undefined
        ? formatMoney(v, decimals)
        : `${prefix}${formatNumber(v, decimals)}`;

    return (
        <Text
            // These render at 48–92pt in a fixed-width hero. "R$ 12.345" is two glyphs
            // wider than "$12,345" at the same size, so without these the Brazilian
            // symbol clips or wraps on a narrow device.
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={{
                fontFamily: 'InstrumentSerif-Regular',
                fontSize: size,
                fontWeight: '400',
                lineHeight: size * 1.05,
                letterSpacing: -0.5,
                color,
            }}
        >
            {body}
        </Text>
    );
}
