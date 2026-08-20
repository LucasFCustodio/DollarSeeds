import { Tabs } from 'expo-router';
import React from 'react';
import { useTheme } from '@/context/ThemeContext';
import CustomTabBar from '@/components/ui/CustomTabBar';

export default function TabLayout() {
    const { theme } = useTheme();

    return (
        <Tabs
            tabBar={(props) => <CustomTabBar {...props} />}
            screenOptions={{
                headerShown: false,
                // The custom tab bar handles its own background and positioning.
                // Keep the system tab bar hidden so it doesn't double-render.
                tabBarStyle: { display: 'none' },
            }}
        >
            {/* These titles are NOT the tab labels — CustomTabBar renders those from
                `common:tabs.<routeName>`. Expo Router only uses them for the screen
                title and back-button text, so they stay English rather than being
                wired to a second source of truth that could drift from the tab bar. */}
            <Tabs.Screen name="index" options={{ title: 'Home' }} />
            <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} /* i18n-canonical */ />
            <Tabs.Screen name="piggyBank" options={{ title: 'Goals' }} />
            <Tabs.Screen name="lessons" options={{ title: 'Lessons' }} />
        </Tabs>
    );
}
