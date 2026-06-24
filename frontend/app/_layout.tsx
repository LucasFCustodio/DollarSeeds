import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useFonts } from 'expo-font';

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

    // Load custom font families via @expo-google-fonts packages
    // (files live inside node_modules — no manual TTF download needed)
    const [fontsLoaded] = useFonts({
        'InstrumentSerif-Regular':
            require('@expo-google-fonts/instrument-serif/400Regular/InstrumentSerif_400Regular.ttf'),
        'InstrumentSerif-Italic':
            require('@expo-google-fonts/instrument-serif/400Regular_Italic/InstrumentSerif_400Regular_Italic.ttf'),
        'Geist-Regular':
            require('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf'),
        'Geist-Medium':
            require('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf'),
        'Geist-SemiBold':
            require('@expo-google-fonts/geist/600SemiBold/Geist_600SemiBold.ttf'),
        'Geist-Bold':
            require('@expo-google-fonts/geist/700Bold/Geist_700Bold.ttf'),
        'JetBrainsMono-Regular':
            require('@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf'),
        'JetBrainsMono-Medium':
            require('@expo-google-fonts/jetbrains-mono/500Medium/JetBrainsMono_500Medium.ttf'),
        'JetBrainsMono-SemiBold':
            require('@expo-google-fonts/jetbrains-mono/600SemiBold/JetBrainsMono_600SemiBold.ttf'),
    });

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
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg }}>
                <ActivityIndicator size="large" color={theme.brand} />
            </View>
        );
    }

    return (
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                <Stack.Screen name="auth" options={{ headerShown: false }} />
                <Stack.Screen name="lessonDetail" options={{ headerShown: false }} />
                <Stack.Screen name="settings" options={{ headerShown: false }} />
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
