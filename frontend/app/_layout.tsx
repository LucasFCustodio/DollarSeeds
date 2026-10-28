import '../lib/axiosConfig'; // sets axios.defaults.timeout before any screen can fire a request

// DarkTheme is intentionally still imported: dark mode is switched off, not deleted.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useFonts } from 'expo-font';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { AppThemeProvider, useTheme } from '../context/ThemeContext';
import { LocaleProvider, useLocale } from '../context/LocaleContext';
import { OnboardingProvider, useOnboarding } from '../context/OnboardingContext';
import { SubscriptionProvider, useSubscription } from '../context/SubscriptionContext';
import { AnnouncementsProvider } from '../context/AnnouncementsContext';
import PaywallSheet from '../components/premium/PaywallSheet';
import UpdateGate from '../components/premium/UpdateGate';
import NewsModal from '../components/news/NewsModal';
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
    const { status: onboarding, replaying } = useOnboarding();
    const { paywallCopy } = useSubscription();

    // Load custom font families via @expo-google-fonts packages
    // (files live inside node_modules — no manual TTF download needed)
    const [fontsLoaded, fontError] = useFonts({
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

    // The bouncer (ONBOARDING_REWORK.md §1):
    //   signed out → the onboarding; only /auth ("I already have an account") and the
    //                onboarding itself are reachable.
    //   signed in, onboarding not done (every pre-rework account, once) or the dev
    //                replay → the onboarding, in signed-in mode.
    //   signed in and done → never left on /auth.
    // A signed-in user is never moved OFF /onboarding from here: sign-up happens on
    // screen 19 and the flow still has its writes, the paywall and the last screen to
    // run. The screen leaves by itself when it is done.
    useEffect(() => {
        if (!initialized) return;
        const at = segments[0] as string | undefined;
        if (!user) {
            if (at !== 'auth' && at !== 'onboarding') router.replace('/onboarding' as any);
            return;
        }
        if (onboarding === 'unknown') return;
        if ((onboarding === 'needed' || replaying) && at !== 'onboarding') {
            router.replace('/onboarding' as any);
        } else if (onboarding === 'done' && !replaying && at === 'auth') {
            router.replace('/(tabs)');
        }
    }, [user, initialized, segments, onboarding, replaying]); // eslint-disable-line react-hooks/exhaustive-deps

    // Wait for the fonts, not just auth + locale. The first screen used to mount before
    // they registered, so iOS measured its text in the system font and then drew the
    // wider Geist / JetBrains Mono glyphs into those widths — "Nee…", "50/30/" clipped on
    // the dashboard. A failed load (`fontError`) falls through to the system font rather
    // than holding the spinner forever.
    const fontsReady = fontsLoaded || !!fontError;

    // A signed-in user waits for the onboarding flag too, so an account that still has
    // the onboarding to do never sees the tabs flash first.
    const onboardingReady = !user || onboarding !== 'unknown';

    // BOOT ONLY. Once the navigator has rendered it is never swapped back for the
    // spinner: sign-up on the onboarding's screen 19 makes the flag 'unknown' for a
    // moment, and unmounting the onboarding then would cut its plan writes off halfway.
    const booted = useRef(false);
    if (initialized && localeReady && fontsReady && onboardingReady) booted.current = true;

    if (!booted.current) {
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
                <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
                <Stack.Screen name="lessonDetail" options={{ headerShown: false }} />
                <Stack.Screen name="lessonSeries/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="lessonPlayer" options={{ headerShown: false }} />
                <Stack.Screen name="settings" options={{ headerShown: false }} />
                <Stack.Screen name="debtDetail" options={{ headerShown: false }} />
                <Stack.Screen name="debtForm" options={{ headerShown: false }} />
                <Stack.Screen name="logExpense" options={{ headerShown: false }} />
                <Stack.Screen name="logIncome" options={{ headerShown: false }} />
            </Stack>
            {/* One paywall instance for the whole app — it opens from both CTAs, a
                locked series card, a locked lesson row, a 403 from the player, and the
                onboarding (the only caller that overrides its headline). */}
            <PaywallSheet headline={paywallCopy?.headline} subtitle={paywallCopy?.subtitle} />
            {/* Last, so it covers everything above it including the auth screen. */}
            <UpdateGate />
            {/* AFTER UpdateGate on purpose. An announcement is never allowed to sit on
                top of a hard stop the user has to act on — NewsModal renders nothing
                while the gate is up (it asks via useUpdateBlocked), and this ordering
                makes that visible in the tree as well as in the code. */}
            <NewsModal />
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
                            {/* Inside AuthProvider — the seen flag is keyed on the
                                Supabase user id, and the fetch needs a token. */}
                            <AnnouncementsProvider>
                                <RootLayoutNav />
                            </AnnouncementsProvider>
                        </OnboardingProvider>
                    </SubscriptionProvider>
                    </LocaleProvider>
                </AppThemeProvider>
            </AuthProvider>
        </PostHogProvider>
    );
});
