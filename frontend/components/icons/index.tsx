/**
 * DollarSeeds custom icon library — botanical + geometric duotone
 * All SVG paths ported 1-to-1 from design_handoff_visual_revamp/prototype/icons.jsx
 * using react-native-svg primitives.
 */
import React from 'react';
import Svg, {
    Path, Circle, Rect, Ellipse,
    Defs, LinearGradient as LG, Stop, ClipPath, G,
    Rect as SvgRect,
} from 'react-native-svg';

// ─── Shared icon wrapper ──────────────────────────────────────────────────────
interface IconProps {
    size?: number;
    color?: string;
    accent?: string;
    filled?: boolean;
}

// ── Tab bar icons (24×24 viewBox) ─────────────────────────────────────────────

export const IconHome = ({ size = 24, color = '#0F2820', accent, filled }: IconProps) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {filled && (
            <Path
                d="M12 3.2L4 9.4v10.2a1.4 1.4 0 0 0 1.4 1.4h13.2a1.4 1.4 0 0 0 1.4-1.4V9.4L12 3.2z"
                fill={accent || color}
                opacity={0.18}
            />
        )}
        <Path
            d="M4 10.2L12 3.8l8 6.4v9.4a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 19.6V10.2z"
            stroke={color}
            strokeWidth={1.6}
            strokeLinejoin="round"
        />
        {/* sprout coming out of the roof */}
        <Path
            d="M12 7.2c0-1.2 0.9-2.1 2.1-2.1M12 7.2c0-1.2-0.9-2.1-2.1-2.1M12 3.8v3.4"
            stroke={accent || color}
            strokeWidth={1.6}
            strokeLinecap="round"
        />
    </Svg>
);

export const IconExpense = ({ size = 24, color = '#0F2820', accent, filled }: IconProps) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {filled && <Circle cx={12} cy={12} r={9} fill={accent || color} opacity={0.18} />}
        <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.6} />
        <Path
            d="M8 12h8M16 12l-3-3M16 12l-3 3"
            stroke={accent || color}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

export const IconIncome = ({ size = 24, color = '#0F2820', accent, filled }: IconProps) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {filled && <Circle cx={12} cy={12} r={9} fill={accent || color} opacity={0.18} />}
        <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.6} />
        <Path
            d="M16 12H8M8 12l3-3M8 12l3 3"
            stroke={accent || color}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

export const IconSavings = ({ size = 24, color = '#0F2820', accent, filled }: IconProps) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {/* clay jar */}
        {filled && (
            <Path
                d="M5.5 10.5h13l-1.2 9a1.4 1.4 0 0 1-1.4 1.2H8.1a1.4 1.4 0 0 1-1.4-1.2l-1.2-9z"
                fill={accent || color}
                opacity={0.18}
            />
        )}
        <Path
            d="M5.5 10.5h13l-1.2 9a1.4 1.4 0 0 1-1.4 1.2H8.1a1.4 1.4 0 0 1-1.4-1.2l-1.2-9z"
            stroke={color}
            strokeWidth={1.6}
            strokeLinejoin="round"
        />
        <Path
            d="M7.5 10.5V9a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1.5"
            stroke={color}
            strokeWidth={1.6}
            strokeLinejoin="round"
        />
        {/* sprout */}
        <Path
            d="M12 8V5.5M12 5.5c0-1 0.8-1.8 1.8-1.8M12 5.5c0-1-0.8-1.8-1.8-1.8"
            stroke={accent || color}
            strokeWidth={1.6}
            strokeLinecap="round"
        />
    </Svg>
);

export const IconLessons = ({ size = 24, color = '#0F2820', accent, filled }: IconProps) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {filled && (
            <Path
                d="M4 5.5a1.5 1.5 0 0 1 1.5-1.5H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5v-10z"
                fill={accent || color}
                opacity={0.18}
            />
        )}
        <Path
            d="M12 6a2 2 0 0 1 2-2h4.5A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H14a2 2 0 0 0-2 2V6z"
            stroke={color}
            strokeWidth={1.6}
            strokeLinejoin="round"
        />
        <Path
            d="M12 6a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 0 4 5.5v10A1.5 1.5 0 0 0 5.5 17H10a2 2 0 0 1 2 2V6z"
            stroke={color}
            strokeWidth={1.6}
            strokeLinejoin="round"
        />
        {/* leaf bookmark */}
        <Path d="M16 4c-0.5 1.5-0.5 3 0.5 4.5C17.5 7 17.5 5.5 16 4z" fill={accent || color} />
    </Svg>
);

