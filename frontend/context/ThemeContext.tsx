import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';

export interface AppTheme {
    mode: 'light' | 'dark';
    background: string;
    surface: string;
    surfaceElevated: string;
    border: string;
    borderSubtle: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    action: string;
    actionText: string;
    actionSoft: string;
    danger: string;
    dangerSoft: string;
    success: string;
    successSoft: string;
    needs: string;
    needsSoft: string;
    wants: string;
    wantsSoft: string;
    goals: string;
    goalsSoft: string;
    inputBg: string;
    inputBorder: string;
    inputText: string;
    inputPlaceholder: string;
    tabBar: string;
    tabBarBorder: string;
    tabActive: string;
    tabInactive: string;
}

const LIGHT: AppTheme = {
    mode: 'light',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    border: '#E2E8F0',
    borderSubtle: '#F1F5F9',
    text: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    action: '#2563EB',
    actionText: '#FFFFFF',
    actionSoft: '#EFF6FF',
    danger: '#DC2626',
    dangerSoft: '#FEF2F2',
    success: '#16A34A',
    successSoft: '#F0FDF4',
    needs: '#F59E0B',
    needsSoft: '#FFFBEB',
    wants: '#8B5CF6',
    wantsSoft: '#F5F3FF',
    goals: '#10B981',
    goalsSoft: '#ECFDF5',
    inputBg: '#F1F5F9',
    inputBorder: '#E2E8F0',
    inputText: '#0F172A',
    inputPlaceholder: '#94A3B8',
    tabBar: '#FFFFFF',
    tabBarBorder: '#E2E8F0',
    tabActive: '#2563EB',
    tabInactive: '#94A3B8',
};

const DARK: AppTheme = {
    mode: 'dark',
    background: '#0F172A',
    surface: '#1E293B',
    surfaceElevated: '#293548',
    border: '#334155',
    borderSubtle: '#1E293B',
    text: '#F1F5F9',
    textSecondary: '#94A3B8',
    textMuted: '#475569',
    action: '#3B82F6',
    actionText: '#FFFFFF',
    actionSoft: '#172554',
    danger: '#EF4444',
    dangerSoft: '#2D1515',
    success: '#22C55E',
    successSoft: '#052E16',
    needs: '#FBBF24',
    needsSoft: '#292002',
    wants: '#A78BFA',
    wantsSoft: '#1C1533',
    goals: '#34D399',
    goalsSoft: '#022C22',
    inputBg: '#1E293B',
    inputBorder: '#334155',
    inputText: '#F1F5F9',
    inputPlaceholder: '#475569',
    tabBar: '#1E293B',
    tabBarBorder: '#334155',
    tabActive: '#3B82F6',
    tabInactive: '#475569',
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
