import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { AppThemeProvider, useTheme } from '../context/ThemeContext';
import { useNotifications } from '../hooks/useNotifications';

export const unstable_settings = {
    anchor: '(tabs)',
};

function RootLayoutNav() {
    const colorScheme = useColorScheme();
    const { user, initialized } = useAuth();
    const { theme } = useTheme();
    const router = useRouter();
    const segments = useSegments();

    useNotifications(initialized && !!user);

    useEffect(() => {
        if (!initialized) return;
        const inAuthGroup = segments[0] === 'auth';
        if (!user && !inAuthGroup) {
            router.replace('/auth');
        } else if (user && inAuthGroup) {
            router.replace('/(tabs)');
        }
    }, [user, initialized, segments]);

    if (!initialized) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
                <ActivityIndicator size="large" color={theme.action} />
            </View>
        );
    }

    return (
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                <Stack.Screen name="auth" options={{ headerShown: false }} />
            </Stack>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        </ThemeProvider>
    );
}

export default function RootLayout() {
    return (
        <AuthProvider>
            <AppThemeProvider>
                <RootLayoutNav />
            </AppThemeProvider>
        </AuthProvider>
    );
}
