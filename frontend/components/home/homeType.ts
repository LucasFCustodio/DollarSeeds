/**
 * The home's four text sizes and its spacing. "Very small / small / medium / large"
 * in the Home Redesign spec always mean exactly these, and every size goes through
 * ft() so tablets scale the whole page by one rule.
 *
 * The home's numbers are Geist throughout: the income hero needs weight 700, and
 * Instrument Serif only ships a regular weight.
 */
import { StyleSheet } from 'react-native';
import { Fonts } from '../../context/ThemeContext';
import { ft } from '../../constants/responsive';

export const HOME_PAD = 20;
export const CARD_GAP = 12;
export const SECTION_GAP = 28;

/** Cream above the first Plan card, under the top band's curved corners. */
export const BAND_PAD = 24;

/** Controls sitting on a green band: the old dashboard hero's glass buttons. */
export const GLASS = { fill: 'rgba(255,255,255,0.16)', border: 'rgba(255,255,255,0.22)' } as const;

export const homeType = StyleSheet.create({
    /** 11 — category examples, connect-bank prompt, bubble amounts. */
    verySmall: { fontFamily: Fonts.sans, fontSize: ft(11) },
    verySmallEmphasis: { fontFamily: Fonts.sansMedium, fontSize: ft(11) },
    /** 13 — date, debt name, status/encouragement text, nudge, bubble names. */
    small: { fontFamily: Fonts.sansMedium, fontSize: ft(13) },
    /** 18 — split "left" amounts, payment amount, debts-paid line. */
    medium: { fontFamily: Fonts.sansSemiBold, fontSize: ft(18) },
    /** 44 — the income-left hero, and nothing else. */
    // Geist-Bold IS the 700 weight; a fontWeight on a custom family makes Android
    // fall back to the system font, so it is left off.
    large: { fontFamily: Fonts.sansBold, fontSize: ft(44), letterSpacing: -1 },
});
