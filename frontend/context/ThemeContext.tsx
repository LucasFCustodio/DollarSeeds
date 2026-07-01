import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';

// ─── Shadow helper ────────────────────────────────────────────────────────────
export function shadow(depth: number, color: string = '#8A8F86') {
    const d = Math.max(0, Math.min(10, depth));
    if (d === 0) return {};
    return {
        shadowColor: color,
        shadowOffset: { width: 0, height: 4 + d * 0.8 },
        shadowOpacity: 0.04 + d * 0.008,
        shadowRadius: 12 + d * 2.2,
        elevation: Math.round(2 + d * 0.8),
    };
}

// Hard offset "sticker" shadow for the retro card look (visible, low blur).
export function stickerShadow(color: string = '#8A8F86') {
    return {
        shadowColor: color,
        shadowOffset: { width: 2, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 1.5,
        elevation: 6,
    };
}

// ─── Font family helpers ──────────────────────────────────────────────────────
export const Fonts = {
    serif: 'InstrumentSerif-Regular',
    serifItalic: 'InstrumentSerif-Italic',
    sans: 'Geist-Regular',
    sansMedium: 'Geist-Medium',
    sansSemiBold: 'Geist-SemiBold',
    sansBold: 'Geist-Bold',
    mono: 'JetBrainsMono-Regular',
    monoMedium: 'JetBrainsMono-Medium',
    monoSemiBold: 'JetBrainsMono-SemiBold',
} as const;

export interface AppTheme {
    mode: 'light' | 'dark';

    // ── New surface tokens ──────────────────────────────────────
    bg: string;
    surface: string;
    surfaceSoft: string;
    surfaceElev: string;
    border: string;
    borderSoft: string;

    // ── New text tokens ─────────────────────────────────────────
    ink: string;    // primary text
    ink2: string;   // secondary text
    ink3: string;   // muted text

    // ── New brand tokens ────────────────────────────────────────
    brand: string;       // forest green
    brand2: string;      // emerald
    brandSoft: string;   // tinted brand bg
    onBrand: string;     // text on brand bg

    // ── Category tokens ─────────────────────────────────────────
    needs: string;    needsSoft: string;
    wants: string;    wantsSoft: string;
    goals: string;    goalsSoft: string;

    // ── Status tokens ────────────────────────────────────────────
    danger: string;   dangerSoft: string;
    success: string;  successSoft: string;

    // ── Accent ──────────────────────────────────────────────────
    harvest: string;   // harvest yellow — health bar, jar fill

    // ── Legacy aliases (backward compat — keep for existing code) ──
    background: string;          // → bg
    surfaceElevated: string;     // → surfaceElev
    borderSubtle: string;        // → borderSoft
    text: string;                // → ink
    textSecondary: string;       // → ink2
    textMuted: string;           // → ink3
    action: string;              // → brand
    actionText: string;          // → onBrand
    actionSoft: string;          // → brandSoft
    inputBg: string;
    inputBorder: string;
    inputText: string;
    inputPlaceholder: string;
    tabBar: string;
    tabBarBorder: string;
    tabActive: string;
    tabInactive: string;
}

// ─── Light theme ──────────────────────────────────────────────────────────────
const LIGHT: AppTheme = {
    mode: 'light',

    // New surface
    bg: '#F5F1E6',
    surface: '#FFFFFF',
    surfaceSoft: '#FAF6EB',
    surfaceElev: '#FFFFFF',
    border: '#E5DDC9',
    borderSoft: '#EFE9D8',

    // New text
    ink: '#0F2820',
    ink2: '#4A5C56',
    ink3: '#8FA39C',

    // New brand (forest)
    brand: '#0F3D2E',
    brand2: '#10B981',
    brandSoft: '#E8F3EE',
    onBrand: '#FFFFFF',

    // Categories — harmonized to forest backdrop
    needs: '#C2701C',    needsSoft: '#FBEDD9',
    wants: '#7C3AED',    wantsSoft: '#EFE6FB',
    goals: '#10B981',    goalsSoft: '#E8F3EE',

    // Status
    danger: '#B91C1C',   dangerSoft: '#FBE7E7',
    success: '#0F8C5C',  successSoft: '#E5F3EC',

    // Accent
    harvest: '#F4D35E',

    // ── Legacy aliases ──────────────────────────────────────────
    background: '#F5F1E6',
    surfaceElevated: '#FFFFFF',
    borderSubtle: '#EFE9D8',
    text: '#0F2820',
    textSecondary: '#4A5C56',
    textMuted: '#8FA39C',
    action: '#0F3D2E',
    actionText: '#FFFFFF',
    actionSoft: '#E8F3EE',
    inputBg: '#FAF6EB',
    inputBorder: '#E5DDC9',
    inputText: '#0F2820',
    inputPlaceholder: '#8FA39C',
    tabBar: '#FFFFFF',
    tabBarBorder: '#E5DDC9',
    tabActive: '#0F3D2E',
    tabInactive: '#8FA39C',
};

// ─── Dark theme ───────────────────────────────────────────────────────────────
const DARK: AppTheme = {
    mode: 'dark',

    // New surface
    bg: '#0A1612',
    surface: '#13231C',
    surfaceSoft: '#1A2D24',
    surfaceElev: '#1E332A',
    border: '#1F3A2E',
    borderSoft: '#162720',

    // New text
    ink: '#F4F1E8',
    ink2: '#9BB1A5',
    ink3: '#6A8478',

    // New brand (forest — same in dark)
    brand: '#0F3D2E',
    brand2: '#10B981',
    brandSoft: '#0F2A20',
    onBrand: '#FFFFFF',

    // Categories
    needs: '#F4B860',    needsSoft: '#2C2010',
    wants: '#B898F7',    wantsSoft: '#1F1830',
    goals: '#34D399',    goalsSoft: '#0F2A20',

    // Status
    danger: '#F87171',   dangerSoft: '#2C1818',
    success: '#34D399',  successSoft: '#0F2A20',

    // Accent
    harvest: '#F4D35E',

    // ── Legacy aliases ──────────────────────────────────────────
    background: '#0A1612',
    surfaceElevated: '#1E332A',
    borderSubtle: '#162720',
    text: '#F4F1E8',
    textSecondary: '#9BB1A5',
    textMuted: '#6A8478',
    action: '#10B981',
    actionText: '#FFFFFF',
    actionSoft: '#0F2A20',
    inputBg: '#1A2D24',
    inputBorder: '#1F3A2E',
    inputText: '#F4F1E8',
    inputPlaceholder: '#6A8478',
    tabBar: '#13231C',
    tabBarBorder: '#1F3A2E',
    tabActive: '#10B981',
    tabInactive: '#6A8478',
};

interface ThemeContextType {
    theme: AppTheme;
    isDark: boolean;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
    theme: LIGHT,
    isDark: false,
    toggleTheme: () => {},
});

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
    const systemScheme = useColorScheme();
    const [isDark, setIsDark] = useState(systemScheme === 'dark');

    useEffect(() => {
        setIsDark(systemScheme === 'dark');
    }, [systemScheme]);

    const toggleTheme = () => setIsDark(prev => !prev);
    const theme = isDark ? DARK : LIGHT;

    return (
        <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
