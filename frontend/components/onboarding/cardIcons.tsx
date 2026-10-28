/**
 * Duotone glyphs for the onboarding's tap cards, in the style of components/icons:
 * a 24-unit grid, 1.7 strokes in `color`, and one soft fill shape in `soft` behind.
 * Colours are theme tokens passed in by the card; nothing is hardcoded here.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type CardIconName =
    // screen 4 · what brought you here
    | 'debt' | 'overspending' | 'saving' | 'honor' | 'organized'
    // screen 5 · how money feels
    | 'stressed' | 'overwhelmed' | 'hopeful' | 'good'
    // screen 6 · tithe
    | 'ten' | 'custom' | 'none'
    // screen 10 · any debts
    | 'yes' | 'free' | 'later'
    // screen 11 · debt type
    | 'credit_card' | 'car' | 'student' | 'medical' | 'personal' | 'other'
    // screen 14 · goal
    | 'emergency' | 'phone' | 'vacation' | 'home' | 'wedding' | 'gift' | 'something';

const W = 1.7;

export default function CardIcon({ name, color, soft, size = 32 }: {
    name: CardIconName; color: string; soft: string; size?: number;
}) {
    const s = { stroke: color, strokeWidth: W, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
    let body: React.ReactNode;
    switch (name) {
        case 'debt': // a chain link breaking
            body = <>
                <Rect x={2.5} y={8} width={10} height={8} rx={4} fill={soft} />
                <Path d="M9 8H7a4 4 0 0 0 0 8h2" {...s} />
                <Path d="M15 8h2a4 4 0 0 1 0 8h-2" {...s} />
                <Path d="M12 5v2M12 17v2M9.5 12h1M13.5 12h1" {...s} />
            </>;
            break;
        case 'overspending': // a wallet with coins spilling
            body = <>
                <Rect x={3} y={7} width={16} height={12} rx={2.5} fill={soft} />
                <Rect x={3} y={7} width={16} height={12} rx={2.5} {...s} />
                <Path d="M15 13h4" {...s} />
                <Circle cx={20} cy={5} r={2} {...s} />
                <Circle cx={15.5} cy={3.8} r={1.4} {...s} />
            </>;
            break;
        case 'saving': // a jar with a coin going in
            body = <>
                <Path d="M6 9h12v9a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill={soft} />
                <Path d="M6 9h12v9a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3zM7.5 6.5h9" {...s} />
                <Circle cx={12} cy={3.5} r={1.8} {...s} />
                <Path d="M12 13v4M10.5 14.5h3" {...s} />
            </>;
            break;
        case 'honor': // an open book with a heart
        case 'ten':
            body = <>
                <Path d="M3 6c3-1.5 6-1.5 9 .5v13c-3-2-6-2-9-.5z" fill={soft} />
                <Path d="M3 6c3-1.5 6-1.5 9 .5 3-2 6-2 9-.5v13c-3-1.5-6-1.5-9 .5-3-2-6-2-9-.5z" {...s} />
                <Path d="M12 6.5v13" {...s} />
                {name === 'honor'
                    ? <Path d="M16.5 10.2c-.6-.9-2-.6-2 .5 0 1 2 2.3 2 2.3s2-1.3 2-2.3c0-1.1-1.4-1.4-2-.5z" {...s} />
                    : <Path d="M15 9.5h3M16.5 8v3" {...s} />}
            </>;
            break;
        case 'organized': // a checklist
            body = <>
                <Rect x={4} y={3} width={16} height={18} rx={2.5} fill={soft} />
                <Rect x={4} y={3} width={16} height={18} rx={2.5} {...s} />
                <Path d="M7.5 8.5l1.2 1.2 2-2.2M7.5 14l1.2 1.2 2-2.2M13 9h4M13 14.5h4" {...s} />
            </>;
            break;
        case 'stressed': // a storm cloud
            body = <>
                <Path d="M7 16a4 4 0 1 1 .8-7.9A5 5 0 0 1 17.5 9a3.5 3.5 0 0 1 0 7z" fill={soft} />
                <Path d="M7 16a4 4 0 1 1 .8-7.9A5 5 0 0 1 17.5 9a3.5 3.5 0 0 1 0 7z" {...s} />
                <Path d="M12.5 16.5l-1.8 3h2.6l-1.8 3" {...s} />
            </>;
            break;
        case 'overwhelmed': // a tangle
            body = <>
                <Circle cx={12} cy={12} r={8.5} fill={soft} />
                <Path d="M5 12c2-5 6 5 8 0s4 5 6 0M6.5 8c3 2 8-2 11 1M6.5 16c3-2 8 2 11-1" {...s} />
            </>;
            break;
        case 'hopeful': // a sunrise
            body = <>
                <Path d="M5 17a7 7 0 0 1 14 0z" fill={soft} />
                <Path d="M5 17a7 7 0 0 1 14 0M3 17h18M12 5v2.5M5.6 8.6l1.6 1.6M18.4 8.6l-1.6 1.6M7 20.5h10" {...s} />
            </>;
            break;
        case 'good': // a sprout
        case 'free':
            body = <>
                <Path d="M12 12c-4.5 0-7-2.5-7-7 4.5 0 7 2.5 7 7z" fill={soft} />
                <Path d="M12 12c-4.5 0-7-2.5-7-7 4.5 0 7 2.5 7 7zM12 14c0-4 2.5-6.5 6.5-6.5 0 4-2.5 6.5-6.5 6.5zM12 12v9" {...s} />
                <Path d="M8 21h8" {...s} />
            </>;
            break;
        case 'custom': // a percent tag
            body = <>
                <Path d="M3 12.5V4.5A1.5 1.5 0 0 1 4.5 3h8l8.5 8.5-9 9z" fill={soft} />
                <Path d="M3 12.5V4.5A1.5 1.5 0 0 1 4.5 3h8l8.5 8.5-9 9z" {...s} />
                <Path d="M9 15l6-6" {...s} />
                <Circle cx={9.5} cy={9.5} r={1} {...s} />
                <Circle cx={14.5} cy={14.5} r={1} {...s} />
            </>;
            break;
        case 'none': // an hourglass: not right now
        case 'later':
            body = <>
                <Path d="M7 3h10c0 5-5 6-5 9s5 4 5 9H7c0-5 5-6 5-9S7 8 7 3z" fill={soft} />
                <Path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" {...s} />
            </>;
            break;
        case 'yes': // a seed going into soil
            body = <>
                <Path d="M3 17h18v4H3z" fill={soft} />
                <Path d="M3 17h18" {...s} />
                <Path d="M12 14c-2.2 0-3.5-1.6-3.5-3.8S12 5 12 5s3.5 3 3.5 5.2S14.2 14 12 14z" {...s} />
                <Path d="M7 20h2M15 20h2" {...s} />
            </>;
            break;
        case 'credit_card':
            body = <>
                <Rect x={2.5} y={5.5} width={19} height={13} rx={2.5} fill={soft} />
                <Rect x={2.5} y={5.5} width={19} height={13} rx={2.5} {...s} />
                <Path d="M2.5 10h19M6 15h4" {...s} />
            </>;
            break;
        case 'car':
            body = <>
                <Path d="M4 16v-3l2-5h12l2 5v3z" fill={soft} />
                <Path d="M3.5 16.5v-3.5l2.2-5.3A1.5 1.5 0 0 1 7.1 7h9.8a1.5 1.5 0 0 1 1.4.7l2.2 5.3v3.5zM3.5 13h17" {...s} />
                <Circle cx={7.5} cy={17} r={1.8} {...s} />
                <Circle cx={16.5} cy={17} r={1.8} {...s} />
            </>;
            break;
        case 'student': // a graduation cap
            body = <>
                <Path d="M12 4l9.5 4.5L12 13 2.5 8.5z" fill={soft} />
                <Path d="M12 4l9.5 4.5L12 13 2.5 8.5zM6.5 10.5v4.5c3 2.5 8 2.5 11 0v-4.5M21.5 8.5v5" {...s} />
            </>;
            break;
        case 'medical':
            body = <>
                <Rect x={3.5} y={3.5} width={17} height={17} rx={4} fill={soft} />
                <Path d="M12 7.5v9M7.5 12h9" {...s} />
                <Rect x={3.5} y={3.5} width={17} height={17} rx={4} {...s} />
            </>;
            break;
        case 'personal': // a handshake-ish: two coins
            body = <>
                <Circle cx={9} cy={12} r={6} fill={soft} />
                <Circle cx={9} cy={12} r={6} {...s} />
                <Path d="M15 6.3a6 6 0 0 1 0 11.4M9 9v6M7.5 10.2h2.5a1 1 0 0 1 0 2H8a1 1 0 0 0 0 2h2.5" {...s} />
            </>;
            break;
        case 'other':
        case 'something': // a sparkle
            body = <>
                <Path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill={soft} />
                <Path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 17v4M17 19h4" {...s} />
            </>;
            break;
        case 'emergency': // an umbrella
            body = <>
                <Path d="M3 12a9 9 0 0 1 18 0z" fill={soft} />
                <Path d="M3 12a9 9 0 0 1 18 0zM12 12v6.5a2 2 0 0 1-4 0M12 3v-.5" {...s} />
            </>;
            break;
        case 'phone':
            body = <>
                <Rect x={6.5} y={2.5} width={11} height={19} rx={2.5} fill={soft} />
                <Rect x={6.5} y={2.5} width={11} height={19} rx={2.5} {...s} />
                <Path d="M10.5 18.5h3" {...s} />
            </>;
            break;
        case 'vacation': // a palm and sun
            body = <>
                <Circle cx={17.5} cy={6.5} r={3} fill={soft} />
                <Path d="M11 21c0-5 .5-8 2-11M13 10c-1.5-2.5-4.5-3-7-1.5M13 10c2-2 5-1.5 6.5.5M13 10c-2 0-4.5 1.5-5 4M3 21h18" {...s} />
            </>;
            break;
        case 'home':
            body = <>
                <Path d="M4.5 10.5L12 4l7.5 6.5V20h-15z" fill={soft} />
                <Path d="M3 11.5L12 4l9 7.5M5 10v10h14V10M10 20v-5h4v5" {...s} />
            </>;
            break;
        case 'wedding': // two rings
            body = <>
                <Circle cx={9} cy={14} r={5.5} fill={soft} />
                <Circle cx={9} cy={14} r={5.5} {...s} />
                <Circle cx={15} cy={14} r={5.5} {...s} />
                <Path d="M10.5 5.5L12 3.5l1.5 2" {...s} />
            </>;
            break;
        case 'gift':
            body = <>
                <Rect x={3.5} y={10} width={17} height={10.5} rx={1.5} fill={soft} />
                <Rect x={3.5} y={10} width={17} height={10.5} rx={1.5} {...s} />
                <Path d="M3 10h18M12 10v10.5M12 10s-2-4.5-4.5-4.5-2.5 4.5 1 4.5zM12 10s2-4.5 4.5-4.5 2.5 4.5-1 4.5z" {...s} />
            </>;
            break;
    }
    return <Svg width={size} height={size} viewBox="0 0 24 24">{body}</Svg>;
}
