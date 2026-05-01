import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme'; // Your existing theme hook
import { AuthProvider, useAuth } from '../context/AuthContext'; // Make sure this path matches your folder structure!

export const unstable_settings = {
  anchor: '(tabs)',
};

// 1. We moved your existing layout code into this inner component so it can access the AuthContext
function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, initialized } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  // THE BOUNCER LOGIC
  useEffect(() => {
    if (!initialized) return; // Wait until Supabase checks local storage

    const inAuthGroup = segments[0] === 'auth';

    if (!user && !inAuthGroup) {
      // No ID -> Send to Login
      router.replace('/auth');
    } else if (user && inAuthGroup) {
      // Has ID -> Send to Dashboard
      router.replace('/(tabs)');
    }
  }, [user, initialized, segments]);

  // Show a loading spinner while Supabase checks the storage
  if (!initialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1ca8eb" />
      </View>
    );
  }

  // If the bouncer approves, render your original template code!
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        
        {/* ADDED THE NEW AUTH SCREEN TO THE STACK */}
        <Stack.Screen name="auth" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

// 2. Wrap the whole app in the AuthProvider so the bouncer has access to the database
export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}