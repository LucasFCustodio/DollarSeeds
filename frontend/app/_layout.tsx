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
import * as Sentry from '@sentry/react-native';
import { PostHogProvider } from 'posthog-react-native';

Sentry.init({
  dsn: 'https://27c7ac22c963cf139a283799121c2b77@o4511666459377664.ingest.us.sentry.io/4511666477989888',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: false,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

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
                <Stack.Screen name="lessonSeries/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="lessonPlayer" options={{ headerShown: false }} />
                <Stack.Screen name="settings" options={{ headerShown: false }} />
            </Stack>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        </ThemeProvider>
    );
}

export default Sentry.wrap(function RootLayout() {
    return (
        <PostHogProvider
            apiKey={process.env.EXPO_PUBLIC_POSTHOG_KEY}
            options={{
                host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
                // Session replay OFF — we never record screens.
                enableSessionReplay: false,
            }}
            // Deliberate event set only — no auto-captured taps/screens. Every event is
            // fired explicitly via lib/analytics.ts.
            autocapture={false}
        >
            <AuthProvider>
                <AppThemeProvider>
                    <RootLayoutNav />
                </AppThemeProvider>
            </AuthProvider>
        </PostHogProvider>
    );
});