// Transactions — banknote / dollar bill (money in & out)
export const IconTransactions = ({ size = 24, color = '#0F2820', accent, filled }: IconProps) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {filled && (
            <Rect x={3} y={6.5} width={18} height={11} rx={2.2} fill={accent || color} opacity={0.18} />
        )}
        <Rect x={3} y={6.5} width={18} height={11} rx={2.2} stroke={color} strokeWidth={1.6} />
        <Circle cx={12} cy={12} r={2.6} stroke={accent || color} strokeWidth={1.6} />
        {/* corner value ticks */}
        <Path
            d="M6 9.4v0.01M18 14.6v0.01"
            stroke={accent || color}
            strokeWidth={1.7}
            strokeLinecap="round"
        />
    </Svg>
);

// ── Category icons (32×32 viewBox) ────────────────────────────────────────────

// Needs — bread loaf (essentials, sustenance)
export const IconNeeds = ({ size = 28, color = '#0F2820', accent = '#D97706' }: { size?: number; color?: string; accent?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <Path
            d="M5 15c0-2.8 2.5-5 6-5h10c3.5 0 6 2.2 6 5v1.5c0 0.6-0.4 1-1 1H6c-0.6 0-1-0.4-1-1V15z"
            fill={accent}
            opacity={0.22}
        />
        <Path
            d="M5 15c0-2.8 2.5-5 6-5h10c3.5 0 6 2.2 6 5v1.5c0 0.6-0.4 1-1 1H6c-0.6 0-1-0.4-1-1V15z"
            stroke={accent}
            strokeWidth={1.6}
        />
        <Path d="M7 17.5v5.5c0 0.6 0.4 1 1 1h16c0.6 0 1-0.4 1-1v-5.5" stroke={accent} strokeWidth={1.6} />
        <Path d="M11 14l1-2M16 14l1-2M21 14l1-2" stroke={accent} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
);

// Wants — flame / desire
export const IconWants = ({ size = 28, color = '#0F2820', accent = '#7C3AED' }: { size?: number; color?: string; accent?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <Path
            d="M16 4s-7 5.5-7 12a7 7 0 1 0 14 0c0-3-1.5-5-3-6.5 0 2-1 3-2 3 0-3.5-1-6-2-8.5z"
            fill={accent}
            opacity={0.2}
        />
        <Path
            d="M16 4s-7 5.5-7 12a7 7 0 1 0 14 0c0-3-1.5-5-3-6.5 0 2-1 3-2 3 0-3.5-1-6-2-8.5z"
            stroke={accent}
            strokeWidth={1.6}
            strokeLinejoin="round"
        />
        <Path
            d="M13 19a3 3 0 1 0 6 0c0-1.5-1-2.5-2-3-0.2 0.9-0.8 1.4-1.5 1.4-0.5-1-1-2-2.5-2-0.3 1.2 0 2.5 0 3.6z"
            fill={accent}
        />
    </Svg>
);

// Goals — sprout in soil
export const IconGoals = ({ size = 28, color = '#0F2820', accent = '#0F8C5C' }: { size?: number; color?: string; accent?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <Path d="M5 23h22l-1 4H6l-1-4z" fill={accent} opacity={0.22} />
        <Path d="M5 23h22l-1 4H6l-1-4z" stroke={accent} strokeWidth={1.6} strokeLinejoin="round" />
        <Path d="M16 23V13" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
        <Path d="M16 17c0-3 2.5-5.5 5.5-5.5C21.5 14.5 19 17 16 17z" fill={accent} />
        <Path d="M16 13c0-2.5-2-4.5-4.5-4.5C11.5 11 13.5 13 16 13z" fill={accent} opacity={0.8} />
    </Svg>
);

// ── Utility / navigation icons ────────────────────────────────────────────────

export const IconChevronLeft = ({ size = 20, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M14 6l-6 6 6 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

export const IconChevronRight = ({ size = 20, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M10 6l6 6-6 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

export const IconChevronDown = ({ size = 20, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

export const IconChevronUp = ({ size = 20, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M6 15l6-6 6 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

export const IconPlus = ({ size = 20, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
);

export const IconClose = ({ size = 16, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
);

export const IconCheck = ({ size = 16, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M5 12l4.5 4.5L19 7" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

export const IconBell = ({ size = 20, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M6 16h12l-1.5-2V10a4.5 4.5 0 1 0-9 0v4L6 16z"
            stroke={color}
            strokeWidth={1.6}
            strokeLinejoin="round"
        />
        <Path d="M10.5 19a1.5 1.5 0 0 0 3 0" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
);

export const IconUser = ({ size = 20, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={9} r={3.5} stroke={color} strokeWidth={1.6} />
        <Path d="M5 20c1-3.5 4-5 7-5s6 1.5 7 5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
);

export const IconGear = ({ size = 20, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.6} />
        <Path
            d="M12 2.5l1.4 2.2 2.6-.5.5 2.6 2.2 1.4-1 2.4 1 2.4-2.2 1.4-.5 2.6-2.6-.5L12 21.5l-1.4-2.2-2.6.5-.5-2.6-2.2-1.4 1-2.4-1-2.4 2.2-1.4.5-2.6 2.6.5L12 2.5z"
            stroke={color}
            strokeWidth={1.6}
            strokeLinejoin="round"
        />
    </Svg>
);

export const IconCalendar = ({ size = 18, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={4} y={6} width={16} height={14} rx={2} stroke={color} strokeWidth={1.6} />
        <Path d="M4 10h16M9 3v4M15 3v4" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
);

export const IconStar = ({ size = 22, color = '#D4B254', filled = false }: { size?: number; color?: string; filled?: boolean }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M12 3l2.7 5.6 6.1 0.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-0.9L12 3z"
            fill={filled ? color : 'none'}
            stroke={color}
            strokeWidth={1.4}
            strokeLinejoin="round"
        />
    </Svg>
);

export const IconTrash = ({ size = 16, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

export const IconEdit = ({ size = 16, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M4 20h4l10-10-4-4L4 16v4z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
        <Path d="M14 6l4 4" stroke={color} strokeWidth={1.6} />
    </Svg>
);

export const IconLeaf = ({ size = 24, color = '#0F8C5C' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M4 20c0-9 7-16 16-16-1 8-8 16-16 16z" fill={color} opacity={0.18} />
        <Path d="M4 20c0-9 7-16 16-16-1 8-8 16-16 16z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
        <Path d="M4 20c4-5 8-9 14-12" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
);

export const IconSparkle = ({ size = 16, color = '#F4D35E' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" fill={color} />
    </Svg>
);

export const IconTrend = ({ size = 18, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M3 16l5-5 4 3 6-7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M14 7h4v4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

export const IconScripture = ({ size = 20, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"
            stroke={color}
            strokeWidth={1.6}
            strokeLinejoin="round"
        />
        <Path d="M5 17a3 3 0 0 1 3-3h11" stroke={color} strokeWidth={1.6} />
        <Path d="M12 8v3M10.5 9.5h3" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
);

export const IconMoon = ({ size = 18, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M19 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10z" fill={color} />
    </Svg>
);

export const IconSun = ({ size = 18, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={4} fill={color} />
        <Path
            d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
        />
    </Svg>
);

export const IconTarget = ({ size = 20, color = '#0F2820' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={1.6} />
        <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={1.6} />
        <Circle cx={12} cy={12} r={1.2} fill={color} />
    </Svg>
);

type ArrowDir = 'up' | 'right' | 'down' | 'left';
export const IconArrow = ({ size = 16, color = '#0F2820', dir = 'up' }: { size?: number; color?: string; dir?: ArrowDir }) => {
    const rotMap: Record<ArrowDir, string> = { up: '0', right: '90', down: '180', left: '270' };
    return (
        <Svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            style={{ transform: [{ rotate: `${rotMap[dir]}deg` }] }}
        >
            <Path
                d="M12 5v14M12 5l-5 5M12 5l5 5"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
};

// ── Transaction category glyphs (20×20) ──────────────────────────────────────

export const GlyphHouse = ({ color = '#D97706' }: { color?: string }) => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9z" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
        <Path d="M10 21v-6h4v6" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
    </Svg>
);

export const GlyphCart = ({ color = '#D97706' }: { color?: string }) => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path d="M3 4h2.5l2 12h11l2-8H7" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={9} cy={20} r={1.4} fill={color} />
        <Circle cx={17} cy={20} r={1.4} fill={color} />
    </Svg>
);

export const GlyphCar = ({ color = '#D97706' }: { color?: string }) => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
            d="M3 14l1.5-5a2 2 0 0 1 2-1.5h11a2 2 0 0 1 2 1.5L21 14v4h-2v-2H5v2H3v-4z"
            stroke={color}
            strokeWidth={1.7}
            strokeLinejoin="round"
        />
        <Circle cx={7.5} cy={14} r={1.2} fill={color} />
        <Circle cx={16.5} cy={14} r={1.2} fill={color} />
    </Svg>
);

export const GlyphCoffee = ({ color = '#7C3AED' }: { color?: string }) => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
            d="M5 9h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z"
            stroke={color}
            strokeWidth={1.7}
            strokeLinejoin="round"
        />
        <Path d="M17 11h2a2 2 0 0 1 0 4h-2" stroke={color} strokeWidth={1.7} />
        <Path d="M8 6c1-1 1-2 0-3M12 6c1-1 1-2 0-3" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
);

export const GlyphFilm = ({ color = '#7C3AED' }: { color?: string }) => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Rect x={3} y={5} width={18} height={14} rx={1.5} stroke={color} strokeWidth={1.7} />
        <Path d="M3 9h3M3 15h3M18 9h3M18 15h3M7 5v14M17 5v14" stroke={color} strokeWidth={1.5} />
    </Svg>
);

export const GlyphGift = ({ color = '#7C3AED' }: { color?: string }) => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Rect x={3} y={10} width={18} height={10} rx={1} stroke={color} strokeWidth={1.7} />
        <Path d="M3 13h18M12 10v10" stroke={color} strokeWidth={1.7} />
        <Path
            d="M12 10s-2-4-4.5-4-2.5 4 1 4h3.5zM12 10s2-4 4.5-4 2.5 4-1 4H12z"
            stroke={color}
            strokeWidth={1.7}
        />
    </Svg>
);

export const GlyphSeed = ({ color = '#0F8C5C' }: { color?: string }) => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Ellipse cx={12} cy={14} rx={6} ry={7} fill={color} opacity={0.22} />
        <Ellipse cx={12} cy={14} rx={6} ry={7} stroke={color} strokeWidth={1.6} />
        <Path d="M12 14c0-3 1.5-5 4-6" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
);

export const GlyphBriefcase = ({ color = '#0F3D2E' }: { color?: string }) => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Rect x={3} y={8} width={18} height={12} rx={1.5} stroke={color} strokeWidth={1.7} />
        <Path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke={color} strokeWidth={1.7} />
        <Path d="M3 13h18" stroke={color} strokeWidth={1.5} />
    </Svg>
);

// ── Savings Jar SVG component (90×100) ───────────────────────────────────────
export const SavingsJar = ({ fill = 0.5, size = 90 }: { fill?: number; size?: number }) => {
    const fillPct = Math.max(0.05, Math.min(1, fill));
    const jarH = size * 1.1;
    // Scale the SVG coordinates (original viewBox: 0 0 100 110)
    return (
        <Svg width={size} height={jarH} viewBox="0 0 100 110">
            <Defs>
                <LG id="jarFill" x1="0" y1="1" x2="0" y2="0">
                    <Stop offset="0" stopColor="#F4D35E" />
                    <Stop offset="1" stopColor="#FDE68A" />
                </LG>
                <ClipPath id="jarClip">
                    <Path d="M22 35h56l-5 65a4 4 0 0 1-4 4H31a4 4 0 0 1-4-4l-5-65z" />
                </ClipPath>
            </Defs>
            {/* lid */}
            <SvgRect x={25} y={20} width={50} height={14} rx={2} fill="rgba(255,255,255,0.85)" />
            <SvgRect x={28} y={22} width={44} height={3} rx={1.5} fill="rgba(255,255,255,0.5)" />
            {/* jar body */}
            <Path
                d="M22 35h56l-5 65a4 4 0 0 1-4 4H31a4 4 0 0 1-4-4l-5-65z"
                fill="rgba(255,255,255,0.18)"
                stroke="rgba(255,255,255,0.65)"
                strokeWidth={1.6}
            />
            {/* fill layer */}
            <G clipPath="url(#jarClip)">
                <SvgRect
                    x={22}
                    y={104 - 69 * fillPct}
                    width={56}
                    height={69 * fillPct}
                    fill="url(#jarFill)"
                />
                {/* floating coins */}
                <Circle cx={38} cy={97 - 60 * fillPct} r={4} fill="rgba(255,255,255,0.4)" />
                <Circle cx={56} cy={102 - 64 * fillPct} r={3} fill="rgba(255,255,255,0.4)" />
                <Circle cx={68} cy={95 - 55 * fillPct} r={4.5} fill="rgba(255,255,255,0.5)" />
            </G>
            {/* shine */}
            <Path d="M28 42v50" stroke="rgba(255,255,255,0.55)" strokeWidth={1.6} strokeLinecap="round" />
            {/* sprout */}
            <Path
                d="M50 20V8M50 14c0-3 2.5-5 5.5-5M50 12c0-3-2.5-5-5.5-5"
                stroke="#F4D35E"
                strokeWidth={2}
                strokeLinecap="round"
            />
        </Svg>
    );
};
