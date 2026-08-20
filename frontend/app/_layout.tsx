import '../lib/axiosConfig'; // sets axios.defaults.timeout before any screen can fire a request

// DarkTheme is intentionally still imported: dark mode is switched off, not deleted.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useFonts } from 'expo-font';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { AppThemeProvider, useTheme } from '../context/ThemeContext';
import { LocaleProvider, useLocale } from '../context/LocaleContext';
import { OnboardingProvider } from '../context/OnboardingContext';
import { SubscriptionProvider } from '../context/SubscriptionContext';
import OnboardingTour from '../components/onboarding/OnboardingTour';
import StartingBalanceGate from '../components/onboarding/StartingBalanceGate';
import PaywallSheet from '../components/premium/PaywallSheet';
import UpdateGate from '../components/premium/UpdateGate';
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
    const { user, initialized } = useAuth();
    const { theme } = useTheme();
    // Gate the first paint on the stored language too. Without this, i18next boots to
    // the device language, the stored override lands a tick later, and any component
    // that snapshots a display string into initial state captures the wrong-language
    // value permanently for that mount.
    const { ready: localeReady } = useLocale();
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

    if (!initialized || !localeReady) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg }}>
                <ActivityIndicator size="large" color={theme.brand} />
            </View>
        );
    }

    return (
        // Forced light, in step with FORCE_LIGHT_MODE in ThemeContext. This drives the
        // navigation container's own background/card colours, which are NOT theme
        // tokens — leaving it on the system scheme would paint a dark backdrop behind
        // light screens during transitions. Restore
        // `colorScheme === 'dark' ? DarkTheme : DefaultTheme` when dark mode returns.
        <ThemeProvider value={DefaultTheme}>
            <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                <Stack.Screen name="auth" options={{ headerShown: false }} />
                <Stack.Screen name="lessonDetail" options={{ headerShown: false }} />
                <Stack.Screen name="lessonSeries/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="lessonPlayer" options={{ headerShown: false }} />
                <Stack.Screen name="settings" options={{ headerShown: false }} />
            </Stack>
            <OnboardingTour />
            <StartingBalanceGate />
            {/* One paywall instance for the whole app — it opens from both CTAs, a
                locked series card, a locked lesson row, and a 403 from the player. */}
            <PaywallSheet />
            {/* Last, so it covers everything above it including the auth screen. */}
            <UpdateGate />
            {/* Dark glyphs on the cream background — forced with the palette above.
                Restore `colorScheme === 'dark' ? 'light' : 'dark'` alongside it. */}
            <StatusBar style="dark" />
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
                    {/* Outermost of the display providers: language is device-global and
                        must be readable on /auth and UpdateGate, before any user exists. */}
                    <LocaleProvider>
                    {/* Inside AuthProvider — it keys entitlement on the Supabase user
                        id. Outside OnboardingProvider so the tour can reference
                        premium state if it ever needs to. */}
                    <SubscriptionProvider>
                        <OnboardingProvider>
                            <RootLayoutNav />
                        </OnboardingProvider>
                    </SubscriptionProvider>
                    </LocaleProvider>
                </AppThemeProvider>
            </AuthProvider>
        </PostHogProvider>
    );
});
