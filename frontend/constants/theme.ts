import { Platform } from 'react-native';

// Backward-compatible Colors for expo-router's navigation theme + useColorScheme hooks
export const Colors = {
    light: {
        text: '#0F172A',
        background: '#F8FAFC',
        tint: '#2563EB',
        icon: '#64748B',
        tabIconDefault: '#94A3B8',
        tabIconSelected: '#2563EB',
    },
    dark: {
        text: '#F1F5F9',
        background: '#0F172A',
        tint: '#3B82F6',
        icon: '#94A3B8',
        tabIconDefault: '#475569',
        tabIconSelected: '#3B82F6',
    },
};

// Semantic category colors (used in trends, dashboard cards)
export const CategoryColors = {
    needs: '#F59E0B',   // amber  — practical essentials
    wants: '#8B5CF6',   // violet — lifestyle & pleasure
    goals: '#10B981',   // emerald — growth & future
    needsDark: '#FBBF24',
    wantsDark: '#A78BFA',
    goalsDark: '#34D399',
};

export const Fonts = Platform.select({
    ios: {
        sans: 'system-ui',
        serif: 'ui-serif',
        rounded: 'ui-rounded',
        mono: 'ui-monospace',
    },
    default: {
        sans: 'normal',
        serif: 'serif',
        rounded: 'normal',
        mono: 'monospace',
    },
    web: {
        sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        serif: "Georgia, 'Times New Roman', serif",
        rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
        mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    },
});
